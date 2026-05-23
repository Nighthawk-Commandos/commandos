// ═══════════════════════════════════════════════════════════════
//  events-stats.js — Division Statistics section
//  Tabs: Overview | Event Statistics | Audit Log
//  Accessible to rank 246+ or eventsStats permission.
// ═══════════════════════════════════════════════════════════════

import { esc, toast } from './utils.js';

// ── Module state ──────────────────────────────────────────────
// Navigation state (_DS.*) is reset on section entry.
// Cache state (_cache.*) persists across entries within the same page session.
var _DS = {
    tab:          'overview',
    period:       'alltime',
    customFrom:   null,
    customTo:     null,
    loading:      false,
    auditAll:     [],    // all raw entries fetched so far (unfiltered)
    auditCursor:  null,
    auditLoaded:  false, // true when all pages have been fetched
    auditLoading: false,
    auditSearch:  '',    // client-side filter: checked against username/actor/userId/actorId
    auditAction:  ''     // client-side filter: exact action type match
};

// TTL-based cache — persists while the page is open
// Overview (alltime) uses a 15-min TTL; other periods use 5 min
var _cache = {
    overview: null,   // { data, ts }
    events:   {}      // { 'alltime': { data, ts }, 'week': { data, ts }, ... }
};
var _CACHE_TTL_OVERVIEW = 15 * 60 * 1000;
var _CACHE_TTL_EVENTS   =  5 * 60 * 1000;

function _cacheKey() {
    return (_DS.period === 'custom')
        ? 'custom_' + _DS.customFrom + '_' + _DS.customTo
        : _DS.period;
}
function _cacheGet(store, key, ttl) {
    var e = key ? store[key] : store;
    if (!e) return null;
    if (Date.now() - e.ts > ttl) { if (key) delete store[key]; else return null; return null; }
    return e.data;
}
function _cachePut(store, key, data) {
    if (key) store[key] = { data: data, ts: Date.now() };
    else return; // not used this way
}

// ── Chart colours ─────────────────────────────────────────────
var _C = ['#c8a44a','#7c4ab8','#4a7fc8','#4a9c72','#e05252','#4ac8c8','#c87c4a','#c84a7c','#a44ac8','#6ab84a'];

// ── Tooltip ───────────────────────────────────────────────────
var _tipEl = null;
var _tipRaf = null;

function _ensureTip() {
    if (!_tipEl) {
        _tipEl = document.createElement('div');
        _tipEl.className = 'es-tooltip';
        document.body.appendChild(_tipEl);
    }
    return _tipEl;
}
function _hideTip() {
    if (_tipRaf) { cancelAnimationFrame(_tipRaf); _tipRaf = null; }
    if (_tipEl) _tipEl.style.display = 'none';
}

