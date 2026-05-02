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
    adminContentNew, adminContentEdit, adminContentDelete, adminContentSave, adminContentCancel,
    adminContentAddQuestion, adminContentRemoveQuestion, adminPGRemoveMember,
    adminEditUserRoles, adminCloseUserPicker, adminShowAddUser, adminHideAddUser,
    adminLoadDiscordGrants, adminAddDiscordGrant, adminRemoveDiscordGrant,
    adminContentRemovePGRole,
    adminCancelNewRole, adminSaveNewRole,
    adminToggleUserRole, adminAddUser, adminRemoveUser,
    adminAddOfficer, adminRemoveOfficer,
    pickAdminOfficerAdd, pickAdminOfficerRm,
    setActFilter,
    cfQMoveUp, cfQMoveDown, cfQTypeChange, cfPGToggle,
    cfQAddOption, cfQRemoveOption,
    cfAddSection, cfRemoveSection, cfSectionFold, cfQFold,
    cfTagAdd, cfTagRemove, cfColorPreview
} from './render.js';
import {
    renderObjectivesSection, objGo, objRefresh
} from './objectives.js';
import { renderProfileSection } from './profile.js';
import { renderDocsSection, docsOpenDoc } from './docs.js';
import {
    renderApplySection, renderApplyMineSection, renderApplyReviewSection,
    applyNavGo, applyOpenForm, applyDecision, applyReviewSelectApp,
    doApplicantLogin, applySectionBack, applyReviewSetStatus, applyFormSubmit
} from './apply.js';
import {
    renderDivisionStatsSection, dsNavGo,
    esSetPeriod, esApplyCustomRange,
    auditLoadMore, dsAuditSearch, dsAuditAction
} from './events-stats.js';
import {
    renderDISSection, disLeave,
    disNavGo, disTriggerSync, disSetGlobalMultiplier,
    disAdvanceWeek, disAdvanceMonth, disResetWeek,
    disRegenerateBoard, disSetTileEventType, disSetTilePoints,
    disUnlockTile, disLockTile, disForceClaim,
    disAdjustPoints, disAdjustRaffle, disRunRaffle,
    disResetUserPoints, disResetUserRaffle,
    disResetAllPoints, disResetAllRaffle,
    disBulkAdjustPoints, disBulkAdjustRaffle,
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
// Cached system version (deploy ID) — populated during boot
var _sysVersion = null;

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
        desc:     'Activity tracker, officer tracker, event logs, department rosters and submission forms.',
        accessFn: function () { return AUTH.isInDivision(); },
        lockMsg:  'Nighthawk Commandos division membership required.'
    },
    {
        id:       'div-objectives',
        tag:      'OBJ',
        tagColor: '#4a7fc8',
        title:    'Division Objectives',
        desc:     'Monthly directives and department-level task assignments.',
        accessFn: function () { return AUTH.canAccessHigherSections(); },
        lockMsg:  'Officer rank required.'
    },
    {
        id:       'deployment',
        tag:      'DIS',
        tagColor: '#7c4ab8',
        title:    'Deployment Incentive System',
        desc:     'Host events to claim tiles on the deployment grid and earn raffle entries.',
        accessFn: function () { return AUTH.canSubmitOfficerForms(); },
        lockMsg:  'Officer rank required.'
    },
    {
        id:       'division-stats',
        disabled: true,
        tag:      'DIV',
        tagColor: '#4a9c72',
        title:    'Division Statistics',
        desc:     'Event statistics, officer leaderboards and the group audit log.',
        accessFn: function () { return AUTH.canAccessEventStats(); },
        lockMsg:  'Senior officer or Event Stats permission required.'
    },
    {
        id:       'docs',
        tag:      'DOC',
        tagColor: '#4a7fc8',
        title:    'Document Hub',
        desc:     'Official division documents — department SOPs, Officer Corps guidelines and reference materials.',
        accessFn: function () { return AUTH.canViewDocs(); },
        lockMsg:  'Division membership or document access required.'
    },
    {
        id:       'apply',
        tag:      'APP',
        tagColor: '#c84a7c',
        title:    'Application Hub',
        desc:     'Apply for department positions, Officer Corps roles or Ghost slots. Track your applications.',
        accessFn: function () { return AUTH.canApply(); },
        lockMsg:  'Log in to view or submit applications.'
    },
    {
        id:       'admin',
        tag:      'ADM',
        tagColor: 'var(--red)',
        title:    'Admin Dashboard',
        desc:     'Role management, DIS moderation, content administration and system audit logs.',
        accessFn: function () { return AUTH.canAdminAny(); },
        lockMsg:  'Admin access required.'
    }
];

