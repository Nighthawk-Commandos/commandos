// ── GET /api/apply/list — list open application definitions
// No auth required to see the list; auth is required to submit.
'use strict';

const { fireStore, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const store = fireStore('commandos-content');
        const apps  = await store.get('app-defs', { type: 'json' }).catch(() => []) || [];
        // Only return public-facing fields; strip webhook/reviewer details
        const safe = apps
            .filter(a => a.status === 'open')
            .map(a => {
                // Normalise: if old format (flat questions), wrap in a single section
                const sections = Array.isArray(a.sections) && a.sections.length
                    ? a.sections
                    : [{ id: 's0', title: '', description: '', nextSection: 'submit',
                         questions: Array.isArray(a.questions) ? a.questions : [] }];
                return {
                    id: a.id, name: a.name, description: a.description,
                    tags: a.tags || [], webhookColor: a.webhookColor || 0x00C2E9,
                    sections
                };
            });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
            body: JSON.stringify(safe)
        };
    } catch (err) {
        return json(502, { error: 'Failed to fetch applications: ' + err.message });
    }
};