// ── SVG escape ────────────────────────────────────────────────
function _se(s) {
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Entry point ───────────────────────────────────────────────
export function renderDivisionStatsSection() {
    // Reset navigation state only — cache is preserved across entries
    _DS.tab = 'overview'; _DS.period = 'alltime'; _DS.customFrom = null; _DS.customTo = null;
    _DS.loading = false;
    _DS.auditAll = []; _DS.auditCursor = null; _DS.auditLoaded = false;
    _DS.auditLoading = false; _DS.auditSearch = ''; _DS.auditAction = '';
    _hideTip();

    // ── Show global loading overlay (same as mainframe/DIS) ──────
    var ls = document.getElementById('loading-status');
    if (ls) ls.textContent = 'Loading division statistics…';
    var loadEl = document.getElementById('loading');
    if (loadEl) loadEl.classList.remove('hidden');

    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.classList.add('hidden');

    // Build the section shell so the sidebar is ready immediately
    hs.className = 'obj-mode hidden';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar es-sidebar" data-accent="green">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
        '    <div class="obj-sidebar-title">Division<br>Statistics</div>' +
        '  </div>' +
        '  <nav class="es-sidebar-nav">' +
        '    <div class="es-sidebar-nav-label">Navigation</div>' +
        _tabBtn('overview', 'Overview',            true) +
        _tabBtn('events',   'Event Statistics',    false) +
        _tabBtn('audit',    'Audit Log',           false) +
        '  </nav>' +
        '  <nav class="es-sidebar-nav" id="ds-period-section" style="display:none">' +
        '    <div class="es-sidebar-nav-label">Time Period</div>' +
        _navBtn('alltime', 'All Time',   true) +
        _navBtn('year',    'This Year',  false) +
        _navBtn('month',   'This Month', false) +
        _navBtn('week',    'This Week',  false) +
        _navBtn('custom',  'Custom…',    false) +
        '    <div id="es-custom-range" style="display:none">' +
        '      <div class="es-date-row"><label class="es-date-label">From</label>' +
        '        <input type="date" id="es-from" class="es-date-input"></div>' +
        '      <div class="es-date-row"><label class="es-date-label">To</label>' +
        '        <input type="date" id="es-to" class="es-date-input"></div>' +
        '      <button class="es-apply-btn" data-click="esApplyCustomRange">Apply</button>' +
        '    </div>' +
        '  </nav>' +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">← Back to Hub</button>' +
        (_ver ? '<div class="sidebar-version">' + _ver + '</div>' : '') +
        '  </div>' +
        '</aside>' +
        '<main class="obj-main" id="es-main">' +
        '  <div class="obj-loading">Loading…</div>' +
        '</main>';

    _loadOverview();
}

function _tabBtn(tab, label, active) {
    return '<button class="es-nav-btn' + (active ? ' active' : '') + '"' +
        ' data-click="dsNavGo" data-tab="' + tab + '">' + label + '</button>';
}
function _navBtn(period, label, active) {
    return '<button class="es-nav-btn' + (active ? ' active' : '') + '"' +
        ' data-click="esSetPeriod" data-period="' + period + '">' + label + '</button>';
}

// ── Tab switcher ──────────────────────────────────────────────
export function dsNavGo(el) {
    var tab = el && el.dataset ? el.dataset.tab : el;
    if (!tab) return;
    _DS.tab = tab;

    // Update tab button active state
    document.querySelectorAll('.es-nav-btn[data-tab]').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Show/hide period nav
    var ps = document.getElementById('ds-period-section');
    if (ps) ps.style.display = (tab === 'events') ? '' : 'none';

    var main = document.getElementById('es-main');
    if (!main) return;

    if (tab === 'overview') {
        var ovCached = _cacheGet(_cache, 'overview', _CACHE_TTL_OVERVIEW);
        if (ovCached) _renderOverview(ovCached);
        else _loadOverview();
    } else if (tab === 'events') {
        main.innerHTML = '<div class="obj-loading">Loading…</div>';
        _esLoad();
    } else if (tab === 'audit') {
        _DS.auditAll = []; _DS.auditCursor = null; _DS.auditLoaded = false;
        main.innerHTML = '<div class="obj-loading">Loading audit log…</div>';
        _auditLoad(true);
    }
}

// ── Period helpers ────────────────────────────────────────────
function _updatePeriodNav() {
    document.querySelectorAll('.es-nav-btn[data-period]').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.period === _DS.period);
    });
    var cr = document.getElementById('es-custom-range');
    if (cr) cr.style.display = (_DS.period === 'custom') ? '' : 'none';
}

export function esSetPeriod(el) {
    var period = el && el.dataset ? el.dataset.period : el;
    if (!period || (period !== 'custom' && period === _DS.period)) return;
    _DS.period = period;
    _updatePeriodNav();
    if (period === 'custom') return;
    _DS.customFrom = null; _DS.customTo = null;
    var main = document.getElementById('es-main');
    if (main) main.innerHTML = '<div class="obj-loading">Loading…</div>';
    _esLoad();
}

export function esApplyCustomRange() {
    var fromEl = document.getElementById('es-from');
    var toEl   = document.getElementById('es-to');
    if (!fromEl || !toEl || !fromEl.value || !toEl.value) return;
    var fromMs = new Date(fromEl.value).getTime();
    var toMs   = new Date(toEl.value).getTime() + 86399999;
    if (isNaN(fromMs) || isNaN(toMs) || fromMs > toMs) return;
    _DS.customFrom = fromMs; _DS.customTo = toMs;
    var main = document.getElementById('es-main');
    if (main) main.innerHTML = '<div class="obj-loading">Loading…</div>';
    _esLoad();
}

