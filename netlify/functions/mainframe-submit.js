// POST /api/mainframe/submit
// Auth-gated proxy for Apps Script mutation calls.
// Verifies the session cookie before forwarding to Apps Script.
// The client never sees SCRIPT_URL — it is only held server-side.
'use strict';

const { verifySession, json } = require('./_shared');

const ALLOWED_FNS = [
    'submitEventLog',
    'submitEditEventLog',
    'submitStatsTransfer',
    'submitExemption',
    'submitMissingAP'
];

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) return json(500, { error: 'SCRIPT_URL not configured' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const { fn, payload } = body;
    if (!fn || typeof fn !== 'string' || !ALLOWED_FNS.includes(fn)) {
        return json(400, { error: 'Unknown function' });
    }

    let url = scriptUrl + '?action=api&fn=' + encodeURIComponent(fn);
    if (payload && typeof payload === 'object' && Object.keys(payload).length) {
        url += '&payload=' + encodeURIComponent(JSON.stringify(payload));
    }

    try {
        const res = await fetch(url, {
            headers: { 'Cache-Control': 'no-store' },
            signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);
        const data = await res.json();
        return json(200, data);
    } catch (err) {
        return json(502, { error: 'Submit failed: ' + err.message });
    }
};
