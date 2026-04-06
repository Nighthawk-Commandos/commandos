// ═══════════════════════════════════════════════════════════════
//  app.js — boot, auth, home page, navigation, data refresh
// ═══════════════════════════════════════════════════════════════

'use strict';

window._D = null;

// ── Content setter ────────────────────────────────────────────
function setContent(html) {
    document.getElementById('content').innerHTML = html;
}

// ── Home page section definitions ─────────────────────────────
// To add a new section: append an object to HOME_SECTIONS below.
// accessFn: function returning true/false — controls lock state.
// handler:  function called when the card is clicked (unlocked).
var HOME_SECTIONS = [
    {
        id:       'mainframe',
        tag:      'MF',
        tagColor: 'var(--accent)',
        title:    'Commandos Mainframe',
        desc:     'Activity & officer trackers, event logs, department data and submission forms.',
        accessFn: function () { return window.AUTH.isInDivision(); },
        lockMsg:  'Division group membership required.'
    },
    {
        id:       'div-objectives',
        tag:      'OBJ',
        tagColor: '#4a7fc8',
        title:    'Division Objectives',
        desc:     'Current monthly directives and per-department task tracking.',
        accessFn: function () { return window.AUTH.canAccessHigherSections(); },
        lockMsg:  'Requires rank 243 (Officer) or above.'
    },
    {
        id:       'deployment',
        tag:      'DIS',
        tagColor: '#7c4ab8',
        title:    'Deployment Incentive System',
        desc:     'Competitive lock-out deployment grid — claim tiles by hosting events, earn raffle entries.',
        accessFn: function () { return window.AUTH.canSubmitOfficerForms(); },
        lockMsg:  'Requires rank 235 (Officer) or above.'
    },
    {
        id:       'admin',
        tag:      'ADM',
        tagColor: 'var(--red)',
        title:    'Admin Dashboard',
        desc:     'System administration — role management, DIS moderation, audit logs.',
        accessFn: function () { return window.AUTH.canAdminAny(); },
        lockMsg:  'Admin access required.'
    }
    // ── Add new sections here ──────────────────────────────────
    // {
    //     id: 'my-section', tag: 'TAG', tagColor: '#hex',
    //     title: 'My Section', desc: 'Description.',
    //     accessFn: function () { return true; }, lockMsg: ''
    // }
];

// ── Home page render ──────────────────────────────────────────
function renderHomeScreen() {
    var u = window.AUTH.user;

    var cards = HOME_SECTIONS.map(function (s) {
        var accessible = s.accessFn();
        return '<div class="home-card' + (accessible ? '' : ' home-card-locked') + '"' +
            (accessible ? ' data-click="enterSection" data-section="' + s.id + '"' : '') + '>' +
            '<div class="home-card-tag" style="color:' + s.tagColor + ';border-color:' + s.tagColor + '44">' + esc(s.tag) + '</div>' +
            '<div class="home-card-body">' +
            '<div class="home-card-title">' + esc(s.title) + '</div>' +
            '<div class="home-card-desc">' + esc(s.desc) + '</div>' +
            (accessible ? '' : '<div class="home-card-lock">' + esc(s.lockMsg) + '</div>') +
            '</div>' +
            (accessible ? '<div class="home-card-arrow">&#8594;</div>' : '') +
            '</div>';
    }).join('');

    var roleLine = u.divisionRoleName
        ? esc(u.divisionRoleName) + ' &mdash; Rank ' + u.divisionRank
        : 'Rank ' + u.divisionRank;

    var ghostLine = u.ghostRank > 0
        ? '<span class="home-profile-ghost">Ghost Rank ' + u.ghostRank + (u.ghostRoleName ? ' &mdash; ' + esc(u.ghostRoleName) : '') + '</span>'
        : '';

    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner">' +
        '<div class="home-header">' +
        '<div class="home-eyebrow">NIGHTHAWK COMMANDOS &mdash; DIVISION HUB</div>' +
        '<h1 class="home-title">Mainframe</h1>' +
        '<div class="home-divider"></div>' +
        '</div>' +
        '<div class="home-profile">' +
        '<div class="home-profile-left">' +
        '<div class="home-profile-name">' + esc(u.robloxUsername) + '</div>' +
        '<div class="home-profile-rank">' + roleLine + ghostLine + '</div>' +
        '</div>' +
        '<button class="home-logout-btn" data-click="doLogout">Disconnect</button>' +
        '</div>' +
        '<div class="home-grid">' + cards + '</div>' +
        '</div>';
}

