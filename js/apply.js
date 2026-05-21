// ═══════════════════════════════════════════════════════════════
//  apply.js — Application Hub + My Applications + Review panel
//  Application hub: visible to anyone with any valid session.
//  Review: requires being in the app's reviewer group or contentAdmin.
// ═══════════════════════════════════════════════════════════════

import { esc, toast } from './utils.js';
import { AUTH } from './auth.js';

var _APPLY = { tab: 'hub', apps: [], mine: [], review: { appId: null, entries: [], status: 'pending' } };

// ── Entry points ──────────────────────────────────────────────
export function renderApplySection() {
    _APPLY.tab = 'hub';
    _renderShell();
    _loadApps();
}

export function renderApplyMineSection() {
    _APPLY.tab = 'mine';
    _renderShell();
    _loadMine();
}

export function renderApplyReviewSection() {
    _APPLY.tab = 'review';
    _renderShell();
    // Show app selector for review
    var main = document.getElementById('apply-main');
    if (main) main.innerHTML = _applyReviewAppSelector();
    _loadAppsForReview();
}

function _renderShell() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    var u         = AUTH.user || null;
    var loggedIn  = !!u;
    var isMember  = u && u.divisionRank > 0;
    var ver       = window._sysVersion || '';
    hs.className  = 'obj-mode';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" data-accent="pink">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
        '    <div class="obj-sidebar-title">Application<br>Hub</div>' +
        '  </div>' +
        '  <nav class="es-sidebar-nav">' +
        '    <div class="es-sidebar-nav-label">Navigation</div>' +
        _tab('hub',  'Open Applications', _APPLY.tab === 'hub') +
        (loggedIn ? _tab('mine', 'My Applications', _APPLY.tab === 'mine') : '') +
        (isMember  ? _tab('review', 'Review Panel',  _APPLY.tab === 'review') : '') +
        '  </nav>' +
        (!loggedIn
            ? '  <div class="apply-pub-login">' +
              '    <div class="apply-pub-login-hint">To submit applications or track status, authenticate with Discord.</div>' +
              '    <button class="pub-member-btn" data-click="doApplicantLogin" style="width:100%">' +
              '      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="flex-shrink:0"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>' +
              '      Log in with Discord' +
              '    </button>' +
              '  </div>'
            : '') +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">← Back to Hub</button>' +
        (ver ? '<div class="sidebar-version">' + ver + '</div>' : '') +
        '  </div>' +
        '</aside>' +
        '<main class="obj-main" id="apply-main"><div class="obj-loading">Loading…</div></main>';
}

function _tab(tab, label, active) {
    return '<button class="es-nav-btn' + (active ? ' active' : '') + '" data-click="applyNavGo" data-tab="' + tab + '">' + label + '</button>';
}

// Redirects unauthenticated public users through the applicant Discord OAuth flow.
// After OAuth the server issues an applicantMode session and redirects back here.
export function doApplicantLogin(el) {
    var appId = el && el.dataset ? el.dataset.appid : '';
    location.href = '/api/auth/apply' + (appId ? '?link=apply' : '');
}

// ── Tab navigation ────────────────────────────────────────────
export function applyNavGo(el) {
    var tab = el && el.dataset ? el.dataset.tab : el;
    _APPLY.tab = tab;
    document.querySelectorAll('.es-nav-btn[data-tab]').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    var main = document.getElementById('apply-main');
    if (!main) return;
    main.innerHTML = '<div class="obj-loading">Loading…</div>';
    if (tab === 'hub')    _loadApps();
    if (tab === 'mine')   _loadMine();
    if (tab === 'review') { main.innerHTML = _applyReviewAppSelector(); _loadAppsForReview(); }
}

// ── Hub: list open applications ───────────────────────────────
function _loadApps() {
    fetch('/api/apply/list')
        .then(function (r) { return r.json(); })
        .then(function (apps) {
            _APPLY.apps = apps;
            _renderHub(apps);
        })
        .catch(function (err) {
            var m = document.getElementById('apply-main');
            if (m) m.innerHTML = '<div class="obj-error">Failed to load: ' + esc(err.message) + '</div>';
        });
}