// ── Home page render ──────────────────────────────────────────
function renderHomeScreen() {
    var u = AUTH.user;

    var cards = HOME_SECTIONS.filter(function (s) { return !s.disabled; }).map(function (s) {
        var accessible = s.accessFn();
        var color = s.tagColor;
        return '<div class="home-card' + (accessible ? '' : ' home-card-locked') + '"' +
            ' style="--card-color:' + color + '"' +
            (accessible ? ' data-click="enterSection" data-section="' + s.id + '"' : '') + '>' +
            '<div class="home-card-deco" aria-hidden="true">' + esc(s.tag) + '</div>' +
            '<div class="home-card-body">' +
            '<div class="home-card-title">' + esc(s.title) + '</div>' +
            '<div class="home-card-desc">' + esc(s.desc) + '</div>' +
            (accessible ? '' : '<div class="home-card-lock">' + esc(s.lockMsg) + '</div>') +
            (accessible ? '<button class="home-card-copy-btn" data-click="copyQuickLink" data-link="' + s.id + '" title="Copy quick link"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Copy link</button>' : '') +
            '</div>' +
            (accessible ? '<div class="home-card-arrow" style="color:' + color + '">&#8594;</div>' : '') +
            '</div>';
    }).join('');

    var roleLine  = u.divisionRoleName ? esc(u.divisionRoleName) : '';
    var ghostLine = u.ghostRank > 0 && u.ghostRoleName ? 'Ghost · ' + esc(u.ghostRoleName) : '';

    var discordAvatar = u.discordAvatar
        ? 'https://cdn.discordapp.com/avatars/' + u.discordId + '/' + u.discordAvatar + '.png'
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-bg-glow"></div>' +
        '<div class="home-inner">' +
        '<div class="home-header">' +
        '<div class="home-eyebrow">THE NIGHTHAWK IMPERIUM &mdash; NIGHTHAWK COMMANDOS</div>' +
        '<h1 class="home-title">Mainframe</h1>' +
        '<div class="home-divider"></div>' +
        '</div>' +
        '<div class="home-profile" data-click="enterSection" data-section="profile" title="View profile" style="cursor:pointer">' +
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
    else if (section === 'division-stats' || section === 'event-stats') { enterDivisionStats(); }
    else if (section === 'docs')         { enterDocs(); }
    else if (section === 'apply')        { enterApply(); }
    else if (section === 'apply-review') { enterApplyReview(); }
    else if (section === 'apply-mine')   { enterApplyMine(); }
    else if (section === 'profile')      { enterProfile(); }
    else if (section === 'admin')          { enterAdmin(); }
}

