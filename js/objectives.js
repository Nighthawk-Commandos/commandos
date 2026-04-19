// ═══════════════════════════════════════════════════════════════
//  objectives.js — Division Objectives section
//  Replicates the original Apps Script HTML design:
//  sidebar nav + overview + per-department task cards
// ═══════════════════════════════════════════════════════════════

import { esc } from './utils.js';

// ── Cache (1 hour, stored in localStorage) ───────────────────
var _OBJ_CACHE_KEY = 'obj:data';
var _OBJ_CACHE_TTL = 60 * 60 * 1000;
var _objMemCache   = null;
var _objMemExp     = 0;
var _objData       = null;
var _objView       = 'overview';

// ── Entry point ───────────────────────────────────────────────
export function renderObjectivesSection() {
    _objView = 'overview';
    var hs = document.getElementById('home-screen');
    if (!hs) return;

    var cached = _objCacheGet();
    if (cached) {
        _objData = cached;
        hs.className = 'obj-mode';
        hs.removeAttribute('style');
        hs.innerHTML = _objShellHTML();
        _objBuildNav();
        _objRenderOverview();
        return;
    }

    var loadDiv = document.getElementById('loading');
    if (loadDiv) loadDiv.classList.remove('hidden');
    hs.className = 'obj-mode';
    hs.removeAttribute('style');
    hs.innerHTML = _objShellHTML();

    _objFetch(function () {
        if (loadDiv) loadDiv.classList.add('hidden');
    });
}

function _objShellHTML() {
    return '' +
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" id="obj-sidebar">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
        '    <div class="obj-sidebar-title">TNIC<br>Objectives</div>' +
        '  </div>' +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">&#8592; Hub</button>' +
        '  </div>' +
        '  <nav class="obj-nav" id="obj-nav">' +
        '    <div class="obj-nav-group">Overview</div>' +
        '    <div class="obj-nav-item active" data-objkey="overview" data-click="objGo">'+
        '      <span class="obj-nav-dot"></span>All Objectives' +
        '    </div>' +
        '    <div class="obj-nav-group">Departments</div>' +
        '  </nav>' +
        '</aside>' +
        '<main class="obj-main" id="obj-main">' +
        '  <div id="obj-content"><div class="obj-load-state">Loading objectives&#8230;</div></div>' +
        '</main>';
}

// ── Data fetch + cache ────────────────────────────────────────
function _objFetch(onDone) {
    fetch('/api/objectives/data', { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) {
            if (!json.success) throw new Error(json.error || 'Unknown error');
            _objData = json.data;
            _objCacheSet(json.data);
            if (onDone) onDone();
            _objBuildNav();
            _objRenderOverview();
        })
        .catch(function (e) {
            if (onDone) onDone();
            _objSetContent('<div class="empty-state" style="color:var(--red)">Failed to load objectives: ' + esc(e.message) + '</div>');
        });
}

