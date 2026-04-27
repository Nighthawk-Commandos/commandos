// ═══════════════════════════════════════════════════════════════
//  app.js — boot, auth, home page, navigation, data refresh
// ═══════════════════════════════════════════════════════════════

import { AUTH, initAuth } from './auth.js';
import { API } from './api.js';
import { esc, debounce, toast } from './utils.js';
import {
    renderSettings, renderActivity, renderActivityRows,
    renderOfficers, renderOfficerRows,
    renderHonored, renderHonoredRows,
    renderDepartments, buildDeptBlocks,
    renderEvents, renderUnifiedAdmin,
    setMembers, adminTab,
    adminPermToggle, adminEditRole, adminCancelEditRole,
    adminSaveRole, adminDeleteRole, adminShowNewRole,
    adminCancelNewRole, adminSaveNewRole,
    adminToggleUserRole, adminAddUser, adminRemoveUser,
    adminAddOfficer, adminRemoveOfficer,
    pickAdminOfficerAdd, pickAdminOfficerRm,
    setActFilter
} from './render.js';
import {
    renderObjectivesSection, objGo
} from './objectives.js';
import {
    renderDISSection, disLeave,
    disNavGo, disTriggerSync, disSetGlobalMultiplier,
    disAdvanceWeek, disAdvanceMonth, disResetWeek,
    disRegenerateBoard, disSetTileEventType, disSetTilePoints,
    disUnlockTile, disLockTile, disForceClaim,
    disAdjustPoints, disAdjustRaffle, disRunRaffle,
    disAddGame, disEditGame, disRemoveGame
} from './dis.js';
import {
    renderFormEventLog, renderFormEditEventLog,
    renderFormTransfer, renderFormExemption, renderFormMissingAP,
    pickELHost, addELAtt, removeELAtt,
    pickEELHost, addEELAtt, removeEELAtt,
    lookupEELEvent, eelFieldChange,
    trTypeChange, resetTR, submitTR,
    pickEXUser, calcExDays, toggleExDeptDD, toggleExDept,
    resetEX, submitEX, submitEL, resetEL, resetEEL, submitEEL,
    pickMAUser, pickMAHost, resetMA, submitMA
} from './forms.js';

// Consume boot session immediately — capture then wipe so nothing lingers on window
var _bs = window._BOOT_SESSION;
window._BOOT_SESSION = undefined;
delete window._BOOT_SESSION;
initAuth(_bs);

// Module-private data store — no window._D
var _D = null;

// ── Content setter ────────────────────────────────────────────
function setContent(html) {
    document.getElementById('content').innerHTML = html;
}

// ── Home page section definitions ─────────────────────────────
var HOME_SECTIONS = [
    {
        id:       'mainframe',
        tag:      'MF',
        tagColor: 'var(--accent)',
        title:    'Commandos Mainframe',
        desc:     'Activity & officer trackers, event logs, department data and submission forms.',
        accessFn: function () { return AUTH.isInDivision(); },
        lockMsg:  'Nighthawk Commandos division membership required.'
    },
    {
        id:       'div-objectives',
        tag:      'OBJ',
        tagColor: '#4a7fc8',
        title:    'Division Objectives',
        desc:     'Current monthly directives and per-department task tracking.',
        accessFn: function () { return AUTH.canAccessHigherSections(); },
        lockMsg:  'Requires rank 243 (Officer) or above.'
    },
    {
        id:       'deployment',
        tag:      'DIS',
        tagColor: '#7c4ab8',
        title:    'Deployment Incentive System',
        desc:     'Competitive lock-out deployment grid — claim tiles by hosting events, earn raffle entries.',
        accessFn: function () { return AUTH.canSubmitOfficerForms(); },
        lockMsg:  'Requires rank 235 (Officer) or above.'
    },
    {
        id:       'admin',
        tag:      'ADM',
        tagColor: 'var(--red)',
        title:    'Admin Dashboard',
        desc:     'System administration — role management, DIS moderation, audit logs.',
        accessFn: function () { return AUTH.canAdminAny(); },
        lockMsg:  'Admin access required.'
    }
];

