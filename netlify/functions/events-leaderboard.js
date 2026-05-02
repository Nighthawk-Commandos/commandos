// ═══════════════════════════════════════════════════════════════
//  events-leaderboard.js
//  Handles all four leaderboard endpoints via URL path segment:
//
//    GET /api/events/leaderboard/hosts      ranked by eventsHosted DESC
//    GET /api/events/leaderboard/op         ranked by totalOp DESC
//    GET /api/events/leaderboard/attendees  ranked by eventsAttended DESC
//    GET /api/events/leaderboard/ap         ranked by totalAp DESC
//
//  The leaderboard type is read from the last path segment so all
//  four netlify.toml redirects can point at this single function.
//
//  Query params (all optional):
//    period  week | month | year | alltime  (default: alltime)
//    from    Unix ms  ─┐ override period
//    to      Unix ms  ─┘ when both supplied
//
//  Response shape varies by type — see LEADERBOARD_CONFIGS below.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }                    = require('./_shared');
const { requireEventStats, getDateRange, fetchEvents, aggregateEvents } = require('./_events-shared');

// Describes how to build each leaderboard from the aggregated maps.
const LEADERBOARD_CONFIGS = {
    hosts: {
        source:  (agg) => agg.byHost,
        row:     (un, s) => ({ username: un, eventsHosted: s.eventsHosted, totalOp: s.totalOp }),
        sortKey: (a, b)  => b.eventsHosted - a.eventsHosted || b.totalOp - a.totalOp
    },
    op: {
        source:  (agg) => agg.byHost,
        row:     (un, s) => ({ username: un, totalOp: s.totalOp, eventsHosted: s.eventsHosted }),
        sortKey: (a, b)  => b.totalOp - a.totalOp || b.eventsHosted - a.eventsHosted
    },
    attendees: {
        source:  (agg) => agg.byAttendee,
        row:     (un, s) => ({ username: un, eventsAttended: s.eventsAttended, totalAp: s.totalAp }),
        sortKey: (a, b)  => b.eventsAttended - a.eventsAttended || b.totalAp - a.totalAp
    },
    ap: {
        source:  (agg) => agg.byAttendee,
        row:     (un, s) => ({ username: un, totalAp: s.totalAp, eventsAttended: s.eventsAttended }),
        sortKey: (a, b)  => b.totalAp - a.totalAp || b.eventsAttended - a.eventsAttended
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const denied  = await requireEventStats(session);
    if (denied) return denied;

    // Extract leaderboard type from the final path segment:
    // /api/events/leaderboard/hosts → 'hosts'
    const segments = (event.path || '').replace(/\/$/, '').split('/');
    const lbType   = segments[segments.length - 1].toLowerCase();
    const cfg = LEADERBOARD_CONFIGS[lbType];
    if (!cfg) return json(400, { error: 'Unknown leaderboard type "' + lbType + '". Valid: hosts, op, attendees, ap' });

    const p = event.queryStringParameters || {};
    const { fromMs, toMs } = getDateRange(p.period, p.from, p.to);

    try {
        const events = await fetchEvents(fromMs, toMs);
        const agg    = aggregateEvents(events);

        const result = Object.entries(cfg.source(agg))
            .map(([un, s]) => cfg.row(un, s))
            .sort(cfg.sortKey)
            .map((entry, i) => ({ rank: i + 1, ...entry }));

        return json(200, result);
    } catch (err) {
        console.error('[events-leaderboard/' + lbType + ']', err.message);
        return json(502, { error: 'Failed to fetch leaderboard: ' + err.message });
    }
};