// ── Section enter ─────────────────────────────────────────────
function enterSection(el) {
    var section = el && el.dataset ? el.dataset.section : el;
    if (section === 'mainframe')           { enterMainframe(); }
    else if (section === 'div-objectives') { enterObjectives(); }
    else if (section === 'deployment')     { enterDIS(); }
    else if (section === 'admin')          { enterAdmin(); }
}

function enterAdmin() {
    renderUnifiedAdmin();
}

function enterMainframe() {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    var hbg = document.getElementById('hbg'); if (hbg) hbg.style.display = '';
    loadMainframe();
}

function enterObjectives() {
    renderObjectivesSection();
}

function enterDIS() {
    renderDISSection();
}

function renderSectionPlaceholder(title, msg) {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner">' +
        '<div class="section-ph-head">' +
        '<div class="home-eyebrow">NIGHTHAWK COMMANDOS</div>' +
        '<h1 class="home-title">' + esc(title) + '</h1>' +
        '</div>' +
        '<div class="section-placeholder">' +
        '<div class="section-placeholder-msg">' + esc(msg) + '</div>' +
        '<button class="btn-ghost" style="margin-top:18px" data-click="showHomeScreen">&#8592; Back to Hub</button>' +
        '</div>' +
        '</div>';
}

function showHomeScreen() { renderHomeScreen(); }
function doLogout()       { window.AUTH.logout(); }

// ── Navigation (mainframe pages) ─────────────────────────────
var PAGES = {
    settings:            function () { setContent(renderSettings(window._D)); },
    activity:            function () { setContent(renderActivity(window._D)); wireActivity(); },
    officers:            function () { setContent(renderOfficers(window._D)); wireOfficers(); },
    honored:             function () { setContent(renderHonored(window._D)); wireHonored(); },
    departments:         function () { setContent(renderDepartments(window._D)); wireDepts(); },
    weekly:              function () {
        setContent(renderEvents(window._D.weeklyEvents,
            ['Username', 'Date', 'Event Type', 'AP Value', 'OP Value', 'Attendees'], 'Weekly Events'));
    },
    monthly:             function () {
        setContent(renderEvents(window._D.monthlyEvents,
            ['Username', 'Date', 'Event Type', 'AP Value', 'OP Value', 'Attendees'], 'Monthly Events'));
    },
    'form-eventlog':     renderFormEventLog,
    'form-editeventlog': renderFormEditEventLog,
    'form-transfer':     renderFormTransfer,
    'form-exemption':    renderFormExemption,
    'form-missingap':    renderFormMissingAP
};

function go(key, el) {
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    if (el) el.classList.add('active');
    document.getElementById('main').scrollTop = 0;
    document.getElementById('sidebar').classList.remove('open');
    actFilter = 'all';
    if (PAGES[key]) PAGES[key]();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── Rank-based nav visibility ─────────────────────────────────
function updateNavAccess() {
    var u = window.AUTH.user;
    if (!u) return;
    var inGroup    = u.divisionRank > 0;
    var canOfficer = u.divisionRank >= 235 || u.ghostRank >= 7;

    // Officer-only forms
    ['form-eventlog', 'form-editeventlog'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item) item.style.display = (inGroup && canOfficer) ? '' : 'none';
    });
    // All forms hidden if not in group
    ['form-eventlog', 'form-editeventlog', 'form-transfer', 'form-exemption', 'form-missingap'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item && !inGroup) item.style.display = 'none';
    });
    // Rank in sidebar
    var rankEl = document.getElementById('sidebar-rank');
    if (rankEl) rankEl.textContent = u.divisionRoleName || ('Rank ' + u.divisionRank);
}