// ── Home page render ──────────────────────────────────────────
function renderHomeScreen() {
    var u = AUTH.user;

    var cards = HOME_SECTIONS.map(function (s) {
        var accessible = s.accessFn();
        return '<div class="home-card' + (accessible ? '' : ' home-card-locked') + '"' +
            (accessible ? ' data-click="enterSection" data-section="' + s.id + '"' : '') + '>' +
            '<div class="home-card-body">' +
            '<div class="home-card-title">' + esc(s.title) + '</div>' +
            '<div class="home-card-desc">' + esc(s.desc) + '</div>' +
            (accessible ? '' : '<div class="home-card-lock">' + esc(s.lockMsg) + '</div>') +
            (accessible ? '<button class="home-card-copy-btn" data-click="copyQuickLink" data-link="' + s.id + '" title="Copy quick link"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Copy link</button>' : '') +
            '</div>' +
            (accessible ? '<div class="home-card-arrow">&#8594;</div>' : '') +
            '</div>';
    }).join('');

    var roleLine = u.divisionRoleName
        ? 'Rank: ' + esc(u.divisionRoleName)
        : 'Rank: ' + u.divisionRank;

    var ghostLine = u.ghostRank > 0
        ? 'Ghost Rank: ' + (u.ghostRoleName ? esc(u.ghostRoleName) : u.ghostRank)
        : '';

    var discordAvatar = u.discordAvatar
        ? 'https://cdn.discordapp.com/avatars/' + u.discordId + '/' + u.discordAvatar + '.png'
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner">' +
        '<div class="home-header">' +
        '<div class="home-eyebrow">THE NIGHTHAWK IMPERIUM &mdash; NIGHTHAWK COMMANDOS</div>' +
        '<h1 class="home-title">Mainframe</h1>' +
        '<div class="home-divider"></div>' +
        '</div>' +
        '<div class="home-profile">' +
        '<div class="home-profile-avatar">' +
        '<img src="' + discordAvatar + '" alt="Discord Avatar">' +
        '</div>' +
        '<div class="home-profile-left">' +
        '<div class="home-profile-name">' + esc(u.robloxUsername) + '</div>' +
        '<div class="home-profile-rank">' +
        '<span class="rank-line">' + roleLine + '</span>'+
        (ghostLine ? '<span class="rank-line home-profile-ghost">' + ghostLine + '</span>' : '') +
        '</div>' +
        '</div>' +
        '<button class="home-logout-btn" data-click="doLogout">Logout</button>' +
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
    if (!AUTH.canAdminAny()) return;
    renderUnifiedAdmin();
}

function enterMainframe() {
    if (!AUTH.isInDivision()) return;
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    var hbg = document.getElementById('hbg'); if (hbg) hbg.style.display = '';
    loadMainframe();
}

function enterObjectives() {
    if (!AUTH.canAccessHigherSections()) return;
    renderObjectivesSection();
}

function enterDIS() {
    if (!AUTH.canSubmitOfficerForms()) return;
    renderDISSection();
}

function showHomeScreen() {
    var appEl = document.getElementById('app');
    var hbg   = document.getElementById('hbg');
    if (appEl && !appEl.classList.contains('hidden')) {
        appEl.classList.add('hidden');
    }
    if (hbg) hbg.style.display = 'none';

    disLeave();

    var hs = document.getElementById('home-screen');
    if (hs) {
        hs.className = '';
        hs.removeAttribute('style');
    }

    requestAnimationFrame(renderHomeScreen);
}

function doLogout() { AUTH.logout(); }

// ── Navigation (mainframe pages) ─────────────────────────────
var actFilterState = 'all';

