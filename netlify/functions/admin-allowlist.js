// ═══════════════════════════════════════════════════════════════
//  admin-allowlist.js — manage the admin allowlist
//  GET    /api/admin/allowlist → list entries
//  POST   /api/admin/allowlist → { discordId, label } → add
//  DELETE /api/admin/allowlist → { discordId }         → remove
//  Requires: divisionRank >= 246 OR already on the list.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { blobsStore, verifySession, json } = require('./_shared');

exports.handler = async function (event) {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'not_authenticated' });

    const store = blobsStore('commandos-admin');
    let list = [];
    try {
        const raw = await store.get('allowlist', { type: 'json' });
        list = Array.isArray(raw) ? raw : [];
    } catch { list = []; }

    // Check admin access: rank >= 246 OR on the list
    const isAdmin = session.divisionRank >= 246 || list.some(e => e.discordId === session.discordId);
    if (!isAdmin) return json(403, { error: 'forbidden' });

    const method = event.httpMethod;

    if (method === 'GET') {
        return json(200, list);
    }

    if (method === 'POST') {
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId, label } = body;
        if (!discordId) return json(400, { error: 'discordId required' });
        if (!list.some(e => e.discordId === discordId)) {
            list.push({ discordId, label: label || discordId, addedBy: session.discordId, addedAt: Date.now() });
            await store.set('allowlist', JSON.stringify(list));
        }
        return json(200, { success: true, list });
    }

    if (method === 'DELETE') {
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId } = body;
        if (!discordId) return json(400, { error: 'discordId required' });
        list = list.filter(e => e.discordId !== discordId);
        await store.set('allowlist', JSON.stringify(list));
        return json(200, { success: true, list });
    }

    return json(405, { error: 'method_not_allowed' });
};