// ── Tooltip wiring ────────────────────────────────────────────
function _wireTooltips() {
    var main = document.getElementById('es-main');
    if (!main) return;
    var tip = _ensureTip();
    tip.style.display = 'none';

    // Use requestAnimationFrame-throttled mousemove — no layout thrashing
    main.addEventListener('mousemove', function (e) {
        var target = e.target; var cx = e.clientX; var cy = e.clientY;
        if (_tipRaf) cancelAnimationFrame(_tipRaf);
        _tipRaf = requestAnimationFrame(function () {
            _tipRaf = null;
            var el = (target && target.closest) ? target.closest('[data-tip]') : null;
            if (el) {
                tip.textContent   = el.dataset.tip;
                tip.style.display = 'block';
                var tx = cx + 14; var ty = cy - 10;
                if (tx + tip.offsetWidth + 4 > window.innerWidth)  tx = cx - tip.offsetWidth - 14;
                if (ty + tip.offsetHeight + 4 > window.innerHeight) ty = cy - tip.offsetHeight - 4;
                tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
            } else {
                _hideTip();
            }
        });
    });
    main.addEventListener('mouseleave', _hideTip);
}

// ─────────────────────────────────────────────────────────────
// ── OVERVIEW TAB ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

function _showSection() {
    var loadEl = document.getElementById('loading');
    if (loadEl) loadEl.classList.add('hidden');
    var hs = document.getElementById('home-screen');
    if (hs) { hs.classList.remove('hidden'); hs.className = 'obj-mode'; }
}

function _loadOverview() {
    if (_DS.loading) return;

    // Serve from cache if fresh
    var cached = _cacheGet(_cache, 'overview', _CACHE_TTL_OVERVIEW);
    if (cached) {
        _showSection();
        _renderOverview(cached);
        return;
    }

    _DS.loading = true;
    fetch('/api/events/all')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            _DS.loading = false;
            _cache.overview = { data: d, ts: Date.now() };
            _showSection();
            _renderOverview(d);
        })
        .catch(function (err) {
            _DS.loading = false;
            _showSection();
            var m = document.getElementById('es-main');
            if (m) m.innerHTML = '<div class="obj-error">Failed to load: ' + esc(err.message) + '</div>';
        });
}

function _renderOverview(d) {
    var main = document.getElementById('es-main');
    if (!main) return;
    if (d.error) { main.innerHTML = '<div class="obj-error">' + esc(d.error) + '</div>'; return; }

    var s  = d.summary || {};
    var bt = Array.isArray(d.byType) ? d.byType : [];

    var html = '';

    // ── Summary row ───────────────────────────────────────────
    html += '<div class="es-summary-row">' +
        _statCard('Total Events',    s.totalEvents    || 0) +
        _statCard('Total Attendees', s.totalAttendees || 0) +
        _statCard('Unique Members',  s.uniqueAttendees || 0) +
        '</div>';

    // ── Top Host / Attendee spotlight ─────────────────────────
    if (s.topHost || s.topAttendee) {
        html += '<div class="es-highlight-row">';
        if (s.topHost) html += _spotlight('Top Host', s.topHost.username,
            s.topHost.eventsHosted + ' event' + (s.topHost.eventsHosted !== 1 ? 's' : '') +
            '&nbsp;&nbsp;·&nbsp;&nbsp;' + s.topHost.totalOp + ' OP total');
        if (s.topAttendee) html += _spotlight('Top Attendee', s.topAttendee.username,
            s.topAttendee.eventsAttended + ' attended' +
            '&nbsp;&nbsp;·&nbsp;&nbsp;' + s.topAttendee.totalAp + ' AP total');
        html += '</div>';
    }

    // ── Event type count list ─────────────────────────────────
    html += '<div class="es-section-label">Event Counts (All Time)</div>';
    html += '<div class="es-panel es-panel-full">';
    if (bt.length) {
        var totalEvts = bt.reduce(function (s, e) { return s + e.count; }, 0);
        html += '<div class="es-type-list">';
        bt.forEach(function (e, i) {
            var pct = totalEvts > 0 ? ((e.count / totalEvts) * 100).toFixed(1) : '0.0';
            var color = _C[i % _C.length];
            html += '<div class="es-type-row">' +
                '<span class="es-type-dot" style="background:' + color + '"></span>' +
                '<span class="es-type-name">' + esc(e.eventType) + '</span>' +
                '<div class="es-type-track"><div class="es-type-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span class="es-type-count">' + e.count + '</span>' +
                '<span class="es-type-pct">' + pct + '%</span>' +
                '</div>';
        });
        html += '</div>';
    } else {
        html += '<p class="obj-empty">No data yet.</p>';
    }
    html += '</div>';

    main.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────
// ── EVENT STATISTICS TAB ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────

function _esLoad() {
    if (_DS.loading) return;

    // Serve from cache if fresh
    var key    = _cacheKey();
    var cached = _cacheGet(_cache.events, key, _CACHE_TTL_EVENTS);
    if (cached) { _renderEvents(cached); return; }

    _DS.loading = true;
    var qs = '';
    if (_DS.period === 'custom' && _DS.customFrom && _DS.customTo) {
        qs = '?from=' + _DS.customFrom + '&to=' + _DS.customTo;
    } else if (_DS.period !== 'alltime') {
        qs = '?period=' + _DS.period;
    }
    fetch('/api/events/all' + qs)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            _DS.loading = false;
            _cache.events[key] = { data: d, ts: Date.now() };
            _renderEvents(d);
        })
        .catch(function (err) {
            _DS.loading = false;
            var m = document.getElementById('es-main');
            if (m) m.innerHTML = '<div class="obj-error">Failed: ' + esc(err.message) + '</div>';
        });
}

