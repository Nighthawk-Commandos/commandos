// ── POST /api/dis/sync — admin: process event rows, claim tiles
// Client sends events fetched from Apps Script. Server processes
// each row: extract gameId + eventType, attempt to claim matching tile.
'use strict';

const { blobsStore, verifySession, requireAdmin, json } = require('./_shared');

// Extract first 5+ digit number from a string (Roblox game ID)
function extractGameId(raw) {
    if (!raw) return null;
    const match = String(raw).match(/\b(\d{5,})\b/);
    return match ? match[1] : null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const authErr = await requireAdmin(session);
    if (authErr) return authErr;

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

    const events = Array.isArray(body.events) ? body.events : [];
    const store  = blobsStore('commandos-dis');

    // Load board and users
    let board, users;
    try { board = await store.get('board', { type: 'json' }); } catch {}
    if (!board || !board.tiles || board.tiles.length === 0) {
        return json(200, { ok: true, claimed: 0, skipped: 0, message: 'No board configured' });
    }
    try { users = await store.get('users', { type: 'json' }); } catch {}
    users = users || {};

    const tiles        = board.tiles;
    const gm           = board.globalMultiplier || 1;
    const auditEntries = [];
    let claimed  = 0;
    let skipped  = 0;
    let notFound = 0; // events that had no matching tile at all

    // Process each event row
    for (const ev of events) {
        const username  = ev && typeof ev.username  === 'string' ? ev.username.trim()  : null;
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
            const existing = tiles.find(t =>
                t.completed &&
                String(t.gameId) === String(gameId) &&
                t.eventType.toLowerCase() === eventType.toLowerCase()
            );
            if (existing) skipped++;
            else notFound++;
            continue;
        }

        // Claim the tile
        const tile = tiles[tileIdx];
        const pts  = (tile.points || 1) * (tile.multiplier || 1) * gm;

        tiles[tileIdx] = Object.assign({}, tile, {
            completed:   true,
            completedBy: username,
            completedAt: new Date().toISOString()
        });

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
            action:  'CLAIM_TILE',
            details: { position: tile.position, claimedBy: username, gameId, eventType, points: pts },
            timestamp: new Date().toISOString()
        });

        claimed++;
    }

    // Update board
    board.tiles      = tiles;
    board.lastSyncAt = new Date().toISOString();
    board.updatedAt  = new Date().toISOString();

    // Append audit log
    let auditLog;
    try { auditLog = await store.get('audit', { type: 'json' }); } catch {}
    auditLog = Array.isArray(auditLog) ? auditLog : [];
    auditLog.push(...auditEntries);
    if (auditLog.length > 500) auditLog = auditLog.slice(-500);

    // Persist all changes in one parallel batch
    await Promise.all([
        store.set('board',       JSON.stringify(board)),
        store.set('users',       JSON.stringify(users)),
        store.set('audit',       JSON.stringify(auditLog)),
        store.set('state-cache', '') // invalidate CDN + Blobs cache
    ]);

    return json(200, { ok: true, claimed, skipped, notFound, total: events.length });
};
