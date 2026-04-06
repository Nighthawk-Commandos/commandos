// ── GET  /api/dis/gamepool — return game pool (public)
// ── POST /api/dis/gamepool — save game pool (admin)
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function blobsStore(name) {
    return getStore({ name, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
}

function verifySession(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)cmd_session=([^;]+)/);
    if (!match) return null;
    try {
        const raw = decodeURIComponent(match[1]);
        const lastDot = raw.lastIndexOf('.');
        if (lastDot === -1) return null;
        const payload64 = raw.slice(0, lastDot);
        const sig = raw.slice(lastDot + 1);
        const secret = process.env.SESSION_SECRET;
        if (!secret) return null;
        const expected = crypto.createHmac('sha256', secret).update(payload64).digest('hex');
        if (sig.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        const session = JSON.parse(Buffer.from(payload64, 'base64url').toString('utf8'));
        if (Date.now() > session.exp * 1000) return null;
        return session;
    } catch { return null; }
}

function json(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
    const store = blobsStore('commandos-dis');

    if (event.httpMethod === 'GET') {
        const pool = await store.get('gamepool', { type: 'json' }).catch(() => []);
        return json(200, pool || []);
    }

    if (event.httpMethod === 'POST') {
        const session = verifySession(event.headers.cookie || event.headers.Cookie);
        if (!session) return json(401, { error: 'Unauthorized' });

        const isAdmin = session.divisionRank >= 246;
        if (!isAdmin) {
            try {
                const adminStore = blobsStore('commandos-admin');
                const allowlist = await adminStore.get('allowlist', { type: 'json' }) || [];
                if (!allowlist.some(e => e.discordId === session.discordId)) {
                    return json(403, { error: 'Forbidden' });
                }
            } catch { return json(403, { error: 'Forbidden' }); }
        }

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
            gameId: String(g.gameId).trim(),
            name: (g.name || '').trim(),
            eventTypes: g.eventTypes.map(t => String(t).trim()).filter(Boolean)
        }));

        await store.set('gamepool', JSON.stringify(cleaned));
        return json(200, { ok: true, count: cleaned.length });
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};