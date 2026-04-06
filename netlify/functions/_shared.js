// ── Shared utilities for Netlify Functions ─────────────────────
// Prefixed with _ so Netlify CLI does not treat this as a function.
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

// ── Blobs store factory ─────────────────────────────────────────
function blobsStore(name) {
    return getStore({ name, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
}

// ── Session verification ────────────────────────────────────────
// Reads cmd_session from the raw Cookie header, verifies HMAC, checks expiry.
function verifySession(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)cmd_session=([^;]+)/);
    if (!match) return null;
    try {
        const raw      = decodeURIComponent(match[1]);
        const lastDot  = raw.lastIndexOf('.');
        if (lastDot === -1) return null;
        const payload64 = raw.slice(0, lastDot);
        const sig        = raw.slice(lastDot + 1);
        const secret     = process.env.SESSION_SECRET;
        if (!secret) return null;
        const expected = crypto.createHmac('sha256', secret).update(payload64).digest('hex');
        if (sig.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        const session = JSON.parse(Buffer.from(payload64, 'base64url').toString('utf8'));
        if (Date.now() > session.exp * 1000) return null;
        return session;
    } catch { return null; }
}

// ── Admin gate ──────────────────────────────────────────────────
// Returns null if the session passes (rank 246+ or on allowlist).
// Returns a JSON error response if access is denied.
async function requireAdmin(session) {
    if (!session) return json(401, { error: 'Unauthorized' });
    if (session.divisionRank >= 246) return null;
    try {
        const allowlist = await blobsStore('commandos-admin').get('allowlist', { type: 'json' }) || [];
        if (allowlist.some(e => e.discordId === session.discordId)) return null;
    } catch {}
    return json(403, { error: 'Forbidden' });
}

// ── JSON response helper ────────────────────────────────────────
function json(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ── ISO week number (ISO 8601) ──────────────────────────────────
function getCurrentWeekNumber() {
    const now   = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const day   = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}

// ── Blobs state-cache invalidation ─────────────────────────────
async function invalidateCache(store) {
    try { await store.set('state-cache', ''); } catch {}
}

module.exports = { blobsStore, verifySession, requireAdmin, json, getCurrentWeekNumber, invalidateCache };
