// ═══════════════════════════════════════════════════════════════
//  render.js — read-only page renderers + shared DOM helpers
// ═══════════════════════════════════════════════════════════════

import { AUTH } from './auth.js';
import { API  } from './api.js';
import { adminRenderDisTab } from './dis.js';
import {
    RANK_CLASSES, DEPT_CLASSES, DEPT_COLOURS, MEDAL_CLASSES,
    $, gv, sv, setHTML,
    esc, ea, fmt2, fmtPct, setToday, debounce,
    toast, btnBusy, btnDone, cooldown,
    pageHeader, statCard, kvRow, flagBadge, statusBadge,
    rankPill, deptPill, deptPills, filterBtn, noResults, evTypeOpts,
    fld, fHead, honeypot, setFieldErr, clrFieldErr, clrAll
} from './utils.js';

// Re-export utils so callers can get them from render.js (backwards compat)
export {
    RANK_CLASSES, DEPT_CLASSES, DEPT_COLOURS, MEDAL_CLASSES,
    $, gv, sv, setHTML,
    esc, ea, fmt2, fmtPct, setToday, debounce,
    toast, btnBusy, btnDone, cooldown,
    pageHeader, statCard, kvRow, flagBadge, statusBadge,
    rankPill, deptPill, deptPills, filterBtn, noResults, evTypeOpts,
    fld, fHead, honeypot, setFieldErr, clrFieldErr, clrAll
};

// ── Settings ──────────────────────────────────────────────────
export function renderSettings(D) {
    var s = D.settings;
    var h = pageHeader('Settings', s.quotaWeek ? 'Quota Week of ' + s.quotaWeek : '');
    h += '<div class="stats">';
    h += statCard(s.stats.totalHosted||0,'Total Events Hosted');
    h += statCard(s.stats.allTimeRD||0,'All-Time R/D Events');
    h += statCard(s.stats.allTimeWins||0,'All-Time R/D Wins');
    h += statCard(fmtPct(s.stats.winRate),'R/D Win Rate');
    h += statCard(s.weekNumber||'—','Week #');
    h += statCard('Q'+(s.quarter||'?'),'Quarter');
    h += '</div><div class="settings-grid">';

    h += '<div class="info-block"><h3>Exemptions</h3>';
    h += kvRow('Global Exemption',flagBadge(s.globalExemption));
    h += kvRow('Member Exemption',flagBadge(s.memberExemption));
    h += kvRow('Officer Exemption',flagBadge(s.officerExemption));
    h += '</div>';

    h += '<div class="info-block"><h3>Performance</h3>';
    h += kvRow('Top Host', s.stats.topHost||'—');
    h += kvRow('Peak Performance', s.stats.peakPerf||'—');
    h += kvRow('All-Time Win Rate', fmtPct(s.stats.winRate));
    h += '</div>';

    if (s.contacts && s.contacts.length) {
        h += '<div class="info-block"><h3>Admin Contacts</h3>';
        s.contacts.forEach(function(c){ if(c) h += kvRow(c,''); });
        h += '</div>';
    }
    if (s.ranks && s.ranks.length) {
        h += '<div class="info-block"><h3>Member Quotas</h3>';
        s.ranks.forEach(function(r){ if(!r.name)return; h+=kvRow(rankPill(r.name),r.quota+' AP'); });
        h += '</div>';
    }
    if (s.officerRanks && s.officerRanks.length) {
        h += '<div class="info-block"><h3>Officer Quotas</h3>';
        s.officerRanks.forEach(function(r){ if(!r.name)return; h+=kvRow(rankPill(r.name),r.quota+' OP'); });
        h += '</div>';
    }
    if (s.deptQuotas && s.deptQuotas.length) {
        h += '<div class="info-block"><h3>Department Quotas</h3>';
        s.deptQuotas.forEach(function(d){ if(!d.name)return; h+=kvRow(deptPill(d.name),d.quota); });
        h += '</div>';
    }
    if (s.eventTypes && s.eventTypes.length) {
        h += '<div class="info-block full-width"><h3>Event Types</h3>';
        h += '<div class="tbl-wrap"><table><thead><tr><th>Event</th><th>AP</th><th>OP</th><th>Times Hosted</th></tr></thead><tbody>';
        s.eventTypes.forEach(function(e){
            h += '<tr><td>'+esc(e.name)+'</td><td class="mono">'+esc(String(e.ap))+'</td><td class="mono">'+esc(String(e.op))+'</td><td class="mono">'+esc(String(e.qty))+'</td></tr>';
        });
        h += '</tbody></table></div></div>';
    }
    h += '</div>';
    return h;
}

// ── Activity Tracker ──────────────────────────────────────────
var actFilter = 'all';

export function setContent(id, html) { setHTML(id, html); }

export function renderActivity(D) {
    var a = D.activity, total = a.members.length;
    var complete   = a.members.filter(function(m){return m.status==='Complete';}).length;
    var constant   = a.members.filter(function(m){return m.status==='Constant';}).length;
    var exempt     = a.members.filter(function(m){return m.status==='Exempt';}).length;
    var incomplete = total - complete - constant - exempt;

    var h = pageHeader(a.title||'Activity Tracker', a.subtitle||'');
    h += '<div class="stats">' +
        statCard(total,'Total Members') + statCard(constant,'Constant') +
        statCard(complete,'Complete') + statCard(exempt,'Exempt') + statCard(incomplete,'Incomplete') + '</div>';
    h += '<div class="toolbar">';
    h += '<input class="search" id="act-search" placeholder="Search username, rank, dept…">';
    h += filterBtn('f-all','all','All',true);
    h += filterBtn('f-const','Constant','Constant');
    h += filterBtn('f-comp','Complete','Complete');
    h += filterBtn('f-inc','Incomplete','Incomplete');
    h += filterBtn('f-exempt','Exempt','Exempt');
    h += '<span class="count-label" id="act-count">'+total+' members</span>';
    h += '</div>';
    h += '<div class="tbl-wrap"><table><thead><tr>' +
        '<th>Username</th><th>Rank</th><th>Strikes</th><th>Assignment</th>' +
        '<th>AP</th><th>Status</th><th>R/D</th><th>Wins</th><th>Win Rate</th>' +
        '<th>Total Pts</th><th>Department</th><th>Notes</th>' +
        '</tr></thead><tbody id="act-tbody"></tbody></table></div>';
    return h;
}

