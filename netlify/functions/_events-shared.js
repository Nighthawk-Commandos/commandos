// ── Shared helpers for events/* Netlify functions ───────────────
// Prefixed with _ so Netlify CLI does not treat this as a function.
'use strict';

const { fireStore, getUserAdminPerms, json } = require('./_shared');

// ─── Access gate ──────────────────────────────────────────────────────────────

// Returns null (allowed) or a 403 json response.
// Allowed when: divisionRank >= 246 OR the user has the eventsStats permission.
async function requireEventStats(session) {
    if (!session) return json(401, { error: 'Unauthorized' });
    if (session.divisionRank >= 246) return null;
    try {
        const perms = await getUserAdminPerms(session, fireStore('commandos-admin'));
        if (perms && perms.eventsStats) return null;
    } catch {}
    return json(403, { error: 'Forbidden: event statistics access required' });
}

// ─── Date range helper ────────────────────────────────────────────────────────

// Returns { fromMs, toMs } (Unix ms) for the requested period.
// Explicit from/to query params take precedence over period when both are present.
// period: 'week' | 'month' | 'year' | 'alltime'  (default: alltime)
function getDateRange(period, from, to) {
    const fromN = Number(from);
    const toN   = Number(to);
    if (from && to && !isNaN(fromN) && !isNaN(toN)) return { fromMs: fromN, toMs: toN };

    const now = Date.now();
    switch (period) {
        case 'week': {
            const d = new Date();
            d.setUTCHours(0, 0, 0, 0);
            d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to Sunday
            return { fromMs: d.getTime(), toMs: now };
        }
        case 'month': {
            const d = new Date();
            return { fromMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), toMs: now };
        }
        case 'year': {
            const d = new Date();
            return { fromMs: Date.UTC(d.getUTCFullYear(), 0, 1), toMs: now };
        }
        default: // alltime
            return { fromMs: 0, toMs: now };
    }
}

// ─── Apps Script fetch ────────────────────────────────────────────────────────

// Fetches all events from app_script.js getEventLog(), then filters
// by [fromMs, toMs] in Node.js.  SCRIPT_URL is kept server-side only.
async function fetchEvents(fromMs, toMs) {
    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) throw new Error('SCRIPT_URL not configured');

    const res = await fetch(scriptUrl + '?action=api&fn=getEventLog', {
        headers: { 'Cache-Control': 'no-store' },
        signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);

    const data = await res.json();
    if (data && data.error) throw new Error('Apps Script error: ' + data.error);
    if (!Array.isArray(data)) throw new Error('Expected event array from Apps Script');

    if (fromMs === 0) return data;
    return data.filter(ev => {
        const ts = Number(ev.timestamp) || 0;
        return ts >= fromMs && ts <= toMs;
    });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

// Single-pass aggregation over an event array.
// Returns:
//   byType     { [eventType]: { count, totalAttendees } }
//   byHost     { [username]:  { eventsHosted, totalOp } }
//   byAttendee { [username]:  { eventsAttended, totalAp } }
//   byMonth    { 'YYYY-MM':   attendeeCount }
//   totalAttendees  number  (sum across all events, includes duplicates)
//   uniqueCount     number  (distinct attendee usernames)
function aggregateEvents(events) {
    const byType     = {};
    const byHost     = {};
    const byAttendee = {};
    const byMonth    = {};
    const uniqueSet  = new Set();
    let totalAttendees = 0;

    for (const ev of events) {
        const type = ev.eventType || 'Unknown';
        const ts   = Number(ev.timestamp)     || 0;
        const cnt  = Math.max(0, Math.min(Number(ev.attendeeCount) || 0, 9999));
        const op   = Number(ev.hostOp)        || 0;

        // Support single hostUsername OR co-host array
        const hostList = (Array.isArray(ev.hosts) && ev.hosts.length > 0)
            ? ev.hosts
            : [ev.hostUsername || ''];
        const validHosts = hostList.filter(h => h && h.toLowerCase() !== 'n/a');
        if (!validHosts.length) continue;

        // ── by-type (counted once per event) ──────────────────────
        if (!byType[type]) byType[type] = { count: 0, totalAttendees: 0 };
        byType[type].count++;
        byType[type].totalAttendees += cnt;

        // ── by-host (each co-host earns +1 event + full OP) ───────
        for (const hostName of validHosts) {
            if (!byHost[hostName]) byHost[hostName] = { eventsHosted: 0, totalOp: 0 };
            byHost[hostName].eventsHosted++;
            byHost[hostName].totalOp += op;
        }

        // ── by-month ───────────────────────────────────────────────
        if (ts) {
            const d  = new Date(ts);
            const mo = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
            byMonth[mo] = (byMonth[mo] || 0) + cnt;
        }

        totalAttendees += cnt;

        // ── by-attendee ────────────────────────────────────────────
        for (const a of (ev.attendees || [])) {
            const un = String(a.username || '').trim();
            if (!un || un.toLowerCase() === 'n/a') continue;
            uniqueSet.add(un);
            if (!byAttendee[un]) byAttendee[un] = { eventsAttended: 0, totalAp: 0 };
            byAttendee[un].eventsAttended++;
            byAttendee[un].totalAp += Number(a.ap) || 0;
        }
    }

    return { byType, byHost, byAttendee, byMonth, totalAttendees, uniqueCount: uniqueSet.size };
}

module.exports = { requireEventStats, getDateRange, fetchEvents, aggregateEvents };