function enterDivisionStats() {
    if (!AUTH.canAccessEventStats()) return;
    renderDivisionStatsSection();
}
function enterDocs()        { if (!AUTH.canViewDocs()) return; renderDocsSection(); }
function enterApply()       { if (!AUTH.canApply()) return; renderApplySection(); }
function enterApplyMine()   { if (!AUTH.canApply()) return; renderApplyMineSection(); }
function enterApplyReview() { if (!AUTH.canApply()) return; renderApplyReviewSection(); }
function enterProfile()     { if (!AUTH.isLoggedIn()) return; renderProfileSection(); }

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
    if (appEl && !appEl.classList.contains('hidden')) appEl.classList.add('hidden');
    if (hbg) hbg.style.display = 'none';

    disLeave();

    var hs = document.getElementById('home-screen');
    if (hs) { hs.className = ''; hs.removeAttribute('style'); }

    if (AUTH.isInDivision()) {
        requestAnimationFrame(renderHomeScreen);
    } else {
        requestAnimationFrame(renderPublicScreen);
    }
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
    var verEl  = document.getElementById('sidebar-version');
    if (nameEl) nameEl.textContent = u.robloxUsername || u.discordUsername;
    if (rankEl) rankEl.textContent = u.divisionRoleName || '';
    if (card) card.style.display = 'flex';
    if (verEl && _sysVersion) verEl.textContent = _sysVersion;
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
        case 'doMemberLogin':    doMemberLogin(); break;
        case 'doApplicantLogin': doApplicantLogin(el); break;
        // Activity filter — pass members so setActFilter doesn't need window._D
        case 'setActFilter':    if (_D) setActFilter(d.filter, el, _D.activity.members); break;
        // Objectives
        case 'objGo':           objGo(el); break;
        case 'objRefresh':      objRefresh(); break;
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
        case 'adminToggleUserRole':         adminToggleUserRole(el, d.id); break;
        case 'adminContentNew':             adminContentNew(el); break;
        case 'adminContentEdit':            adminContentEdit(el); break;
        case 'adminContentDelete':          adminContentDelete(el); break;
        case 'adminContentSave':            adminContentSave(); break;
        case 'adminContentCancel':          adminContentCancel(); break;
        case 'adminContentAddQuestion':     adminContentAddQuestion(el); break;
        case 'adminContentRemoveQuestion':  adminContentRemoveQuestion(el); break;
        case 'cfQMoveUp':      cfQMoveUp(el); break;
        case 'cfQMoveDown':    cfQMoveDown(el); break;
        case 'cfPGToggle':     cfPGToggle(el); break;
        case 'cfQAddOption':    cfQAddOption(el); break;
        case 'cfQRemoveOption': cfQRemoveOption(el); break;
        case 'cfAddSection':    cfAddSection(); break;
        case 'cfRemoveSection': cfRemoveSection(el); break;
        case 'cfSectionFold':   cfSectionFold(el); break;
        case 'cfQFold':         cfQFold(el); break;
        case 'cfTagAdd':        cfTagAdd(); break;
        case 'cfTagRemove':     cfTagRemove(el); break;
        case 'docCmd': {
            e.preventDefault();
            var cmd = el.dataset.cmd; var val = el.dataset.val || null;
            if (cmd === 'createLink') {
                val = prompt('URL:');
                if (!val) break;
            }
            document.execCommand(cmd, false, val);
            break;
        }
        case 'docInsertTemplate': {
            var ed = document.getElementById('cf-content');
            if (!ed) break;
            if (ed.innerHTML.replace(/<br\s*\/?>/gi, '').trim() &&
                !confirm('Replace current content with the TNIC template?')) break;
            var variantEl = document.getElementById('doc-template-variant');
            var variant   = variantEl ? variantEl.value : 'standard';

            // ── Variant config ──────────────────────────────────────
            var isGhost = variant === 'ghost';
            var DEPT_MEDALLION = {
                'standard':        '/assets/MedallionLogo_Watermark.png',
                'ghost':           '/assets/GhostMedallion.png',
                'progression':     '/assets/ProgressionMedallion.png',
                'welfare':         '/assets/WelfareMedallion.png',
                'librarium':       '/assets/LibrariumMedallion.png',
                'internal-affairs':'/assets/Internal Affairs.png'
            };
            var DEPT_NAMES = {
                'standard':'Nighthawk Commandos',
                'ghost':'Ghost Division',
                'progression':'Progression Department',
                'welfare':'Welfare Department',
                'librarium':'Librarium Department',
                'internal-affairs':'Internal Affairs'
            };
            var logoImg   = isGhost ? '/assets/GhostWings.png' : '/assets/DocumentLogo_Wings.png';
            var medallion = DEPT_MEDALLION[variant] || DEPT_MEDALLION['standard'];
            var deptName  = DEPT_NAMES[variant] || 'Nighthawk Commandos';

            // Banners: Ghost uses dark purple gradient, all others use the banner assets.
            // Negative margins extend past the editor padding; the .doc-editor-wrap scroll
            // container now sits outside the editor itself so overflow doesn't clip them.
            var _bannerStyle = 'display:block;width:calc(100% + 96px);height:14px;object-fit:fill;';
            var topBanner = isGhost
                ? '<div style="background:linear-gradient(90deg,#2d0a4e,#6b21a8);height:14px;margin:-32px -48px 24px"></div>'
                : '<img src="/assets/PageTopBanner" style="' + _bannerStyle + 'margin:-32px -48px 24px" alt="">';
            var botBanner = isGhost
                ? '<div style="background:linear-gradient(90deg,#6b21a8,#2d0a4e);height:14px;margin:24px -48px -32px"></div>'
                : '<img src="/assets/PageBottomBanner" style="' + _bannerStyle + 'margin:24px -48px -32px" alt="">';

            var _now = new Date();
            var _todayFmt = String(_now.getDate()).padStart(2,'0') + '/' +
                            String(_now.getMonth()+1).padStart(2,'0') + '/' +
                            _now.getFullYear();

            // Division name is always "Nighthawk Commandos"; deptName is the sub-division.
            // For the standard variant they are the same, so only show dept line for others.
            var isStandard = variant === 'standard';

            ed.innerHTML =
                topBanner +
                // ── Full-width wings logo spanning the document ──────────
                '<div style="text-align:center;margin-bottom:6px">' +
                '<img src="' + logoImg + '" style="display:block;width:100%;max-height:72px;object-fit:contain" alt="Wings">' +
                '</div>' +
                // ── Title block: division > department > document name ───
                '<div style="text-align:center;font-family:\'Source Sans Pro\',Arial,sans-serif;line-height:1.5;margin-bottom:16px">' +
                '<div style="font-size:15px;font-weight:700;color:#111;letter-spacing:.04em;text-transform:uppercase">Nighthawk Commandos</div>' +
                (!isStandard ? '<div style="font-size:18px;font-weight:700;color:#4a86e8">' + deptName + '</div>' : '') +
                '<div style="font-size:22px;font-weight:700;color:#073763;font-family:\'Cinzel Decorative\',Georgia,serif">Document Title</div>' +
                '</div>' +
                '<hr style="border:none;border-top:2px solid #0b5394;margin:0 0 14px">' +
                // ── Table of Contents ────────────────────────────────────
                '<div style="font-family:\'Source Sans Pro\',Arial,sans-serif;font-size:12px;margin-bottom:14px">' +
                '<div style="font-weight:700;color:#0b5394;margin-bottom:5px;font-size:11px;letter-spacing:.08em;text-transform:uppercase">Table of Contents</div>' +
                '<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #ccc;padding:2px 0"><span>Introduction</span><span style="color:#666">2</span></div>' +
                '<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #ccc;padding:2px 0"><span>#1 section</span><span style="color:#666">2</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0 2px 18px"><span>#2 sub section</span><span style="color:#666">2</span></div>' +
                '</div>' +
                '<hr style="border:none;border-top:1px solid #ccc;margin:4px 0 18px">' +
                // ── Body content with medallion watermark ────────────────
                '<div style="position:relative;min-height:400px">' +
                '<img src="' + medallion + '" style="position:absolute;top:40px;left:50%;transform:translateX(-50%);width:340px;height:340px;object-fit:contain;opacity:.05;pointer-events:none;user-select:none" alt="">' +
                '<h1>Introduction</h1>' +
                '<p>Write your introduction here.</p>' +
                '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0">' +
                '<h1>#1 section</h1>' +
                '<p></p>' +
                '<h2>#2 sub section</h2>' +
                '<p></p>' +
                '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0">' +
                // ── Signature block ──────────────────────────────────────
                '<p style="text-align:right;font-size:11px;color:#444;margin-top:100px;line-height:1.9">' +
                '(DATE)<br>Signed,<br><br>' +
                '(RANK), ________________________<br>' +
                '(RELEVANT TITLES)<br>[Honorary Mentions]<br><br>' +
                '<span style="font-size:9px;font-family:monospace;color:#1c4587">Last Update ' + _todayFmt + '</span>' +
                '</p></div>' +
                botBanner;
            break;
        }
        case 'adminPGRemoveMember':         adminPGRemoveMember(el); break;
        case 'adminEditUserRoles':          adminEditUserRoles(el); break;
        case 'adminCloseUserPicker':        adminCloseUserPicker(el); break;
        case 'adminShowAddUser':            adminShowAddUser(); break;
        case 'adminHideAddUser':            adminHideAddUser(); break;
        case 'adminLoadDiscordGrants':      adminLoadDiscordGrants(); break;
        case 'adminAddDiscordGrant':        adminAddDiscordGrant(); break;
        case 'adminRemoveDiscordGrant':     adminRemoveDiscordGrant(el); break;
        case 'adminContentRemovePGRole':    adminContentRemovePGRole(el); break;
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
            var url = location.origin + '/share?link=' + encodeURIComponent(d.link);
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
        case 'dsNavGo':                dsNavGo(el); break;
        case 'docsOpenDoc':            docsOpenDoc(el); break;
        case 'applyNavGo':             applyNavGo(el); break;
        case 'applyOpenForm':          applyOpenForm(el); break;
        case 'applyDecision':          applyDecision(el); break;
        case 'applyReviewSelectApp':   applyReviewSelectApp(el); break;
        case 'applySectionBack':       applySectionBack(); break;
        case 'applyReviewSetStatus':   applyReviewSetStatus(el); break;
        case 'esSetPeriod':            esSetPeriod(el); break;
        case 'esApplyCustomRange':     esApplyCustomRange(); break;
        case 'auditLoadMore':          auditLoadMore(); break;
        case 'dsAuditSearch':          dsAuditSearch(el); break;
        case 'dsAuditAction':          dsAuditAction(el); break;
        case 'disAdjustPoints':        disAdjustPoints(); break;
        case 'disAdjustRaffle':        disAdjustRaffle(); break;
        case 'disRunRaffle':           disRunRaffle(); break;
        case 'disResetUserPoints':     disResetUserPoints(d.user); break;
        case 'disResetUserRaffle':     disResetUserRaffle(d.user); break;
        case 'disResetAllPoints':      disResetAllPoints(); break;
        case 'disResetAllRaffle':      disResetAllRaffle(); break;
        case 'disBulkAdjustPoints':    disBulkAdjustPoints(); break;
        case 'disBulkAdjustRaffle':    disBulkAdjustRaffle(); break;
        case 'disAddGame':             disAddGame(); break;
        case 'disEditGame':            disEditGame(+d.idx); break;
        case 'disRemoveGame':          disRemoveGame(+d.idx); break;
        case 'cfQTypeChange':   cfQTypeChange(el); break;
        case 'cfColorPreview':  cfColorPreview(el); break;
        case 'docFmtBlock': {
            document.execCommand('formatBlock', false, '<' + el.value + '>');
            break;
        }
    }
}