export function renderActivityRows(members) {
    var q = (gv('act-search')||'').toLowerCase();
    var filtered = members.filter(function(m){
        return (actFilter==='all' || m.status===actFilter) &&
            (!q || m.username.toLowerCase().indexOf(q)>-1 ||
                (m.rank||'').toLowerCase().indexOf(q)>-1 ||
                (m.department||'').toLowerCase().indexOf(q)>-1);
    });
    var cnt = $('act-count');
    if (cnt) cnt.textContent = filtered.length + ' member' + (filtered.length===1?'':'s');

    var buf = [];
    for (var i=0; i<filtered.length; i++) {
        var m = filtered[i];
        buf.push('<tr><td>'+esc(m.username)+'</td><td>'+rankPill(m.rank)+'</td>'+
            '<td class="mono strike'+(m.strikes>0?' red':'')+'">'+m.strikes+'</td>'+
            '<td>'+esc(m.assignment)+'</td><td class="mono">'+fmt2(m.ap)+'</td>'+
            '<td>'+statusBadge(m.status)+'</td><td class="mono">'+m.rd+'</td>'+
            '<td class="mono">'+m.wins+'</td><td class="mono">'+esc(m.winrate)+'</td>'+
            '<td class="mono">'+fmt2(m.totalPts)+'</td>'+
            '<td class="dept-cell">'+deptPills(m.department)+'</td>'+
            '<td class="wrap">'+esc(m.notes)+'</td></tr>');
    }
    var tbody = $('act-tbody');
    if (tbody) tbody.innerHTML = buf.length ? buf.join('') : noResults(12);
}

// members param passed from _dispatch in app.js — no window._D access
export function setActFilter(f, btn, members) {
    actFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on');
    renderActivityRows(members);
}

// ── Officer Tracker ───────────────────────────────────────────
export function renderOfficers(D) {
    var o = D.officers, total = o.officers.length;
    var constant   = o.officers.filter(function(m){return m.status==='Constant';}).length;
    var exempt     = o.officers.filter(function(m){return m.status==='Exempt';}).length;
    var incomplete = o.officers.filter(function(m){return m.status==='Incomplete';}).length;

    var h = pageHeader(o.title||'Officer Tracker', o.subtitle||'');
    h += '<div class="stats">' + statCard(total,'Officers') + statCard(constant,'Constant') +
        statCard(exempt,'Exempt') + statCard(incomplete,'Incomplete') + '</div>';
    h += '<div class="toolbar"><input class="search" id="off-search" placeholder="Search…">' +
        '<span class="count-label" id="off-count">'+total+' officers</span></div>';
    h += '<div class="tbl-wrap"><table><thead><tr>' +
        '<th>Username</th><th>Rank</th><th>Strikes</th><th>Assignment</th>' +
        '<th>OP</th><th>Status</th><th>R/D</th><th>Wins</th><th>Win Rate</th>' +
        '<th>Total Pts</th><th>Department</th><th>Notes</th>' +
        '</tr></thead><tbody id="off-tbody"></tbody></table></div>';
    return h;
}

export function renderOfficerRows(officers) {
    var q = (gv('off-search')||'').toLowerCase();
    var filtered = officers.filter(function(o){
        return !q || o.username.toLowerCase().indexOf(q)>-1 || (o.rank||'').toLowerCase().indexOf(q)>-1;
    });
    var cnt = $('off-count');
    if (cnt) cnt.textContent = filtered.length + ' officer' + (filtered.length===1?'':'s');
    var buf = [];
    for (var i=0; i<filtered.length; i++) {
        var o = filtered[i];
        buf.push('<tr><td>'+esc(o.username)+'</td><td>'+rankPill(o.rank)+'</td>'+
            '<td class="mono strike'+(o.strikes>0?' red':'')+'">'+o.strikes+'</td>'+
            '<td class="wrap">'+esc(o.assignment)+'</td><td class="mono">'+fmt2(o.officerPts)+'</td>'+
            '<td>'+statusBadge(o.status)+'</td><td class="mono">'+o.rd+'</td>'+
            '<td class="mono">'+o.wins+'</td><td class="mono">'+esc(o.winrate)+'</td>'+
            '<td class="mono">'+fmt2(o.totalPts)+'</td>'+
            '<td class="dept-cell">'+deptPills(o.department)+'</td>'+
            '<td class="wrap">'+esc(o.notes)+'</td></tr>');
    }
    var tbody = $('off-tbody');
    if (tbody) tbody.innerHTML = buf.length ? buf.join('') : noResults(12);
}

// ── Honored Tracker ───────────────────────────────────────────
export function renderHonored(D) {
    var hon = D.honored;
    var h = pageHeader('Honored Tracker','');
    if (hon.disclaimer) {
        h += '<div class="disclaimer">'+esc(hon.disclaimer)+'</div>';
    }
    h += '<div class="stats">'+
        statCard(hon.members.length,'Honored Members')+
        statCard(hon.members.filter(function(m){return m.medals.indexOf('Legend')>-1;}).length,'Legends')+
        statCard(hon.members.filter(function(m){return m.medals.indexOf('Cheerleader')>-1;}).length,'Cheerleaders')+
        '</div>';
    h += '<div class="toolbar"><input class="search" id="hon-search" placeholder="Search…">' +
        '<span class="count-label" id="hon-count">'+hon.members.length+' members</span></div>';
    h += '<div class="tbl-wrap"><table><thead><tr>' +
        '<th>Username</th><th>Medals &amp; Awards</th><th>Total Pts</th>' +
        '<th>R/D</th><th>Wins</th><th>Win Rate</th><th>Notes</th>' +
        '</tr></thead><tbody id="hon-tbody"></tbody></table></div>';
    return h;
}