function _renderEvents(d) {
    var main = document.getElementById('es-main');
    if (!main) return;
    if (d.error) { main.innerHTML = '<div class="obj-error">' + esc(d.error) + '</div>'; return; }

    var s    = d.summary   || {};
    var bt   = Array.isArray(d.byType)   ? d.byType   : [];
    var temp = Array.isArray(d.temporal) ? d.temporal : [];
    var lb   = d.leaderboard || {};
    var gran = d.granularity || 'monthly';

    var temporalLabel = gran === 'daily'   ? 'Daily Attendees'   :
                        gran === 'weekly'  ? 'Weekly Attendees'  :
                        gran === 'yearly'  ? 'Yearly Attendance' : 'Monthly Attendance';

    var html = '';

    // ── Summary ───────────────────────────────────────────────
    html += '<div class="es-summary-row">' +
        _statCard('Total Events',    s.totalEvents    || 0) +
        _statCard('Total Attendees', s.totalAttendees || 0) +
        _statCard('Unique Members',  s.uniqueAttendees || 0) +
        '</div>';

    if (s.topHost || s.topAttendee) {
        html += '<div class="es-highlight-row">';
        if (s.topHost) html += _spotlight('Top Host', s.topHost.username,
            s.topHost.eventsHosted + ' event' + (s.topHost.eventsHosted !== 1 ? 's' : '') +
            '&nbsp;&nbsp;·&nbsp;&nbsp;' + s.topHost.totalOp + ' OP total');
        if (s.topAttendee) html += _spotlight('Top Attendee', s.topAttendee.username,
            s.topAttendee.eventsAttended + ' attended' +
            '&nbsp;&nbsp;·&nbsp;&nbsp;' + s.topAttendee.totalAp + ' AP total');
        html += '</div>';
    }

    // ── Event Type Breakdown ──────────────────────────────────
    html += '<div class="es-section-label">Event Type Breakdown</div>';
    html += '<div class="es-two-col">';

    // Left: numbered count list
    html += '<div class="es-panel"><div class="es-panel-title">Event Count by Type</div>';
    if (bt.length) {
        var totalEvts = bt.reduce(function (s, e) { return s + e.count; }, 0);
        html += '<div class="es-type-list">';
        bt.forEach(function (e, i) {
            var pct   = totalEvts > 0 ? ((e.count / totalEvts) * 100).toFixed(1) : '0.0';
            var color = _C[i % _C.length];
            html += '<div class="es-type-row">' +
                '<span class="es-type-dot" style="background:' + color + '"></span>' +
                '<span class="es-type-name">' + esc(e.eventType) + '</span>' +
                '<div class="es-type-track"><div class="es-type-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span class="es-type-count">' + e.count + '</span>' +
                '</div>';
        });
        html += '</div>';
    } else {
        html += '<p class="obj-empty">No data for this period.</p>';
    }
    html += '</div>';

    // Right: combo chart Count vs Attendees
    var typeCombo = bt.slice(0, 10).map(function (e) {
        return { label: e.eventType, bar: e.count, line: e.totalAttendees,
                 barTip: e.eventType + ': ' + e.count + ' events',
                 lineTip: e.eventType + ': ' + e.totalAttendees + ' attendees' };
    });
    html += '<div class="es-panel">' +
        '<div class="es-panel-title">Count <span class="es-legend-bar"></span>&nbsp;vs Attendees <span class="es-legend-line"></span></div>' +
        _comboSvg(typeCombo, _C[0], _C[1]) + '</div>';

    html += '</div>';

    // ── Temporal chart ────────────────────────────────────────
    html += '<div class="es-section-label">' + esc(temporalLabel) + '</div>';
    var tempCombo = temp.map(function (e) {
        return { label: e.label, bar: e.attendeeCount, line: e.attendeeCount,
                 barTip: e.label + ': ' + e.attendeeCount + ' attendees',
                 lineTip: e.label + ': ' + e.attendeeCount + ' attendees' };
    });
    html += '<div class="es-panel es-panel-full">' +
        '<div class="es-panel-title">Attendees <span class="es-legend-bar"></span>&nbsp;Trend <span class="es-legend-line" style="background:#4a9c72"></span></div>' +
        _comboSvg(tempCombo, _C[0], _C[3], true) + '</div>';

    // ── Top Officers charts ───────────────────────────────────
    html += '<div class="es-section-label">Top Officers</div>';
    html += '<div class="es-two-col">';
    var hostSlices = (lb.hosts || []).slice(0, 8).map(function (e, i) {
        return { label: e.username, value: e.eventsHosted, subtitle: e.eventsHosted + ' events', color: _C[i % _C.length] };
    });
    var attSlices = (lb.ap || []).slice(0, 8).map(function (e, i) {
        return { label: e.username, value: e.totalAp, subtitle: e.totalAp + ' AP', color: _C[i % _C.length] };
    });
    html += '<div class="es-panel"><div class="es-panel-title">Top Hosts <span class="es-chart-label">(pie)</span></div>' + _pieSvg(hostSlices) + '</div>';
    html += '<div class="es-panel"><div class="es-panel-title">Top Attendees by AP <span class="es-chart-label">(pie)</span></div>' + _pieSvg(attSlices) + '</div>';
    html += '</div>';

    // ── Leaderboards ──────────────────────────────────────────
    html += '<div class="es-section-label">Leaderboards</div>';
    html += '<div class="es-two-col">';
    html += '<div class="es-panel"><div class="es-panel-title">Host Leaderboard</div>' +
        _lbTable(lb.hosts, ['#','Officer','Events','OP'],
            function (e) { return [e.rank, e.username, e.eventsHosted, e.totalOp]; }) + '</div>';
    html += '<div class="es-panel"><div class="es-panel-title">OP Leaderboard</div>' +
        _lbTable(lb.op, ['#','Officer','OP','Events'],
            function (e) { return [e.rank, e.username, e.totalOp, e.eventsHosted]; }) + '</div>';
    html += '</div><div class="es-two-col">';
    html += '<div class="es-panel"><div class="es-panel-title">Attendee Leaderboard</div>' +
        _lbTable(lb.attendees, ['#','Member','Attended','AP'],
            function (e) { return [e.rank, e.username, e.eventsAttended, e.totalAp]; }) + '</div>';
    html += '<div class="es-panel"><div class="es-panel-title">AP Leaderboard</div>' +
        _lbTable(lb.ap, ['#','Member','AP','Attended'],
            function (e) { return [e.rank, e.username, e.totalAp, e.eventsAttended]; }) + '</div>';
    html += '</div>';

    main.innerHTML = html;
    _wireTooltips();
}

