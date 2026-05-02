// ═══════════════════════════════════════════════════════════════
//  events-top-attendees.js
//  GET /api/events/top-attendees
//
//  Query params (all optional):
//    limit   max results returned  (default: 10)
//    period  week | month | year | alltime  (default: alltime)
//    from    Unix ms  ─┐ override period
//    to      Unix ms  ─┘ when both supplied
//
//  Response:
//    [ { rank, username, eventsAttended, totalAp }, ... ]
//    Sorted by totalAp DESC, tie-break eventsAttended DESC.
//    Suitable for a pie / bar chart of top attendees.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }                    = require('./_shared');
const { requireEventStats, getDateRange, fetchEvents, aggregateEvents } = require('./_events-shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const denied  = await requireEventStats(session);
    if (denied) return denied;

    const p     = event.queryStringParameters || {};
    const limit = Math.min(Math.max(1, parseInt(p.limit) || 10), 100);
    const { fromMs, toMs } = getDateRange(p.period, p.from, p.to);

    try {
        const events = await fetchEvents(fromMs, toMs);
        const { byAttendee } = aggregateEvents(events);

        const result = Object.entries(byAttendee)
            .map(([username, s]) => ({ username, eventsAttended: s.eventsAttended, totalAp: s.totalAp }))
            .sort((a, b) => b.totalAp - a.totalAp || b.eventsAttended - a.eventsAttended)
            .slice(0, limit)
            .map((entry, i) => ({ rank: i + 1, ...entry }));

        return json(200, result);
    } catch (err) {
        console.error('[events-top-attendees]', err.message);
        return json(502, { error: 'Failed to fetch top attendees: ' + err.message });
    }
};