var PAGES = {
    settings:            function () { setContent(renderSettings(_D)); },
    activity:            function () { setContent(renderActivity(_D)); wireActivity(); },
    officers:            function () { setContent(renderOfficers(_D)); wireOfficers(); },
    honored:             function () { setContent(renderHonored(_D)); wireHonored(); },
    departments:         function () { setContent(renderDepartments(_D)); wireDepts(); },
    weekly:              function () {
        setContent(renderEvents(_D.weeklyEvents,
            ['Username', 'Date', 'Event Type', 'AP Value', 'OP Value', 'Attendees'], 'Weekly Events'));
    },
    monthly:             function () {
        setContent(renderEvents(_D.monthlyEvents,
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
    if (PAGES[key]) PAGES[key]();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── Rank-based nav visibility ─────────────────────────────────
function updateNavAccess() {
    var u = AUTH.user;
    if (!u) return;
    var inGroup    = u.divisionRank > 0;
    var canOfficer = u.divisionRank >= 235 || u.ghostRank >= 7;

    ['form-eventlog', 'form-editeventlog'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item) item.style.display = (inGroup && canOfficer) ? '' : 'none';
    });
    ['form-eventlog', 'form-editeventlog', 'form-transfer', 'form-exemption', 'form-missingap'].forEach(function (key) {
        var item = document.querySelector('.nav-item[data-key="' + key + '"]');
        if (item && !inGroup) item.style.display = 'none';
    });
    var rankEl = document.getElementById('sidebar-rank');
    if (rankEl) rankEl.textContent = u.divisionRoleName;
}

// ── Search wire-up ────────────────────────────────────────────
function wireActivity() {
    renderActivityRows(_D.activity.members);
    var inp = document.getElementById('act-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderActivityRows(_D.activity.members); }, 160));
}
function wireOfficers() {
    renderOfficerRows(_D.officers.officers);
    var inp = document.getElementById('off-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderOfficerRows(_D.officers.officers); }, 160));
}
function wireHonored() {
    renderHonoredRows(_D.honored.members);
    var inp = document.getElementById('hon-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () { renderHonoredRows(_D.honored.members); }, 160));
}
function wireDepts() {
    var inp = document.getElementById('dept-search');
    if (!inp) return;
    inp.addEventListener('input', debounce(function () {
        var grid = document.getElementById('dept-grid');
        if (grid) grid.innerHTML = buildDeptBlocks(_D.departments, inp.value.toLowerCase());
    }, 160));
}

// ── Manual refresh ────────────────────────────────────────────
function refreshData() {
    var btn = document.getElementById('refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    API.refreshAllData().then(function (d) {
        _D = d;
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
    var u = AUTH.user; if (!u) return;
    var nameEl = document.getElementById('profile-name');
    var rankEl = document.getElementById('profile-rank');
    var card   = document.getElementById('profile-card');
    if (nameEl) nameEl.textContent = u.robloxUsername || u.discordUsername;
    if (rankEl) rankEl.textContent = u.divisionRoleName
        ? u.divisionRoleName + ' \u00b7 '
        : 'Rank ' + u.divisionRank;
    if (card) card.style.display = 'flex';
}

// ── Global event delegation ───────────────────────────────────
// _AC_ALLOWLIST + _AC_HANDLERS replace the old window[fn] pattern,
// ensuring only explicitly registered functions can be dispatched
// from autocomplete data-fn attributes.

var _AC_ALLOWLIST = {
    pickELHost: true,  addELAtt: true,   removeELAtt: true,
    pickEELHost: true, addEELAtt: true,  removeEELAtt: true,
    pickEXUser: true,  pickMAUser: true, pickMAHost: true,
    pickAdminOfficerAdd: true, pickAdminOfficerRm: true
};

var _AC_HANDLERS = {
    pickELHost:          pickELHost,
    addELAtt:            addELAtt,
    removeELAtt:         removeELAtt,
    pickEELHost:         pickEELHost,
    addEELAtt:           addEELAtt,
    removeEELAtt:        removeEELAtt,
    pickEXUser:          pickEXUser,
    pickMAUser:          pickMAUser,
    pickMAHost:          pickMAHost,
    pickAdminOfficerAdd: pickAdminOfficerAdd,
    pickAdminOfficerRm:  pickAdminOfficerRm
};

function _dispatch(fn, el, e) {
    var d = el ? el.dataset : {};
    switch (fn) {
        // Navigation
        case 'enterSection':    enterSection(el); break;
        case 'doLogout':        doLogout(); break;
        case 'showHomeScreen':  showHomeScreen(); break;
        // Activity filter — pass members so setActFilter doesn't need window._D
        case 'setActFilter':    if (_D) setActFilter(d.filter, el, _D.activity.members); break;
        // Objectives
        case 'objGo':           objGo(el); break;
        // DIS nav
        case 'disNavGo':        disNavGo(el); break;
        // Admin tabs
        case 'adminTab':        adminTab(d.key); break;
        // Admin officers
        case 'adminAddOfficer':    adminAddOfficer(); break;
        case 'adminRemoveOfficer': adminRemoveOfficer(); break;
        // Admin perms
        case 'adminPermToggle': adminPermToggle(el); break;
        // Admin roles
        case 'adminShowNewRole':    adminShowNewRole(); break;
        case 'adminSaveNewRole':    adminSaveNewRole(); break;
        case 'adminCancelNewRole':  adminCancelNewRole(); break;
        case 'adminSaveRole':       adminSaveRole(d.id); break;
        case 'adminCancelEditRole': adminCancelEditRole(d.id); break;
        case 'adminEditRole':       adminEditRole(d.id); break;
        case 'adminDeleteRole':     adminDeleteRole(d.id); break;
        // Admin users
        case 'adminAddUser':        adminAddUser(); break;
        case 'adminRemoveUser':     adminRemoveUser(d.id); break;
        case 'adminToggleUserRole': adminToggleUserRole(el, d.id); break;
        // Forms — Event Log
        case 'resetEL':  resetEL(); break;
        case 'submitEL': submitEL(); break;
        // Forms — Edit Event Log
        case 'lookupEELEvent': lookupEELEvent(); break;
        case 'eelFieldChange': eelFieldChange(); break;
        case 'resetEEL':       resetEEL(); break;
        case 'submitEEL':      submitEEL(); break;
        // Forms — Stats Transfer
        case 'trTypeChange': trTypeChange(); break;
        case 'resetTR':      resetTR(); break;
        case 'submitTR':     submitTR(); break;
        // Forms — Exemption
        case 'calcExDays':     calcExDays(); break;
        case 'toggleExDeptDD': toggleExDeptDD(); break;
        case 'toggleExDept':   toggleExDept(d.dept); break;
        case 'exTagRemove':    e.preventDefault(); e.stopPropagation(); toggleExDept(d.dept); break;
        case 'resetEX':        resetEX(); break;
        case 'submitEX':       submitEX(); break;
        // Forms — Missing AP
        case 'resetMA':  resetMA(); break;
        case 'submitMA': submitMA(); break;
        // Autocomplete select — allowlisted explicit handler map (no window[fn])
        case 'acSelect': {
            var fn2 = d.fn;
            if (_AC_ALLOWLIST[fn2] && _AC_HANDLERS[fn2]) _AC_HANDLERS[fn2](d.val);
            break;
        }
        case 'acRemove': {
            e.preventDefault();
            var fn3 = d.fn;
            if (_AC_ALLOWLIST[fn3] && _AC_HANDLERS[fn3]) _AC_HANDLERS[fn3](d.val);
            break;
        }
        // DIS
        case 'copyQuickLink': {
            e.stopPropagation();
            var url = location.origin + '/?link=' + encodeURIComponent(d.link);
            navigator.clipboard.writeText(url)
                .then(function () { toast('Link copied!', 'success'); })
                .catch(function () { toast('Failed to copy', 'error'); });
            break;
        }
        case 'openGame': {
            if (d.gameId && /^\d+$/.test(d.gameId)) {
                open('https://www.roblox.com/games/' + d.gameId, '_blank', 'noopener,noreferrer');
            }
            break;
        }
        case 'disTriggerSync':         disTriggerSync(); break;
        case 'disSetGlobalMultiplier': disSetGlobalMultiplier(); break;
        case 'disAdvanceWeek':         disAdvanceWeek(); break;
        case 'disAdvanceMonth':        disAdvanceMonth(); break;
        case 'disResetWeek':           disResetWeek(); break;
        case 'disRegenerateBoard':     disRegenerateBoard(); break;
        case 'disSetTileEventType':    disSetTileEventType(+d.pos); break;
        case 'disSetTilePoints':       disSetTilePoints(+d.pos); break;
        case 'disUnlockTile':          disUnlockTile(+d.pos); break;
        case 'disLockTile':            disLockTile(+d.pos); break;
        case 'disForceClaim':          disForceClaim(+d.pos); break;
        case 'disAdjustPoints':        disAdjustPoints(); break;
        case 'disAdjustRaffle':        disAdjustRaffle(); break;
        case 'disRunRaffle':           disRunRaffle(); break;
        case 'disAddGame':             disAddGame(); break;
        case 'disEditGame':            disEditGame(+d.idx); break;
        case 'disRemoveGame':          disRemoveGame(+d.idx); break;
    }
}

document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-click]');
    if (el) _dispatch(el.dataset.click, el, e);
});
document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (el) _dispatch(el.dataset.change, el, e);
});
document.addEventListener('mousedown', function (e) {
    var el = e.target.closest('[data-mousedown]');
    if (el) _dispatch(el.dataset.mousedown, el, e);
});
document.addEventListener('focus', function (e) {
    var el = e.target.closest('[data-focus]');
    if (el) _dispatch(el.dataset.focus, el, e);
}, true);

// ── Static DOM wiring ─────────────────────────────────────────
// Script is dynamically injected after auth, so DOMContentLoaded has already
// fired — wire immediately since the DOM is guaranteed to be ready.
(function () {
    var hbg = document.getElementById('hbg');
    if (hbg) hbg.addEventListener('click', toggleSidebar);
    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
    var logoutBtn = document.getElementById('sidebar-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { AUTH.logout(); });
    document.querySelectorAll('.nav-item').forEach(function (item) {
        item.addEventListener('click', function () { go(item.dataset.key, item); });
    });
    document.querySelectorAll('.nav-copy-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var url = location.origin + '/?link=' + encodeURIComponent(btn.dataset.link);
            navigator.clipboard.writeText(url)
                .then(function () { toast('Link copied!', 'success'); })
                .catch(function () { toast('Failed to copy', 'error'); });
        });
    });
})();

