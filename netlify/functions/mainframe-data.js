// GET /api/mainframe/data — server-side cached proxy for getAllData
//
// Cache layers:
//   1. Netlify CDN edge cache (s-maxage=600 — 10 min)
//   2. api.cipherinteractive.dev in-memory cache (10-min, stale-while-revalidate)
//      — reads directly from Google Sheets; cache is pre-populated on bot startup
//        so requests almost always return in < 100 ms.
//   3. Firestore stale fallback — if the custom API is unreachable, serve
//      up to 24 hours of stale data rather than returning a 502.
'use strict';

const { fireStore, verifySession, json, cipherApiGet, sendErrorWebhook } = require('./_shared');

const STALE_MAX_MS = 24 * 60 * 60 * 1000; // serve stale for up to 24 hours on error

function dataJson(body) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    // ── Firestore stale fallback (load upfront so it's ready if the API call fails)
    const store = fireStore('commandos-main');
    let staleData = null;
    try {
        const cached = await store.get('data-cache');
        if (cached && cached.data) {
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < STALE_MAX_MS) staleData = cached.data;
        }
    } catch (_) {}

    // ── Call the custom API (hits in-memory cache ~99% of the time)
    try {
        const data = await cipherApiGet('/api/mainframe/data');
        // Update Firestore in the background so the stale fallback stays fresh
        store.set('data-cache', { data, cachedAt: new Date().toISOString() }).catch(() => {});
        return dataJson(data);
    } catch (err) {
        if (staleData) return dataJson(staleData);
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        if (!isTimeout) {
            await sendErrorWebhook('Mainframe Data Fetch Error', err.message, { fn: 'getAllData' }).catch(() => {});
        }
        return json(502, { error: 'Failed to fetch mainframe data: ' + err.message });
    }
};
