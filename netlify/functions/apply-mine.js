// ── GET /api/apply/mine — list current user's own submissions
// Requires any valid session (including applicantMode).
'use strict';

const { verifyAnySession, json } = require('./_shared');
const { firestoreCollection }    = require('./_firebase');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifyAnySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    try {
        const col  = firestoreCollection('commandos-submissions');
        const snap = await col
            .where('discordId', '==', session.discordId)
            .limit(100)
            .get();
        const submissions = snap.docs
            .map(d => {
                const s = d.data();
                return {
                    id:          s.id || d.id,
                    appId:       s.appId,
                    appName:     s.appName,
                    status:      s.status,
                    reviewedBy:  s.reviewedBy,
                    reviewNotes: s.reviewNotes,
                    reviewedAt:  s.reviewedAt,
                    submittedAt: s.submittedAt,
                    answers:     s.answers
                };
            })
            .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
            .slice(0, 50);
        return json(200, submissions);
    } catch (err) {
        return json(502, { error: 'Failed to fetch submissions: ' + err.message });
    }
};