export function renderHonoredRows(members) {
    var q = (gv('hon-search')||'').toLowerCase();
    var filtered = members.filter(function(m){return !q || m.username.toLowerCase().indexOf(q)>-1;});
    var cnt = $('hon-count');
    if (cnt) cnt.textContent = filtered.length + ' member' + (filtered.length===1?'':'s');
    var buf = [];
    for (var i=0; i<filtered.length; i++) {
        var m = filtered[i];
        var medals = m.medals.map(function(md){
            var mc = MEDAL_CLASSES[md];
            return mc
                ? '<span class="medal ' + mc + '">' + esc(md) + '</span>'
                : '<span class="medal medal-default">' + esc(md) + '</span>';
        }).join('');
        buf.push('<tr><td>'+esc(m.username)+'</td>'+
            '<td class="medals-cell">'+(medals||'<span class="muted-val">—</span>')+'</td>'+
            '<td class="mono">'+fmt2(m.totalPts)+'</td><td class="mono">'+m.rd+'</td>'+
            '<td class="mono">'+m.wins+'</td><td class="mono">'+esc(m.winrate)+'</td>'+
            '<td class="wrap">'+esc(m.notes)+'</td></tr>');
    }
    var tbody = $('hon-tbody');
    if (tbody) tbody.innerHTML = buf.length ? buf.join('') : noResults(7);
}

// ── Departments ───────────────────────────────────────────────
export function renderDepartments(D) {
    var depts = D.departments;
    var h = pageHeader('Department Members','');
    h += '<div class="stats">';
    depts.forEach(function(d){ h+=statCard(d.total,d.name); });
    h += '</div>';
    h += '<div class="toolbar"><input class="search" id="dept-search" placeholder="Search member…"></div>';
    h += '<div class="dept-grid" id="dept-grid">'+buildDeptBlocks(depts,'')+'</div>';
    return h;
}

export function buildDeptBlocks(depts, q) {
    var buf = [];
    for (var i=0; i<depts.length; i++) {
        var dept = depts[i];
        var members = dept.members.filter(function(m){return !q || m.username.toLowerCase().indexOf(q)>-1;});
        if (q && !members.length) continue;
        var colour = DEPT_COLOURS[dept.name] || '#444';
        var rows = members.map(function(m){
            return '<div class="dept-member"><span class="un">'+esc(m.username)+'</span><span class="rk">'+esc(m.rank)+'</span></div>';
        }).join('') || '<div class="dept-empty">No matches</div>';
        var dc = DEPT_CLASSES[dept.name] || DEPT_CLASSES[(dept.name||'').toUpperCase()] || '';
        buf.push('<div class="dept-block"><div class="dept-head ' + dc + '">'+
            '<div class="dept-head-name ' + dc + '">'+esc(dept.name)+'</div>'+
            '<div class="dept-head-count">'+members.length+' member'+(members.length===1?'':'s')+(q?' matching':'')+'</div>'+
            '</div>'+rows+'</div>');
    }
    return buf.join('');
}

// ── Events ────────────────────────────────────────────────────
export function renderEvents(ev, cols, title) {
    var h = pageHeader(title,'') + '<div class="stats">'+statCard(ev.total||ev.events.length,'Total Events')+'</div>';
    if (!ev.events.length) { return h + '<div class="empty">No events recorded yet for this period.</div>'; }
    h += '<div class="tbl-wrap"><table><thead><tr>';
    cols.forEach(function(c){h+='<th>'+esc(c)+'</th>';});
    h += '</tr></thead><tbody>';
    ev.events.forEach(function(e){
        h+='<tr>'; cols.forEach(function(c){h+='<td>'+esc(e[c]||'')+'</td>';}); h+='</tr>';
    });
    h += '</tbody></table></div>';
    return h;
}

// ── Autocomplete ──────────────────────────────────────────────
var GROUP_MEMBERS = [];

export function setMembers(members) { GROUP_MEMBERS = members || []; }

export function openAC(id)  { var d=$(id); if(d) d.classList.add('open'); }
export function closeAC(id) { var d=$(id); if(d) d.classList.remove('open'); }

export function buildAC(ddId, query, exclude, onSel) {
    var q = (query||'').toLowerCase();
    if (!q) { closeAC(ddId); return; }
    var matches = [];
    for (var i=0; i<GROUP_MEMBERS.length && matches.length<12; i++) {
        var m = GROUP_MEMBERS[i];
        if (m.toLowerCase().indexOf(q)>-1 && exclude.indexOf(m)===-1) matches.push(m);
    }
    var dd = $(ddId); if (!dd) return;
    if (!matches.length) { closeAC(ddId); return; }
    dd.innerHTML = matches.map(function(m){
        return '<div class="ac-option" data-mousedown="acSelect" data-fn="'+onSel+'" data-val="'+ea(m)+'">'+esc(m)+'</div>';
    }).join('');
    openAC(ddId);
}

export function initSingleAC(inpId, ddId, onSel) {
    var inp = $(inpId); if (!inp) return;
    var debouncedBuild = debounce(function(){ buildAC(ddId, inp.value, [], onSel); }, 120);
    inp.addEventListener('input', debouncedBuild);
    inp.addEventListener('keydown', function(e){ if(e.key==='Escape') closeAC(ddId); });
    inp.addEventListener('focus', function(){ if(inp.value.trim()) buildAC(ddId, inp.value, [], onSel); });
}

