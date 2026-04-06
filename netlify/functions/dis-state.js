// ── GET /api/dis/state — full board state, leaderboard, stats
// Cached in Blobs for 30 seconds to reduce read load.
'use strict';

const { getStore } = require('@netlify/blobs');

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

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const store = getStore({ name: 'commandos-dis', consistency: 'strong' });
    const weekNumber = getCurrentWeekNumber();

    // ── 30-second cache ─────────────────────────────────────────
    try {
        const cached = await store.get('state-cache', { type: 'json' });
        if (cached && cached.weekNumber === weekNumber &&
            Date.now() - new Date(cached.cachedAt).getTime() < 30000) {
            return json(200, cached.state);
        }
    } catch (_) { /* cache miss is fine */ }

    // ── Load fresh ───────────────────────────────────────────────
    const [board, users] = await Promise.all([
        store.get('board', { type: 'json' }).catch(() => null),
        store.get('users', { type: 'json' }).catch(() => ({}))
    ]);

    const tiles = (board && board.tiles) ? board.tiles : [];
    const usersObj = users || {};

    // ── Build leaderboard ────────────────────────────────────────
    const leaderboard = Object.entries(usersObj)
        .map(([username, data]) => ({
            username,
            points: data.points || 0,
            raffleEntries: data.raffleEntries || 0,
            tiles: (data.claimedTiles || []).length
        }))
        .filter(e => e.points > 0 || e.tiles > 0)
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.tiles !== a.tiles) return b.tiles - a.tiles;
            return b.raffleEntries - a.raffleEntries;
        })
        .map((e, i) => Object.assign({ rank: i + 1 }, e));

    const claimed   = tiles.filter(t => t.completed).length;
    const unclaimed = tiles.filter(t => !t.completed && !t.lockedByAdmin).length;

    const state = {
        tiles,
        globalMultiplier: (board && board.globalMultiplier) || 1,
        weekNumber: (board && board.weekNumber) || weekNumber,
        updatedAt: (board && board.updatedAt) || null,
        lastSyncAt: (board && board.lastSyncAt) || null,
        leaderboard,
        stats: { totalClaimed: claimed, totalUnclaimed: unclaimed }
    };

    // ── Save cache ───────────────────────────────────────────────
    try {
        await store.set('state-cache', JSON.stringify({ state, weekNumber, cachedAt: new Date().toISOString() }));
    } catch (_) { /* non-critical */ }

    return json(200, state);
};
