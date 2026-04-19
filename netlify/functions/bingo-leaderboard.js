// ── GET /api/bingo/leaderboard — weekly leaderboard (public)
'use strict';

const { fireStore, json, getCurrentWeekNumber } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const weekNumber = getCurrentWeekNumber();
    const bingoStore = fireStore('commandos-bingo');

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
