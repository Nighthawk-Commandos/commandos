// ── GET  /api/dis/gamepool — return game pool (public)
// ── POST /api/dis/gamepool — save game pool (admin)
'use strict';

const { blobsStore, verifySession, getUserAdminPerms, json } = require('./_shared');

exports.handler = async (event) => {
    const store = blobsStore('commandos-dis');

    if (event.httpMethod === 'GET') {
        const pool = await store.get('gamepool', { type: 'json' }).catch(() => []);
        return json(200, pool || []);
    }

    if (event.httpMethod === 'POST') {
        const session = verifySession(event.headers.cookie || event.headers.Cookie);
        const adminStore = blobsStore('commandos-admin');
        const perms = await getUserAdminPerms(session, adminStore);
        if (!perms || !perms.disGamePool) return json(403, { error: 'Forbidden: requires disGamePool permission' });

        let body;
        try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

        const pool = Array.isArray(body.pool) ? body.pool : [];

        // Validate entries
        for (const g of pool) {
            if (!g.gameId || !String(g.gameId).trim()) {
                return json(400, { error: 'Each entry must have a gameId' });
            }
            if (!Array.isArray(g.eventTypes) || g.eventTypes.length === 0) {
                return json(400, { error: 'Each entry must have at least one eventType (gameId: ' + g.gameId + ')' });
            }
        }

        const cleaned = pool.map(g => ({
            gameId:     String(g.gameId).trim(),
            name:       (g.name || '').trim(),
            eventTypes: g.eventTypes.map(t => String(t).trim()).filter(Boolean)
        }));

        await store.set('gamepool', JSON.stringify(cleaned));
        return json(200, { ok: true, count: cleaned.length });
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