function _renderHub(apps) {
    var main     = document.getElementById('apply-main');
    if (!main) return;
    var loggedIn = !!AUTH.user;
    if (!Array.isArray(apps) || !apps.length) {
        main.innerHTML = '<div class="obj-empty" style="margin-top:40px">No applications are currently open.</div>';
        return;
    }
    var discordSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="margin-right:6px;vertical-align:middle"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>';
    main.innerHTML = '<div class="apply-hub-list">' + apps.map(function (app) {
        var colorHex = app.webhookColor ? '#' + app.webhookColor.toString(16).padStart(6, '0') : '#00c2e9';
        var tags = Array.isArray(app.tags) && app.tags.length
            ? '<div class="apply-app-tags">' +
              app.tags.map(function (t) { return '<span class="apply-app-tag">' + esc(t) + '</span>'; }).join('') +
              '</div>' : '';
        var btn = loggedIn
            ? '<button class="btn-dis-primary" style="margin-top:12px" data-click="applyOpenForm" data-id="' + esc(app.id) + '">Apply Now</button>'
            : '<button class="btn-dis-primary" style="margin-top:12px" data-click="doApplicantLogin" data-appid="' + esc(app.id) + '">' +
              discordSvg + 'Log in to Apply</button>';
        return '<div class="apply-app-card" style="border-left-color:' + colorHex + '">' +
            '<div class="apply-app-card-top">' +
            '<span class="apply-app-color-dot" style="background:' + colorHex + '"></span>' +
            '<div class="apply-app-name">' + esc(app.name) + '</div>' +
            '</div>' +
            tags +
            (app.description ? '<div class="apply-app-desc">' + esc(app.description) + '</div>' : '') +
            btn +
            '</div>';
    }).join('') + '</div>';
}

// ── Application form (sections) ───────────────────────────────
var _activeForm = { app: null, sections: [], sectionIdx: 0, history: [], answers: {} };

export function applyOpenForm(el) {
    var id  = el && el.dataset ? el.dataset.id : el;
    var app = _APPLY.apps.find(function (a) { return a.id === id; });
    var main = document.getElementById('apply-main');
    if (!main) return;
    if (!app) {
        main.innerHTML = '<div class="obj-error">Application not found. Please refresh and try again.</div>';
        return;
    }

    // Normalise sections — handle both new sections[] and legacy flat questions[]
    var sections = Array.isArray(app.sections) && app.sections.length
        ? app.sections
        : [{ id: 's0', title: '', description: '', nextSection: 'submit',
             questions: Array.isArray(app.questions) ? app.questions : [] }];

    // Ensure every section has nextSection set.
    // Non-last sections that still have 'submit' (the new-section default) are redirected
    // to the next section's id, since the admin likely just forgot to change the dropdown.
    sections = sections.map(function (sec, i) {
        var isLast = i >= sections.length - 1;
        var next = sec.nextSection;
        if (!isLast && (!next || next === 'submit')) {
            next = sections[i + 1].id || ('s' + (i + 1));
        }
        return Object.assign({}, sec, { nextSection: next || 'submit' });
    });

    _activeForm = { app: app, sections: sections, sectionIdx: 0, history: [], answers: {} };
    _renderSection(main);
}

function _sectionBtnText(sec, f) {
    var defaultNext = sec.nextSection || 'submit';
    var hasRouting  = (sec.questions || []).some(function (q) {
        return q.optionGoTos && Object.keys(q.optionGoTos).length > 0;
    });
    if (defaultNext === 'submit' && !hasRouting) return 'Submit Application';
    if (!hasRouting) {
        var nextSec = f.sections.find(function (s) { return s.id === defaultNext; });
        if (nextSec) return 'Continue to ' + (nextSec.title || ('Section ' + (f.sections.indexOf(nextSec) + 1))) + ' →';
    }
    // Has routing — destination depends on answer, show generic label
    return f.sectionIdx < f.sections.length - 1 ? 'Next →' : 'Submit Application';
}

