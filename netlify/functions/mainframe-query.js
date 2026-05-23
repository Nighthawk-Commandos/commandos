// GET /api/mainframe/query?fn=...&payload=...
// Auth-gated proxy for read-only Apps Script queries.
// Routes through api.cipherinteractive.dev which caches responses
// in-memory (per-fn TTL) and keeps GAS warm — so most calls return
// in < 100 ms with no GAS round-trip.
'use strict';

const { verifySession, json, cipherApiGet } = require('./_shared');

const ALLOWED_FNS = ['getGroupMembers', 'getEventById', 'getExemptionDays', 'getDeploymentEvents'];

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const { fn, payload } = event.queryStringParameters || {};
    if (!fn || !ALLOWED_FNS.includes(fn)) return json(400, { error: 'Unknown function' });

    let path = '/api/mainframe/query?fn=' + encodeURIComponent(fn);
    if (payload) path += '&payload=' + encodeURIComponent(payload);

    try {
        const data = await cipherApiGet(path);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify(data)
        };
    } catch (err) {
        return json(502, { error: 'Query failed: ' + err.message });
    }
};