// ─────────────────────────────────────────────────────────────
// ── AUDIT LOG TAB ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

// ── Client-side filter ────────────────────────────────────────
// Checks username, actor, userId, and actorId against a single term.
function _auditFiltered() {
    var term   = (_DS.auditSearch || '').toLowerCase().trim();
    var action = _DS.auditAction;
    return _DS.auditAll.filter(function (e) {
        if (action && e.action !== action) return false;
        if (!term) return true;
        return (e.username || '').toLowerCase().indexOf(term) !== -1 ||
               (e.actor    || '').toLowerCase().indexOf(term) !== -1 ||
               String(e.userId   || '').indexOf(term) !== -1 ||
               String(e.actorId  || '').indexOf(term) !== -1;
    });
}

// ── Fetch — auto-paginates all pages without user interaction ──
function _auditLoad(reset) {
    if (_DS.auditLoading) return;
    if (reset) { _DS.auditAll = []; _DS.auditCursor = null; _DS.auditLoaded = false; }
    _DS.auditLoading = true;

    var qs = '?limit=200' + (_DS.auditCursor ? '&before=' + _DS.auditCursor : '');

    fetch('/api/division/audit' + qs)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            _DS.auditLoading = false;
            if (d.error) { _renderAuditBodyOnly('<div class="obj-error">Audit log unavailable: ' + esc(d.error) + '<br><small style="color:var(--muted)">Ensure the Stats Sheet has synced at least once.</small></div>'); return; }

            _DS.auditAll    = _DS.auditAll.concat(d.entries || []);
            _DS.auditCursor = d.nextCursor || null;

            if (_DS.auditCursor) {
                // More pages — update table with what we have, then auto-fetch next
                _renderAuditBody();
                setTimeout(function () { _auditLoad(false); }, 80);
            } else {
                _DS.auditLoaded = true;
                _renderAuditBody();
            }
        })
        .catch(function (err) {
            _DS.auditLoading = false;
            _DS.auditLoaded  = true;
            _renderAuditBodyOnly('<div class="obj-error">Failed to load audit log: ' + esc(err.message) + '</div>');
        });
}