function _renderSection(main) {
    var f = _activeForm;
    var sec = f.sections[f.sectionIdx];
    if (!sec) return;

    var total = f.sections.length;
    var progress = total > 1
        ? '<div class="apply-section-progress">' +
          '<div class="apply-section-bar"><div class="apply-section-fill" style="width:' +
          Math.round(((f.sectionIdx + 1) / total) * 100) + '%"></div></div>' +
          '<span>Section ' + (f.sectionIdx + 1) + ' of ' + total + (sec.title ? ' — ' + esc(sec.title) : '') + '</span>' +
          '</div>'
        : '';

    var questions = _renderSectionQuestions(sec, f.answers);

    main.innerHTML =
        '<div class="apply-form-header">' +
        '<button class="admin-role-btn" data-click="applyNavGo" data-tab="hub">← Back</button>' +
        '<div class="apply-form-title">' + esc(f.app.name) + '</div>' +
        '</div>' +
        (f.app.description && f.sectionIdx === 0 ? '<p class="apply-form-desc">' + esc(f.app.description) + '</p>' : '') +
        progress +
        (sec.description ? '<p class="apply-qdesc" style="margin-bottom:14px">' + esc(sec.description) + '</p>' : '') +
        '<form id="apply-form">' + questions +
        '<div id="apply-form-err" class="field-error hidden"></div>' +
        '<div class="apply-section-nav">' +
        (f.history.length > 0 ? '<button type="button" class="admin-role-btn" data-click="applySectionBack">← Back</button>' : '<span></span>') +
        '<button type="button" class="btn-dis-primary" id="apply-submit-btn" data-click="applyFormSubmit">' + _sectionBtnText(sec, f) + '</button>' +
        '</div></form>';

    // Store current form state on the main element so the global submit handler can find it
    main._applyState = { f: f, sec: sec };

    // For sections with MCQ routing, update the button text live as options change
    var routingQs = (sec.questions || []).filter(function (q) {
        return q.optionGoTos && Object.keys(q.optionGoTos).length > 0;
    });
    if (routingQs.length > 0) {
        function updateBtnText() {
            var btn = document.getElementById('apply-submit-btn');
            if (!btn) return;
            // Read current answers from DOM
            var draftAnswers = {};
            (sec.questions || []).forEach(function (q) {
                if (q.type === 'radio') {
                    var chk = document.querySelector('input[name="aq-' + q.id + '"]:checked');
                    if (chk) draftAnswers[q.id] = chk.value;
                } else if (q.type === 'select') {
                    var sel = document.getElementById('aq-' + q.id);
                    if (sel && sel.value) draftAnswers[q.id] = sel.value;
                }
            });
            var nextId = _resolveNextSection(sec, Object.assign({}, f.answers, draftAnswers));
            var text;
            if (nextId === 'submit') {
                text = 'Submit Application';
            } else {
                var nextSec = f.sections.find(function (s) { return s.id === nextId; });
                var label = nextSec ? (nextSec.title || ('Section ' + (f.sections.indexOf(nextSec) + 1))) : 'Next Section';
                text = 'Continue to ' + label + ' →';
            }
            btn.textContent = text;
        }
        // Attach change listeners to routing questions
        routingQs.forEach(function (q) {
            if (q.type === 'radio') {
                document.querySelectorAll('input[name="aq-' + q.id + '"]').forEach(function (inp) {
                    inp.addEventListener('change', updateBtnText);
                });
            } else if (q.type === 'select') {
                var sel = document.getElementById('aq-' + q.id);
                if (sel) sel.addEventListener('change', updateBtnText);
            }
        });
        // Trigger immediately to set correct initial state if answers were restored
        updateBtnText();
    }
}

// Called from global submit event delegation in app.js
export function applyFormSubmit() {
    var main = document.getElementById('apply-main');
    if (!main || !main._applyState) return;
    var state = main._applyState;
    _sectionNext(state.f, state.sec, main);
}

