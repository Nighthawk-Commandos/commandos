// ── Shared utilities for Netlify Functions ─────────────────────
// Prefixed with _ so Netlify CLI does not treat this as a function.
'use strict';

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');
const { fireStore } = require('./_firebase');

// ── Discord webhook URLs ────────────────────────────────────────
const DISCORD_ERROR_WEBHOOK = process.env.DISCORD_ERROR_WEBHOOK_URL || '';
const DISCORD_AUDIT_WEBHOOK = process.env.DISCORD_AUDIT_WEBHOOK_URL || '';

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
        if (!secret) { console.error('[_shared] SESSION_SECRET env var is not set'); return null; }
        // sig must be exactly 64 hex chars (SHA-256 HMAC)
        if (!/^[0-9a-f]{64}$/.test(sig)) return null;
        const expected = crypto.createHmac('sha256', secret).update(payload64).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        // Use 'base64' (not 'base64url') — must match how auth-callback.js signs sessions
        const session = JSON.parse(Buffer.from(payload64, 'base64').toString('utf8'));
        if (!session || typeof session !== 'object') return null;
        if (typeof session.exp !== 'number' || Date.now() > session.exp * 1000) return null;
        // Required fields must be present
        if (!session.discordId || !session.robloxId) return null;
        return session;
    } catch { return null; }
}

// ── Session freshness ───────────────────────────────────────────
// Rank-based superadmin (divisionRank >= 246) is only trusted for 24 h after login.
// After that the user must re-authenticate. Allowlist-based access is not time-limited
// because membership is stored server-side and can be revoked at any time.
const _RANK_SESSION_MAX_AGE_S = 24 * 60 * 60; // 24 hours in seconds
function _isRankSessionFresh(session) {
    // Sessions created before the iat field was added are treated as stale.
    if (!session || typeof session.iat !== 'number') return false;
    return (Math.floor(Date.now() / 1000) - session.iat) < _RANK_SESSION_MAX_AGE_S;
}

// ── Admin gate ──────────────────────────────────────────────────
// Returns null if the session passes (rank 246+ with fresh session, or on allowlist).
// Returns a JSON error response if access is denied.
async function requireAdmin(session) {
    if (!session) return json(401, { error: 'Unauthorized' });
    // Rank-based gate: only valid for 24 h after login to prevent stale-rank bypass.
    if (session.divisionRank >= 246 && _isRankSessionFresh(session)) return null;
    try {
        const allowlist = await fireStore('commandos-admin').get('allowlist', { type: 'json' }) || [];
        if (allowlist.some(e => e.discordId === session.discordId)) return null;
    } catch {}
    return json(403, { error: 'Forbidden' });
}

// ── Granular permission check ────────────────────────────────────
// Returns full permissions object for the session user.
// Superadmin (rank 246+) always has all perms.
// Supports both single roleId and roleIds[] array for multi-role assignment.
const ALL_PERMS = ['roleAssign','roleEdit','disSync','disTiles','disPoints','disRaffle','disGamePool','disAudit','mfOfficers','mfRemote'];

async function getUserAdminPerms(session, adminStore) {
    if (!session) return null;
    // Rank-based superadmin: only trusted for 24 h to prevent stale-rank bypass.
    if (session.divisionRank >= 246 && _isRankSessionFresh(session)) {
        const perms = { superadmin: true };
        ALL_PERMS.forEach(k => { perms[k] = true; });
        return perms;
    }
    try {
        const list  = await adminStore.get('allowlist', { type: 'json' }) || [];
        const entry = list.find(e => e.discordId === session.discordId);
        if (!entry) return null;

        // Collect all roleIds — support legacy single roleId and new roleIds array
        const roleIds = [];
        if (Array.isArray(entry.roleIds) && entry.roleIds.length) {
            roleIds.push(...entry.roleIds);
        } else if (entry.roleId) {
            roleIds.push(entry.roleId);
        }

        // Union permissions from all assigned roles + any direct permissions
        const roles = roleIds.length
            ? (await adminStore.get('roles', { type: 'json' }).catch(() => []) || [])
            : [];

        let merged = Object.assign({}, entry.permissions || {});
        for (const roleId of roleIds) {
            const role = roles.find(r => r.id === roleId);
            if (role && role.permissions) {
                ALL_PERMS.forEach(k => {
                    if (role.permissions[k]) merged[k] = true;
                });
            }
        }

        const perms = { superadmin: false };
        ALL_PERMS.forEach(k => { perms[k] = !!merged[k]; });
        return perms;
    } catch { return null; }
}

// Returns null if session has the required permission, or a 403 response.
async function requirePerm(session, adminStore, permKey) {
    if (!session) return json(401, { error: 'Unauthorized' });
    if (session.divisionRank >= 246 && _isRankSessionFresh(session)) return null;
    try {
        const perms = await getUserAdminPerms(session, adminStore);
        if (perms && perms[permKey]) return null;
    } catch {}
    return json(403, { error: 'Forbidden: requires ' + permKey + ' permission' });
}