// ── Render — controls rendered once; body updated separately ──
var _auditCtrlRendered = false;

function _renderAuditLog() {
    var main = document.getElementById('es-main');
    if (!main) return;
    _auditCtrlRendered = false;

    var ACTION_TYPES = ['', 'Joined Group', 'Left Group', 'Removed from Group', 'Rank Changed', 'Assigned Role', 'Unassigned Role'];
    var ctrlHtml =
        '<div id="ds-audit-ctrl" class="ds-audit-controls">' +
        '  <input type="text" id="ds-audit-search" class="es-date-input" placeholder="Search by username, actor, user ID, or actor ID…"' +
        '    value="' + _se(_DS.auditSearch) + '" data-change="dsAuditSearch" style="flex:1;min-width:0">' +
        '  <select id="ds-audit-action" class="es-date-input ds-audit-select" data-change="dsAuditAction">' +
        ACTION_TYPES.map(function (a) {
            return '<option value="' + _se(a) + '"' + (a === _DS.auditAction ? ' selected' : '') + '>' + (a || 'All Actions') + '</option>';
        }).join('') +
        '  </select>' +
        '</div>' +
        '<div id="ds-audit-body"></div>';

    main.innerHTML = ctrlHtml;
    _auditCtrlRendered = true;
    _renderAuditBody();
}

// Updates only the table div — never touches the search/filter controls
function _renderAuditBody() {
    var body = document.getElementById('ds-audit-body');
    if (!body) return;
    body.innerHTML = _buildAuditTableHtml();
}

function _renderAuditBodyOnly(html) {
    var body = document.getElementById('ds-audit-body');
    if (body) { body.innerHTML = html; return; }
    // Fallback if controls haven't rendered yet
    var main = document.getElementById('es-main');
    if (main) main.innerHTML = html;
}

function _buildAuditTableHtml() {
    if (_DS.auditAll.length === 0 && _DS.auditLoading) {
        return '<div class="obj-loading" style="margin-top:16px">Loading audit entries…</div>';
    }
    if (_DS.auditAll.length === 0) {
        return '<div class="obj-empty" style="margin-top:24px">No audit log entries found. Make sure the Stats Sheet has synced at least once.</div>';
    }

    var filtered = _auditFiltered();
    var display  = filtered.slice(0, 500);

    var status = !_DS.auditLoaded
        ? '<div class="ds-audit-status loading">Loading… ' + _DS.auditAll.length + ' entries so far</div>'
        : '<div class="ds-audit-status">' + _DS.auditAll.length + ' total entries' +
          (filtered.length !== _DS.auditAll.length ? ' &nbsp;·&nbsp; <strong>' + filtered.length + ' matching</strong>' : '') +
          '</div>';

    var rows = display.map(function (e) {
        var term = (_DS.auditSearch || '').toLowerCase();
        function hi(v) {
            v = esc(String(v || ''));
            if (!term) return v;
            var idx = v.toLowerCase().indexOf(term);
            if (idx === -1) return v;
            return v.slice(0, idx) + '<mark class="ds-hl">' + v.slice(idx, idx + term.length) + '</mark>' + v.slice(idx + term.length);
        }
        return '<tr>' +
            '<td class="ds-audit-date">' + esc(e.date || '') + '</td>' +
            '<td><span class="ds-audit-action">' + esc(e.action || '') + '</span></td>' +
            '<td>' + hi(e.username) + '</td>' +
            '<td class="ds-audit-id">' + hi(e.userId) + '</td>' +
            '<td style="color:var(--muted)">' + hi(e.actor) + '</td>' +
            '<td class="ds-audit-id">' + hi(e.actorId) + '</td>' +
            '<td style="color:var(--muted)">' + esc(e.prevRole || '—') + '</td>' +
            '<td style="color:var(--muted)">' + esc(e.newRole  || '—') + '</td>' +
            '</tr>';
    }).join('');

    var footer = filtered.length > 500
        ? '<div class="ds-audit-note">Showing 500 of ' + filtered.length + ' results — refine your search to see more</div>'
        : '';

    return status +
        '<div class="ds-audit-wrap"><table class="ds-audit-table">' +
        '<thead><tr><th>Date</th><th>Action</th><th>Username</th><th>User ID</th><th>Actor</th><th>Actor ID</th><th>From</th><th>To</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        footer;
}