// Renders the questions for a single section into HTML, restoring prior answers
function _renderSectionQuestions(sec, savedAnswers) {
    return (sec.questions || []).map(function (q) {
        var req  = q.required ? '<span class="apply-req">*</span>' : '';
        var ph   = esc(q.placeholder || 'Your answer…');
        var desc = q.description ? '<div class="apply-qdesc">' + esc(q.description) + '</div>' : '';
        var opts = Array.isArray(q.options) ? q.options : [];
        var saved = savedAnswers[q.id] || '';
        var input;

        if (q.type === 'textarea') {
            input = '<textarea class="apply-input" rows="4" id="aq-' + esc(q.id) + '" placeholder="' + ph + '"' +
                (q.required ? ' required' : '') + '>' + esc(saved) + '</textarea>';
        } else if (q.type === 'select') {
            input = '<select class="apply-input" id="aq-' + esc(q.id) + '"' + (q.required ? ' required' : '') + '>' +
                '<option value="">' + ph + '</option>' +
                opts.map(function (o) {
                    return '<option value="' + esc(o) + '"' + (saved === o ? ' selected' : '') + '>' + esc(o) + '</option>';
                }).join('') + '</select>';
        } else if (q.type === 'radio') {
            input = '<div class="apply-options" id="aq-' + esc(q.id) + '">' +
                opts.map(function (o) {
                    return '<label class="apply-option-label"><input type="radio" name="aq-' + esc(q.id) + '" value="' + esc(o) + '"' +
                        (saved === o ? ' checked' : '') + (q.required ? ' required' : '') + '> ' + esc(o) + '</label>';
                }).join('') + '</div>';
        } else if (q.type === 'checkbox') {
            var savedArr = saved ? saved.split(', ') : [];
            input = '<div class="apply-options" id="aq-' + esc(q.id) + '">' +
                opts.map(function (o) {
                    return '<label class="apply-option-label"><input type="checkbox" class="aq-cb-' + esc(q.id) + '" value="' + esc(o) + '"' +
                        (savedArr.indexOf(o) > -1 ? ' checked' : '') + '> ' + esc(o) + '</label>';
                }).join('') + '</div>';
        } else {
            input = '<input class="apply-input" type="text" id="aq-' + esc(q.id) + '" placeholder="' + ph + '"' +
                ' value="' + esc(saved) + '"' + (q.required ? ' required' : '') + '>';
        }

        var val = q.validation || {};
        var valAttrs = '';
        if (val.minLen > 0) valAttrs += ' data-minlen="' + val.minLen + '"';
        if (val.maxLen > 0) valAttrs += ' data-maxlen="' + val.maxLen + '"';
        if (val.pattern)    valAttrs += ' data-pattern="' + esc(val.pattern) + '"';
        if (val.errMsg)     valAttrs += ' data-errmsg="' + esc(val.errMsg) + '"';

        return '<div class="apply-question"' + valAttrs + ' data-qid="' + esc(q.id) + '" data-qtype="' + esc(q.type) + '">' +
            '<label class="apply-qlabel">' + esc(q.label) + req + '</label>' +
            desc + input + '<div class="apply-q-err hidden"></div>' +
            '</div>';
    }).join('');
}

// Collects answers from the current section DOM and validates them
function _collectSectionAnswers(sec) {
    var answers = {};
    var errors  = [];
    (sec.questions || []).forEach(function (q) {
        var qEl  = document.querySelector('.apply-question[data-qid="' + q.id + '"]');
        var qErr = qEl ? qEl.querySelector('.apply-q-err') : null;
        if (qErr) { qErr.textContent = ''; qErr.classList.add('hidden'); }
        var val = '';

        if (q.type === 'radio') {
            var chk = document.querySelector('input[name="aq-' + q.id + '"]:checked');
            val = chk ? chk.value : '';
        } else if (q.type === 'checkbox') {
            var cbs = document.querySelectorAll('.aq-cb-' + q.id + ':checked');
            val = Array.from(cbs).map(function (cb) { return cb.value; }).join(', ');
        } else {
            var el = document.getElementById('aq-' + q.id);
            val = el ? el.value.trim() : '';
        }
        answers[q.id] = val;

        // Validation
        var minLen   = parseInt((qEl && qEl.dataset.minlen)  || '0', 10) || 0;
        var maxLen   = parseInt((qEl && qEl.dataset.maxlen)  || '0', 10) || 0;
        var pattern  = (qEl && qEl.dataset.pattern) || '';
        var errMsg   = (qEl && qEl.dataset.errmsg)  || 'Invalid response.';
        var fieldErr = '';
        if (q.required && !val) fieldErr = 'This field is required.';
        else if (minLen > 0 && val.length < minLen) fieldErr = errMsg || 'Minimum ' + minLen + ' characters.';
        else if (maxLen > 0 && val.length > maxLen) fieldErr = errMsg || 'Maximum ' + maxLen + ' characters.';
        else if (pattern && val) { try { if (!new RegExp(pattern).test(val)) fieldErr = errMsg || 'Invalid format.'; } catch (_) {} }
        if (fieldErr) { if (qErr) { qErr.textContent = fieldErr; qErr.classList.remove('hidden'); } errors.push(q.id); }
    });
    return { answers: answers, errors: errors };
}

