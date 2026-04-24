// ── GET /api/mainframe/data — server-side cached proxy for getAllData
//
// Cache layers:
//   1. Netlify CDN edge cache (s-maxage=600 — 10 min)
//   2. Firestore cache (10-min TTL) — one Apps Script call per 10 min max
//   3. Stale fallback — if Apps Script times out, last good data is served
//   4. Apps Script (origin)
'use strict';

const { fireStore, verifySession, json, sendErrorWebhook } = require('./_shared');

const CACHE_TTL_MS  = 10 * 60 * 1000; // 10 minutes fresh
const STALE_MAX_MS  = 60 * 60 * 1000; // serve stale for up to 1 hour on error

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

    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) return json(500, { error: 'SCRIPT_URL not configured' });

    const store = fireStore('commandos-main');

    // ── Firestore cache ──────────────────────────────────────────
    let staleData = null;
    try {
        const cached = await store.get('data-cache');
        if (cached && cached.data) {
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < CACHE_TTL_MS) return dataJson(cached.data);  // fresh
            if (age < STALE_MAX_MS) staleData = cached.data;       // stale fallback
        }
    } catch (_) {}

    // ── Fetch fresh from Apps Script ─────────────────────────────
    try {
        const url = scriptUrl + '?action=api&fn=getAllData';
        const res = await fetch(url, {
            headers: { 'Cache-Control': 'no-store' },
            signal:  AbortSignal.timeout(24000)
        });
        if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);
        const data = await res.json();

        store.set('data-cache', { data, cachedAt: new Date().toISOString() }).catch(() => {});
        return dataJson(data);
    } catch (err) {
        if (staleData) return dataJson(staleData);  // serve stale rather than error
        await sendErrorWebhook('Mainframe Data Fetch Error', err.message, { fn: 'getAllData' }).catch(() => {});
        return json(502, { error: 'Failed to fetch mainframe data: ' + err.message });
    }
};
