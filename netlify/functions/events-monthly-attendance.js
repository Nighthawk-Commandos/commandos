// ═══════════════════════════════════════════════════════════════
//  events-monthly-attendance.js
//  GET /api/events/monthly-attendance
//
//  Query params (all optional):
//    period  week | month | year | alltime  (default: alltime)
//    from    Unix ms  ─┐ override period
//    to      Unix ms  ─┘ when both supplied
//
//  Response:
//    [ { month: 'YYYY-MM', attendeeCount }, ... ]
//    Sorted by month ASC.  Suitable for a smooth line / combo chart.
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
        const { byMonth } = aggregateEvents(events);

        const result = Object.entries(byMonth)
            .map(([month, attendeeCount]) => ({ month, attendeeCount }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return json(200, result);
    } catch (err) {
        console.error('[events-monthly-attendance]', err.message);
        return json(502, { error: 'Failed to fetch monthly attendance: ' + err.message });
    }
};