// ── Quick link — ?link=<section|form-key> ─────────────────────
var _quickLink = (function () {
    try {
        return new URLSearchParams(location.search).get('link') || null;
    } catch (_) { return null; }
})();

var _pendingPage = null;

function _handleQuickLink() {
    if (!_quickLink) return;
    var link = _quickLink;
    _quickLink = null;

    var mfPages = ['form-eventlog', 'form-editeventlog', 'form-transfer', 'form-exemption', 'form-missingap',
                   'settings', 'activity', 'officers', 'honored', 'departments', 'weekly', 'monthly'];
    if (mfPages.indexOf(link) !== -1) {
        _pendingPage = link;
        enterMainframe();
        return;
    }
    if (link === 'mainframe')      { enterMainframe(); return; }
    if (link === 'div-objectives') { enterObjectives(); return; }
    if (link === 'deployment')     { enterDIS(); return; }
    if (link === 'admin')          { enterAdmin(); return; }
}

// ── Load mainframe data ───────────────────────────────────────
function loadMainframe() {
    if (_D) {
        updateNavAccess();
        populateProfileCard();
        var pageKey = _pendingPage || 'settings';
        _pendingPage = null;
        var validKey = PAGES[pageKey] ? pageKey : 'settings';
        go(validKey, document.querySelector('.nav-item[data-key="' + validKey + '"]'));
        return;
    }
    var ls = document.getElementById('loading-status');
    if (ls) ls.textContent = 'Loading mainframe data…';
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    Promise.all([API.getAllData(), API.getGroupMembers()])
        .then(function (results) {
            _D = results[0];
            setMembers(results[1] || []);
            updateNavAccess();
            populateProfileCard();
            var pageKey = _pendingPage || 'settings';
            _pendingPage = null;
            var validKey = PAGES[pageKey] ? pageKey : 'settings';
            go(validKey, document.querySelector('.nav-item[data-key="' + validKey + '"]'));
            var hbg = document.getElementById('hbg'); if (hbg) hbg.style.display = '';
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
        })
        .catch(function (err) {
            if (ls) ls.textContent = 'Error loading data: ' + err.message;
        });
}

// ── Boot ──────────────────────────────────────────────────────
Promise.all([
    AUTH.load(),
    API.checkVersion()
]).then(function (results) {
    var user = results[0];
    document.getElementById('loading').classList.add('hidden');
    if (!user) {
        document.getElementById('login-screen').classList.remove('hidden');
    } else {
        AUTH.loadAdminPerms().then(function () {
            document.getElementById('home-screen').classList.remove('hidden');
            if (_quickLink) {
                renderHomeScreen();
                _handleQuickLink();
            } else {
                renderHomeScreen();
            }
        });
    }
});
