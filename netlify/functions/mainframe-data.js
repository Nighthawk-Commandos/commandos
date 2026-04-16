// ── GET /api/mainframe/data — server-side cached proxy for getAllData
//
// Architecture for 300+ users:
//   1. Netlify CDN edge cache (s-maxage=300 — 5 min)
//       → the vast majority of requests never hit this function at all
//   2. Blobs cache (5-min TTL) — at most one Apps Script call per 5 min
//       → CDN misses hit this; only cold misses call Apps Script
//   3. Apps Script (origin)
//
// Result: Apps Script called at most once per 5 minutes regardless of user count.
'use strict';

const { blobsStore, verifySession, json, sendErrorWebhook } = require('./_shared');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function dataJson(body) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    // Auth check — only logged-in users get mainframe data
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) return json(500, { error: 'SCRIPT_URL not configured' });

    const store = blobsStore('commandos-main');

    // ── Blobs cache (CDN-miss path) ──────────────────────────────
    try {
        const cached = await store.get('data-cache', { type: 'json' });
        if (cached && cached.data && Date.now() - new Date(cached.cachedAt).getTime() < CACHE_TTL_MS) {
            return dataJson(cached.data);
        }
    } catch (_) {}

    // ── Fetch fresh from Apps Script ─────────────────────────────
    try {
        const url = scriptUrl + '?action=api&fn=getAllData';
        const res = await fetch(url, {
            headers: { 'Cache-Control': 'no-store' },
            signal: AbortSignal.timeout(25000) // 25s timeout
        });
        if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);
        const data = await res.json();

        // Cache it in Blobs (non-blocking — don't add latency)
        store.set('data-cache', JSON.stringify({ data, cachedAt: new Date().toISOString() })).catch(() => {});

        return dataJson(data);
    } catch (err) {
        await sendErrorWebhook('Mainframe Data Fetch Error', err.message, { fn: 'getAllData' }).catch(() => {});
        return json(502, { error: 'Failed to fetch mainframe data: ' + err.message });
    }
};