// ── JSON response helper ────────────────────────────────────────
function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        },
        body: JSON.stringify(body)
    };
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
// Always writes to Netlify Blobs (cache only — data lives in Firebase).
async function invalidateCache() {
    try { await blobsStore('commandos-dis').set('state-cache', ''); } catch {}
}

// ── Admin audit log ─────────────────────────────────────────────
// Appends an entry to commandos-admin/audit. Keeps last 500 entries.
async function addAdminAudit(_unused, adminId, action, details) {
    const store = fireStore('commandos-admin');
    let log;
    try { log = await store.get('audit', { type: 'json' }); } catch {}
    log = Array.isArray(log) ? log : [];
    log.push({ adminId, action, details, timestamp: new Date().toISOString() });
    if (log.length > 500) log = log.slice(-500);
    await store.set('audit', log);
}

// ── Error log ────────────────────────────────────────────────────
// Appends an error entry to commandos-admin/error-log. Keeps last 200 entries.
// Used for failures — successful actions go to audit log instead.
async function addErrorLog(_unused, action, error, details) {
    const store = fireStore('commandos-admin');
    let log;
    try { log = await store.get('error-log', { type: 'json' }); } catch {}
    log = Array.isArray(log) ? log : [];
    log.push({
        action,
        error: String(error || 'Unknown error').slice(0, 500),
        details: details || {},
        timestamp: new Date().toISOString()
    });
    if (log.length > 200) log = log.slice(-200);
    await store.set('error-log', log);
}

// ── Discord webhook sender ──────────────────────────────────────
// Fire-and-forget — never throws, never blocks response.
async function sendDiscordWebhook(url, payload) {
    try {
        await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
    } catch (_) { /* never block on webhook failure */ }
}

// ── Error webhook ───────────────────────────────────────────────
// Sends a simple error notification to the error channel.
async function sendErrorWebhook(title, description, errorDetails) {
    const embed = {
        title:       String(title),
        description: String(description).slice(0, 2048),
        color:       0xE05252,
        timestamp:   new Date().toISOString(),
        fields: errorDetails ? [{ name: 'Details', value: String(JSON.stringify(errorDetails)).slice(0, 1024), inline: false }] : []
    };
    return sendDiscordWebhook(DISCORD_ERROR_WEBHOOK, { embeds: [embed] });
}

// ── Audit webhook ───────────────────────────────────────────────
// Sends a styled audit log embed to the audit channel.
async function sendAuditWebhook(adminId, action, details) {
    // Map action to a readable title and color
    const actionColors = {
        ADVANCE_WEEK:      0x7C4AB8,
        ADVANCE_MONTH:     0xC8A44A,
        OFFICER_ADD:       0x4A9C72,
        OFFICER_REMOVE:    0xE05252,
        UNLOCK_TILE:       0x4A7FC8,
        LOCK_TILE:         0xE05252,
        FORCE_CLAIM:       0x4A7FC8,
        ADJUST_POINTS:     0xC8A44A,
        ADJUST_RAFFLE:     0xC8A44A,
        SET_MULTIPLIER:    0xC8A44A,
        RESET_WEEK:        0xE05252,
        REGENERATE_BOARD:  0x7C4AB8,
        ROLE_CREATE:       0x4A9C72,
        ROLE_UPDATE:       0x4A7FC8,
        ROLE_DELETE:       0xE05252,
        ALLOWLIST_ADD:     0x4A9C72,
        ALLOWLIST_UPDATE:  0x4A7FC8,
        ALLOWLIST_REMOVE:  0xE05252,
        GAMEPOOL_UPDATE:   0x4A7FC8,
        SET_TILE_POINTS:   0xC8A44A,
        SET_TILE_EVENTTYPE:0xC8A44A
    };

    const color = actionColors[action] || 0x6B7280;
    const fieldsArr = [];
    if (details && typeof details === 'object') {
        for (const [k, v] of Object.entries(details)) {
            if (v !== undefined && v !== null) {
                fieldsArr.push({ name: k, value: String(JSON.stringify(v)).slice(0, 256), inline: true });
                if (fieldsArr.length >= 9) break; // Discord embed field limit
            }
        }
    }

    const embed = {
        title:     String(action).replace(/_/g, ' '),
        color,
        timestamp: new Date().toISOString(),
        fields:    [
            { name: 'Admin', value: String(adminId || 'Unknown'), inline: true },
            ...fieldsArr
        ],
        footer: { text: 'TNI:C Commandos Mainframe' }
    };
    return sendDiscordWebhook(DISCORD_AUDIT_WEBHOOK, { embeds: [embed] });
}

module.exports = {
    blobsStore,
    fireStore,
    verifySession,
    requireAdmin,
    getUserAdminPerms,
    requirePerm,
    ALL_PERMS,
    json,
    getCurrentWeekNumber,
    invalidateCache,
    addAdminAudit,
    addErrorLog,
    sendErrorWebhook,
    sendAuditWebhook
};
