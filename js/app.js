// ═══════════════════════════════════════════════════════════════
//  app.js — boot, auth, home page, navigation, data refresh
// ═══════════════════════════════════════════════════════════════

'use strict';

// Shared data store
window._D = null;

// ── Content setter ────────────────────────────────────────────
function setContent(html) {
    document.getElementById('content').innerHTML = html;
}

// ── Home page ─────────────────────────────────────────────────
// Add new sections here: icon, id, title, desc, accessFn, lockMsg
var HOME_SECTIONS = [
    {
        id:       'mainframe',
        icon:     '🖥️',
        title:    'Commandos Mainframe',
        desc:     'Activity & officer trackers, event logs, department data and submission forms.',
        accessFn: function () { return window.AUTH.isInDivision(); },
        lockMsg:  'Must be a member of the division group.'
    },
    {
        id:       'div-objectives',
        icon:     '🎯',
        title:    'Division Objectives',
        desc:     'Track and manage current division objectives and goals.',
        accessFn: function () { return window.AUTH.canAccessHigherSections(); },
        lockMsg:  'Requires rank 243 (Officer) or above.'
    },
    {
        id:       'deployment',
        icon:     '⚡',
        title:    'Deployment Incentive System',
        desc:     'Review and manage deployment incentives and mission rewards.',
        accessFn: function () { return window.AUTH.canAccessHigherSections(); },
        lockMsg:  'Requires rank 243 (Officer) or above.'
    }
    // ── Add new sections above this line ──
    // {
    //     id: 'my-new-section', icon: '🔧', title: 'My Section',
    //     desc: 'Description here.',
    //     accessFn: function () { return true; },
    //     lockMsg: ''
    // }
];

function renderHomeScreen() {
    var u = window.AUTH.user;
    var cards = HOME_SECTIONS.map(function (s) {
        var accessible = s.accessFn();
        var cls = 'home-card' + (accessible ? '' : ' home-card-locked');
        return '<div class="' + cls + '" ' +
            (accessible ? 'data-click="enterSection" data-section="' + s.id + '"' : '') + '>' +
            '<div class="home-card-icon">' + s.icon + '</div>' +
            '<div class="home-card-body">' +
            '<div class="home-card-title">' + esc(s.title) + '</div>' +
            '<div class="home-card-desc">' + esc(s.desc) + '</div>' +
            (accessible ? '' : '<div class="home-card-lock">🔒 ' + esc(s.lockMsg) + '</div>') +
            '</div>' +
            '</div>';
    }).join('');

    var rankLine = u.divisionRoleName
        ? esc(u.divisionRoleName) + ' · Rank ' + u.divisionRank
        : 'Rank ' + u.divisionRank;

    var hs = document.getElementById('home-screen');
    if (hs) {
        hs.innerHTML =
            '<div class="home-header">' +
            '<div class="home-eyebrow">NIGHTHAWK COMMANDOS</div>' +
            '<h1 class="home-title">Mainframe</h1>' +
            '<div class="home-subtitle">Select a system to enter</div>' +
            '</div>' +
            '<div class="home-profile">' +
            '<div class="home-profile-name">' + esc(u.robloxUsername) + '</div>' +
            '<div class="home-profile-rank">' + rankLine + '</div>' +
            '<button class="home-logout-btn" data-click="doLogout">Logout</button>' +
            '</div>' +
            '<div class="home-grid">' + cards + '</div>';
    }
}

