// ── POST /api/dis/sync — admin: process event rows, claim tiles
// Client sends events fetched from Apps Script. Server processes
// each row: extract gameId + eventType, attempt to claim matching tile.
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function verifySession(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)cmd_session=([^;]+)/);
    if (!match) return null;
    try {
        const raw = decodeURIComponent(match[1]);
        const lastDot = raw.lastIndexOf('.');
        if (lastDot === -1) return null;
        const payload64 = raw.slice(0, lastDot);
        const sig = raw.slice(lastDot + 1);
        const secret = process.env.SESSION_SECRET;
        if (!secret) return null;
        const expected = crypto.createHmac('sha256', secret).update(payload64).digest('hex');
        if (sig.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        const session = JSON.parse(Buffer.from(payload64, 'base64url').toString('utf8'));
        if (Date.now() > session.exp * 1000) return null;
        return session;
    } catch { return null; }
}

function json(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}

// Extract first 5+ digit number from a string (Roblox game ID)
function extractGameId(raw) {
    if (!raw) return null;
    const match = String(raw).match(/\b(\d{5,})\b/);
    return match ? match[1] : null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    // Require rank 246+ or allowlist
    const isAdmin = session.divisionRank >= 246;
    if (!isAdmin) {
        try {
            const adminStore = getStore({ name: 'commandos-admin', consistency: 'strong' });
            const allowlist = await adminStore.get('allowlist', { type: 'json' }) || [];
            if (!allowlist.some(e => e.discordId === session.discordId)) {
                return json(403, { error: 'Forbidden: admin rank required' });
            }
        } catch { return json(403, { error: 'Forbidden' }); }
    }

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

    const events = Array.isArray(body.events) ? body.events : [];
    const store = getStore({ name: 'commandos-dis', consistency: 'strong' });

    // Load board and users
    let board, users;
    try { board = await store.get('board', { type: 'json' }); } catch {}
    if (!board || !board.tiles || board.tiles.length === 0) {
        return json(200, { ok: true, claimed: 0, skipped: 0, message: 'No board configured' });
    }
    try { users = await store.get('users', { type: 'json' }); } catch {}
    users = users || {};

    const tiles = board.tiles;
    const gm = board.globalMultiplier || 1;
    const auditEntries = [];
    let claimed = 0;
    let skipped = 0;

    // Process each event row
    for (const ev of events) {
        // Validate
        const username = ev && typeof ev.username === 'string' ? ev.username.trim() : null;
        const eventType = ev && typeof ev.eventType === 'string' ? ev.eventType.trim() : null;
        const rawGameId = ev && ev.gameId ? String(ev.gameId).trim() : null;

        if (!username || !eventType || !rawGameId) continue;
        if (username.toLowerCase() === 'officer') continue; // block invalid username

        const gameId = extractGameId(rawGameId);
        if (!gameId) continue;

        // Find matching unclaimed, unlocked tile
        const tileIdx = tiles.findIndex(t =>
            !t.completed &&
            !t.lockedByAdmin &&
            String(t.gameId) === String(gameId) &&
            t.eventType.toLowerCase() === eventType.toLowerCase()
        );

        if (tileIdx === -1) {
            // Check if it was already claimed (by any user)
            const existing = tiles.find(t =>
                t.completed &&
                String(t.gameId) === String(gameId) &&
                t.eventType.toLowerCase() === eventType.toLowerCase()
            );
            if (existing) skipped++;
            continue;
        }

        // Claim the tile
        const tile = tiles[tileIdx];
        const pts = (tile.points || 1) * (tile.multiplier || 1) * gm;

        tiles[tileIdx] = Object.assign({}, tile, {
            completed: true,
            completedBy: username,
            completedAt: new Date().toISOString()
        });

        // Update user stats
        if (!users[username]) {
            users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        }
        users[username].points = (users[username].points || 0) + pts;
        if (!Array.isArray(users[username].claimedTiles)) users[username].claimedTiles = [];
        if (!users[username].claimedTiles.includes(tile.position)) {
            users[username].claimedTiles.push(tile.position);
        }
        if (!Array.isArray(users[username].history)) users[username].history = [];
        users[username].history.push({ tile: tile.position, action: 'claim', points: pts, timestamp: new Date().toISOString() });

        auditEntries.push({
            adminId: session.robloxUsername || session.discordId,
            action: 'CLAIM_TILE',
            details: { position: tile.position, claimedBy: username, gameId, eventType, points: pts },
            timestamp: new Date().toISOString()
        });

        claimed++;
    }

    // Note: raffle entries from tile claims only — manual adjustments handled by admin endpoint

    // Update board
    board.tiles = tiles;
    board.lastSyncAt = new Date().toISOString();
    board.updatedAt = new Date().toISOString();

    // Append audit log
    let auditLog;
    try { auditLog = await store.get('audit', { type: 'json' }); } catch {}
    auditLog = Array.isArray(auditLog) ? auditLog : [];
    auditLog.push(...auditEntries);
    if (auditLog.length > 500) auditLog = auditLog.slice(-500);

    // Persist all changes
    await Promise.all([
        store.set('board', JSON.stringify(board)),
        store.set('users', JSON.stringify(users)),
        store.set('audit', JSON.stringify(auditLog)),
        store.set('state-cache', '') // invalidate cache
    ]);

    return json(200, { ok: true, claimed, skipped, total: events.length });
};
