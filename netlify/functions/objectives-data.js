// GET /api/objectives/data
// Auth-gated proxy for the Division Objectives Apps Script.
// The client never sees OBJECTIVES_URL — it is only held server-side.
// Access requires divisionRank >= 243 OR the viewObjectives admin perm.
// Uses a Firestore cache (5-min TTL, 24-hour stale fallback) to reduce
// calls to the Apps Script and prevent 502 errors on slow responses.
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json } = require('./_shared');

const CACHE_TTL_MS  = 5  * 60 * 1000;       // 5 minutes fresh
const STALE_MAX_MS  = 24 * 60 * 60 * 1000;  // serve stale for up to 24 hours

function dataJson(body) {
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    // Rank 243+ always allowed; otherwise require the viewObjectives perm.
    if (session.divisionRank < 243) {
        const perms = await getUserAdminPerms(session, fireStore('commandos-admin')).catch(() => null);
        if (!perms || !perms.viewObjectives) return json(403, { error: 'Forbidden' });
    }

    const objectivesUrl = process.env.OBJECTIVES_URL;
    if (!objectivesUrl) return json(500, { error: 'OBJECTIVES_URL not configured' });

    const store = fireStore('commandos-main');

    // ── Firestore cache ──────────────────────────────────────────
    let staleData = null;
    try {
        const cached = await store.get('objectives-cache');
        if (cached && cached.data) {
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < CACHE_TTL_MS) return dataJson(cached.data);   // fresh — skip Apps Script
            if (age < STALE_MAX_MS) staleData = cached.data;        // stale fallback
        }
    } catch (_) {}

    // ── Fetch from Apps Script ───────────────────────────────────
    try {
        const res = await fetch(objectivesUrl + '?action=api', {
            redirect: 'follow',
            headers: { 'Cache-Control': 'no-store' },
            signal: AbortSignal.timeout(7000)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        // Write to cache in the background — never block the response
        store.set('objectives-cache', { data, cachedAt: new Date().toISOString() }).catch(() => {});
        return dataJson(data);
    } catch (err) {
        if (staleData) return dataJson(staleData);  // serve stale rather than 502
        return json(502, { success: false, error: 'Failed to fetch objectives: ' + err.message });
    }
};
