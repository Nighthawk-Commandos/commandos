// GET /api/mainframe/query?fn=...&payload=...
// Auth-gated proxy for read-only Apps Script queries.
// The client never sees SCRIPT_URL — it is only held server-side.
'use strict';

const { verifySession, json } = require('./_shared');

const ALLOWED_FNS = ['getGroupMembers', 'getEventById', 'getExemptionDays', 'getDeploymentEvents'];

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) return json(500, { error: 'SCRIPT_URL not configured' });

    const { fn, payload } = event.queryStringParameters || {};
    if (!fn || !ALLOWED_FNS.includes(fn)) return json(400, { error: 'Unknown function' });

    let url = scriptUrl + '?action=api&fn=' + encodeURIComponent(fn);
    if (payload) url += '&payload=' + encodeURIComponent(payload);

    try {
        const res = await fetch(url, {
            headers: { 'Cache-Control': 'no-store' },
            signal: AbortSignal.timeout(25000)
        });
        if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);
        const data = await res.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify(data)
        };
    } catch (err) {
        return json(502, { error: 'Query failed: ' + err.message });
    }
};
