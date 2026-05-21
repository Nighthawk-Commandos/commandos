// GET /api/objectives/data
// Auth-gated proxy for the Division Objectives Apps Script.
// Routes through api.cipherinteractive.dev (5-min cache, stale-while-revalidate).
// Access requires divisionRank >= 243 OR the viewObjectives admin perm.
// Falls back to a 24-hour Firestore stale copy if the custom API is unreachable.
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json, cipherApiGet } = require('./_shared');

const STALE_MAX_MS = 24 * 60 * 60 * 1000;

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

    // ── Firestore stale fallback (load upfront so it's ready if the API call fails)
    const store = fireStore('commandos-main');
    let staleData = null;
    try {
        const cached = await store.get('objectives-cache');
        if (cached && cached.data) {
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < STALE_MAX_MS) staleData = cached.data;
        }
    } catch (_) {}

    // ── Call the custom API (hits in-memory cache most of the time)
    try {
        const data = await cipherApiGet('/api/mainframe/objectives');
        store.set('objectives-cache', { data, cachedAt: new Date().toISOString() }).catch(() => {});
        return dataJson(data);
    } catch (err) {
        if (staleData) return dataJson(staleData);
        return json(502, { success: false, error: 'Failed to fetch objectives: ' + err.message });
    }
};
