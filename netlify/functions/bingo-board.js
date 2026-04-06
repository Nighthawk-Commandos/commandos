// ── GET  /api/bingo/board  — return current board
// ── PUT  /api/bingo/board  — admin: save board config
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

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
    const store = getStore({ name: 'commandos-bingo', consistency: 'strong' });

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
        if (!session) return json(401, { error: 'Unauthorized' });

        const isAdmin = session.divisionRank >= 246;
        if (!isAdmin) {
            // Check allowlist
            try {
                const adminStore = getStore({ name: 'commandos-admin', consistency: 'strong' });
                const allowlist = await adminStore.get('allowlist', { type: 'json' }) || [];
                if (!allowlist.some(function (e) { return e.discordId === session.discordId; })) {
                    return json(403, { error: 'Forbidden: rank 246+ or allowlist required' });
                }
            } catch { return json(403, { error: 'Forbidden' }); }
        }

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
        }

        const weekNumber = getCurrentWeekNumber();
        const board = {
            tiles: body.tiles.map(function (t, idx) {
                return { position: idx, eventType: t.eventType.trim(), label: (t.label || '').trim() };
            }),
            weekNumber,
            updatedAt: new Date().toISOString(),
            updatedBy: session.robloxUsername || session.discordId
        };

        try {
            await store.set('board', JSON.stringify(board));
            return json(200, { ok: true, weekNumber });
        } catch (e) {
            return json(500, { error: e.message });
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};

function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}