// Search/filter — instant client-side, no API call
export function dsAuditSearch(el) {
    _DS.auditSearch = el && el.value !== undefined ? el.value : '';
    _renderAuditBody();
}

export function dsAuditAction(el) {
    _DS.auditAction = el && el.value !== undefined ? el.value : '';
    _renderAuditBody();
}

// Kept for backwards compat with any existing dispatch references
export function auditLoadMore() {}

// ─────────────────────────────────────────────────────────────
// ── SVG CHART BUILDERS ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

function _pieSvg(data) {
    if (!data || !data.length) return '<p class="obj-empty">No data for this period.</p>';
    var total = data.reduce(function (s, d) { return s + (d.value || 0); }, 0);
    if (!total) return '<p class="obj-empty">No data for this period.</p>';

    var show  = data.slice(0, 7);
    var other = data.slice(7).reduce(function (s, d) { return s + (d.value || 0); }, 0);
    if (other > 0) show = show.concat([{ label: 'Other', value: other, subtitle: other + '', color: '#374151' }]);

    var cx = 95, cy = 95, r = 80, svgH = Math.max(200, show.length * 22 + 24);
    var angle = -Math.PI / 2, paths = '', legends = '';

    show.forEach(function (d, i) {
        var frac = d.value / total, sweep = frac * 2 * Math.PI;
        var color = d.color || _C[i % _C.length];
        var tip   = _se(d.label) + ': ' + _se(d.subtitle || String(d.value)) + ' (' + (frac * 100).toFixed(1) + '%)';

        if (show.length === 1) {
            paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" class="es-pie-slice" data-tip="' + tip + '"/>';
        } else {
            var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
            var x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
            paths += '<path d="M' + cx + ',' + cy + 'L' + x1.toFixed(2) + ',' + y1.toFixed(2) +
                'A' + r + ',' + r + ',0,' + (sweep > Math.PI ? 1 : 0) + ',1,' +
                x2.toFixed(2) + ',' + y2.toFixed(2) + 'Z" fill="' + color +
                '" stroke="#0b0c0f" stroke-width="1.5" class="es-pie-slice" data-tip="' + tip + '"/>';
        }
        var ly = 18 + i * 22, lbl = d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label;
        legends += '<rect x="198" y="' + ly + '" width="10" height="10" rx="2" fill="' + color + '"/>' +
            '<text x="212" y="' + (ly + 9) + '" fill="#e8e9ec" font-size="10" font-family="DM Mono,monospace">' + _se(lbl) + '</text>' +
            '<text x="336" y="' + (ly + 9) + '" fill="#6b7280" font-size="10" font-family="DM Mono,monospace" text-anchor="end">' + (frac * 100).toFixed(1) + '%</text>';
        angle += sweep;
    });

    return '<svg viewBox="0 0 340 ' + svgH + '" style="width:100%;display:block">' + paths + legends + '</svg>';
}

function _crPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
        var cp1x = p1[0]+(p2[0]-p0[0])/6, cp1y = p1[1]+(p2[1]-p0[1])/6;
        var cp2x = p2[0]-(p3[0]-p1[0])/6, cp2y = p2[1]-(p3[1]-p1[1])/6;
        d += ' C'+cp1x.toFixed(1)+','+cp1y.toFixed(1)+' '+cp2x.toFixed(1)+','+cp2y.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);
    }
    return d;
}

