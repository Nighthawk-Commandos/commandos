// ── GET  /api/dis/gamepool — return game pool (public)
// ── POST /api/dis/gamepool — save game pool (admin)
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json, addAdminAudit, addErrorLog, sendAuditWebhook, sendErrorWebhook } = require('./_shared');

exports.handler = async (event) => {
    const store = fireStore('commandos-dis');

    if (event.httpMethod === 'GET') {
        const pool = await store.get('gamepool', { type: 'json' }).catch(() => []);
        return json(200, pool || []);
    }

    if (event.httpMethod === 'POST') {
        const session = verifySession(event.headers.cookie || event.headers.Cookie);
        if (!session) return json(401, { error: 'Unauthorized' });
        const adminStore = fireStore('commandos-admin');
        const perms = await getUserAdminPerms(session, adminStore);
        if (!perms || !perms.disGamePool) return json(403, { error: 'Forbidden: requires disGamePool permission' });

        let body;
        try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

        const pool = Array.isArray(body.pool) ? body.pool : [];

        if (pool.length > 500) return json(400, { error: 'Game pool too large (max 500 entries)' });

        // Validate entries
        for (const g of pool) {
            const gid = String(g.gameId || '').trim();
            if (!gid) return json(400, { error: 'Each entry must have a gameId' });
            if (gid.length > 30) return json(400, { error: 'gameId too long (max 30 chars): ' + gid.slice(0, 30) });
            if (!Array.isArray(g.eventTypes) || g.eventTypes.length === 0) {
                return json(400, { error: 'Each entry must have at least one eventType (gameId: ' + gid + ')' });
            }
            if (g.eventTypes.length > 20) return json(400, { error: 'Too many eventTypes per entry (max 20)' });
            for (const t of g.eventTypes) {
                if (String(t).trim().length > 100) return json(400, { error: 'eventType too long (max 100 chars)' });
            }
            if (g.name && String(g.name).length > 128) return json(400, { error: 'Game name too long (max 128 chars)' });
        }

        const cleaned = pool.map(g => ({
            gameId:     String(g.gameId).trim(),
            name:       (g.name || '').trim(),
            eventTypes: g.eventTypes.map(t => String(t).trim()).filter(Boolean)
        }));

        const adminId = (session && (session.robloxUsername || session.discordId)) || 'unknown';

        try {
            await store.set('gamepool', cleaned);
            await addAdminAudit(adminStore, adminId, 'GAMEPOOL_UPDATE', { count: cleaned.length });
            await sendAuditWebhook(adminId, 'GAMEPOOL_UPDATE', { count: cleaned.length });
            return json(200, { ok: true, count: cleaned.length });
        } catch (err) {
            await addErrorLog(adminStore, 'GAMEPOOL_UPDATE', err, { adminId, count: cleaned.length }).catch(() => {});
            await sendErrorWebhook('Game Pool Update Error', err.message || String(err), { adminId }).catch(() => {});
            return json(500, { error: 'Failed to save game pool: ' + err.message });
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