// removeFn replaces old window[onSel.replace('add','remove')] pattern
export function initMultiAC(inpId, ddId, areaId, getSel, onSel, removeFn) {
    var inp = $(inpId), area = $(areaId); if (!inp||!area) return;
    area.addEventListener('click', function(){ inp.focus(); });
    inp.addEventListener('focus', function(){ area.classList.add('focused'); });
    inp.addEventListener('blur',  function(){ area.classList.remove('focused'); });
    var debouncedBuild = debounce(function(){ buildAC(ddId, inp.value, getSel(), onSel); }, 120);
    inp.addEventListener('input', debouncedBuild);
    inp.addEventListener('keydown', function(e){
        if (e.key==='Escape') closeAC(ddId);
        if (e.key==='Backspace' && !inp.value) {
            var sel = getSel();
            if (sel.length && removeFn) removeFn(sel[sel.length-1]);
        }
    });
}

export function renderTags(areaId, inpId, items, removeFn) {
    var area=$(areaId), inp=$(inpId); if(!area||!inp) return;
    area.querySelectorAll('.tag').forEach(function(t){t.remove();});
    var frag = document.createDocumentFragment();
    items.forEach(function(name){
        var tag = document.createElement('span'); tag.className='tag';
        tag.innerHTML = esc(name)+'<i class="tag-remove" data-mousedown="acRemove" data-fn="'+removeFn+'" data-val="'+ea(name)+'">×</i>';
        frag.appendChild(tag);
    });
    area.insertBefore(frag, inp);
    inp.placeholder = items.length ? 'Add more…' : 'Type to search…';
}

export function docOutsideClick(pairs) {
    function handler(e) {
        var allGone = true;
        pairs.forEach(function(p){
            var inp = $(p[0]);
            if (inp) { allGone=false; var w=inp.closest('.ac-wrap'); if(w&&!w.contains(e.target)) closeAC(p[1]); }
        });
        if (allGone) document.removeEventListener('click', handler);
    }
    document.addEventListener('click', handler);
}

// ═══════════════════════════════════════════════════════════════
//  Unified Admin Dashboard
// ═══════════════════════════════════════════════════════════════

var _ADMIN = { tab: null, roles: [], list: [], seq: 0 };

var ADMIN_PERM_DEFS = [
    { key: 'roleAssign',  label: 'Assign Users', superadminOnly: true  },
    { key: 'roleEdit',    label: 'Edit Roles',   superadminOnly: true  },
    { key: 'mfOfficers',  label: 'Officers',     superadminOnly: false },
    { key: 'mfRemote',    label: 'Remote',       superadminOnly: false },
    { key: 'disSync',     label: 'Sync',         superadminOnly: false },
    { key: 'disTiles',    label: 'Tiles',        superadminOnly: false },
    { key: 'disPoints',   label: 'Points',       superadminOnly: false },
    { key: 'disRaffle',   label: 'Raffle',       superadminOnly: false },
    { key: 'disGamePool', label: 'Game Pool',    superadminOnly: false },
    { key: 'disAudit',    label: 'Audit',        superadminOnly: false }
];

var ADMIN_PERM_GROUPS = [
    { label: 'System',    keys: ['roleAssign', 'roleEdit'] },
    { label: 'Mainframe', keys: ['mfOfficers', 'mfRemote'] },
    { label: 'DIS',       keys: ['disSync', 'disTiles', 'disPoints', 'disRaffle', 'disGamePool', 'disAudit'] }
];

export function renderUnifiedAdmin() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;

    var tabDefs = [
        { key: 'roles',     label: 'Roles',     canSee: AUTH.canAdminTab('roles')     },
        { key: 'mainframe', label: 'Mainframe', canSee: AUTH.canAdminTab('mainframe') },
        { key: 'sync',      label: 'Sync',      canSee: AUTH.canAdminTab('sync')      },
        { key: 'tiles',     label: 'Tiles',     canSee: AUTH.canAdminTab('tiles')     },
        { key: 'points',    label: 'Points',    canSee: AUTH.canAdminTab('points')    },
        { key: 'raffle',    label: 'Raffle',    canSee: AUTH.canAdminTab('raffle')    },
        { key: 'gamepool',  label: 'Game Pool', canSee: AUTH.canAdminTab('gamepool')  },
        { key: 'audit',     label: 'Audit Log', canSee: AUTH.canAdminTab('audit')     },
        { key: 'errors',    label: 'Errors',    canSee: AUTH.canAdminTab('errors')    }
    ].filter(function (t) { return t.canSee; });

    if (!_ADMIN.tab || !tabDefs.some(function (t) { return t.key === _ADMIN.tab; })) {
        _ADMIN.tab = tabDefs.length ? tabDefs[0].key : null;
    }

    if (tabDefs.length === 0) {
        hs.className = '';
        hs.innerHTML =
            '<div class="bg-grid"></div><div class="home-inner" style="padding-top:40px">' +
            '<div class="dis-wrap"><div class="info-block">' +
            '<p class="admin-desc">You do not have any admin permissions.</p>' +
            '<button class="btn-ghost" style="margin-top:12px" data-click="showHomeScreen">&#8592; Back to Hub</button>' +
            '</div></div></div>';
        return;
    }

    var navHtml = tabDefs.map(function (t) {
        return '<div class="obj-nav-item' + (_ADMIN.tab === t.key ? ' active' : '') +
            '" data-admintab="' + esc(t.key) + '" data-click="adminTab" data-key="' + esc(t.key) + '">' +
            '<div class="obj-nav-dot"></div>' + esc(t.label) + '</div>';
    }).join('');

    hs.className = 'obj-mode';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" id="admin-sidebar">' +
            '<div class="obj-sidebar-logo">' +
                '<div class="obj-sidebar-label">Nighthawk Commandos</div>' +
                '<div class="obj-sidebar-title">Admin Dashboard</div>' +
            '</div>' +
            '<div class="obj-sidebar-back">' +
                '<button class="btn-ghost" data-click="showHomeScreen">\u2190 Back to Hub</button>' +
            '</div>' +
            '  <nav class="obj-nav" id="dis-nav">' +
        '    <div class="obj-nav-group">Tools</div>' +
            navHtml +
        '</aside>' +
        '<main class="obj-main" id="admin-body"></main>';

    _adminRenderTab();
}