// Determines the next section ID based on answers and routing rules
function _resolveNextSection(sec, answers) {
    // Check if any question in this section has routing rules
    var questions = sec.questions || [];
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        if (!q.optionGoTos || !Object.keys(q.optionGoTos).length) continue;
        var picked = answers[q.id] || '';
        if (q.optionGoTos[picked]) return q.optionGoTos[picked];
    }
    return sec.nextSection || 'submit';
}

function _sectionNext(f, sec, main) {
    var result = _collectSectionAnswers(sec);
    if (result.errors.length) {
        var first = document.querySelector('.apply-q-err:not(.hidden)');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    // Merge answers
    Object.assign(f.answers, result.answers);

    var nextId = _resolveNextSection(sec, f.answers);

    if (nextId === 'submit') {
        _submitForm(f.app, f.answers, main);
        return;
    }

    // Find next section index by id
    var nextIdx = f.sections.findIndex(function (s) { return s.id === nextId; });
    if (nextIdx === -1) nextIdx = f.sectionIdx + 1;
    if (nextIdx >= f.sections.length) {
        _submitForm(f.app, f.answers, main);
        return;
    }

    f.history.push(f.sectionIdx);
    f.sectionIdx = nextIdx;
    _renderSection(main);
}

export function applySectionBack() {
    var f    = _activeForm;
    var main = document.getElementById('apply-main');
    if (!f || !main || !f.history.length) return;
    f.sectionIdx = f.history.pop();
    _renderSection(main);
}

// Called when the last section is submitted — sends all accumulated answers
function _submitForm(app, answers, mainEl) {
    var btn   = document.getElementById('apply-submit-btn');
    var errEl = document.getElementById('apply-form-err');
    if (btn) btn.disabled = true;

    fetch('/api/apply/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id, answers: answers || {} })
    })
        .then(function (r) {
            var ct = r.headers.get('content-type') || '';
            if (!ct.includes('json')) throw new Error('Server error (' + r.status + '). Please try again.');
            return r.json();
        })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            var m = mainEl || document.getElementById('apply-main');
            if (m) m.innerHTML =
                '<div class="apply-success">' +
                '<div class="apply-success-title">Application Submitted!</div>' +
                '<div class="apply-success-sub">Your application for <strong>' + esc(app.name) + '</strong> has been submitted. You can track its status in "My Applications".</div>' +
                '<button class="btn-dis-primary" style="margin-top:18px" data-click="applyNavGo" data-tab="mine">View My Applications</button>' +
                '</div>';
        })
        .catch(function (err) {
            if (btn) btn.disabled = false;
            if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
        });
}

// ── Mine: my submissions ──────────────────────────────────────
function _loadMine() {
    fetch('/api/apply/mine', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (subs) {
            _APPLY.mine = subs;
            _renderMine(subs);
        })
        .catch(function (err) {
            var m = document.getElementById('apply-main');
            if (m) m.innerHTML = '<div class="obj-error">Failed to load: ' + esc(err.message) + '</div>';
        });
}

function _renderMine(subs) {
    var main = document.getElementById('apply-main');
    if (!main) return;
    if (!subs.length) {
        main.innerHTML = '<div class="obj-empty" style="margin-top:40px">You have not submitted any applications yet.</div>';
        return;
    }
    main.innerHTML = '<div class="apply-mine-list">' + subs.map(function (s) {
        var statusColor = s.status === 'accepted' ? '#4a9c72' : s.status === 'denied' ? '#e05252' : '#c8a44a';
        var statusLabel = s.status.charAt(0).toUpperCase() + s.status.slice(1);
        var date = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB') : '';
        return '<div class="apply-mine-card">' +
            '<div class="apply-mine-header">' +
            '  <span class="apply-mine-name">' + esc(s.appName) + '</span>' +
            '  <span class="apply-status-badge" style="background:' + statusColor + '20;color:' + statusColor + ';border-color:' + statusColor + '40">' + statusLabel + '</span>' +
            '</div>' +
            (date ? '<div class="apply-mine-date">Submitted ' + esc(date) + '</div>' : '') +
            (s.reviewNotes ? '<div class="apply-mine-notes"><strong>Review notes:</strong> ' + esc(s.reviewNotes) + '</div>' : '') +
            (s.reviewedBy ? '<div class="apply-mine-reviewer">Reviewed by ' + esc(s.reviewedBy) + '</div>' : '') +
            '</div>';
    }).join('') + '</div>';
}

