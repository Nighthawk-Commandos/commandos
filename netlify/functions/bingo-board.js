// ── GET  /api/bingo/board  — return current board
// ── PUT  /api/bingo/board  — admin: save board config
'use strict';

const { fireStore, verifySession, requireAdmin, json, getCurrentWeekNumber } = require('./_shared');

exports.handler = async (event) => {
    const store = fireStore('commandos-bingo');

    // ── GET: public, no auth required ─────────────────────────
    if (event.httpMethod === 'GET') {
        try {
            const board = await store.get('board', { type: 'json' });
            return json(200, board || { tiles: [], weekNumber: 0 });
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    // ── PUT: admin only ────────────────────────────────────────
    if (event.httpMethod === 'PUT') {
        const session = verifySession(event.headers.cookie || event.headers.Cookie);
        const authErr = await requireAdmin(session);
        if (authErr) return authErr;

        let body;
        try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

        if (!Array.isArray(body.tiles) || body.tiles.length !== 25) {
            return json(400, { error: 'tiles must be an array of exactly 25 entries' });
        }
        for (let i = 0; i < 25; i++) {
            const t = body.tiles[i];
            if (typeof t.eventType !== 'string' || !t.eventType.trim()) {
                return json(400, { error: 'Each tile must have a non-empty eventType string' });
            }
            if (t.eventType.length > 100) return json(400, { error: 'eventType max 100 chars' });
            if (t.label && typeof t.label === 'string' && t.label.length > 200) {
                return json(400, { error: 'label max 200 chars' });
            }
        }

        const weekNumber = getCurrentWeekNumber();
        const board = {
            tiles: body.tiles.map(function (t, idx) {
                return { position: idx, eventType: t.eventType.trim().slice(0, 100), label: (t.label || '').trim().slice(0, 200) };
            }),
            weekNumber,
            updatedAt: new Date().toISOString(),
            updatedBy: session.robloxUsername || session.discordId
        };

        try {
            await store.set('board', board);
            return json(200, { ok: true, weekNumber });
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