// ── Search wire-up ────────────────────────────────────────────
function wireActivity() {
    renderActivityRows(window._D.activity.members);
    var inp = document.getElementById('act-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderActivityRows(window._D.activity.members); }, 160));
}
function wireOfficers() {
    renderOfficerRows(window._D.officers.officers);
    var inp = document.getElementById('off-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderOfficerRows(window._D.officers.officers); }, 160));
}
function wireHonored() {
    renderHonoredRows(window._D.honored.members);
    var inp = document.getElementById('hon-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderHonoredRows(window._D.honored.members); }, 160));
}
function wireDepts() {
    var inp = document.getElementById('dept-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () {
        var grid = document.getElementById('dept-grid');
        if (grid) grid.innerHTML = buildDeptBlocks(window._D.departments, inp.value.toLowerCase());
    }, 160));
}

// ── Manual refresh ────────────────────────────────────────────
function refreshData() {
    var btn = document.getElementById('refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    API.refreshAllData().then(function (d) {
        window._D = d;
        toast('Data refreshed', 'success');
        if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
        var active = document.querySelector('.nav-item.active');
        if (active && PAGES[active.dataset.key]) PAGES[active.dataset.key]();
    }).catch(function (e) {
        toast('Refresh failed: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
    });
}

// ── Profile card ──────────────────────────────────────────────
function populateProfileCard() {
    var u = window.AUTH.user; if (!u) return;
    var nameEl = document.getElementById('profile-name');
    var rankEl = document.getElementById('profile-rank');
    var card   = document.getElementById('profile-card');
    if (nameEl) nameEl.textContent = u.robloxUsername || u.discordUsername;
    if (rankEl) rankEl.textContent = u.divisionRoleName
        ? u.divisionRoleName + ' \u00b7 ' + u.divisionRank
        : 'Rank ' + u.divisionRank;
    if (card) card.style.display = 'flex';
}

// ── Global event delegation ───────────────────────────────────
document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-click]');
    if (!el) return;
    var fn = el.dataset.click;
    if (fn === 'enterSection')  enterSection(el);
    else if (fn === 'doLogout') doLogout();
    else if (fn === 'showHomeScreen') showHomeScreen();
    else if (typeof window[fn] === 'function') window[fn](el);
});

// ── Static DOM wiring ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    var hbg = document.getElementById('hbg');
    if (hbg) hbg.addEventListener('click', toggleSidebar);
    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
    var logoutBtn = document.getElementById('sidebar-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { window.AUTH.logout(); });
    document.querySelectorAll('.nav-item').forEach(function (item) {
        item.addEventListener('click', function () { go(item.dataset.key, item); });
    });
});

// ── Load mainframe data ───────────────────────────────────────
function loadMainframe() {
    if (window._D) {
        updateNavAccess();
        populateProfileCard();
        setContent(renderSettings(window._D));
        return;
    }
    var ls = document.getElementById('loading-status');
    if (ls) ls.textContent = 'Loading mainframe data…';
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    Promise.all([API.getAllData(), API.getGroupMembers()])
        .then(function (results) {
            window._D = results[0];
            setMembers(results[1] || []);
            updateNavAccess();
            populateProfileCard();
            setContent(renderSettings(window._D));
            var hbg = document.getElementById('hbg'); if (hbg) hbg.style.display = '';
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
        })
        .catch(function (err) {
            if (ls) ls.textContent = 'Error loading data: ' + err.message;
        });
}

// ── Boot ──────────────────────────────────────────────────────
(function boot() {
    if (!window.SCRIPT_URL || window.SCRIPT_URL.indexOf('YOUR_DEPLOYMENT_ID_HERE') !== -1) {
        document.getElementById('loading').classList.add('hidden');
        setContent('<div class="setup-wrap"><div class="ph"><div class="ey">Setup Required</div><h1>Set Your Script URL</h1><div class="sub">Edit config.js and set your Apps Script /exec URL.</div></div></div>');
        return;
    }
    window.AUTH.load().then(function (user) {
        document.getElementById('loading').classList.add('hidden');
        if (!user) {
            document.getElementById('login-screen').classList.remove('hidden');
        } else {
            // Load admin perms in parallel, then show home screen
            window.AUTH.loadAdminPerms().then(function () {
                document.getElementById('home-screen').classList.remove('hidden');
                renderHomeScreen();
            });
        }
    });
})();
