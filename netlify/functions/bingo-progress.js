// ── GET  /api/bingo/progress  — current user's progress for this week
// ── POST /api/bingo/progress  — sync: client sends event log rows, server updates tiles
'use strict';

const { getStore } = require('@netlify/blobs');
const { verifySession, json, getCurrentWeekNumber } = require('./_shared');

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const bingoStore = getStore({ name: 'commandos-bingo', consistency: 'strong' });
    const weekNumber = getCurrentWeekNumber();
    const progressKey = 'progress-' + weekNumber;

    // ── GET: return this user's progress ──────────────────────
    if (event.httpMethod === 'GET') {
        try {
            const allProgress = await bingoStore.get(progressKey, { type: 'json' }) || {};
            const myProgress = allProgress[session.discordId] || {
                username: session.robloxUsername || session.discordUsername,
                completedTiles: [],
                completedBoards: 0,
                raffleEntries: 0
            };
            return json(200, Object.assign({ weekNumber }, myProgress));
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    // ── POST: sync events against bingo board ─────────────────
    if (event.httpMethod === 'POST') {
        let body;
        try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

        // events = [{username, eventType, date?}, ...]  (all events from mainframe)
        if (Array.isArray(body.events) && body.events.length > 5000) {
            return json(400, { error: 'events array too large (max 5000)' });
        }
        const allEvents = Array.isArray(body.events) ? body.events : [];
        const myUsername = (session.robloxUsername || '').toLowerCase();

        // Filter to this user's events
        const myEvents = allEvents.filter(function (e) {
            return e && typeof e.username === 'string' &&
                e.username.toLowerCase() === myUsername;
        });

        // Get current board
        let board;
        try { board = await bingoStore.get('board', { type: 'json' }); } catch {}
        if (!board || !board.tiles || board.tiles.length === 0) {
            return json(200, { ok: true, newlyCompleted: 0, totalCompleted: 0, boardCompleted: false, message: 'No board configured' });
        }

        // Get existing progress
        let allProgress;
        try { allProgress = await bingoStore.get(progressKey, { type: 'json' }) || {}; } catch { allProgress = {}; }

        const existing = allProgress[session.discordId] || {
            username: session.robloxUsername || session.discordUsername,
            completedTiles: [],
            completedBoards: 0,
            raffleEntries: 0
        };

        const alreadyDone = Array.isArray(existing.completedTiles) ? existing.completedTiles.slice() : [];

        // Build a pool of event-type counts for matching
        // Tally how many events of each type the user has
        const eventPool = {};
        myEvents.forEach(function (e) {
            const et = (e.eventType || '').trim().toLowerCase();
            if (et) eventPool[et] = (eventPool[et] || 0) + 1;
        });

        // Already-completed tiles consume from the pool first
        const pendingTiles = [];
        board.tiles.forEach(function (tile) {
            if (alreadyDone.indexOf(tile.position) !== -1) {
                // Already done — consume one event from pool (so counts don't allow extra)
                const et = tile.eventType.toLowerCase();
                if (eventPool[et] > 0) eventPool[et]--;
            } else {
                pendingTiles.push(tile);
            }
        });

        // Now match remaining tiles against remaining events
        const newlyCompleted = [];
        pendingTiles.forEach(function (tile) {
            const et = tile.eventType.toLowerCase();
            if (eventPool[et] > 0) {
                eventPool[et]--;
                newlyCompleted.push(tile.position);
            }
        });

        const allCompleted = alreadyDone.concat(newlyCompleted);
        const boardCompleted = allCompleted.length >= 25;
        const prevBoards = existing.completedBoards || 0;
        const prevEntries = existing.raffleEntries || 0;
        const newBoards = boardCompleted && alreadyDone.length < 25 ? 1 : 0;

        const updated = {
            username: session.robloxUsername || session.discordUsername,
            robloxUsername: session.robloxUsername || null,
            completedTiles: allCompleted,
            completedBoards: prevBoards + newBoards,
            raffleEntries: prevEntries + newBoards,
            updatedAt: new Date().toISOString()
        };

        allProgress[session.discordId] = updated;

        try {
            await bingoStore.set(progressKey, JSON.stringify(allProgress));
        } catch (e) {
            return json(500, { error: 'Failed to save progress: ' + e.message });
        }

        return json(200, {
            ok: true,
            weekNumber,
            newlyCompleted: newlyCompleted.length,
            totalCompleted: allCompleted.length,
            boardCompleted,
            completedBoards: updated.completedBoards,
            raffleEntries: updated.raffleEntries
        });
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
