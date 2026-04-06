// ── POST /api/dis/admin — all admin actions for the DIS
// Actions: unlock-tile, lock-tile, force-claim, adjust-points,
//          adjust-raffle, set-multiplier, reset-week,
//          regenerate-board, get-audit
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function blobsStore(name) {
    return getStore({ name, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
}

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

async function addAudit(store, adminId, action, details) {
    let log;
    try { log = await store.get('audit', { type: 'json' }); } catch {}
    log = Array.isArray(log) ? log : [];
    log.push({ adminId, action, details, timestamp: new Date().toISOString() });
    if (log.length > 500) log = log.slice(-500);
    await store.set('audit', JSON.stringify(log));
}

async function invalidateCache(store) {
    try { await store.set('state-cache', ''); } catch {}
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const isAdmin = session.divisionRank >= 246;
    if (!isAdmin) {
        try {
            const adminStore = blobsStore('commandos-admin');
            const allowlist = await adminStore.get('allowlist', { type: 'json' }) || [];
            if (!allowlist.some(e => e.discordId === session.discordId)) {
                return json(403, { error: 'Forbidden' });
            }
        } catch { return json(403, { error: 'Forbidden' }); }
    }

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

    const store = blobsStore('commandos-dis');
    const adminId = session.robloxUsername || session.discordId;

    // ── get-audit ────────────────────────────────────────────────
    if (body.action === 'get-audit') {
        const log = await store.get('audit', { type: 'json' }).catch(() => []);
        return json(200, { log: log || [] });
    }

    // ── unlock-tile ──────────────────────────────────────────────
    if (body.action === 'unlock-tile') {
        const pos = Number(body.position);
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        const tile = board.tiles[pos];
        if (!tile) return json(404, { error: 'Tile not found' });
        const prevUser = tile.completedBy;

        // Deduct points from user if tile was completed
        if (tile.completed && prevUser) {
            let users = await store.get('users', { type: 'json' }).catch(() => ({}));
            users = users || {};
            if (users[prevUser]) {
                const gm = board.globalMultiplier || 1;
                const pts = (tile.points || 1) * (tile.multiplier || 1) * gm;
                users[prevUser].points = Math.max(0, (users[prevUser].points || 0) - pts);
                users[prevUser].claimedTiles = (users[prevUser].claimedTiles || []).filter(p => p !== pos);
                await store.set('users', JSON.stringify(users));
            }
        }

        board.tiles[pos] = Object.assign({}, tile, {
            completed: false, completedBy: null, completedAt: null, lockedByAdmin: false
        });
        board.updatedAt = new Date().toISOString();

        await store.set('board', JSON.stringify(board));
        await addAudit(store, adminId, 'UNLOCK_TILE', { position: pos, prevUser });
        await invalidateCache(store);
        return json(200, { ok: true });
    }

    // ── lock-tile ─────────────────────────────────────────────────
    if (body.action === 'lock-tile') {
        const pos = Number(body.position);
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        board.tiles[pos] = Object.assign({}, board.tiles[pos], { lockedByAdmin: true });
        board.updatedAt = new Date().toISOString();

        await store.set('board', JSON.stringify(board));
        await addAudit(store, adminId, 'LOCK_TILE', { position: pos });
        await invalidateCache(store);
        return json(200, { ok: true });
    }

    // ── force-claim ───────────────────────────────────────────────
    if (body.action === 'force-claim') {
        const pos = Number(body.position);
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });
        if (!username) return json(400, { error: 'Username required' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};

        const tile = board.tiles[pos];
        const gm = board.globalMultiplier || 1;
        const pts = (tile.points || 1) * (tile.multiplier || 1) * gm;

        board.tiles[pos] = Object.assign({}, tile, {
            completed: true,
            completedBy: username,
            completedAt: new Date().toISOString(),
            lockedByAdmin: false
        });
        board.updatedAt = new Date().toISOString();

        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].points = (users[username].points || 0) + pts;
        if (!(users[username].claimedTiles || []).includes(pos)) {
            (users[username].claimedTiles = users[username].claimedTiles || []).push(pos);
        }

        await store.set('board', JSON.stringify(board));
        await store.set('users', JSON.stringify(users));
        await addAudit(store, adminId, 'FORCE_CLAIM', { position: pos, username, points: pts });
        await invalidateCache(store);
        return json(200, { ok: true });
    }

    // ── adjust-points ─────────────────────────────────────────────
    if (body.action === 'adjust-points') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        const delta = Number(body.delta);
        if (!username) return json(400, { error: 'Username required' });
        if (isNaN(delta)) return json(400, { error: 'Delta must be a number' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].points = Math.max(0, (users[username].points || 0) + delta);

        await store.set('users', JSON.stringify(users));
        await addAudit(store, adminId, 'ADJUST_POINTS', { username, delta, newTotal: users[username].points });
        await invalidateCache(store);
        return json(200, { ok: true, newPoints: users[username].points });
    }

    // ── adjust-raffle ─────────────────────────────────────────────
    if (body.action === 'adjust-raffle') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        const delta = parseInt(body.delta, 10);
        if (!username) return json(400, { error: 'Username required' });
        if (isNaN(delta)) return json(400, { error: 'Delta must be an integer' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].raffleEntries = Math.max(0, (users[username].raffleEntries || 0) + delta);

        await store.set('users', JSON.stringify(users));
        await addAudit(store, adminId, 'ADJUST_RAFFLE', { username, delta, newTotal: users[username].raffleEntries });
        await invalidateCache(store);
        return json(200, { ok: true, newEntries: users[username].raffleEntries });
    }

    // ── set-multiplier ────────────────────────────────────────────
    if (body.action === 'set-multiplier') {
        const val = Number(body.value);
        if (isNaN(val) || val < 0.5 || val > 100) return json(400, { error: 'Multiplier must be between 0.5 and 100' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });
        board.globalMultiplier = val;
        board.updatedAt = new Date().toISOString();

        await store.set('board', JSON.stringify(board));
        await addAudit(store, adminId, 'SET_MULTIPLIER', { globalMultiplier: val });
        await invalidateCache(store);
        return json(200, { ok: true, globalMultiplier: val });
    }

    // ── reset-week ────────────────────────────────────────────────
    if (body.action === 'reset-week') {
        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (board && board.tiles) {
            board.tiles = board.tiles.map(t => Object.assign({}, t, {
                completed: false, completedBy: null, completedAt: null
            }));
            board.updatedAt = new Date().toISOString();
            board.lastSyncAt = null;
        }

        await Promise.all([
            store.set('users', JSON.stringify({})),
            board ? store.set('board', JSON.stringify(board)) : Promise.resolve(),
            invalidateCache(store)
        ]);
        await addAudit(store, adminId, 'RESET_WEEK', { weekNumber: getCurrentWeekNumber() });
        return json(200, { ok: true });
    }

    // ── regenerate-board ──────────────────────────────────────────
    if (body.action === 'regenerate-board') {
        const gamepool = await store.get('gamepool', { type: 'json' }).catch(() => []) || [];
        if (gamepool.length < 25) {
            return json(400, { error: 'Game pool must have at least 25 entries. Currently has ' + gamepool.length + '.' });
        }

        // Shuffle and pick 25
        const pool = gamepool.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const tiles = pool.slice(0, 25).map((g, idx) => {
            const types = Array.isArray(g.eventTypes) && g.eventTypes.length > 0 ? g.eventTypes : ['Event'];
            const eventType = types[Math.floor(Math.random() * types.length)];
            return {
                position: idx,
                gameId: String(g.gameId),
                gameName: g.name || null,
                eventType,
                completed: false,
                completedBy: null,
                completedAt: null,
                points: 1,
                multiplier: 1,
                lockedByAdmin: false
            };
        });

        const weekNumber = getCurrentWeekNumber();
        const board = {
            tiles,
            globalMultiplier: 1,
            weekNumber,
            updatedAt: new Date().toISOString(),
            lastSyncAt: null
        };

        await store.set('board', JSON.stringify(board));
        await addAudit(store, adminId, 'REGENERATE_BOARD', { weekNumber, tiles: tiles.length });
        await invalidateCache(store);
        return json(200, { ok: true, weekNumber, tiles: tiles.length });
    }

    return json(400, { error: 'Unknown action: ' + body.action });
};