// singleScale=true: bars and line share same Y max (accurate for same-data series)
function _comboSvg(items, barColor, lineColor, singleScale) {
    if (!items || !items.length) return '<p class="obj-empty">No data for this period.</p>';
    var ML=46,MR=16,MT=14,MB=44, W=580,H=200, cW=W-ML-MR, cH=H-MT-MB;
    var maxBar  = Math.max.apply(null, items.map(function(d){return d.bar  ||0;})) || 1;
    var maxLine = Math.max.apply(null, items.map(function(d){return d.line ||0;})) || 1;
    var maxY    = singleScale ? Math.max(maxBar,maxLine) : null;
    var n=items.length, gap=cW/n, bW=Math.max(3,Math.min(gap*0.55,40));
    var yTicks='',bars='',linePts=[],linePath='',dots='',xLabels='';

    for (var t=0;t<=4;t++) {
        var tv=Math.round(((maxY||maxBar)*t)/4), ty=(MT+cH-(t/4)*cH).toFixed(1);
        yTicks+='<line x1="'+ML+'" y1="'+ty+'" x2="'+(ML+cW)+'" y2="'+ty+'" stroke="rgba(255,255,255,.05)" stroke-width="1"/>' +
                 '<text x="'+(ML-4)+'" y="'+(parseFloat(ty)+4)+'" fill="#6b7280" font-size="9" font-family="DM Mono,monospace" text-anchor="end">'+tv+'</text>';
    }

    items.forEach(function(d,i) {
        var cx=ML+gap*i+gap/2, bVal=d.bar||0, lVal=d.line||0;
        var bH=cH*(bVal/(maxY||maxBar)), bY=MT+cH-bH;
        bars+='<rect x="'+(cx-bW/2).toFixed(1)+'" y="'+bY.toFixed(1)+'" width="'+bW.toFixed(1)+'" height="'+bH.toFixed(1)+'" fill="'+barColor+'" opacity="0.8" rx="2" class="es-bar" data-tip="'+_se(d.barTip||(d.label+': '+bVal))+'"/>';

        var lY=MT+cH-cH*(lVal/(maxY||maxLine));
        linePts.push([cx,lY,d.lineTip||(d.label+': '+lVal)]);

        var lbl=String(d.label||''); if(lbl.length>7)lbl=lbl.slice(0,6)+'…';
        if(n>8) xLabels+='<text transform="translate('+cx.toFixed(1)+','+(MT+cH+12)+') rotate(-40)" fill="#6b7280" font-size="9" font-family="DM Mono,monospace" text-anchor="end">'+_se(lbl)+'</text>';
        else    xLabels+='<text x="'+cx.toFixed(1)+'" y="'+(MT+cH+16)+'" fill="#6b7280" font-size="9" font-family="DM Mono,monospace" text-anchor="middle">'+_se(lbl)+'</text>';
    });

    if (linePts.length>=2) {
        linePath='<path d="'+_crPath(linePts.map(function(p){return[p[0],p[1]];}))+ '" fill="none" stroke="'+lineColor+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        linePts.forEach(function(p){dots+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="5" fill="'+lineColor+'" stroke="#111318" stroke-width="1.5" class="es-dot" data-tip="'+_se(p[2])+'"/>';});
    }
    var axes='<line x1="'+ML+'" y1="'+(MT+cH)+'" x2="'+(ML+cW)+'" y2="'+(MT+cH)+'" stroke="rgba(255,255,255,.12)" stroke-width="1"/><line x1="'+ML+'" y1="'+MT+'" x2="'+ML+'" y2="'+(MT+cH)+'" stroke="rgba(255,255,255,.12)" stroke-width="1"/>';
    return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;display:block;max-height:200px">'+yTicks+axes+bars+linePath+dots+xLabels+'</svg>';
}

// columns[2] = primary metric (accent2 bold), columns[3] = secondary (muted)
function _lbTable(rows, headers, rowFn) {
    if (!Array.isArray(rows)||!rows.length) return '<p class="obj-empty">No data for this period.</p>';
    var html='<div class="es-lb-wrap"><table class="es-lb-table"><thead><tr>'+
        headers.map(function(h,i){return '<th'+(i>=2?' style="text-align:right"':'')+'>'+h+'</th>';}).join('')+
        '</tr></thead><tbody>';
    rows.forEach(function(e){
        var cells=rowFn(e);
        html+='<tr>'+cells.map(function(c,i){
            var s=i===0?' class="es-lb-rank"':i===1?' class="es-lb-name"':i===2?' class="es-lb-primary"':' class="es-lb-secondary"';
            return '<td'+s+'>'+esc(String(c??'—'))+'</td>';
        }).join('')+'</tr>';
    });
    return html+'</tbody></table></div>';
}

function _statCard(label, value) {
    return '<div class="es-stat-card"><div class="es-stat-value">'+esc(String(value))+'</div><div class="es-stat-label">'+esc(label)+'</div></div>';
}
function _spotlight(role, username, meta) {
    return '<div class="es-highlight"><div class="es-highlight-role">'+esc(role)+'</div><div class="es-highlight-name">'+esc(username)+'</div><div class="es-highlight-meta">'+meta+'</div></div>';
}
function _shortMonth(m) {
    var p=m.split('-'); if(p.length!==2) return m;
    var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (mn[parseInt(p[1],10)-1]||p[1])+'\''+p[0].slice(2);
}
