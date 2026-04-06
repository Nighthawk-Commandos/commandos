// ═══════════════════════════════════════════════════════════════
//  admin-allowlist.js — manage the admin allowlist
//  Uses Netlify Blobs for persistence.
//  GET    /api/admin/allowlist → list entries
//  POST   /api/admin/allowlist → { discordId, label } → add
//  DELETE /api/admin/allowlist → { discordId }         → remove
//  Requires: divisionRank >= 246 OR already on the list.
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const ADMIN_RANK     = 246;
const SESSION_COOKIE = 'cmd_session';

// ── Session helpers (duplicated from auth-me for independence) ─
function verifySession(token, secret) {
    if (!token || !token.includes('.')) return null;
    const dot      = token.lastIndexOf('.');
    const encoded  = token.slice(0, dot);
    const hmac     = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
    if (expected.length !== hmac.length) return null;
    try {
        const ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'));
        if (!ok) return null;
        const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch { return null; }
}

function parseCookies(header) {
    if (!header) return {};
    return Object.fromEntries(
        header.split(';').map(c => {
            const idx = c.indexOf('=');
            if (idx < 0) return [c.trim(), ''];
            return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
        })
    );
}

function json(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
    const secret  = process.env.SESSION_SECRET || 'change-this-secret-in-netlify-env';
    const cookies = parseCookies(event.headers.cookie || '');
    const token   = cookies[SESSION_COOKIE];

    if (!token) return json(401, { error: 'not_authenticated' });

    const session = verifySession(token, secret);
    if (!session)  return json(401, { error: 'invalid_session' });

    // Load allowlist
    const store = getStore('commandos-admin');
    let list = [];
    try {
        const raw = await store.get('allowlist', { type: 'json' });
        list = Array.isArray(raw) ? raw : [];
    } catch { list = []; }

    // Check admin access: rank >= 246 OR on the list
    const isAdmin = session.divisionRank >= ADMIN_RANK || list.some(e => e.discordId === session.discordId);
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
            await store.setJSON('allowlist', list);
        }
        return json(200, { success: true, list });
    }

    if (method === 'DELETE') {
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId } = body;
        if (!discordId) return json(400, { error: 'discordId required' });
        list = list.filter(e => e.discordId !== discordId);
        await store.setJSON('allowlist', list);
        return json(200, { success: true, list });
    }

    return json(405, { error: 'method_not_allowed' });
};