export function adminTab(key) {
    _ADMIN.tab = key;
    document.querySelectorAll('.obj-nav-item[data-admintab]').forEach(function (el) {
        el.classList.toggle('active', el.dataset.admintab === key);
    });
    _adminRenderTab();
}

function _adminRenderTab() {
    var body = document.getElementById('admin-body');
    if (!body) return;
    var tab = _ADMIN.tab;
    var seq = ++_ADMIN.seq;
    var isCurrent = function () { return _ADMIN.seq === seq; };
    if (tab === 'mainframe') { _adminRenderMainframe(body); return; }
    body.innerHTML = '<div class="obj-loading">Loading…</div>';
    if (tab === 'roles')  { _adminRenderRoles(body, isCurrent);  return; }
    if (tab === 'errors') { _adminRenderErrors(body, isCurrent); return; }
    adminRenderDisTab(tab, body, isCurrent);
}

// ── Mainframe tab ─────────────────────────────────────────────
function _adminRenderMainframe(body) {
    var ap = AUTH.adminPerms || {};
    var isSuperadmin = !!(AUTH.user && AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var canOfficers  = isSuperadmin || !!ap.mfOfficers;
    var canRemote    = isSuperadmin || !!ap.mfRemote;

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Mainframe Admin</h3>' +
        '<p class="admin-desc">Administrative tools for the Nighthawk Commandos Mainframe.</p></div>';

    if (canOfficers) {
        var rankOpts = [
            'Interim Warrant Officer','Warrant Officer','Chief Warrant Officer',
            'Captain','Commandant','Developer','Advisor','Deputy Director','Director'
        ].map(function (r) { return '<option value="' + esc(r) + '">' + esc(r) + '</option>'; }).join('');

        html +=
            '<div class="info-block" style="margin-bottom:16px">' +
            '<h3>Officers Tracker</h3>' +
            '<p class="admin-desc">Add or remove entries from the Officers Tracker.</p>' +
            '<div class="admin-section-title" style="margin-top:12px">Add Officer</div>' +
            '<div class="dis-inline-form" style="flex-wrap:wrap;gap:8px;margin-bottom:4px">' +
            '<div class="ac-wrap" style="flex:1;min-width:140px"><input class="ac-input" id="admin-mf-add-inp" placeholder="Type to search\u2026" autocomplete="off"><div class="ac-dropdown" id="admin-mf-add-dd"></div></div>' +
            '<select id="admin-mf-add-rank" class="admin-role-select" style="flex:1;min-width:160px">' +
            '<option value="">\u2014 Select rank \u2014</option>' + rankOpts + '</select>' +
            '<button id="admin-mf-add-btn" class="btn-dis-primary" data-click="adminAddOfficer">Add Officer</button>' +
            '</div>' +
            '<div id="admin-mf-add-res" style="font-size:12px;min-height:18px"></div>' +
            '<div class="admin-section-title" style="margin-top:16px">Remove Officer</div>' +
            '<div class="dis-inline-form" style="flex-wrap:wrap;gap:8px;margin-bottom:4px">' +
            '<div class="ac-wrap" style="flex:1;min-width:160px"><input class="ac-input" id="admin-mf-rm-inp" placeholder="Type to search\u2026" autocomplete="off"><div class="ac-dropdown" id="admin-mf-rm-dd"></div></div>' +
            '<button id="admin-mf-rm-btn" class="btn-dis-primary" style="background:#c0392b" data-click="adminRemoveOfficer">Remove Officer</button>' +
            '</div>' +
            '<div id="admin-mf-rm-res" style="font-size:12px;min-height:18px"></div>' +
            '</div>';
    }

    if (canRemote) {
        html +=
            '<div class="info-block" style="margin-bottom:16px">' +
            '<h3>Remote Functions</h3>' +
            '<p class="admin-desc">Run administrative functions against the mainframe data.</p>' +
            '<div id="admin-mf-remote"><p class="admin-desc" style="color:var(--muted)">Coming soon.</p></div>' +
            '</div>';
    }

    body.innerHTML = html;

    if (canOfficers) {
        _initOfficerAC();
    }
}

function _initOfficerAC() {
    function wire() {
        initSingleAC('admin-mf-add-inp', 'admin-mf-add-dd', 'pickAdminOfficerAdd');
        initSingleAC('admin-mf-rm-inp',  'admin-mf-rm-dd',  'pickAdminOfficerRm');
        docOutsideClick([['admin-mf-add-inp','admin-mf-add-dd'],['admin-mf-rm-inp','admin-mf-rm-dd']]);
    }
    if (GROUP_MEMBERS.length) {
        wire();
    } else {
        API.getGroupMembers().then(function (members) {
            setMembers(members);
            wire();
        }).catch(function () { wire(); });
    }
}

export function pickAdminOfficerAdd(name) { sv('admin-mf-add-inp', name); closeAC('admin-mf-add-dd'); }
export function pickAdminOfficerRm(name)  { sv('admin-mf-rm-inp',  name); closeAC('admin-mf-rm-dd');  }

// ── Roles tab ─────────────────────────────────────────────────
export function adminPermToggle(btn) {
    btn.classList.toggle('on');
}

function _readPermToggles(container) {
    var perms = {};
    container.querySelectorAll('.admin-perm-toggle').forEach(function (btn) {
        perms[btn.dataset.perm] = btn.classList.contains('on');
    });
    return perms;
}

function _adminRenderPermToggles(existingPerms) {
    var ap = AUTH.adminPerms || {};
    var isSuperadmin = !!(AUTH.user && AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var defsMap = {};
    ADMIN_PERM_DEFS.forEach(function (d) { defsMap[d.key] = d; });
    var html = '';
    ADMIN_PERM_GROUPS.forEach(function (g) {
        var visible = g.keys.filter(function (k) {
            var d = defsMap[k];
            return d && (!d.superadminOnly || isSuperadmin);
        });
        if (!visible.length) return;
        html += '<div class="admin-perm-group"><div class="admin-perm-group-label">' + esc(g.label) + '</div><div class="admin-perm-toggles">';
        visible.forEach(function (k) {
            var d = defsMap[k];
            var isOn = !!(existingPerms && existingPerms[k]);
            var canToggle = isSuperadmin || (k !== 'roleManager' && !!ap[k]);
            html += '<button type="button" class="admin-perm-toggle' + (isOn ? ' on' : '') + '" data-perm="' + esc(k) + '"' +
                (canToggle ? ' data-click="adminPermToggle"' : ' disabled') + '>' + esc(d.label) + '</button>';
        });
        html += '</div></div>';
    });
    return html;
}

function _adminRenderRoles(body, isCurrent) {
    Promise.all([
        fetch('/api/admin/roles',     { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('roles ' + r.status); return r.json(); }),
        fetch('/api/admin/allowlist', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('allowlist ' + r.status); return r.json(); })
    ]).then(function (results) {
        if (!isCurrent()) return;
        _adminBuildRolesUI(body, Array.isArray(results[0]) ? results[0] : [], Array.isArray(results[1]) ? results[1] : []);
    }).catch(function (e) {
        if (!isCurrent()) return;
        body.innerHTML = '<div class="obj-error">Failed to load: ' + esc(e.message) + '</div>';
    });
}

function _adminBuildRolesUI(body, roles, list) {
    _ADMIN.roles = roles;
    _ADMIN.list  = list;
    var ap = AUTH.adminPerms || {};
    var isSuperadmin = !!(AUTH.user && AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var canAssign    = isSuperadmin || !!ap.roleAssign;
    var canEditRoles = isSuperadmin || !!ap.roleEdit;

    var html = '';

    html += '<div class="admin-section-title">Role Templates</div><div class="admin-role-grid">';

    roles.forEach(function (role) {
        var enabledPerms = ADMIN_PERM_DEFS.filter(function (d) { return role.permissions && role.permissions[d.key]; });
        html += '<div class="admin-role-card" style="border-left-color:' + esc(role.color || '#7c4ab8') + '" id="admin-role-card-' + esc(role.id) + '">' +
            _adminRoleCardViewHTML(role, enabledPerms, canEditRoles) + '</div>';
    });

    if (canEditRoles) {
        html += '<div class="admin-role-card" style="border-left-color:var(--border)">' +
            '<div id="admin-new-role-collapsed">' +
            '<button class="btn-dis-primary" style="width:100%;font-size:12px" data-click="adminShowNewRole">+ Create Role</button>' +
            '</div>' +
            '<div id="admin-new-role-expanded" style="display:none" class="admin-role-edit-form">' +
            '<div class="admin-role-form-row">' +
            '<input id="admin-new-role-name" class="admin-input" placeholder="Role name" style="flex:1;min-width:0">' +
            '<input id="admin-new-role-color" class="admin-color-input" type="color" value="#7c4ab8">' +
            '</div>' +
            _adminRenderPermToggles({}) +
            '<div class="admin-role-form-row" style="margin-top:4px">' +
            '<button class="btn-dis-primary" style="flex:1;font-size:12px" data-click="adminSaveNewRole">Save Role</button>' +
            '<button class="admin-role-btn" style="white-space:nowrap" data-click="adminCancelNewRole">Cancel</button>' +
            '</div></div></div>';
    }

    html += '</div>';

    html += '<div class="admin-section-title" style="margin-top:28px">Assigned Users</div>';

    if (list.length) {
        html += '<div class="admin-user-list">';
        list.forEach(function (e) {
            var assignedIds = Array.isArray(e.roleIds) && e.roleIds.length ? e.roleIds
                : (e.roleId ? [e.roleId] : []);
            html += '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                '<div class="admin-user-label">' + esc(e.label || e.discordId) + '</div>' +
                '<div class="admin-user-id">' + esc(e.discordId) + '</div>' +
                '</div>';
            if (canAssign) {
                html += _adminRoleCheckboxesHTML(roles, assignedIds, e.discordId) +
                    '<button class="admin-remove-btn" data-click="adminRemoveUser" data-id="' + ea(e.discordId) + '">Remove</button>';
            } else {
                var roleNames = assignedIds.map(function (rid) {
                    var r = roles.find(function (rr) { return rr.id === rid; });
                    return r ? r.name : '';
                }).filter(Boolean);
                html += '<span style="font-size:11px;color:var(--muted)">' + esc(roleNames.length ? roleNames.join(', ') : '\u2014') + '</span>';
            }
            html += '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="empty" style="margin-bottom:16px">No users on the admin list.</div>';
    }

    if (canAssign) {
        html += '<div class="info-block" style="margin-top:12px"><h3>Add User</h3>' +
            '<div class="dis-inline-form" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
            '<input id="admin-new-user-id" class="admin-input" placeholder="Discord ID" style="width:180px">' +
            '<input id="admin-new-user-label" class="admin-input" placeholder="Display name (optional)" style="flex:1">' +
            '</div>' +
            '<div style="margin-bottom:12px">' +
            '<label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Roles:</label>' +
            _adminRoleCheckboxesHTML(roles, [], 'new-user') +
            '</div>' +
            '<button class="btn-dis-primary" data-click="adminAddUser">Add User</button></div>';
    }

    body.innerHTML = html;
}

function _adminRoleCardViewHTML(role, enabledPerms, canManage) {
    var html = '<div class="admin-role-card-header"><div class="admin-role-name">' + esc(role.name) + '</div>';
    if (canManage) {
        html += '<div class="admin-role-actions">' +
            '<button class="admin-role-btn" data-click="adminEditRole" data-id="' + esc(role.id) + '">Edit</button>' +
            '<button class="admin-role-btn danger" data-click="adminDeleteRole" data-id="' + esc(role.id) + '">Delete</button>' +
            '</div>';
    }
    html += '</div><div class="admin-perm-pills">';
    if (enabledPerms.length) {
        enabledPerms.forEach(function (d) { html += '<span class="admin-perm-pill">' + esc(d.label) + '</span>'; });
    } else {
        html += '<span style="font-size:11px;color:var(--muted)">No permissions</span>';
    }
    return html + '</div>';
}

function _adminRoleCheckboxesHTML(roles, selectedIds, discordId) {
    var isNew = (discordId === 'new-user');
    if (!roles.length) return '<span style="font-size:11px;color:var(--muted)">No roles defined</span>';
    var html = '<div class="admin-role-checks" id="admin-roles-' + esc(discordId) + '">';
    roles.forEach(function (r) {
        var checked = selectedIds.indexOf(r.id) > -1;
        var onChange = isNew ? '' : ' data-change="adminToggleUserRole" data-id="' + ea(discordId) + '"';
        html += '<label class="admin-role-check"><input type="checkbox" value="' + esc(r.id) + '"' +
            (checked ? ' checked' : '') + onChange + '> ' + esc(r.name) + '</label>';
    });
    return html + '</div>';
}

export function adminEditRole(id) {
    var role = (_ADMIN.roles || []).find(function (r) { return r.id === id; });
    if (!role) return;
    var card = document.getElementById('admin-role-card-' + id);
    if (!card) return;
    card.innerHTML = '<div class="admin-role-edit-form">' +
        '<div class="admin-role-form-row">' +
        '<input id="admin-edit-role-name" class="admin-input" value="' + esc(role.name) + '" style="flex:1;min-width:0">' +
        '<input id="admin-edit-role-color" class="admin-color-input" type="color" value="' + esc(role.color || '#7c4ab8') + '">' +
        '</div>' +
        _adminRenderPermToggles(role.permissions || {}) +
        '<div class="admin-role-form-row" style="margin-top:4px">' +
        '<button class="btn-dis-primary" style="flex:1;font-size:12px" data-click="adminSaveRole" data-id="' + esc(id) + '">Save</button>' +
        '<button class="admin-role-btn" style="white-space:nowrap" data-click="adminCancelEditRole" data-id="' + esc(id) + '">Cancel</button>' +
        '</div></div>';
    var colorInput = document.getElementById('admin-edit-role-color');
    if (colorInput) colorInput.addEventListener('input', function () { card.style.borderLeftColor = colorInput.value; });
}

export function adminCancelEditRole(id) {
    var role = (_ADMIN.roles || []).find(function (r) { return r.id === id; });
    if (!role) { _adminReloadRoles(); return; }
    var card = document.getElementById('admin-role-card-' + id);
    if (!card) return;
    var ap = AUTH.adminPerms || {};
    var isSuperadmin = !!(AUTH.user && AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var enabledPerms = ADMIN_PERM_DEFS.filter(function (d) { return role.permissions && role.permissions[d.key]; });
    card.innerHTML = _adminRoleCardViewHTML(role, enabledPerms, isSuperadmin || !!ap.roleEdit);
}

export function adminSaveRole(id) {
    var card = document.getElementById('admin-role-card-' + id);
    if (!card) return;
    var name  = (document.getElementById('admin-edit-role-name')  || {}).value || '';
    var color = (document.getElementById('admin-edit-role-color') || {}).value || '#7c4ab8';
    name = name.trim();
    if (!name) { toast('Role name required', 'error'); return; }
    fetch('/api/admin/roles', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, name: name, color: color, permissions: _readPermToggles(card) })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Role updated', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminDeleteRole(id) {
    if (!confirm('Delete this role? Users assigned to it will lose their permissions.')) return;
    fetch('/api/admin/roles', {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Role deleted', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminShowNewRole() {
    var c = document.getElementById('admin-new-role-collapsed');
    var e = document.getElementById('admin-new-role-expanded');
    if (c) c.style.display = 'none';
    if (e) e.style.display = '';
}

export function adminCancelNewRole() {
    var c = document.getElementById('admin-new-role-collapsed');
    var e = document.getElementById('admin-new-role-expanded');
    if (c) c.style.display = '';
    if (e) e.style.display = 'none';
}

export function adminSaveNewRole() {
    var name  = ((document.getElementById('admin-new-role-name')  || {}).value || '').trim();
    var color = (document.getElementById('admin-new-role-color')  || {}).value || '#7c4ab8';
    if (!name) { toast('Role name required', 'error'); return; }
    var expanded = document.getElementById('admin-new-role-expanded');
    fetch('/api/admin/roles', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, color: color, permissions: expanded ? _readPermToggles(expanded) : {} })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Role created', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminToggleUserRole(cb, discordId) {
    var container = document.getElementById('admin-roles-' + discordId);
    var roleIds = [];
    if (container) {
        container.querySelectorAll('input[type=checkbox]:checked').forEach(function (c) { roleIds.push(c.value); });
        container.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.disabled = true; });
    }
    fetch('/api/admin/allowlist', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: discordId, roleIds: roleIds })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (container) container.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.disabled = false; });
            if (res.success) toast('Roles updated', 'success');
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () {
            if (container) container.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.disabled = false; });
            toast('Request failed', 'error');
        });
}

