// ═══════════════════════════════════════════════════════════════
//  events-by-type.js
//  GET /api/events/by-type
//
//  Query params (all optional):
//    period  week | month | year | alltime  (default: alltime)
//    from    Unix ms  ─┐ override period
//    to      Unix ms  ─┘ when both supplied
//
//  Response:
//    [ { eventType, count, totalAttendees }, ... ]
//    Sorted by count DESC.  Suitable for pie and combo charts.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }                    = require('./_shared');
const { requireEventStats, getDateRange, fetchEvents, aggregateEvents } = require('./_events-shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const denied  = await requireEventStats(session);
    if (denied) return denied;

    const p = event.queryStringParameters || {};
    const { fromMs, toMs } = getDateRange(p.period, p.from, p.to);

    try {
        const events = await fetchEvents(fromMs, toMs);
        const { byType } = aggregateEvents(events);

        const result = Object.entries(byType)
            .map(([eventType, s]) => ({ eventType, count: s.count, totalAttendees: s.totalAttendees }))
            .sort((a, b) => b.count - a.count);

        return json(200, result);
    } catch (err) {
        console.error('[events-by-type]', err.message);
        return json(502, { error: 'Failed to fetch events by type: ' + err.message });
    }
};
