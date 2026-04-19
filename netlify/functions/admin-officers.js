// ── POST /api/admin/officers — add or remove an officer row
//  POST { action: 'add',    username, rank }  → inserts after last row of that rank
//  POST { action: 'remove', username }         → removes the row for that username
//  Requires: mfOfficers permission
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json, addAdminAudit, addErrorLog, sendAuditWebhook, sendErrorWebhook } = require('./_shared');

async function callAppsScript(fn, payload) {
    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) throw new Error('SCRIPT_URL environment variable not set');
    const qs = new URLSearchParams({ action: 'api', fn });
    if (payload && Object.keys(payload).length) {
        qs.set('payload', JSON.stringify(payload));
    }
    const res = await fetch(scriptUrl + '?' + qs.toString(), {
        method: 'GET',
        headers: { 'Cache-Control': 'no-store' }
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error('Apps Script returned HTTP ' + res.status + ': ' + text.slice(0, 200));
    }
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error('Apps Script returned non-JSON: ' + text.slice(0, 200));
    }
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

        const session = verifySession(event.headers.cookie || event.headers.Cookie);
        if (!session) return json(401, { error: 'Unauthorized' });

        const adminStore = fireStore('commandos-admin');
        const perms = await getUserAdminPerms(session, adminStore).catch(() => null);
        if (!perms || (!perms.mfOfficers && !perms.superadmin)) {
            return json(403, { error: 'Forbidden: requires mfOfficers permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

        const adminId = session.robloxUsername || session.discordId;

        if (body.action === 'add') {
            const username = typeof body.username === 'string' ? body.username.trim() : null;
            const rank     = typeof body.rank     === 'string' ? body.rank.trim()     : null;
            if (!username) return json(400, { error: 'username required' });
            if (!rank)     return json(400, { error: 'rank required' });
            if (username.length > 50) return json(400, { error: 'username too long (max 50 chars)' });
            if (rank.length > 64)     return json(400, { error: 'rank too long (max 64 chars)' });

            let result;
            try {
                result = await callAppsScript('addOfficer', { username, rank });
            } catch (err) {
                return json(500, { error: 'Apps Script error: ' + err.message });
            }

            if (!result || result.error || result.success === false) {
                return json(400, { error: (result && (result.error || result.message)) || 'Operation failed' });
            }

            addAdminAudit(adminStore, adminId, 'OFFICER_ADD', { username, rank }).catch(() => {});
            sendAuditWebhook(adminId, 'OFFICER_ADD', { username, rank }).catch(() => {});
            return json(200, { ok: true, message: (result && result.message) || 'Officer added' });
        }

        if (body.action === 'remove') {
            const username = typeof body.username === 'string' ? body.username.trim() : null;
            if (!username) return json(400, { error: 'username required' });
            if (username.length > 50) return json(400, { error: 'username too long (max 50 chars)' });

            let result;
            try {
                result = await callAppsScript('removeOfficer', { username });
            } catch (err) {
                return json(500, { error: 'Apps Script error: ' + err.message });
            }

            if (!result || result.error || result.success === false) {
                return json(400, {
                    error: (result && (result.error || result.message)) || 'Operation failed',
                    found: (result && result.found) || null
                });
            }

            addAdminAudit(adminStore, adminId, 'OFFICER_REMOVE', { username }).catch(() => {});
            sendAuditWebhook(adminId, 'OFFICER_REMOVE', { username }).catch(() => {});
            return json(200, { ok: true, message: (result && result.message) || 'Officer removed' });
        }

        return json(400, { error: 'Unknown action: ' + body.action });

    } catch (err) {
        // Top-level catch — logs the real error, never hides it
        console.error('[admin-officers] unhandled error:', err);
        sendErrorWebhook('Officer Admin Unhandled Error', err.message || String(err), {}).catch(() => {});
        addErrorLog(null, 'OFFICER_UNHANDLED', err, {}).catch(() => {});
        return json(500, { error: err.message || 'Internal server error' });
    }
};
