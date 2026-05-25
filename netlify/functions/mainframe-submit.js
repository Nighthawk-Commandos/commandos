// POST /api/mainframe/submit
// Auth-gated proxy for Sheets mutation calls.
// Routes through api.cipherinteractive.dev which writes directly to
// Google Sheets — mutations typically complete in 1-3 seconds.
'use strict';

const { verifySession, json, cipherApiPost } = require('./_shared');

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

    if ((event.body || '').length > 16384) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const { fn, payload } = body;
    if (!fn || typeof fn !== 'string' || !ALLOWED_FNS.includes(fn)) {
        return json(400, { error: 'Unknown function' });
    }

    try {
        const data = await cipherApiPost('/api/mainframe/submit', { fn, payload });
        return json(200, data);
    } catch (err) {
        return json(502, { error: 'Submit failed: ' + err.message });
    }
};