function _objCacheGet() {
    if (_objMemCache && Date.now() < _objMemExp) return _objMemCache;
    try {
        var raw = localStorage.getItem(_OBJ_CACHE_KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (Date.now() > obj.exp) { localStorage.removeItem(_OBJ_CACHE_KEY); return null; }
        _objMemCache = obj.data; _objMemExp = obj.exp;
        return obj.data;
    } catch (_) { return null; }
}

function _objCacheSet(data) {
    _objMemCache = data; _objMemExp = Date.now() + _OBJ_CACHE_TTL;
    try { localStorage.setItem(_OBJ_CACHE_KEY, JSON.stringify({ data: data, exp: _objMemExp })); } catch (_) {}
}

// ── Build sidebar nav ─────────────────────────────────────────
function _objBuildNav() {
    var nav = document.getElementById('obj-nav');
    if (!nav || !_objData || !_objData.divisions) return;
    _objData.divisions.forEach(function (dept) {
        var el = document.createElement('div');
        el.className = 'obj-nav-item';
        el.setAttribute('data-objkey', dept.name);
        el.setAttribute('data-click', 'objGo');
        el.innerHTML = '<span class="obj-nav-dot"></span>' + esc(dept.name);
        nav.appendChild(el);
    });
}

// ── Navigation ────────────────────────────────────────────────
export function objGo(el) {
    var key = el && el.dataset ? el.dataset.objkey : el;
    document.querySelectorAll('.obj-nav-item').forEach(function (n) { n.classList.remove('active'); });
    if (el && el.classList) el.classList.add('active');
    var mainEl = document.getElementById('obj-main');
    if (mainEl) mainEl.scrollTop = 0;
    _objView = key;
    if (key === 'overview') {
        _objRenderOverview();
    } else if (_objData) {
        var dept = (_objData.divisions || []).find(function (d) { return d.name === key; });
        if (dept) _objRenderDept(dept);
    }
}

// ── Overview ──────────────────────────────────────────────────
function _objRenderOverview() {
    if (!_objData) return;
    var c = _objData.commandos || {};
    var allTasks = [];
    (_objData.divisions || []).forEach(function (d) { allTasks = allTasks.concat(d.tasks || []); });

    var inProg   = allTasks.filter(function (t) { return _normSt(t.status) === 'progress'; }).length;
    var notSt    = allTasks.filter(function (t) { return _normSt(t.status) === 'not'; }).length;
    var launched = allTasks.filter(function (t) { return _normSt(t.status) === 'launched'; }).length;
    var highest  = allTasks.filter(function (t) { return (t.priority || '').toLowerCase() === 'highest'; }).length;

    var h = '';
    h += '<div class="page-header">';
    h += '<div class="eyebrow">Nighthawk Commandos \u2014 ' + esc(_objData.month || 'Monthly') + '</div>';
    h += '<h1>TNIC Objectives</h1>';
    h += '<div class="page-meta">';
    if (c.director) h += _chip('Director', c.director);
    if (c.deputies) h += _chip('Deputy Director(s)', c.deputies);
    if (c.advisors)  h += _chip('Advisors', c.advisors);
    h += '</div></div>';

    h += '<div class="summary-bar">';
    h += _stat(allTasks.length, 'Total Tasks');
    h += _stat(inProg,   'In Progress');
    h += _stat(notSt,    'Not Started');
    h += _stat(launched, 'Launched');
    h += _stat(highest,  'Highest Priority');
    h += '</div>';

    h += '<div class="section-label">Monthly Directives</div>';
    var cmTasks = c.tasks || [];
    if (cmTasks.length === 0) {
        h += '<div class="empty-state">No monthly directives found.</div>';
    } else {
        h += '<div class="tasks-grid">';
        cmTasks.forEach(function (t, i) { h += _taskCard(t, i, true); });
        h += '</div>';
    }

    h += '<hr class="obj-divider">';
    h += '<div class="section-label">Departments</div>';
    h += '<div class="tasks-grid">';
    (_objData.divisions || []).forEach(function (dept) { h += _deptCard(dept); });
    h += '</div>';

    _objSetContent(h);
}

// ── Department page ───────────────────────────────────────────
function _objRenderDept(dept) {
    var tasks    = dept.tasks || [];
    var inProg   = tasks.filter(function (t) { return _normSt(t.status) === 'progress'; }).length;
    var notSt    = tasks.filter(function (t) { return _normSt(t.status) === 'not'; }).length;
    var launched = tasks.filter(function (t) { return _normSt(t.status) === 'launched'; }).length;
    var highest  = tasks.filter(function (t) { return (t.priority || '').toLowerCase() === 'highest'; }).length;

    var h = '';
    h += '<div class="page-header">';
    h += '<div class="eyebrow">Department Objectives</div>';
    h += '<h1>' + esc(dept.name) + '</h1>';
    h += '<div class="page-meta">';
    if (dept.overseer)      h += _chip('Overseer', dept.overseer);
    if (dept.adminOverseer) h += _chip('Admin Overseer', dept.adminOverseer);
    h += '</div></div>';

    h += '<div class="summary-bar">';
    h += _stat(tasks.length, 'Tasks');
    h += _stat(inProg,   'In Progress');
    h += _stat(notSt,    'Not Started');
    h += _stat(launched, 'Launched');
    h += _stat(highest,  'Highest Priority');
    h += '</div>';

    h += '<div class="section-label">Tasks</div>';
    if (tasks.length === 0) {
        h += '<div class="empty-state">No tasks assigned.</div>';
    } else {
        h += '<div class="tasks-grid">';
        tasks.forEach(function (t, i) { h += _taskCard(t, i, false); });
        h += '</div>';
    }
    _objSetContent(h);
}

// ── Department summary card ───────────────────────────────────
function _deptCard(dept) {
    var tasks    = dept.tasks || [];
    var inProg   = tasks.filter(function (t) { return _normSt(t.status) === 'progress'; }).length;
    var notSt    = tasks.filter(function (t) { return _normSt(t.status) === 'not'; }).length;
    var launched = tasks.filter(function (t) { return _normSt(t.status) === 'launched'; }).length;

    var h = '<div class="dept-card" data-objkey="' + esc(dept.name) + '" data-click="objGo">';
    h += '<div>';
    h += '<div class="dept-card-name">' + esc(dept.name) + '</div>';
    h += '<div class="dept-card-sub">Overseer: <span>' + esc(dept.overseer || 'VACANT') + '</span></div>';
    h += '</div>';
    h += '<div class="dept-badges">';
    if (tasks.length === 0) {
        h += _badge('No tasks', 's-not');
    } else {
        if (inProg)   h += _badge(inProg + ' In Progress', 's-progress');
        if (notSt)    h += _badge(notSt + ' Not Started', 's-not');
        if (launched) h += _badge(launched + ' Launched', 's-launched');
    }
    h += '</div></div>';
    return h;
}

// ── Task card ─────────────────────────────────────────────────
function _taskCard(t, idx, isCmdo) {
    var pClass = 'p-' + (t.priority || 'low').toLowerCase().replace(/\s+/g, '');
    var sClass = _normSt(t.status) === 'progress' ? 's-progress' : _normSt(t.status) === 'launched' ? 's-launched' : 's-not';

    var h = '<div class="task-card">';
    h += '<div>';
    h += '<div class="task-text">' + esc(t.task) + '</div>';
    h += '<div class="task-footer">';
    if (t.date) h += '<span class="task-date">' + esc(t.date) + '</span>';
    if (isCmdo && t.department) h += '<span class="task-tag">' + esc(t.department) + '</span>';
    if (!isCmdo && t.notes && t.notes.trim()) h += '<span class="task-tag">' + esc(t.notes) + '</span>';
    h += '</div></div>';
    h += '<div class="task-badges">';
    if (t.priority) h += _badge(t.priority, pClass);
    if (t.status)   h += _badge(t.status, sClass);
    if (!isCmdo && t.size) h += '<span class="size-badge">' + esc(t.size) + '</span>';
    h += '</div></div>';
    return h;
}

// ── Helpers ───────────────────────────────────────────────────
function _objSetContent(html) {
    var el = document.getElementById('obj-content');
    if (el) el.innerHTML = html;
}

function _normSt(s) {
    if (!s) return 'not';
    var l = s.toLowerCase();
    if (l.indexOf('progress') !== -1) return 'progress';
    if (l.indexOf('launch') !== -1 || l.indexOf('complete') !== -1) return 'launched';
    return 'not';
}

function _chip(label, val) {
    if (!val) return '';
    return '<div class="meta-chip"><span>' + esc(label) + ':&nbsp;</span><strong>' + esc(val) + '</strong></div>';
}

function _stat(n, label) {
    return '<div class="stat-card"><div class="num">' + n + '</div><div class="lbl">' + esc(label) + '</div></div>';
}

function _badge(text, cls) {
    return '<span class="badge ' + cls + '">' + esc(String(text)) + '</span>';
}