document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-click]');
    if (el) _dispatch(el.dataset.click, el, e);
});
// Handle application form submission globally — covers all sections
document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'apply-form') {
        e.preventDefault();
        applyFormSubmit();
    }
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

// ── WYSIWYG backspace: remove block format before merging lines ─
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Backspace') return;
    var editor = document.querySelector('.doc-editor');
    if (!editor) return;
    var active = document.activeElement;
    if (active !== editor && !editor.contains(active)) return;

    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    // Find the nearest block ancestor inside the editor
    var node = range.startContainer;
    var block = null;
    while (node && node !== editor) {
        if (node.nodeType === 1) {
            var tag = node.nodeName.toLowerCase();
            if (tag === 'blockquote' || tag === 'pre') { block = node; break; }
        }
        node = node.parentNode;
    }

    if (block) {
        // Only intercept when cursor is at position 0 of the block's first text
        var blockRange = document.createRange();
        blockRange.selectNodeContents(block);
        blockRange.collapse(true);
        if (range.compareBoundaryPoints(Range.START_TO_START, blockRange) === 0) {
            e.preventDefault();
            document.execCommand('formatBlock', false, '<p>');
        }
        return;
    }

    // HR: if previous sibling of current block is an HR, remove the HR first
    var curBlock = range.startContainer;
    while (curBlock && curBlock.parentNode !== editor) curBlock = curBlock.parentNode;
    if (curBlock && curBlock.previousElementSibling && curBlock.previousElementSibling.nodeName === 'HR') {
        if (range.startOffset === 0) {
            e.preventDefault();
            curBlock.previousElementSibling.remove();
        }
    }
});

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
    if (link === 'division-stats' || link === 'event-stats') { enterDivisionStats(); return; }
    if (link === 'docs')         { enterDocs(); return; }
    if (link === 'apply')        { enterApply(); return; }
    if (link === 'apply-review') { enterApplyReview(); return; }
    if (link === 'apply-mine')   { enterApplyMine(); return; }
    if (link === 'profile')      { enterProfile(); return; }
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

