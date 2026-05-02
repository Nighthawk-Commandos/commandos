// ═══════════════════════════════════════════════════════════════
//  events-summary.js
//  GET /api/events/summary
//
//  Query params (all optional):
//    period  week | month | year | alltime  (default: alltime)
//    from    Unix ms  ─┐ override period
//    to      Unix ms  ─┘ when both supplied
//
//  Response:
//    { totalEvents, totalAttendees, uniqueAttendees,
//      topHost: { username, eventsHosted, totalOp } | null,
//      topAttendee: { username, eventsAttended, totalAp } | null }
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }                                        = require('./_shared');
const { requireEventStats, getDateRange, fetchEvents, aggregateEvents } = require('./_events-shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const denied  = await requireEventStats(session);
    if (denied) return denied;

    const p      = event.queryStringParameters || {};
    const { fromMs, toMs } = getDateRange(p.period, p.from, p.to);

    try {
        const events = await fetchEvents(fromMs, toMs);
        const { byHost, byAttendee, totalAttendees, uniqueCount } = aggregateEvents(events);

        // ── top host (by events hosted, tie-break: total OP) ──────
        let topHost = null;
        const hostEntries = Object.entries(byHost);
        if (hostEntries.length) {
            const [un, stats] = hostEntries.sort(([, a], [, b]) =>
                b.eventsHosted - a.eventsHosted || b.totalOp - a.totalOp
            )[0];
            topHost = { username: un, eventsHosted: stats.eventsHosted, totalOp: stats.totalOp };
        }

        // ── top attendee (by total AP, tie-break: events attended) ─
        let topAttendee = null;
        const attEntries = Object.entries(byAttendee);
        if (attEntries.length) {
            const [un, stats] = attEntries.sort(([, a], [, b]) =>
                b.totalAp - a.totalAp || b.eventsAttended - a.eventsAttended
            )[0];
            topAttendee = { username: un, eventsAttended: stats.eventsAttended, totalAp: stats.totalAp };
        }

        return json(200, {
            totalEvents:    events.length,
            totalAttendees,
            uniqueAttendees: uniqueCount,
            topHost,
            topAttendee
        });
    } catch (err) {
        console.error('[events-summary]', err.message);
        return json(502, { error: 'Failed to fetch event summary: ' + err.message });
    }
};
