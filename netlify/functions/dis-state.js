// ── GET /api/dis/state — full board state, leaderboard, stats
// Two-layer cache:
//   1. Netlify CDN (s-maxage=30) — serves all concurrent users from the edge.
//   2. Blobs state-cache (30s TTL) — only one cold read per 30s for CDN misses.
'use strict';

const { blobsStore, fireStore, json, getCurrentWeekNumber } = require('./_shared');

// Adds CDN cache directives to the response so Netlify's global edge
// can absorb concurrent traffic without hitting the function at all.
function stateJson(body) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const cacheStore = blobsStore('commandos-dis');
    const dataStore  = fireStore('commandos-dis');
    const weekNumber = getCurrentWeekNumber();

    // ── Blobs cache (CDN miss path) ───────────────────────────────
    try {
        const cached = await cacheStore.get('state-cache', { type: 'json' });
        if (cached && cached.weekNumber === weekNumber &&
            Date.now() - new Date(cached.cachedAt).getTime() < 30000) {
            return stateJson(cached.state);
        }
    } catch (_) {}

    // ── Load fresh from Firebase ─────────────────────────────────
    const [board, users] = await Promise.all([
        dataStore.get('board', { type: 'json' }).catch(() => null),
        dataStore.get('users', { type: 'json' }).catch(() => ({}))
    ]);

    const tiles    = (board && board.tiles) ? board.tiles : [];
    const usersObj = users || {};

    // ── Build leaderboard ────────────────────────────────────────
    const leaderboard = Object.entries(usersObj)
        .map(([username, data]) => ({
            username,
            points:        data.points || 0,
            raffleEntries: data.raffleEntries || 0,
            tiles:         (data.claimedTiles || []).length
        }))
        .filter(e => e.points > 0 || e.tiles > 0)
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.tiles  !== a.tiles)  return b.tiles  - a.tiles;
            return b.raffleEntries - a.raffleEntries;
        })
        .map((e, i) => Object.assign({ rank: i + 1 }, e));

    const claimed   = tiles.filter(t => t.completed).length;
    const unclaimed = tiles.filter(t => !t.completed && !t.lockedByAdmin).length;

    const state = {
        tiles,
        globalMultiplier: (board && board.globalMultiplier) || 1,
        weekNumber:       (board && board.weekNumber) || weekNumber,
        updatedAt:        (board && board.updatedAt)   || null,
        lastSyncAt:       (board && board.lastSyncAt)  || null,
        leaderboard,
        stats: { totalClaimed: claimed, totalUnclaimed: unclaimed }
    };

    // ── Save cache (non-blocking — don't add latency to the response) ──
    cacheStore.set('state-cache', JSON.stringify({ state, weekNumber, cachedAt: new Date().toISOString() })).catch(() => {});

    return stateJson(state);
};