function enterSection(el) {
    var section = el && el.dataset ? el.dataset.section : el;
    if (section === 'mainframe') {
        document.getElementById('home-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadMainframe();
    } else if (section === 'div-objectives') {
        renderSectionPlaceholder('Division Objectives', '🎯',
            'This section is under construction. Check back soon.');
    } else if (section === 'deployment') {
        renderSectionPlaceholder('Deployment Incentive System', '⚡',
            'This section is under construction. Check back soon.');
    }
}

function renderSectionPlaceholder(title, icon, msg) {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.innerHTML =
        '<div class="home-header">' +
        '<div class="home-eyebrow">NIGHTHAWK COMMANDOS</div>' +
        '<h1 class="home-title">' + icon + ' ' + esc(title) + '</h1>' +
        '</div>' +
        '<div class="section-placeholder">' +
        '<div class="section-placeholder-icon">🚧</div>' +
        '<div class="section-placeholder-msg">' + esc(msg) + '</div>' +
        '<button class="btn-ghost" style="margin-top:18px" data-click="showHomeScreen">← Back to Hub</button>' +
        '</div>';
}

function showHomeScreen() {
    renderHomeScreen();
}

function doLogout() {
    window.AUTH.logout();
}

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
    'form-missingap':    renderFormMissingAP,
    'admin':             renderAdminDashboard
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

// ── Update nav visibility based on rank ───────────────────────
function updateNavAccess() {
    var u = window.AUTH.user;
    if (!u) return;
    var inGroup   = u.divisionRank > 0;
    var canOfficer = u.divisionRank >= 235 || u.ghostRank >= 7;
    var canAdmin   = u.divisionRank >= 246;

    // Hide/show officer-only forms
    ['form-eventlog', 'form-editeventlog'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item) item.style.display = (inGroup && canOfficer) ? '' : 'none';
    });

    // Hide/show all forms if not in group
    ['form-eventlog', 'form-editeventlog', 'form-transfer', 'form-exemption', 'form-missingap'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item && !inGroup) item.style.display = 'none';
    });

    // Show admin nav
    var adminItem  = document.getElementById('nav-admin');
    var adminGroup = document.getElementById('nav-admin-group');
    if (adminItem)  adminItem.style.display  = canAdmin ? '' : 'none';
    if (adminGroup) adminGroup.style.display = canAdmin ? '' : 'none';

    // Show group label in sidebar logo area
    var rankEl = document.getElementById('sidebar-rank');
    if (rankEl && u) {
        rankEl.textContent = (u.divisionRoleName || 'Rank ' + u.divisionRank);
    }
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
        var q    = inp.value.toLowerCase();
        var grid = document.getElementById('dept-grid');
        if (grid) grid.innerHTML = buildDeptBlocks(window._D.departments, q);
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
        if (active) { var key = active.dataset.key; if (key && PAGES[key]) PAGES[key](); }
    }).catch(function (e) {
        toast('Refresh failed: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
    });
}

// ── Profile card population ───────────────────────────────────
function populateProfileCard() {
    var u = window.AUTH.user;
    if (!u) return;
    var nameEl  = document.getElementById('profile-name');
    var rankEl  = document.getElementById('profile-rank');
    var card    = document.getElementById('profile-card');
    if (nameEl) nameEl.textContent = u.robloxUsername || u.discordUsername;
    if (rankEl) {
        rankEl.textContent = u.divisionRoleName
            ? u.divisionRoleName + ' · ' + u.divisionRank
            : 'Rank ' + u.divisionRank;
    }
    if (card) card.style.display = 'flex';
}

// ── Global event delegation (replaces remaining inline handlers)
document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-click]');
    if (!el) return;
    var fn = el.dataset.click;
    if (fn === 'enterSection') enterSection(el);
    else if (fn === 'doLogout') doLogout();
    else if (fn === 'showHomeScreen') showHomeScreen();
    else if (typeof window[fn] === 'function') window[fn](el);
});

// ── Load mainframe data ───────────────────────────────────────
function loadMainframe() {
    if (window._D) {
        // Data already loaded, just show the mainframe
        document.getElementById('home-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        var hbg = document.getElementById('hbg'); if (hbg) hbg.style.display = '';
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

// ── Static DOM wiring (DOMContentLoaded) ─────────────────────
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

// ── Boot ──────────────────────────────────────────────────────
(function boot() {
    // 1. Check SCRIPT_URL config
    if (!window.SCRIPT_URL || window.SCRIPT_URL.indexOf('YOUR_DEPLOYMENT_ID_HERE') !== -1) {
        document.getElementById('loading').classList.add('hidden');
        setContent(
            '<div class="setup-wrap">' +
            '<div class="ph"><div class="ey">Setup Required</div><h1>Set Your Script URL</h1>' +
            '<div class="sub">Edit config.js and set your Apps Script /exec URL.</div></div>' +
            '</div>'
        );
        return;
    }

    // 2. Load auth session
    window.AUTH.load().then(function (user) {
        document.getElementById('loading').classList.add('hidden');
        if (!user) {
            // Not logged in → show login screen
            document.getElementById('login-screen').classList.remove('hidden');
        } else {
            // Logged in → show home screen
            document.getElementById('home-screen').classList.remove('hidden');
            renderHomeScreen();
        }
    });
})();