// ── Public landing screen (no auth / applicant mode) ─────────
var _AUTH_ERRORS = {
    rowifi_not_linked: 'Your Discord is not linked to Roblox via RoWifi.',
    rowifi_error:      'Failed to verify your Roblox account. Try again later.',
    not_in_group:      'You are not a Nighthawk Commandos division member.',
    rank_too_low:      'Your rank is too low to access the member mainframe.',
    auth_failed:       'Authentication failed. Please try again.',
    unauthorized:      'Authorisation failed. Division membership is required.'
};

function renderPublicScreen() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;

    var u   = AUTH.user;
    var err = window._BOOT_ERROR;
    window._BOOT_ERROR = null;

    var errorBanner = '';
    if (err) {
        var msg = _AUTH_ERRORS[err] || _AUTH_ERRORS['unauthorized'];
        var hint = err === 'rowifi_not_linked'
            ? ' Visit <a href="https://rowifi.xyz" target="_blank" rel="noopener" class="link-accent">rowifi.xyz</a> to link your accounts.' : '';
        errorBanner = '<div class="pub-error-banner">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
            '<span>' + esc(msg) + (hint ? '<br><span style="opacity:.7;font-size:11px">' + hint + '</span>' : '') + '</span>' +
            '</div>';
    }

    var displayName = u
        ? (u.discordUsername || u.robloxUsername || ('Discord ' + String(u.discordId || '').slice(-4))) : '';
    var greeting = displayName
        ? '<div class="pub-greeting">Logged in as <strong>' + esc(displayName) + '</strong>' +
          (u && u.applicantMode ? ' <span class="pub-applicant-badge">Applicant</span>' : '') +
          ' · <button class="pub-link-btn" data-click="doLogout">Log out</button></div>'
        : '';

    hs.className = '';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-bg-glow"></div>' +
        '<div class="pub-wrap">' +
            errorBanner +
            '<div class="pub-header">' +
                '<div class="pub-eyebrow">THE NIGHTHAWK IMPERIUM — NIGHTHAWK COMMANDOS</div>' +
                '<h1 class="pub-title">Mainframe</h1>' +
                '<div class="pub-subtitle">Documents and applications open to all — division login for full access.</div>' +
                greeting +
            '</div>' +
            '<div class="pub-grid">' +
                '<div class="pub-card" data-click="enterSection" data-section="docs">' +
                    '<div class="pub-card-accent" style="background:#4a7fc8"></div>' +
                    '<div class="pub-card-title">Document Hub</div>' +
                    '<div class="pub-card-desc">Department SOPs, Officer Corps guidelines and official division reference materials.</div>' +
                    '<div class="pub-card-cta">Browse Documents →</div>' +
                '</div>' +
                '<div class="pub-card" data-click="enterSection" data-section="apply">' +
                    '<div class="pub-card-accent" style="background:#c84a7c"></div>' +
                    '<div class="pub-card-title">Application Hub</div>' +
                    '<div class="pub-card-desc">Apply for department positions, Officer Corps roles or Ghost slots. Track submitted applications.</div>' +
                    '<div class="pub-card-cta">View Applications →</div>' +
                '</div>' +
            '</div>' +
            '<div class="pub-member-cta">' +
                '<div class="pub-member-label">Nighthawk Commandos member?</div>' +
                '<button class="pub-member-btn" data-click="doMemberLogin">' +
                    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
                    'Member Login' +
                '</button>' +
                (_sysVersion ? '<div class="pub-version">' + esc(_sysVersion) + '</div>' : '') +
            '</div>' +
        '</div>';
}