// ── Review panel ──────────────────────────────────────────────
var _reviewApps = [];

function _applyReviewAppSelector() {
    return '<div id="apply-review-app-sel"><div class="obj-loading">Loading…</div></div>' +
        '<div id="apply-review-content"></div>';
}

var _reviewStatus = 'pending'; // current status filter

function _loadAppsForReview() {
    fetch('/api/admin/apps', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (apps) {
            _reviewApps = Array.isArray(apps) ? apps : [];
            var sel = document.getElementById('apply-review-app-sel');
            if (!sel) return;
            if (!_reviewApps.length) { sel.innerHTML = '<div class="obj-empty">No applications defined.</div>'; return; }
            sel.innerHTML =
                '<div class="apply-review-tabs">' +
                _reviewApps.map(function (a) {
                    return '<button class="es-nav-btn" data-click="applyReviewSelectApp" data-id="' + esc(a.id) + '">' + esc(a.name) + '</button>';
                }).join('') + '</div>' +
                '<div class="apply-review-status-row">' +
                ['pending','accepted','denied'].map(function (s) {
                    return '<button class="es-nav-btn apply-status-filter' + (_reviewStatus === s ? ' active' : '') + '" data-click="applyReviewSetStatus" data-status="' + s + '">' +
                        s.charAt(0).toUpperCase() + s.slice(1) + '</button>';
                }).join('') + '</div>';
            // Auto-select first
            applyReviewSelectApp({ dataset: { id: _reviewApps[0].id } });
        })
        .catch(function () {
            var sel = document.getElementById('apply-review-app-sel');
            if (sel) sel.innerHTML = '<div class="obj-error">Could not load applications. Requires contentAdmin or reviewer permission.</div>';
        });
}

export function applyReviewSelectApp(el) {
    var id = el && el.dataset ? el.dataset.id : el;
    document.querySelectorAll('.apply-review-tabs .es-nav-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.id === id);
    });
    _loadReviewEntries(id);
}

export function applyReviewSetStatus(el) {
    _reviewStatus = el && el.dataset ? el.dataset.status : 'pending';
    document.querySelectorAll('.apply-status-filter').forEach(function (b) {
        b.classList.toggle('active', b.dataset.status === _reviewStatus);
    });
    _loadReviewEntries(_APPLY.review.appId);
}

function _loadReviewEntries(appId) {
    if (!appId) return;
    _APPLY.review.appId = appId;
    var content = document.getElementById('apply-review-content');
    if (content) content.innerHTML = '<div class="obj-loading">Loading submissions…</div>';

    fetch('/api/admin/app-review?appId=' + encodeURIComponent(appId) + '&status=' + encodeURIComponent(_reviewStatus), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (subs) {
            _APPLY.review.entries = Array.isArray(subs) ? subs : [];
            _renderReviewList();
        })
        .catch(function (err) {
            var content = document.getElementById('apply-review-content');
            if (content) content.innerHTML = '<div class="obj-error">Failed: ' + esc(err.message) + '</div>';
        });
}

