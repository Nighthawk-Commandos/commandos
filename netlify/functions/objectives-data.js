// GET /api/objectives/data
// Auth-gated proxy for the Division Objectives Apps Script.
// The client never sees OBJECTIVES_URL — it is only held server-side.
'use strict';

const { verifySession, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const objectivesUrl = process.env.OBJECTIVES_URL;
    if (!objectivesUrl) return json(500, { error: 'OBJECTIVES_URL not configured' });

    try {
        const res = await fetch(objectivesUrl + '?action=api', {
            redirect: 'follow',
            headers: { 'Cache-Control': 'no-store' },
            signal: AbortSignal.timeout(7000)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify(data)
        };
    } catch (err) {
        return json(502, { success: false, error: 'Failed to fetch objectives: ' + err.message });
    }
};
