// ── POST /api/bingo/admin — admin actions: regenerate, reset-week
'use strict';

const { getStore } = require('@netlify/blobs');
const { verifySession, requireAdmin, json, getCurrentWeekNumber } = require('./_shared');

const DEFAULT_EVENT_TYPES = [
    'Raid', 'Defence', 'Training', 'Patrol', 'Drill',
    'Raid', 'Defence', 'Training', 'Patrol', 'Drill',
    'Raid', 'Defence', 'Training', 'Patrol', 'Drill',
    'Raid', 'Defence', 'Training', 'Patrol', 'Drill',
    'Raid', 'Defence', 'Training', 'Patrol', 'Drill'
];

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const authErr = await requireAdmin(session);
    if (authErr) return authErr;

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

    const bingoStore = getStore({ name: 'commandos-bingo', consistency: 'strong' });
    const weekNumber = getCurrentWeekNumber();

    // ── Action: regenerate — create a new random board ──────────
    if (body.action === 'regenerate') {
        let customTypes = body.eventTypes;
        if (Array.isArray(customTypes)) {
            if (customTypes.length > 200) return json(400, { error: 'eventTypes max 200 entries' });
            for (const et of customTypes) {
                if (typeof et !== 'string' || et.length > 100) return json(400, { error: 'Each eventType must be a string ≤100 chars' });
            }
        }
        const eventTypes = Array.isArray(customTypes) && customTypes.length >= 25
            ? customTypes
            : DEFAULT_EVENT_TYPES;

        // Shuffle
        const pool = eventTypes.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }

        const tiles = pool.slice(0, 25).map(function (et, idx) {
            return { position: idx, eventType: et, label: '' };
        });

        const board = { tiles, weekNumber, updatedAt: new Date().toISOString(), updatedBy: session.robloxUsername || session.discordId };
        try {
            await bingoStore.set('board', JSON.stringify(board));
            return json(200, { ok: true, weekNumber, tiles });
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    // ── Action: reset-week — wipe all progress for current week ─
    if (body.action === 'reset-week') {
        try {
            await bingoStore.set('progress-' + weekNumber, JSON.stringify({}));
            return json(200, { ok: true, weekNumber, message: 'Progress reset for week ' + weekNumber });
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    return json(400, { error: 'Unknown action. Valid: regenerate, reset-week' });
};
