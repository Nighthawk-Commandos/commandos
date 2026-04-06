// ── POST /api/bingo/admin — admin actions: regenerate, reset-week
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

function getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}

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
    if (!session) return json(401, { error: 'Unauthorized' });

    // Require rank 246+ or allowlist
    const isAdmin = session.divisionRank >= 246;
    if (!isAdmin) {
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

    const bingoStore = getStore({ name: 'commandos-bingo', consistency: 'strong' });
    const weekNumber = getCurrentWeekNumber();

    // ── Action: regenerate — create a new random board ──────────
    if (body.action === 'regenerate') {
        const eventTypes = Array.isArray(body.eventTypes) && body.eventTypes.length >= 25
            ? body.eventTypes
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