function doMemberLogin() {
    var linkParam = new URLSearchParams(location.search).get('link');
    location.href = '/api/auth/discord' + (linkParam ? '?link=' + encodeURIComponent(linkParam) : '');
}

// ── Boot ──────────────────────────────────────────────────────
Promise.all([
    AUTH.load(),
    API.checkVersion()
]).then(function (results) {
    var user = results[0];
    var ver  = results[1];
    if (ver && ver.v) _sysVersion = 'v' + ver.v.slice(0, 8);
    window._sysVersion = _sysVersion;
    document.getElementById('loading').classList.add('hidden');

    if (!user) {
        // Unauthenticated — show public screen immediately
        document.getElementById('home-screen').classList.remove('hidden');
        renderPublicScreen();
        if (_quickLink) _handleQuickLink();
    } else if (!AUTH.isInDivision()) {
        // Logged in but not a division member — check for bypassMember perm before
        // deciding whether to show the full home screen or the public screen.
        AUTH.loadAdminPerms().then(function () {
            document.getElementById('home-screen').classList.remove('hidden');
            if (AUTH.canBypassMemberCheck()) {
                if (_quickLink) { renderHomeScreen(); _handleQuickLink(); }
                else { renderHomeScreen(); }
            } else {
                renderPublicScreen();
                if (_quickLink) _handleQuickLink();
            }
        });
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