function _renderReviewList() {
    var content = document.getElementById('apply-review-content');
    if (!content) return;
    var subs = _APPLY.review.entries;
    if (!subs.length) {
        var emptyMsg = 'No ' + _reviewStatus + ' submissions for this application.';
        content.innerHTML = '<div class="obj-empty" style="margin-top:16px">' + esc(emptyMsg) + '</div>';
        return;
    }
    content.innerHTML = subs.map(function (s) {
        var app = _reviewApps.find(function (a) { return a.id === s.appId; });
        // Flatten questions from sections (new format) or fall back to legacy questions
        var questions = app
            ? (Array.isArray(app.sections)
                ? app.sections.reduce(function (acc, sec) { return acc.concat(sec.questions || []); }, [])
                : (app.questions || []))
            : [];
        var date = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB') : '';
        var sid  = esc(s.id || s.submissionId || '');
        // Rank: show name only, no numbers
        var rankDisplay  = s.divisionRoleName || '—';
        var ghostDisplay = s.ghostRank > 0 && s.ghostRoleName ? s.ghostRoleName : null;
        var tniDisplay   = s.group1174414RoleName || (s.group1174414Rank > 0 ? null : 'Not in group');
        return '<div class="apply-review-card" id="rev-' + sid + '">' +
            '<div class="apply-review-header">' +
            '<span class="apply-review-name">' + esc(s.robloxUsername) + '</span>' +
            '<span class="apply-review-date">' + esc(date) + '</span>' +
            '</div>' +
            '<div class="apply-review-info-grid">' +
            _rInfo('Roblox', s.robloxUsername) +
            _rInfo('Discord', s.discordUsername ? '@' + s.discordUsername : '—') +
            _rInfo('Division Rank', rankDisplay) +
            (ghostDisplay ? _rInfo('Ghost Rank', ghostDisplay) : '') +
            (tniDisplay ? _rInfo('TNI Rank', tniDisplay) : '') +
            '</div>' +
            '<div class="apply-review-answers">' +
            (questions.length
                ? questions.map(function (q) {
                    var ans = (s.answers || {})[q.id];
                    return '<div class="apply-review-qa">' +
                        '<div class="apply-review-qlabel">' + esc(q.label) + '</div>' +
                        '<div class="apply-review-answer">' + esc(ans !== undefined && ans !== '' ? ans : '—') + '</div>' +
                        '</div>';
                }).join('')
                : '<div class="apply-review-qa"><div class="apply-review-answer" style="color:var(--muted)">No questions found in application definition.</div></div>') +
            '</div>' +
            '<div class="apply-review-actions">' +
            '<button class="btn-dis-primary" data-click="applyDecision" data-id="' + sid + '" data-action="accept">Accept</button>' +
            '<div class="apply-review-deny-row">' +
            '<input class="apply-input" id="deny-reason-' + sid + '" placeholder="Reason for denial (required)">' +
            '<button class="btn-dis-danger" data-click="applyDecision" data-id="' + sid + '" data-action="deny">Deny</button>' +
            '</div>' +
            '<div id="rev-err-' + sid + '" class="field-error hidden"></div>' +
            '</div>' +
            '</div>';
    }).join('');
}

function _rInfo(label, value) {
    return '<div class="apply-review-info-item"><span class="apply-review-info-label">' + esc(label) + '</span><span class="apply-review-info-value">' + esc(String(value || '—')) + '</span></div>';
}

export function applyDecision(el) {
    var id     = el && el.dataset ? el.dataset.id : null;
    var action = el && el.dataset ? el.dataset.action : null;
    if (!id || !action) return;

    var notes = '';
    if (action === 'deny') {
        var notesEl = document.getElementById('deny-reason-' + id);
        notes = notesEl ? notesEl.value.trim() : '';
        if (!notes) { toast('A reason is required when denying', 'error'); return; }
    }

    var errEl = document.getElementById('rev-err-' + id);
    var btns = document.querySelectorAll('[data-id="' + id + '"]');
    btns.forEach(function (b) { b.disabled = true; });

    fetch('/api/admin/app-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ submissionId: id, action: action, notes: notes })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            var card = document.getElementById('rev-' + id);
            if (card) {
                var color = action === 'accept' ? '#4a9c72' : '#e05252';
                var label = action === 'accept' ? 'Accepted' : 'Denied';
                card.style.opacity = '0.5';
                card.style.borderLeftColor = color;
                var actionsEl = card.querySelector('.apply-review-actions');
                if (actionsEl) actionsEl.innerHTML = '<span style="color:' + color + ';font-weight:600">' + label + '</span>';
            }
            toast((action === 'accept' ? 'Application accepted' : 'Application denied'), 'success');
        })
        .catch(function (err) {
            btns.forEach(function (b) { b.disabled = false; });
            if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
        });
}
