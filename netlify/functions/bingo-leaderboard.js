// ── GET /api/bingo/leaderboard — weekly leaderboard (public)
'use strict';

const { getStore } = require('@netlify/blobs');

function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}

function json(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const weekNumber = getCurrentWeekNumber();
    const bingoStore = getStore({ name: 'commandos-bingo', consistency: 'strong' });

    try {
        const allProgress = await bingoStore.get('progress-' + weekNumber, { type: 'json' }) || {};

        const entries = Object.entries(allProgress)
            .map(function ([discordId, p]) {
                return {
                    discordId,
                    username: p.username || discordId,
                    completedTiles: Array.isArray(p.completedTiles) ? p.completedTiles.length : 0,
                    completedBoards: p.completedBoards || 0,
                    raffleEntries: p.raffleEntries || 0
                };
            })
            .filter(function (e) { return e.completedTiles > 0; })
            .sort(function (a, b) {
                if (b.completedTiles !== a.completedTiles) return b.completedTiles - a.completedTiles;
                if (b.completedBoards !== a.completedBoards) return b.completedBoards - a.completedBoards;
                return b.raffleEntries - a.raffleEntries;
            })
            .map(function (e, i) { return Object.assign({ rank: i + 1 }, e); });

        return json(200, { weekNumber, entries });
    } catch (e) {
        return json(500, { error: e.message });
    }
};
