// ═══════════════════════════════════════════════════════════════
//  events-all.js
//  GET /api/events/all
//
//  Returns every aggregated stat the Division Statistics dashboard
//  needs in a single call — one Apps Script read, all aggregation
//  in Node.js.
//
//  Query params (all optional):
//    period   week | month | year | alltime  (default: alltime)
//    from     Unix ms  ─┐ override period
//    to       Unix ms  ─┘ when both supplied
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }                                        = require('./_shared');
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
        const { byType, byHost, byAttendee, byMonth, totalAttendees, uniqueCount } = aggregateEvents(events);

        // ── Leaderboard arrays ─────────────────────────────────────
        const hostsByEvents = Object.entries(byHost)
            .map(([un, s]) => ({ username: un, eventsHosted: s.eventsHosted, totalOp: s.totalOp }))
            .sort((a, b) => b.eventsHosted - a.eventsHosted || b.totalOp - a.totalOp);

        const hostsByOp = Object.entries(byHost)
            .map(([un, s]) => ({ username: un, totalOp: s.totalOp, eventsHosted: s.eventsHosted }))
            .sort((a, b) => b.totalOp - a.totalOp || b.eventsHosted - a.eventsHosted);

        const attsByCount = Object.entries(byAttendee)
            .map(([un, s]) => ({ username: un, eventsAttended: s.eventsAttended, totalAp: s.totalAp }))
            .sort((a, b) => b.eventsAttended - a.eventsAttended || b.totalAp - a.totalAp);

        const attsByAp = Object.entries(byAttendee)
            .map(([un, s]) => ({ username: un, totalAp: s.totalAp, eventsAttended: s.eventsAttended }))
            .sort((a, b) => b.totalAp - a.totalAp || b.eventsAttended - a.eventsAttended);

        const byTypeArr = Object.entries(byType)
            .map(([t, s]) => ({ eventType: t, count: s.count, totalAttendees: s.totalAttendees }))
            .sort((a, b) => b.count - a.count);

        const topHost     = hostsByEvents[0] || null;
        const topAttendee = attsByAp[0]       || null;

        // ── Temporal distribution — granularity depends on period ──
        const period = p.period || 'alltime';
        let granularity = 'monthly';
        let temporal    = [];

        // Determine range length for custom ranges
        const rangeDays = (toMs - fromMs) / 86400000;

        if (period === 'alltime' || (p.from && p.to && rangeDays > 365)) {
            // Yearly: group by YYYY
            granularity = 'yearly';
            const byYear = {};
            for (const ev of events) {
                const cnt = Math.max(0, Math.min(Number(ev.attendeeCount) || 0, 9999));
                const ts  = Number(ev.timestamp) || 0;
                if (!ts) continue;
                byYear[String(new Date(ts).getUTCFullYear())] = (byYear[String(new Date(ts).getUTCFullYear())] || 0) + cnt;
            }
            temporal = Object.entries(byYear)
                .map(([year, c]) => ({ label: year, attendeeCount: c }))
                .sort((a, b) => a.label.localeCompare(b.label));

        } else if (period === 'week' || (p.from && p.to && rangeDays <= 8)) {
            // Daily: group by YYYY-MM-DD
            granularity = 'daily';
            const byDay = {};
            for (const ev of events) {
                const cnt = Math.max(0, Math.min(Number(ev.attendeeCount) || 0, 9999));
                const ts  = Number(ev.timestamp) || 0;
                if (!ts) continue;
                const d   = new Date(ts);
                const key = d.getUTCFullYear() + '-' +
                    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(d.getUTCDate()).padStart(2, '0');
                byDay[key] = (byDay[key] || 0) + cnt;
            }
            temporal = Object.entries(byDay)
                .map(([day, c]) => ({ label: day, attendeeCount: c }))
                .sort((a, b) => a.label.localeCompare(b.label));

        } else if (period === 'month' || (p.from && p.to && rangeDays <= 35)) {
            // Weekly: group by "Week N" within the month
            granularity = 'weekly';
            const byWeek = {};
            for (const ev of events) {
                const cnt = Math.max(0, Math.min(Number(ev.attendeeCount) || 0, 9999));
                const ts  = Number(ev.timestamp) || 0;
                if (!ts) continue;
                const d   = new Date(ts);
                const key = 'Week ' + Math.ceil(d.getUTCDate() / 7);
                byWeek[key] = (byWeek[key] || 0) + cnt;
            }
            temporal = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']
                .filter(w => byWeek[w])
                .map(w => ({ label: w, attendeeCount: byWeek[w] }));

        } else {
            // Monthly (default)
            granularity = 'monthly';
            temporal    = Object.entries(byMonth)
                .map(([m, c]) => ({ label: m, attendeeCount: c }))
                .sort((a, b) => a.label.localeCompare(b.label));
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                summary: {
                    totalEvents:     events.length,
                    totalAttendees,
                    uniqueAttendees: uniqueCount,
                    topHost:         topHost     ? { username: topHost.username,     eventsHosted:   topHost.eventsHosted,     totalOp: topHost.totalOp }         : null,
                    topAttendee:     topAttendee ? { username: topAttendee.username, eventsAttended: topAttendee.eventsAttended, totalAp: topAttendee.totalAp }     : null
                },
                byType:      byTypeArr,
                temporal,
                granularity,
                leaderboard: {
                    hosts:     hostsByEvents.map((e, i) => ({ rank: i + 1, ...e })),
                    op:        hostsByOp.map((e, i)     => ({ rank: i + 1, ...e })),
                    attendees: attsByCount.map((e, i)   => ({ rank: i + 1, ...e })),
                    ap:        attsByAp.map((e, i)       => ({ rank: i + 1, ...e }))
                }
            })
        };
    } catch (err) {
        console.error('[events-all]', err.message);
        return json(502, { error: 'Failed to fetch event stats: ' + err.message });
    }
};