export function adminAddUser() {
    var id    = ((document.getElementById('admin-new-user-id')    || {}).value || '').trim();
    var label = ((document.getElementById('admin-new-user-label') || {}).value || '').trim();
    var roleIds = [];
    var roleContainer = document.getElementById('admin-roles-new-user');
    if (roleContainer) {
        roleContainer.querySelectorAll('input[type=checkbox]:checked').forEach(function (c) { roleIds.push(c.value); });
    }
    if (!id) { toast('Enter a Discord ID', 'error'); return; }
    var payload = { discordId: id, label: label || id };
    if (roleIds.length) payload.roleIds = roleIds;
    fetch('/api/admin/allowlist', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('User added', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminRemoveUser(discordId) {
    if (!confirm('Remove this user from the admin list?')) return;
    fetch('/api/admin/allowlist', {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: discordId })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('User removed', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

function _adminReloadRoles() {
    var body = document.getElementById('admin-body');
    if (body && _ADMIN.tab === 'roles') _adminRenderRoles(body, function () { return true; });
}

// ── Errors tab ────────────────────────────────────────────────
function _adminRenderErrors(body, isCurrent) {
    fetch('/api/admin/errors', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (res) {
            if (!isCurrent()) return;
            var log = Array.isArray(res.log) ? res.log.slice().reverse() : [];
            if (log.length === 0) {
                body.innerHTML = '<div class="empty">No errors logged.</div>';
                return;
            }
            var html = '<div class="info-block" style="margin-bottom:16px">' +
                '<h3>Error Log</h3>' +
                '<p class="admin-desc">Failed admin actions. Last ' + log.length + ' entries, most recent first.</p>' +
                '</div>' +
                '<div class="tbl-wrap"><table>' +
                '<thead><tr><th>Time</th><th>Action</th><th>Error</th><th>Details</th></tr></thead><tbody>';
            log.forEach(function (entry) {
                html += '<tr>' +
                    '<td style="white-space:nowrap;font-size:11px">' + esc(new Date(entry.timestamp).toLocaleString()) + '</td>' +
                    '<td><span class="badge b-incomplete">' + esc(entry.action || '—') + '</span></td>' +
                    '<td style="font-size:11px;color:#e05252;max-width:260px;word-break:break-word">' + esc(entry.error || '—') + '</td>' +
                    '<td style="font-size:11px;color:var(--muted);word-break:break-all">' + esc(JSON.stringify(entry.details || {})) + '</td>' +
                    '</tr>';
            });
            body.innerHTML = html + '</tbody></table></div>';
        })
        .catch(function (e) {
            if (!isCurrent()) return;
            body.innerHTML = '<div class="obj-error">Failed to load error log: ' + esc(e.message) + '</div>';
        });
}

// ── Officer management ────────────────────────────────────────
export function adminAddOfficer() {
    var username = ((document.getElementById('admin-mf-add-inp') || {}).value || '').trim();
    var rank     = ((document.getElementById('admin-mf-add-rank') || {}).value || '').trim();
    if (!username) { toast('Enter a username', 'error'); return; }
    if (!rank)     { toast('Select a rank', 'error'); return; }
    if (GROUP_MEMBERS.length && GROUP_MEMBERS.indexOf(username) === -1) {
        toast('"' + username + '" is not in the group members list', 'error');
        setHTML('admin-mf-add-res', '<span style="color:#c0392b">Not found in group members list.</span>');
        return;
    }
    btnBusy('admin-mf-add-btn', 'Adding\u2026');
    fetch('/api/admin/officers', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', username: username, rank: rank })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            btnDone('admin-mf-add-btn', 'Add Officer');
            if (res.ok) {
                toast('Officer added', 'success');
                sv('admin-mf-add-inp', ''); sv('admin-mf-add-rank', '');
                setHTML('admin-mf-add-res', '<span style="color:#27ae60">Added: ' + esc(username) + ' (' + esc(rank) + ')</span>');
                API.bustCache('c:allData');
            } else {
                toast('Error: ' + (res.error || 'Unknown'), 'error');
                setHTML('admin-mf-add-res', '<span style="color:#c0392b">' + esc(res.error || 'Failed') + '</span>');
            }
        }).catch(function () {
            btnDone('admin-mf-add-btn', 'Add Officer');
            toast('Request failed', 'error');
        });
}

export function adminRemoveOfficer() {
    var username = ((document.getElementById('admin-mf-rm-inp') || {}).value || '').trim();
    if (!username) { toast('Enter a username', 'error'); return; }
    if (GROUP_MEMBERS.length && GROUP_MEMBERS.indexOf(username) === -1) {
        toast('"' + username + '" is not in the group members list', 'error');
        setHTML('admin-mf-rm-res', '<span style="color:#c0392b">Not found in group members list.</span>');
        return;
    }
    if (!confirm('Remove officer "' + username + '" from the tracker?')) return;
    btnBusy('admin-mf-rm-btn', 'Removing\u2026');
    fetch('/api/admin/officers', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', username: username })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            btnDone('admin-mf-rm-btn', 'Remove Officer');
            if (res.ok) {
                toast('Officer removed', 'success');
                sv('admin-mf-rm-inp', '');
                setHTML('admin-mf-rm-res', '<span style="color:#27ae60">Removed: ' + esc(username) + '</span>');
                API.bustCache('c:allData');
            } else {
                var msg = res.error || 'Failed';
                var detail = '';
                if (res.found && res.found.length) {
                    detail = '<div style="font-size:11px;color:var(--muted);margin-top:4px">Names in sheet: ' + esc(res.found.join(', ')) + '</div>';
                }
                toast('Error: ' + msg, 'error');
                setHTML('admin-mf-rm-res', '<span style="color:#c0392b">' + esc(msg) + '</span>' + detail);
            }
        }).catch(function () {
            btnDone('admin-mf-rm-btn', 'Remove Officer');
            toast('Request failed', 'error');
        });
}
