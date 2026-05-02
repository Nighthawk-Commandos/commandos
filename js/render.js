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
    { key: 'roleAssign',     label: 'Assign Users',        superadminOnly: true  },
    { key: 'roleEdit',       label: 'Edit Roles',          superadminOnly: true  },
    { key: 'mfOfficers',     label: 'Officers',            superadminOnly: false },
    { key: 'mfRemote',       label: 'Remote',              superadminOnly: false },
    { key: 'eventsStats',    label: 'Event Stats',         superadminOnly: false },
    { key: 'contentAdmin',   label: 'Content',             superadminOnly: false },
    { key: 'disSync',        label: 'Sync',                superadminOnly: false },
    { key: 'disTiles',       label: 'Tiles',               superadminOnly: false },
    { key: 'disPoints',      label: 'Points',              superadminOnly: false },
    { key: 'disRaffle',      label: 'Raffle',              superadminOnly: false },
    { key: 'disGamePool',    label: 'Game Pool',           superadminOnly: false },
    { key: 'disAudit',       label: 'Audit',               superadminOnly: false },
    // Section-access perms — assignable via role templates + Discord role grants
    { key: 'viewAdmin',      label: 'Admin Dashboard',     superadminOnly: false },
    { key: 'viewObjectives', label: 'Objectives View',     superadminOnly: false },
    { key: 'viewEventLog',   label: 'Submit Event Log',    superadminOnly: false },
    { key: 'editEventLog',   label: 'Edit Event Log',      superadminOnly: false },
    { key: 'bypassMember',   label: 'Bypass Member Check', superadminOnly: false }
];

var ADMIN_PERM_GROUPS = [
    { label: 'System',    keys: ['roleAssign', 'roleEdit'] },
    { label: 'Mainframe', keys: ['mfOfficers', 'mfRemote', 'eventsStats', 'contentAdmin'] },
    { label: 'DIS',       keys: ['disSync', 'disTiles', 'disPoints', 'disRaffle', 'disGamePool', 'disAudit'] },
    { label: 'Access',    keys: ['viewAdmin', 'viewObjectives', 'viewEventLog', 'editEventLog', 'bypassMember'] }
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
        { key: 'errors',    label: 'Errors',    canSee: AUTH.canAdminTab('errors')    },
        { key: 'documents', label: 'Documents', canSee: AUTH.canAdminTab('content')   },
        { key: 'appdefs',   label: 'Applications', canSee: AUTH.canAdminTab('content') },
        { key: 'permgroups',label: 'Perm Groups',  canSee: AUTH.canAdminTab('content') }
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
        '<div class="home-bg-glow"></div>' +
        '<aside class="obj-sidebar" id="admin-sidebar" data-accent="red">' +
            '<div class="obj-sidebar-logo">' +
                '<div class="obj-sidebar-label">Nighthawk Commandos</div>' +
                '<div class="obj-sidebar-title">Admin<br>Dashboard</div>' +
            '</div>' +
            '<nav class="obj-nav" id="dis-nav">' +
                '<div class="obj-nav-group">Tools</div>' +
                navHtml +
            '</nav>' +
            '<div class="obj-sidebar-back">' +
                '<button class="obj-hub-btn" data-click="showHomeScreen">\u2190 Back to Hub</button>' +
                (window._sysVersion ? '<div class="sidebar-version">' + window._sysVersion + '</div>' : '') +
            '</div>' +
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
    if (tab === 'mainframe')  { _adminRenderMainframe(body);                return; }
    body.innerHTML = '<div class="obj-loading">Loading…</div>';
    if (tab === 'roles')     { _adminRenderRoles(body, isCurrent);          return; }
    if (tab === 'errors')    { _adminRenderErrors(body, isCurrent);         return; }
    if (tab === 'documents') { _adminRenderContent('docs',   body, isCurrent); return; }
    if (tab === 'appdefs')   { _adminRenderContent('apps',   body, isCurrent); return; }
    if (tab === 'permgroups'){ _adminRenderContent('perm-groups', body, isCurrent); return; }
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

    // ── Role Templates ────────────────────────────────────────
    html += '<div class="roles-section-header">' +
        '<div class="admin-section-title" style="margin:0">Role Templates</div>' +
        '<div class="roles-header-actions">' +
        '<input id="roles-search" class="admin-input roles-search" placeholder="Filter roles…" oninput="_adminFilterRoles(this.value)">' +
        (canEditRoles ? '<button class="btn-dis-primary" style="white-space:nowrap" data-click="adminShowNewRole">+ New Role</button>' : '') +
        '</div>' +
        '</div>';

    if (!roles.length) {
        html += '<div class="empty" style="margin:12px 0">No roles defined yet.</div>';
    } else {
        html += '<div class="roles-table-wrap"><table class="roles-table" id="roles-table">' +
            '<thead><tr><th style="width:12px"></th><th>Role</th><th>Permissions</th>' +
            (canEditRoles ? '<th style="width:100px;text-align:right">Actions</th>' : '') +
            '</tr></thead><tbody>';

        roles.forEach(function (role) {
            var enabledPerms = ADMIN_PERM_DEFS.filter(function (d) { return role.permissions && role.permissions[d.key]; });
            var pills = enabledPerms.map(function (d) {
                return '<span class="admin-perm-pill">' + esc(d.label) + '</span>';
            }).join('');
            var saOnly = role.superadminOnly
                ? '<span class="admin-role-badge superadmin-only">SA Only</span>' : '';
            html += '<tr class="roles-row" id="admin-role-card-' + esc(role.id) + '" data-name="' + esc((role.name || '').toLowerCase()) + '">' +
                '<td><span class="roles-color-dot" style="background:' + esc(role.color || '#7c4ab8') + '"></span></td>' +
                '<td><span class="roles-row-name">' + esc(role.name) + '</span>' + saOnly + '</td>' +
                '<td class="roles-perms-cell">' + (pills || '<span style="color:var(--muted);font-size:10px">No permissions</span>') + '</td>' +
                (canEditRoles ? '<td style="text-align:right;white-space:nowrap">' +
                    '<button class="admin-role-btn" data-click="adminEditRole" data-id="' + esc(role.id) + '">Edit</button>' +
                    '<button class="admin-role-btn danger" data-click="adminDeleteRole" data-id="' + esc(role.id) + '">Delete</button>' +
                    '</td>' : '') +
                '</tr>';
        });
        html += '</tbody></table></div>';
    }

    // New role form (hidden by default, shown inline above the table)
    if (canEditRoles) {
        html = html.replace(
            '<div class="roles-table-wrap">',
            '<div id="admin-new-role-expanded" style="display:none" class="admin-role-edit-form roles-create-form">' +
            '<div class="admin-role-form-row">' +
            '<input id="admin-new-role-name" class="admin-input" placeholder="Role name" style="flex:1;min-width:0">' +
            '<input id="admin-new-role-color" class="admin-color-input" type="color" value="#7c4ab8">' +
            '<label class="roles-sa-toggle"><input type="checkbox" id="admin-new-role-saonly"> Superadmin only</label>' +
            '</div>' +
            _adminRenderPermToggles({}) +
            '<div class="admin-role-form-row" style="margin-top:4px">' +
            '<button class="btn-dis-primary" style="flex:1;font-size:12px" data-click="adminSaveNewRole">Save Role</button>' +
            '<button class="admin-role-btn" style="white-space:nowrap" data-click="adminCancelNewRole">Cancel</button>' +
            '</div></div>' +
            '<div class="roles-table-wrap">'
        );
    }

    // \u2500\u2500 Discord Role Grants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    html += '<div class="roles-section-header" style="margin-top:28px">' +
        '<div class="admin-section-title" style="margin:0">Discord Role Grants</div>' +
        (canEditRoles ? '<button class="btn-dis-primary" style="white-space:nowrap" data-click="adminLoadDiscordGrants">Manage</button>' : '') +
        '</div>' +
        '<p style="font-size:11px;color:var(--muted);margin:4px 0 10px">Map Nighthawk Commandos Discord roles to admin role templates. Members automatically receive the linked permissions.</p>' +
        '<div id="discord-grants-area"><span style="font-size:11px;color:var(--muted)">Click "Manage" to view and edit.</span></div>';

    // \u2500\u2500 Assigned users \u2014 compact table with expandable role picker \u2500
    html += '<div class="roles-section-header" style="margin-top:28px">' +
        '<div class="admin-section-title" style="margin:0">Assigned Users</div>';

    if (canAssign) {
        html += '<div style="display:flex;gap:8px">' +
            '<input id="admin-user-search" class="admin-input roles-search" placeholder="Filter users\u2026" oninput="_adminFilterUsers(this.value)">' +
            '<button class="btn-dis-primary" style="white-space:nowrap" data-click="adminShowAddUser">+ Add User</button></div>';
    }
    html += '</div>';

    // Add user form (collapsed by default)
    if (canAssign) {
        html += '<div id="admin-add-user-form" style="display:none" class="roles-create-form">' +
            '<div class="admin-role-form-row">' +
            '<input id="admin-new-user-id" class="admin-input" placeholder="Discord ID (17\u201320 digits)" style="width:200px">' +
            '<input id="admin-new-user-label" class="admin-input" placeholder="Display name (optional)" style="flex:1">' +
            '</div>' +
            '<div style="margin:8px 0 4px;font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase">Roles</div>' +
            _adminRoleCheckboxesHTML(roles, [], 'new-user') +
            '<div class="admin-role-form-row" style="margin-top:8px">' +
            '<button class="btn-dis-primary" data-click="adminAddUser">Add User</button>' +
            '<button class="admin-role-btn" data-click="adminHideAddUser">Cancel</button>' +
            '</div></div>';
    }

    if (list.length) {
        html += '<div class="roles-table-wrap"><table class="roles-user-table" id="users-table">' +
            '<thead><tr><th>User</th><th>Assigned Roles</th>' +
            (canAssign ? '<th style="width:110px;text-align:right">Actions</th>' : '') +
            '</tr></thead><tbody>';

        list.forEach(function (e) {
            var assignedIds = Array.isArray(e.roleIds) && e.roleIds.length ? e.roleIds
                : (e.roleId ? [e.roleId] : []);
            var rolePills = assignedIds.map(function (rid) {
                var r = roles.find(function (rr) { return rr.id === rid; });
                return r ? '<span class="admin-perm-pill" style="border-left:2px solid ' + esc(r.color || '#7c4ab8') + '">' + esc(r.name) + '</span>' : '';
            }).filter(Boolean).join('');

            var safeId = ea(e.discordId);
            html += '<tr class="roles-row" data-name="' + esc((e.label || e.discordId).toLowerCase()) + '">' +
                '<td class="roles-user-cell">' +
                '  <div class="roles-user-label">' + esc(e.label || e.discordId) + '</div>' +
                '  <div class="roles-user-id">' + esc(e.discordId) + '</div>' +
                '</td>' +
                '<td>' +
                '  <div class="roles-user-pills">' + (rolePills || '<span style="color:var(--muted);font-size:10px">No roles</span>') + '</div>' +
                (canAssign
                    ? '  <div class="roles-user-picker" id="user-picker-' + safeId + '" style="display:none">' +
                      '    <div class="roles-picker-grid">' +
                      _adminRoleCheckboxesHTML(roles, assignedIds, e.discordId) +
                      '    </div>' +
                      '    <button class="admin-role-btn" style="margin-top:6px" data-click="adminCloseUserPicker" data-id="' + safeId + '">Done</button>' +
                      '  </div>'
                    : '') +
                '</td>' +
                (canAssign
                    ? '<td style="text-align:right;white-space:nowrap">' +
                      '<button class="admin-role-btn" data-click="adminEditUserRoles" data-id="' + safeId + '">Roles</button>' +
                      '<button class="admin-role-btn danger" data-click="adminRemoveUser" data-id="' + safeId + '">Remove</button>' +
                      '</td>'
                    : '') +
                '</tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<div class="empty" style="margin:16px 0">No users on the admin list.</div>';
    }

    body.innerHTML = html;
}

// Exported helpers for user section
export function adminShowAddUser()   {
    var f = document.getElementById('admin-add-user-form'); if (f) { f.style.display = ''; f.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}
export function adminHideAddUser()   { var f = document.getElementById('admin-add-user-form'); if (f) f.style.display = 'none'; }
export function adminEditUserRoles(el) {
    var id = el && el.dataset ? el.dataset.id : '';
    var picker = document.getElementById('user-picker-' + id);
    if (!picker) return;
    var isOpen = picker.style.display !== 'none';
    // Close all open pickers first
    document.querySelectorAll('.roles-user-picker').forEach(function (p) { p.style.display = 'none'; });
    if (!isOpen) picker.style.display = '';
}
export function adminCloseUserPicker(el) {
    var id = el && el.dataset ? el.dataset.id : '';
    var picker = document.getElementById('user-picker-' + id);
    if (picker) picker.style.display = 'none';
}

window._adminFilterUsers = function (query) {
    var q = (query || '').toLowerCase();
    document.querySelectorAll('#users-table .roles-row').forEach(function (row) {
        row.style.display = (!q || (row.dataset.name || '').indexOf(q) !== -1) ? '' : 'none';
    });
};

// Called by the inline oninput on the roles search box
window._adminFilterRoles = function (query) {
    var q = (query || '').toLowerCase();
    document.querySelectorAll('#roles-table .roles-row').forEach(function (row) {
        row.style.display = (!q || (row.dataset.name || '').indexOf(q) !== -1) ? '' : 'none';
    });
};

function _adminRoleCardViewHTML(role, enabledPerms, canManage) {
    var badge = role.superadminOnly
        ? '<span class="admin-role-badge superadmin-only" title="Can only be assigned by superadmins (rank 246+)">Superadmin Only</span>'
        : '';
    var html = '<div class="admin-role-card-header"><div class="admin-role-name">' + esc(role.name) + badge + '</div>';
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
    var isSA = AUTH && AUTH._adminPerms && AUTH._adminPerms.superadmin;
    roles.forEach(function (r) {
        var checked    = selectedIds.indexOf(r.id) > -1;
        var restricted = r.superadminOnly && !isSA;
        var onChange   = (isNew || restricted) ? '' : ' data-change="adminToggleUserRole" data-id="' + ea(discordId) + '"';
        var badge      = r.superadminOnly ? ' <span class="admin-role-badge superadmin-only" style="font-size:9px">SA Only</span>' : '';
        html += '<label class="admin-role-check' + (restricted ? ' admin-role-check-locked' : '') + '">' +
            '<input type="checkbox" value="' + esc(r.id) + '"' +
            (checked ? ' checked' : '') + (restricted ? ' disabled title="Superadmin only"' : '') + onChange + '> ' +
            esc(r.name) + badge + '</label>';
    });
    return html + '</div>';
}

export function adminEditRole(id) {
    var role = (_ADMIN.roles || []).find(function (r) { return r.id === id; });
    if (!role) return;

    // Toggle: if edit row already open, close it
    var existing = document.getElementById('admin-role-edit-row-' + id);
    if (existing) { existing.remove(); return; }

    // Close any other open edit rows
    document.querySelectorAll('[id^="admin-role-edit-row-"]').forEach(function (r) { r.remove(); });

    var roleRow = document.getElementById('admin-role-card-' + id);
    if (!roleRow) return;

    // Build a spanning edit row inserted directly after the role row
    var editRow = document.createElement('tr');
    editRow.id = 'admin-role-edit-row-' + id;
    editRow.className = 'roles-edit-row';
    var td = document.createElement('td');
    td.colSpan = 10;
    td.className = 'roles-edit-cell';
    td.innerHTML = '<div class="admin-role-edit-form">' +
        '<div class="admin-role-form-row">' +
        '<input id="admin-edit-role-name" class="admin-input" value="' + esc(role.name) + '" style="flex:1;min-width:0" placeholder="Role name">' +
        '<input id="admin-edit-role-color" class="admin-color-input" type="color" value="' + esc(role.color || '#7c4ab8') + '">' +
        '<label class="roles-sa-toggle"><input type="checkbox" id="admin-edit-role-saonly"' + (role.superadminOnly ? ' checked' : '') + '> SA only</label>' +
        '</div>' +
        _adminRenderPermToggles(role.permissions || {}) +
        '<div class="admin-role-form-row" style="margin-top:8px">' +
        '<button class="btn-dis-primary" style="flex:1;font-size:12px" data-click="adminSaveRole" data-id="' + esc(id) + '">Save Changes</button>' +
        '<button class="admin-role-btn" style="white-space:nowrap" data-click="adminCancelEditRole" data-id="' + esc(id) + '">Cancel</button>' +
        '</div></div>';
    editRow.appendChild(td);
    roleRow.parentNode.insertBefore(editRow, roleRow.nextSibling);

    // Live color preview
    var colorInput = td.querySelector('#admin-edit-role-color');
    if (colorInput) {
        colorInput.addEventListener('input', function () {
            var dot = roleRow.querySelector('.roles-color-dot');
            if (dot) dot.style.background = colorInput.value;
        });
    }
    var nameInput = td.querySelector('#admin-edit-role-name');
    if (nameInput) nameInput.focus();
}

export function adminCancelEditRole(id) {
    var editRow = document.getElementById('admin-role-edit-row-' + id);
    if (editRow) editRow.remove();
}

export function adminSaveRole(id) {
    var editRow = document.getElementById('admin-role-edit-row-' + id);
    if (!editRow) return;
    var nameInput  = editRow.querySelector('#admin-edit-role-name');
    var colorInput = editRow.querySelector('#admin-edit-role-color');
    var saInput    = editRow.querySelector('#admin-edit-role-saonly');
    var name  = nameInput  ? nameInput.value.trim()   : '';
    var color = colorInput ? colorInput.value         : '#7c4ab8';
    var saOnly = saInput ? saInput.checked : false;
    if (!name) { toast('Role name required', 'error'); return; }
    fetch('/api/admin/roles', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, name: name, color: color, superadminOnly: saOnly, permissions: _readPermToggles(editRow) })
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
    var e = document.getElementById('admin-new-role-expanded');
    if (e) e.style.display = '';
    var nameEl = document.getElementById('admin-new-role-name');
    if (nameEl) nameEl.focus();
}

export function adminCancelNewRole() {
    var e = document.getElementById('admin-new-role-expanded');
    if (e) e.style.display = 'none';
}

export function adminSaveNewRole() {
    var name     = ((document.getElementById('admin-new-role-name')  || {}).value || '').trim();
    var color    = (document.getElementById('admin-new-role-color')  || {}).value || '#7c4ab8';
    var saOnly   = !!(document.getElementById('admin-new-role-saonly') || {}).checked;
    if (!name) { toast('Role name required', 'error'); return; }
    var expanded = document.getElementById('admin-new-role-expanded');
    fetch('/api/admin/roles', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, color: color, superadminOnly: saOnly, permissions: expanded ? _readPermToggles(expanded) : {} })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Role created', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

// ── Discord Role Grants UI ─────────────────────────────────────

export function adminLoadDiscordGrants() {
    var area  = document.getElementById('discord-grants-area');
    var roles = _ADMIN.roles || [];
    if (!area) return;
    area.innerHTML = '<div class="obj-loading" style="padding:8px">Loading…</div>';

    fetch('/api/admin/roles?grants=1', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (grants) {
            var html = '';
            if (Array.isArray(grants) && grants.length) {
                html += '<div class="content-items-table" style="margin-bottom:12px"><table class="discord-grants-table"><thead><tr><th>Discord Role ID</th><th>Admin Role Template</th><th style="width:80px;text-align:right">Action</th></tr></thead><tbody>';
                grants.forEach(function (g) {
                    var role = roles.find(function (r) { return r.id === g.roleId; });
                    html += '<tr>' +
                        '<td><span class="discord-role-id-badge">' + esc(g.discordRoleId) + '</span></td>' +
                        '<td>' + (role ? '<span style="color:' + esc(role.color || '#7c4ab8') + '">' + esc(role.name) + '</span>' : '<span style="color:var(--muted)">Unknown role</span>') + '</td>' +
                        '<td style="text-align:right"><button class="admin-role-btn danger" data-click="adminRemoveDiscordGrant" data-rid="' + esc(g.discordRoleId) + '">Remove</button></td>' +
                        '</tr>';
                });
                html += '</tbody></table></div>';
            } else {
                html += '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">No grants configured.</div>';
            }

            var roleOptions = roles.map(function (r) {
                return '<option value="' + esc(r.id) + '" style="color:' + esc(r.color || '#7c4ab8') + '">' + esc(r.name) + '</option>';
            }).join('');

            html += '<div class="admin-role-form-row" style="flex-wrap:wrap;gap:8px">' +
                '<input id="discord-grant-role-id" class="admin-input" placeholder="Discord Role ID (17–20 digits)" style="width:200px">' +
                '<select id="discord-grant-tmpl" class="admin-input" style="flex:1">' +
                '<option value="">Select admin role template…</option>' + roleOptions + '</select>' +
                '<button class="btn-dis-primary" data-click="adminAddDiscordGrant" style="white-space:nowrap">Add Grant</button>' +
                '</div>';

            area.innerHTML = html;
        })
        .catch(function (err) { area.innerHTML = '<div class="obj-error">Failed: ' + esc(err.message) + '</div>'; });
}

export function adminAddDiscordGrant() {
    var discordRoleId = ((document.getElementById('discord-grant-role-id') || {}).value || '').trim();
    var roleId        = (document.getElementById('discord-grant-tmpl') || {}).value || '';
    if (!/^\d{17,20}$/.test(discordRoleId)) { toast('Enter a valid Discord Role ID (17–20 digits)', 'error'); return; }
    if (!roleId) { toast('Select a role template', 'error'); return; }
    fetch('/api/admin/roles', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: { discordRoleId, roleId } })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Grant added', 'success'); adminLoadDiscordGrants(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminRemoveDiscordGrant(el) {
    var rid = el && el.dataset ? el.dataset.rid : '';
    if (!rid || !confirm('Remove grant for Discord role ' + rid + '?')) return;
    fetch('/api/admin/roles', {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: { discordRoleId: rid } })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Grant removed', 'success'); adminLoadDiscordGrants(); }
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
// ─── Content admin tabs (Documents / Applications / Perm Groups) ─────────────

var _contentEndpoints = {
    'docs':        { url: '/api/admin/docs',        listLabel: 'Documents',         idField: 'id', nameField: 'title' },
    'apps':        { url: '/api/admin/apps',        listLabel: 'Applications',      idField: 'id', nameField: 'name'  },
    'perm-groups': { url: '/api/admin/perm-groups', listLabel: 'Permission Groups', idField: 'id', nameField: 'name'  }
};

function _adminRenderContent(type, body, isCurrent) {
    var meta = _contentEndpoints[type];
    if (!meta) { body.innerHTML = '<div class="obj-error">Unknown content type</div>'; return; }
    // Capture isCurrent in a local alias to ensure it survives Promise callbacks
    var checkCurrent = typeof isCurrent === 'function' ? isCurrent : function () { return true; };
    fetch(meta.url, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (items) {
            if (!checkCurrent()) return;
            if (items && items.error) throw new Error(items.error);
            _adminBuildContentUI(type, Array.isArray(items) ? items : [], body);
        })
        .catch(function (err) {
            if (!checkCurrent()) return;
            body.innerHTML = '<div class="obj-error">Failed to load: ' + esc(err.message) + '</div>';
        });
}

function _adminBuildContentUI(type, items, body) {
    var isDoc   = type === 'docs';
    var isApp   = type === 'apps';
    var isPG    = type === 'perm-groups';
    var title   = isDoc ? 'Documents' : isApp ? 'Applications' : 'Permission Groups';
    var addBtn  = '<button class="btn-dis-primary" style="white-space:nowrap" data-click="adminContentNew" data-ctype="' + esc(type) + '">+ New</button>';

    var html = '<div class="content-tab-header"><div class="admin-section-title">' + esc(title) + '</div>' + addBtn + '</div>';
    html += '<div id="content-form-area" style="display:none"></div>';

    if (!items.length) {
        html += '<div class="empty" style="margin:16px 0">None yet. Click "+ New" to create one.</div>';
    } else if (isDoc) {
        html += '<div class="content-items-table"><table style="width:100%;border-collapse:collapse">' +
            '<thead><tr><th>Title</th><th>Slug</th><th>Access</th><th style="width:100px;text-align:right">Actions</th></tr></thead><tbody>';
        items.forEach(function (d) {
            var access = d.public ? '<span class="admin-role-badge" style="background:rgba(74,156,114,.1);color:#4a9c72;border-color:rgba(74,156,114,.3)">Public</span>'
                : '<span class="admin-role-badge" style="background:rgba(200,164,74,.1);color:#c8a44a;border-color:rgba(200,164,74,.3)">' + (d.permGroupIds || []).length + ' group(s)</span>';
            html += '<tr class="content-row"><td>' + esc(d.title) + '</td><td style="color:var(--muted);font-size:11px">' + esc(d.slug) + '</td><td>' + access + '</td>' +
                '<td style="text-align:right;white-space:nowrap">' +
                '<button class="admin-role-btn" data-click="adminContentEdit" data-ctype="' + esc(type) + '" data-cid="' + esc(d.id) + '">Edit</button>' +
                '<button class="admin-role-btn danger" data-click="adminContentDelete" data-ctype="' + esc(type) + '" data-cid="' + esc(d.id) + '" data-cname="' + esc(d.title) + '">Delete</button>' +
                '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else if (isApp) {
        html += '<div class="content-items-table"><table style="width:100%;border-collapse:collapse">' +
            '<thead><tr><th>Name</th><th>Status</th><th>Questions</th><th style="width:100px;text-align:right">Actions</th></tr></thead><tbody>';
        items.forEach(function (a) {
            var badge = a.status === 'open'
                ? '<span class="admin-role-badge" style="background:rgba(74,156,114,.1);color:#4a9c72;border-color:rgba(74,156,114,.3)">Open</span>'
                : '<span class="admin-role-badge" style="background:rgba(224,82,82,.1);color:#e05252;border-color:rgba(224,82,82,.3)">Closed</span>';
            html += '<tr class="content-row"><td>' + esc(a.name) + '</td><td>' + badge + '</td>' +
                '<td style="color:var(--muted)">' + (a.questions || []).length + ' questions</td>' +
                '<td style="text-align:right;white-space:nowrap">' +
                '<button class="admin-role-btn" data-click="adminContentEdit" data-ctype="' + esc(type) + '" data-cid="' + esc(a.id) + '">Edit</button>' +
                '<button class="admin-role-btn danger" data-click="adminContentDelete" data-ctype="' + esc(type) + '" data-cid="' + esc(a.id) + '" data-cname="' + esc(a.name) + '">Delete</button>' +
                '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else if (isPG) {
        html += '<div class="content-items-table"><table style="width:100%;border-collapse:collapse">' +
            '<thead><tr><th>Name</th><th>Purpose</th><th>Members</th><th style="width:100px;text-align:right">Actions</th></tr></thead><tbody>';
        items.forEach(function (g) {
            html += '<tr class="content-row"><td>' + esc(g.name) + '</td>' +
                '<td style="color:var(--muted)">' + esc(g.purpose || '—') + '</td>' +
                '<td style="color:var(--muted)">' + (g.memberDiscordIds || []).length + '</td>' +
                '<td style="text-align:right;white-space:nowrap">' +
                '<button class="admin-role-btn" data-click="adminContentEdit" data-ctype="' + esc(type) + '" data-cid="' + esc(g.id) + '">Edit</button>' +
                '<button class="admin-role-btn danger" data-click="adminContentDelete" data-ctype="' + esc(type) + '" data-cid="' + esc(g.id) + '" data-cname="' + esc(g.name) + '">Delete</button>' +
                '</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    body.innerHTML = html;
    // Store items for edit lookups
    body._contentItems = items;
    body._contentType  = type;
}

// Store latest items for editor use
var _contentItems = [];
var _contentType  = '';

export function adminContentNew(el) {
    var type = el && el.dataset ? el.dataset.ctype : '';
    _contentType = type;
    var area = document.getElementById('content-form-area');
    if (!area) return;
    area.style.display = '';
    area.innerHTML = _buildContentForm(type, null);
}

export function adminContentEdit(el) {
    var type = el && el.dataset ? el.dataset.ctype : '';
    var id   = el && el.dataset ? el.dataset.cid   : '';
    _contentType = type;
    var body = document.getElementById('admin-body');
    var items = body && body._contentItems ? body._contentItems : [];
    var item  = items.find(function (x) { return x.id === id; });
    if (!item) return;
    var area = document.getElementById('content-form-area');
    if (!area) return;
    area.style.display = '';
    area.innerHTML = _buildContentForm(type, item);
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function adminContentDelete(el) {
    var type  = el && el.dataset ? el.dataset.ctype  : '';
    var id    = el && el.dataset ? el.dataset.cid    : '';
    var cname = el && el.dataset ? el.dataset.cname  : id;
    var meta  = _contentEndpoints[type];
    if (!meta || !id) return;
    if (!confirm('Delete "' + cname + '"? This cannot be undone.')) return;
    fetch(meta.url, {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Deleted', 'success'); _adminReloadContent(type); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminContentSave() {
    var type = _contentType;
    var meta = _contentEndpoints[type];
    if (!meta) return;
    var id = (document.getElementById('cf-id') || {}).value || '';
    var isEdit = !!id;
    var body = {};

    if (type === 'docs') {
        body.title   = ((document.getElementById('cf-title') || {}).value || '').trim();
        body.slug    = ((document.getElementById('cf-slug')  || {}).value || '').trim();
        var contentEl = document.getElementById('cf-content');
        body.content = contentEl ? contentEl.innerHTML : '';
        body.public  = !!(document.getElementById('cf-public') || {}).checked;
        var pgChips = document.querySelectorAll('.cf-pg-chip.on');
        body.permGroupIds = Array.from(pgChips).map(function (btn) { return btn.dataset.gid; });
        if (!body.title) { toast('Title required', 'error'); return; }
    } else if (type === 'apps') {
        body.name        = ((document.getElementById('cf-name')    || {}).value || '').trim();
        body.description = ((document.getElementById('cf-desc')    || {}).value || '').trim();
        body.status      = (document.getElementById('cf-status')   || {}).value || 'open';
        body.webhookUrl  = ((document.getElementById('cf-webhook') || {}).value || '').trim();
        body.webhookColor = parseInt(((document.getElementById('cf-wcolor') || {}).value || '').replace('#',''), 16) || 0x00C2E9;
        body.webhookMentions = ((document.getElementById('cf-wmentions') || {}).value || '').trim();
        body.reviewerGroupId = (document.getElementById('cf-reviewer') || {}).value || null;
        body.name        = ((document.getElementById('cf-name')    || {}).value || '').trim();
        // Tags
        var tagEls = document.querySelectorAll('.cf-tag[data-tag]');
        body.tags = Array.from(tagEls).map(function (el) { return el.dataset.tag; }).filter(Boolean);
        // Also check tag input
        var tagInp = (document.getElementById('cf-tag-inp') || {}).value || '';
        if (tagInp.trim()) body.tags.push(tagInp.trim());
        // Sections
        var sectionEls = document.querySelectorAll('.cf-section');
        body.sections = Array.from(sectionEls).map(function (sec, si) {
            var sid = sec.dataset.sid || ('s' + si);
            var nextEl = sec.querySelector('.cf-section-next');
            var qCards = sec.querySelectorAll('.cf-q-card');
            var questions = Array.from(qCards).map(function (card, i) {
                var qtype = (card.querySelector('.cf-q-type') || {}).value || 'text';
                var optInputs = card.querySelectorAll('.cf-q-opt-inp');
                var options = Array.from(optInputs).map(function (inp) { return inp.value.trim(); }).filter(Boolean);
                var minLen = parseInt((card.querySelector('.cf-q-minlen') || {}).value || '0', 10) || 0;
                var maxLen = parseInt((card.querySelector('.cf-q-maxlen') || {}).value || '0', 10) || 0;
                // Routing: per-option goTo
                var gotoEls = card.querySelectorAll('.cf-q-goto');
                var optionGoTos = {};
                Array.from(gotoEls).forEach(function (sel) { if (sel.value) optionGoTos[sel.dataset.opt] = sel.value; });
                return {
                    id:          card.dataset.qid || ('q' + (si * 100 + i + 1)),
                    label:       (card.querySelector('.cf-q-label')       || {}).value || '',
                    type:        qtype,
                    required:    !!(card.querySelector('.cf-q-req') || {}).checked,
                    placeholder: (card.querySelector('.cf-q-placeholder') || {}).value || '',
                    description: (card.querySelector('.cf-q-description') || {}).value || '',
                    options,
                    optionGoTos,
                    validation: {
                        minLen, maxLen,
                        pattern: (card.querySelector('.cf-q-pattern') || {}).value || '',
                        errMsg:  (card.querySelector('.cf-q-errmsg')  || {}).value || ''
                    }
                };
            }).filter(function (q) { return q.label; });
            return {
                id: sid,
                title:       (sec.querySelector('.cf-section-title-inp') || {}).value || '',
                description: (sec.querySelector('.cf-section-desc-inp')  || {}).value || '',
                nextSection: nextEl ? nextEl.value : 'submit',
                questions
            };
        });
        if (!body.name) { toast('Name required', 'error'); return; }
    } else if (type === 'perm-groups') {
        body.name    = ((document.getElementById('cf-name')    || {}).value || '').trim();
        body.purpose = (document.getElementById('cf-purpose')  || {}).value || 'general';
        // roleId: empty string means clear it (null), otherwise pass the selected role id
        var pgRoleVal = (document.getElementById('cf-pg-role') || {}).value || '';
        body.roleId = pgRoleVal || null;
        if (isEdit) {
            var addStr = ((document.getElementById('cf-addids') || {}).value || '');
            body.addIds = addStr.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var addRoleStr = ((document.getElementById('cf-addRoleIds') || {}).value || '').trim();
            if (addRoleStr) body.addRoleIds = [addRoleStr];
        } else {
            var addStr2 = ((document.getElementById('cf-addids') || {}).value || '');
            body.addIds = addStr2.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var addRoleStr2 = ((document.getElementById('cf-addRoleIds') || {}).value || '').trim();
            if (addRoleStr2) body.addRoleIds = [addRoleStr2];
        }
        if (!body.name) { toast('Name required', 'error'); return; }
    }

    if (isEdit) body.id = id;
    fetch(meta.url, {
        method: isEdit ? 'PATCH' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            toast(isEdit ? 'Saved' : 'Created', 'success');
            document.getElementById('content-form-area').style.display = 'none';
            _adminReloadContent(type);
        }).catch(function (err) { toast('Error: ' + err.message, 'error'); });
}

export function adminContentCancel() {
    var area = document.getElementById('content-form-area');
    if (area) area.style.display = 'none';
}

export function adminContentAddQuestion(el) {
    // Find the questions list inside the button's nearest section, or fall back to first list
    var btn  = el;
    var sec  = btn ? btn.closest('.cf-section') : null;
    var list = sec ? sec.querySelector('.cf-questions-list') : document.querySelector('.cf-questions-list');
    if (!list) return;
    var qtype   = (el && el.dataset ? el.dataset.qtype : null) || 'text';
    var idx     = list.querySelectorAll('.cf-q-card').length;
    var secId   = sec ? sec.dataset.sid : null;
    var allSecs = _getAllSectionStubs();
    var card    = document.createElement('div');
    card.innerHTML = _questionCardHTML({ id: 'q' + Date.now().toString(36), label: '', type: qtype, required: false, options: [] }, idx, allSecs, secId);
    list.appendChild(card.firstElementChild);
    var newCard = list.lastElementChild;
    if (newCard) { var inp = newCard.querySelector('.cf-q-label'); if (inp) inp.focus(); }
    _cfqRenumber(list);
}

// Returns a lightweight stub array of all current sections for routing dropdowns
function _getAllSectionStubs() {
    var secs = document.querySelectorAll('.cf-section');
    return Array.from(secs).map(function (s, i) {
        var titleInp = s.querySelector('.cf-section-title-inp');
        return { id: s.dataset.sid || ('s' + i), title: titleInp ? titleInp.value : '' };
    });
}

export function cfAddSection() {
    var list = document.getElementById('cf-sections-list');
    if (!list) return;
    var allSecs = _getAllSectionStubs();
    var idx = allSecs.length;
    var newId = 's' + Date.now().toString(36);
    var newSec = { id: newId, title: '', description: '', nextSection: 'submit', questions: [] };
    allSecs.push({ id: newId, title: '' });
    var wrapper = document.createElement('div');
    wrapper.innerHTML = _sectionHTML(newSec, idx, allSecs);
    list.appendChild(wrapper.firstElementChild);
    var inp = list.lastElementChild.querySelector('.cf-section-title-inp');
    if (inp) inp.focus();
    _cfUpdateSectionNumbers();
}

export function cfRemoveSection(el) {
    var sec = el && el.closest ? el.closest('.cf-section') : null;
    var list = document.getElementById('cf-sections-list');
    if (!sec || !list) return;
    var count = list.querySelectorAll('.cf-section').length;
    if (count <= 1) { toast('An application must have at least one section.', 'error'); return; }
    if (!confirm('Remove this section and all its questions?')) return;
    sec.remove();
    _cfUpdateSectionNumbers();
}

export function cfSectionFold(el) {
    var sec = el && el.closest ? el.closest('.cf-section') : null;
    if (!sec) return;
    sec.classList.toggle('cf-section-collapsed');
    el.textContent = sec.classList.contains('cf-section-collapsed') ? '▸' : '▾';
}

function _cfUpdateSectionNumbers() {
    document.querySelectorAll('.cf-section').forEach(function (sec, i) {
        var badge = sec.querySelector('.cf-section-badge');
        if (badge) badge.textContent = 'Section ' + (i + 1);
        var inp = sec.querySelector('.cf-section-title-inp');
        if (inp && !inp.value) inp.placeholder = 'Section ' + (i + 1) + ' title (optional)';
    });
}

export function cfQFold(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card) return;
    card.classList.toggle('cf-q-folded');
    el.textContent = card.classList.contains('cf-q-folded') ? 'Expand ↓' : 'Fold ↑';
}

export function cfTagAdd() {
    var inp  = document.getElementById('cf-tag-inp');
    var list = document.getElementById('cf-tags-list');
    if (!inp || !list) return;
    var tag = inp.value.trim();
    if (!tag) return;
    var span = document.createElement('span');
    span.className = 'cf-tag';
    span.dataset.tag = tag;
    span.innerHTML = esc(tag) + '<button type="button" class="cf-tag-rm" data-click="cfTagRemove" data-tag="' + esc(tag) + '">×</button>';
    list.appendChild(span);
    inp.value = '';
    inp.focus();
}

export function cfTagRemove(el) {
    var tag = el && el.dataset ? el.dataset.tag : '';
    var list = document.getElementById('cf-tags-list');
    if (!list || !tag) return;
    var el2 = list.querySelector('.cf-tag[data-tag="' + tag + '"]');
    if (el2) el2.remove();
}

export function cfColorPreview(el) {
    var tag = document.querySelector('.cf-tag-color');
    if (!tag || !el) return;
    var v = el.value;
    tag.style.background = v + '20'; tag.style.borderColor = v + '50'; tag.style.color = v; tag.textContent = v;
}

export function adminContentRemoveQuestion(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card) return;
    var list = card.parentNode;
    card.remove();
    if (list) _cfqRenumber(list);
}

function _cfqRenumber(list) {
    list.querySelectorAll('.cf-q-card').forEach(function (card, i) {
        var num = card.querySelector('.cf-q-num');
        if (num) num.textContent = i + 1;
    });
}

export function cfQMoveUp(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card || !card.previousElementSibling) return;
    card.parentNode.insertBefore(card, card.previousElementSibling);
    _cfqRenumber(card.parentNode);
}

export function cfQMoveDown(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card || !card.nextElementSibling) return;
    card.parentNode.insertBefore(card.nextElementSibling, card);
    _cfqRenumber(card.parentNode);
}

export function cfQTypeChange(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card) return;
    var type    = el.value;
    var hasOpts = type === 'select' || type === 'radio' || type === 'checkbox';
    var optsArea = card.querySelector('.cf-q-opts-area');
    if (optsArea) optsArea.classList.toggle('hidden', !hasOpts);
}

export function cfQAddOption(el) {
    var card = el && el.closest ? el.closest('.cf-q-card') : null;
    if (!card) return;
    var list = card.querySelector('.cf-q-opts-list');
    if (!list) return;
    var count = list.querySelectorAll('.cf-q-opt-row').length;
    var row = document.createElement('div');
    row.className = 'cf-q-opt-row';
    row.innerHTML =
        '<span class="cf-q-opt-drag">⋮⋮</span>' +
        '<input class="cf-q-opt-inp admin-input" value="" placeholder="Option ' + (count + 1) + '">' +
        '<button type="button" class="cf-q-opt-rm" data-click="cfQRemoveOption" title="Remove">×</button>';
    list.appendChild(row);
    var inp = row.querySelector('.cf-q-opt-inp');
    if (inp) inp.focus();
}

export function cfQRemoveOption(el) {
    var row = el && el.closest ? el.closest('.cf-q-opt-row') : null;
    if (row) row.remove();
}

export function cfPGToggle(el) {
    if (el) el.classList.toggle('on');
}

export function adminContentRemovePGRole(el) {
    var rid = el && el.dataset ? el.dataset.rid : '';
    var gid = el && el.dataset ? el.dataset.gid : '';
    if (!rid || !gid) return;
    fetch('/api/admin/perm-groups', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gid, removeRoleIds: [rid] })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Discord role removed from group', 'success'); _adminReloadContent('perm-groups'); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

export function adminPGRemoveMember(el) {
    var id   = el && el.dataset ? el.dataset.mid  : '';
    var gid  = el && el.dataset ? el.dataset.gid  : '';
    if (!id || !gid) return;
    fetch('/api/admin/perm-groups', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gid, removeIds: [id] })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Member removed', 'success'); _adminReloadContent('perm-groups'); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

function _adminReloadContent(type) {
    var body = document.getElementById('admin-body');
    if (body && _ADMIN.tab === (type === 'docs' ? 'documents' : type === 'apps' ? 'appdefs' : 'permgroups')) {
        body.innerHTML = '<div class="obj-loading">Loading…</div>';
        _adminRenderContent(type, body, function () { return true; });
    }
}

// ── Doc editor toolbar SVG icons ─────────────────────────────
var _DOC_TB = {
    bold:   '<b style="font-size:12px">B</b>',
    italic: '<i style="font-size:12px">I</i>',
    under:  '<u style="font-size:12px">U</u>',
    strike: '<s style="font-size:12px">S</s>',
    ul:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>',
    ol:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" font-size="7" fill="currentColor" stroke="none">1.</text><text x="2" y="14" font-size="7" fill="currentColor" stroke="none">2.</text><text x="2" y="20" font-size="7" fill="currentColor" stroke="none">3.</text></svg>',
    quote:  '❝',
    code:   '&lt;/&gt;',
    hr:     '—',
    link:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
};

function _docToolbar() {
    function btn(cmd, icon, title, val) {
        return '<button class="doc-tb-btn" data-mousedown="docCmd" data-cmd="' + cmd + '"' +
            (val ? ' data-val="' + esc(val) + '"' : '') + ' title="' + esc(title) + '">' + icon + '</button>';
    }
    return '<div class="doc-toolbar">' +
        '<select class="doc-tb-sel" data-change="docFmtBlock">' +
        '<option value="p">Normal</option>' +
        '<option value="h1">Heading 1</option>' +
        '<option value="h2">Heading 2</option>' +
        '<option value="h3">Heading 3</option>' +
        '</select>' +
        '<div class="doc-tb-sep"></div>' +
        btn('bold',             _DOC_TB.bold,   'Bold (Ctrl+B)') +
        btn('italic',           _DOC_TB.italic, 'Italic (Ctrl+I)') +
        btn('underline',        _DOC_TB.under,  'Underline (Ctrl+U)') +
        btn('strikeThrough',    _DOC_TB.strike, 'Strikethrough') +
        '<div class="doc-tb-sep"></div>' +
        btn('insertUnorderedList', _DOC_TB.ul,  'Bullet list') +
        btn('insertOrderedList',   _DOC_TB.ol,  'Numbered list') +
        '<div class="doc-tb-sep"></div>' +
        btn('formatBlock', _DOC_TB.quote, 'Blockquote', 'blockquote') +
        btn('formatBlock', _DOC_TB.code,  'Code block',  'pre') +
        btn('insertHorizontalRule', _DOC_TB.hr, 'Horizontal rule') +
        '<div class="doc-tb-sep"></div>' +
        btn('createLink', _DOC_TB.link, 'Insert link') +
        '<div class="doc-tb-sep"></div>' +
        '<select id="doc-template-variant" class="doc-tb-sel" title="Document variant">' +
        '<option value="standard">Standard</option>' +
        '<option value="ghost">Ghost Division</option>' +
        '<option value="progression">Progression</option>' +
        '<option value="welfare">Welfare</option>' +
        '<option value="librarium">Librarium</option>' +
        '<option value="internal-affairs">Internal Affairs</option>' +
        '</select>' +
        '<button class="doc-tb-btn doc-tb-tnic" data-click="docInsertTemplate" title="Insert TNIC document template">📄 Template</button>' +
        '</div>';
}

function _buildContentForm(type, item) {
    var isEdit = !!item;
    var html   = '<div class="content-form-panel">' +
        '<div class="cf-panel-header">' +
        '<div class="cf-panel-title">' + (isEdit ? 'Edit' : 'New') + ' ' +
        (type === 'docs' ? 'Document' : type === 'apps' ? 'Application' : 'Permission Group') + '</div>' +
        '</div>' +
        (isEdit ? '<input type="hidden" id="cf-id" value="' + esc(item.id) + '">' : '');

    if (type === 'docs') {
        html +=
            '<div class="cf-meta-row">' +
            '<div class="cf-field"><label class="cf-label">Title</label>' +
            '<input id="cf-title" class="admin-input" value="' + esc(item ? item.title : '') + '" placeholder="Document title" autocomplete="off"></div>' +
            '<div class="cf-field cf-field-sm"><label class="cf-label">Slug</label>' +
            '<input id="cf-slug" class="admin-input" value="' + esc(item ? item.slug : '') + '" placeholder="auto-generated"></div>' +
            '</div>' +
            '<div class="cf-field cf-field-inline">' +
            '<label class="cf-toggle"><input type="checkbox" id="cf-public"' + (item && item.public ? ' checked' : '') + '>' +
            '<span class="cf-toggle-label">Public — visible to all division members</span></label></div>' +
            '<div class="cf-field"><label class="cf-label">Access Groups</label>' +
            '<div id="cf-pg-area" class="cf-pg-chips"><span class="cf-loading-txt">Loading groups…</span></div></div>' +
            '<div class="cf-field cf-field-grow"><label class="cf-label">Content</label>' +
            _docToolbar() +
            '<div class="doc-editor-wrap">' +
            '<div id="cf-content" class="doc-editor" contenteditable="true" spellcheck="true">' +
            (item ? (item.content || '') : '') +
            '</div></div></div>';

        setTimeout(function () {
            fetch('/api/admin/perm-groups', { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (groups) {
                    var area = document.getElementById('cf-pg-area');
                    if (!area || !Array.isArray(groups)) return;
                    if (!groups.length) { area.innerHTML = '<span class="cf-loading-txt">No groups yet.</span>'; return; }
                    var assigned = item ? (item.permGroupIds || []) : [];
                    area.innerHTML = groups.map(function (g) {
                        var on = assigned.indexOf(g.id) > -1;
                        return '<button type="button" class="cf-pg-chip' + (on ? ' on' : '') + '" data-click="cfPGToggle" data-gid="' + esc(g.id) + '">' + esc(g.name) + '</button>';
                    }).join('');
                }).catch(function () {});
        }, 0);

    } else if (type === 'apps') {
        // Normalise: use sections if available, else wrap flat questions in one section
        var rawSections = item && Array.isArray(item.sections) && item.sections.length
            ? item.sections
            : [{ id: 's0', title: '', description: '', nextSection: 'submit',
                 questions: item ? (item.questions || []) : [] }];
        var existingTags = item ? (item.tags || []) : [];
        var colorHex = item && item.webhookColor
            ? '#' + item.webhookColor.toString(16).padStart(6, '0') : '#00c2e9';

        html +=
            // ── Name / Status / Tags
            '<div class="cf-meta-row">' +
            '<div class="cf-field"><label class="cf-label">Application Name</label>' +
            '<input id="cf-name" class="admin-input" value="' + esc(item ? item.name : '') + '" placeholder="e.g. Operator Application" autocomplete="off"></div>' +
            '<div class="cf-field cf-field-sm"><label class="cf-label">Status</label>' +
            '<select id="cf-status" class="admin-input">' +
            '<option value="open"' + (!item || item.status === 'open' ? ' selected' : '') + '>Open</option>' +
            '<option value="closed"' + (item && item.status === 'closed' ? ' selected' : '') + '>Closed</option>' +
            '</select></div></div>' +

            '<div class="cf-field" style="padding:8px 20px 0"><label class="cf-label">Description <span class="cf-optional">(shown to applicants)</span></label>' +
            '<input id="cf-desc" class="admin-input" value="' + esc(item ? (item.description || '') : '') + '" placeholder="Brief description of this application"></div>' +

            '<div class="cf-field" style="padding:8px 20px 0"><label class="cf-label">Tags' +
            '<span class="cf-optional"> — e.g. Progression, Welfare, Officer Corps</span></label>' +
            '<div class="cf-tags-wrap">' +
            '<div class="cf-tags-list" id="cf-tags-list">' +
            existingTags.map(function (t) {
                return '<span class="cf-tag">' + esc(t) +
                    '<button type="button" class="cf-tag-rm" data-click="cfTagRemove" data-tag="' + esc(t) + '">×</button></span>';
            }).join('') +
            '</div>' +
            '<input id="cf-tag-inp" class="admin-input cf-tag-inp" placeholder="Add tag…">' +
            '<button type="button" class="cf-q-opt-add" style="width:auto;padding:4px 12px" data-click="cfTagAdd">+ Add</button>' +
            '</div></div>' +

            // ── Webhook & Reviewer (collapsed)
            '<details class="cf-details"><summary class="cf-details-sum">Webhook &amp; Reviewer Settings</summary>' +
            '<div class="cf-meta-row" style="margin-top:10px">' +
            '<div class="cf-field"><label class="cf-label">Reviewer Group</label>' +
            '<select id="cf-reviewer" class="admin-input"><option value="">— No reviewer group —</option></select></div>' +
            '<div class="cf-field"><label class="cf-label">Webhook URL</label>' +
            '<input id="cf-webhook" class="admin-input" value="' + esc(item ? (item.webhookUrl || '') : '') + '" placeholder="https://discord.com/api/webhooks/…"></div></div>' +
            '<div class="cf-meta-row">' +
            '<div class="cf-field cf-field-sm"><label class="cf-label">Embed Color' +
            '<span class="cf-tag cf-tag-color" style="background:' + colorHex + '20;border-color:' + colorHex + '50;color:' + colorHex + ';margin-left:6px">' + colorHex + '</span></label>' +
            '<input id="cf-wcolor" class="admin-color-input" type="color" value="' + esc(colorHex) + '" data-change="cfColorPreview"></div>' +
            '<div class="cf-field"><label class="cf-label">Mention Roles/Users</label>' +
            '<input id="cf-wmentions" class="admin-input" value="' + esc(item ? (item.webhookMentions || '') : '<@&1170401285435039764><@&1075785656502071437>') + '"></div>' +
            '</div></details>' +

            // ── Sections
            '<div class="cf-field" style="padding:12px 20px 0"><label class="cf-label">Form Sections</label>' +
            '<div id="cf-sections-list" class="cf-sections-list">' +
            rawSections.map(function (sec, si) { return _sectionHTML(sec, si, rawSections); }).join('') +
            '</div>' +
            '<button type="button" class="cf-add-section-btn" data-click="cfAddSection">+ Add Section</button>' +
            '</div>';

        setTimeout(function () {
            fetch('/api/admin/perm-groups', { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (groups) {
                    var sel = document.getElementById('cf-reviewer');
                    if (!sel || !Array.isArray(groups)) return;
                    var cur = item ? (item.reviewerGroupId || '') : '';
                    groups.forEach(function (g) {
                        var opt = document.createElement('option');
                        opt.value = g.id; opt.textContent = g.name;
                        if (g.id === cur) opt.selected = true;
                        sel.appendChild(opt);
                    });
                }).catch(function () {});
            // Wire color preview
            var wcolor = document.getElementById('cf-wcolor');
            if (wcolor) wcolor.addEventListener('input', function () {
                var tag = document.querySelector('.cf-tag-color');
                if (tag) { tag.style.background = wcolor.value + '20'; tag.style.borderColor = wcolor.value + '50'; tag.style.color = wcolor.value; tag.textContent = wcolor.value; }
            });
        }, 0);

    } else if (type === 'perm-groups') {
        var members = item ? (item.memberDiscordIds || []) : [];
        var availableRoles = _ADMIN.roles || [];
        html +=
            '<div class="cf-meta-row">' +
            '<div class="cf-field"><label class="cf-label">Group Name</label>' +
            '<input id="cf-name" class="admin-input" value="' + esc(item ? item.name : '') + '" placeholder="e.g. Officers Group"></div>' +
            '<div class="cf-field cf-field-sm"><label class="cf-label">Purpose</label>' +
            '<select id="cf-purpose" class="admin-input">' +
            ['general','docs','apps'].map(function (p) {
                return '<option value="' + p + '"' + (item && item.purpose === p ? ' selected' : '') + '>' +
                    (p === 'general' ? 'General' : p === 'docs' ? 'Document Access' : 'App Reviewer') + '</option>';
            }).join('') +
            '</select></div></div>';

        // Role assignment — grants all permissions from the chosen role template to group members
        html += '<div class="cf-field"><label class="cf-label">Assigned Role' +
            '<span class="cf-optional"> — group members inherit all permissions from this role</span></label>' +
            '<select id="cf-pg-role" class="admin-input">' +
            '<option value="">— No role —</option>' +
            availableRoles.map(function (r) {
                var sel = item && item.roleId === r.id ? ' selected' : '';
                return '<option value="' + esc(r.id) + '"' + sel + '>' + esc(r.name) + '</option>';
            }).join('') +
            '</select></div>';

        if (isEdit && members.length) {
            html += '<div class="cf-field"><label class="cf-label">Current Members</label>' +
                '<div class="pg-member-list">' + members.map(function (did) {
                    return '<div class="pg-member-row"><code class="pg-member-id">' + esc(did) + '</code>' +
                        '<button class="admin-role-btn danger" style="padding:2px 8px;font-size:10px" ' +
                        'data-click="adminPGRemoveMember" data-mid="' + esc(did) + '" data-gid="' + esc(item.id) + '">Remove</button></div>';
                }).join('') + '</div></div>';
        }

        html += '<div class="cf-field"><label class="cf-label">' +
            (isEdit ? 'Add Discord User IDs' : 'Discord User IDs') +
            '<span class="cf-optional"> — one per line or comma-separated</span></label>' +
            '<textarea id="cf-addids" class="admin-input" rows="3" placeholder="123456789012345678&#10;987654321098765432"></textarea></div>';

        var existingRoleIds = item ? (item.discordRoleIds || []) : [];
        html += '<div class="cf-field"><label class="cf-label">Discord Role IDs <span class="cf-optional">(anyone with these roles gets group access)</span></label>';
        if (isEdit && existingRoleIds.length) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">' +
                existingRoleIds.map(function (rid) {
                    return '<span class="discord-role-id-badge">' + esc(rid) +
                        '<button type="button" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 2px;font-size:10px;margin-left:4px" ' +
                        'data-click="adminContentRemovePGRole" data-rid="' + esc(rid) + '" data-gid="' + esc(item ? item.id : '') + '">×</button></span>';
                }).join('') + '</div>';
        }
        html += '<input id="cf-addRoleIds" class="admin-input" placeholder="Discord Role ID"></div>';
    }

    html += '<div class="cf-actions">' +
        '<button class="btn-dis-primary" data-click="adminContentSave">Save</button>' +
        '<button class="admin-role-btn" data-click="adminContentCancel">Cancel</button>' +
        '</div></div>';
    return html;
}

// ── Section HTML for app builder ─────────────────────────────
function _sectionHTML(sec, idx, allSections) {
    var qHtml = (sec.questions || []).map(function (q, qi) {
        return _questionCardHTML(q, qi, allSections, sec.id);
    }).join('');
    // "Next section" options
    var nextOpts = allSections.map(function (s, si) {
        var label = s.title ? s.title : ('Section ' + (si + 1));
        var sel = sec.nextSection === s.id ? ' selected' : '';
        return '<option value="' + esc(s.id) + '"' + sel + '>' + esc(label) + '</option>';
    }).join('');
    var isSubmit = !sec.nextSection || sec.nextSection === 'submit';

    return '<div class="cf-section" data-sid="' + esc(sec.id || ('s' + idx)) + '">' +
        '<div class="cf-section-header">' +
        '<button type="button" class="cf-section-fold-btn" data-click="cfSectionFold" title="Collapse section">▾</button>' +
        '<input class="cf-section-title-inp admin-input" value="' + esc(sec.title || '') + '" placeholder="Section ' + (idx + 1) + ' title (optional)">' +
        '<div class="cf-section-header-right">' +
        '<span class="cf-section-badge">Section ' + (idx + 1) + '</span>' +
        '<button type="button" class="cf-q-act cf-q-act-del" data-click="cfRemoveSection" title="Remove section">🗑</button>' +
        '</div></div>' +
        '<div class="cf-section-body">' +
        (sec.description !== undefined
            ? '<input class="cf-section-desc-inp admin-input" value="' + esc(sec.description || '') + '" placeholder="Section description (optional)" style="margin:0 12px 10px;width:calc(100% - 24px)">'
            : '') +
        '<div class="cf-questions-list">' + qHtml + '</div>' +
        '<div class="cf-section-footer">' +
        '<div class="cf-qs-types" data-section="' + esc(sec.id || ('s' + idx)) + '">' +
        ['Short answer','Paragraph','Multiple choice','Checkboxes','Dropdown'].map(function (t, i) {
            var vals = ['text','textarea','radio','checkbox','select'];
            return '<button type="button" class="cf-add-q-btn" data-click="adminContentAddQuestion" data-qtype="' + vals[i] + '">+ ' + t + '</button>';
        }).join('') +
        '</div>' +
        '<div class="cf-section-next-row">' +
        '<label class="cf-label" style="font-size:10px;margin:0 6px 0 0">After this section:</label>' +
        '<select class="cf-section-next admin-input">' +
        '<option value="submit"' + (isSubmit ? ' selected' : '') + '>Submit form</option>' +
        nextOpts +
        '</select></div></div></div></div>';
}

// ── Question card (Google Forms–style) ────────────────────────
var _Q_TYPE_LABELS = {
    text:     'Short answer',
    textarea: 'Paragraph',
    radio:    'Multiple choice',
    checkbox: 'Checkboxes',
    select:   'Dropdown'
};

function _questionCardHTML(q, idx, allSections, sectionId) {
    var type    = q.type || 'text';
    var hasOpts = type === 'select' || type === 'radio' || type === 'checkbox';
    var opts    = Array.isArray(q.options) ? q.options : [];
    var val     = q.validation || {};
    var qid     = q.id || ('q' + (idx + 1));

    var optRows = opts.map(function (o, i) {
        return '<div class="cf-q-opt-row">' +
            '<span class="cf-q-opt-drag">⋮⋮</span>' +
            '<input class="cf-q-opt-inp admin-input" value="' + esc(o) + '" placeholder="Option ' + (i + 1) + '">' +
            '<button type="button" class="cf-q-opt-rm" data-click="cfQRemoveOption" title="Remove option">×</button>' +
            '</div>';
    }).join('');

    return '<div class="cf-q-card" data-qid="' + esc(qid) + '">' +

        // ── Top row: number + question text + type
        '<div class="cf-q-card-top">' +
        '<span class="cf-q-num">' + (idx + 1) + '</span>' +
        '<input class="cf-q-label admin-input" placeholder="Question *" value="' + esc(q.label || '') + '" title="Question text">' +
        '<select class="cf-q-type admin-input" data-change="cfQTypeChange" title="Question type">' +
        Object.keys(_Q_TYPE_LABELS).map(function (k) {
            return '<option value="' + k + '"' + (type === k ? ' selected' : '') + '>' + _Q_TYPE_LABELS[k] + '</option>';
        }).join('') +
        '</select>' +
        // Action buttons — prominent
        '<div class="cf-q-actions">' +
        '<button type="button" class="cf-q-act cf-q-act-up"   data-click="cfQMoveUp"   title="Move up">↑</button>' +
        '<button type="button" class="cf-q-act cf-q-act-dn"   data-click="cfQMoveDown" title="Move down">↓</button>' +
        '<button type="button" class="cf-q-act cf-q-act-del"  data-click="adminContentRemoveQuestion" title="Delete question">🗑</button>' +
        '</div>' +
        '</div>' +

        // ── Placeholder + Description
        '<div class="cf-q-meta-row">' +
        '<input class="cf-q-placeholder admin-input" placeholder="Placeholder text (shown in empty input)" value="' + esc(q.placeholder || '') + '">' +
        '<input class="cf-q-description admin-input" placeholder="Helper text shown below the question" value="' + esc(q.description || '') + '">' +
        '</div>' +

        // ── Options editor (radio / checkbox / select) — no placeholder shown on MCQ/checkbox
        '<div class="cf-q-opts-area' + (hasOpts ? '' : ' hidden') + '">' +
        '<div class="cf-q-opts-list">' + optRows + '</div>' +
        '<button type="button" class="cf-q-opt-add" data-click="cfQAddOption">+ Add option</button>' +
        '</div>' +

        // ── Section routing (MCQ / dropdown only, only when in a section context)
        (hasOpts && allSections && allSections.length > 1
            ? (function () {
                var goTos = q.optionGoTos || {};
                var secOpts = allSections.map(function (s, si) {
                    return '<option value="' + esc(s.id) + '">' + esc(s.title || ('Section ' + (si + 1))) + '</option>';
                }).join('');
                var optRouteRows = opts.map(function (o) {
                    var cur = goTos[o] || '';
                    return '<div class="cf-q-route-row">' +
                        '<span class="cf-q-route-opt">' + esc(o) + '</span>' +
                        '<span class="cf-q-route-arrow">→</span>' +
                        '<select class="cf-q-goto admin-input" data-opt="' + esc(o) + '">' +
                        '<option value="">Default (next section)</option>' +
                        '<option value="submit"' + (cur === 'submit' ? ' selected' : '') + '>Submit form</option>' +
                        secOpts.replace('value="' + esc(sectionId) + '"', 'value="' + esc(sectionId) + '" disabled') +
                        '</select></div>';
                }).join('');
                return '<details class="cf-q-routing' + (Object.keys(goTos).length ? ' open-by-default' : '') + '">' +
                    '<summary class="cf-q-val-sum">Section routing <span class="cf-optional">(optional)</span></summary>' +
                    '<div class="cf-q-route-list">' + (opts.length ? optRouteRows : '<span class="cf-loading-txt">Add options above first.</span>') + '</div>' +
                    '</details>';
            })()
            : '') +

        // ── Validation (collapsible)
        '<details class="cf-q-validation">' +
        '<summary class="cf-q-val-sum">Validation <span class="cf-optional">(optional)</span></summary>' +
        '<div class="cf-q-val-grid">' +
        '<label class="cf-q-val-label">Min length' +
        '<input type="number" class="cf-q-minlen admin-input" min="0" value="' + esc(String(val.minLen || 0)) + '" placeholder="0"></label>' +
        '<label class="cf-q-val-label">Max length' +
        '<input type="number" class="cf-q-maxlen admin-input" min="0" value="' + esc(String(val.maxLen || 0)) + '" placeholder="0 = no limit"></label>' +
        '<label class="cf-q-val-label" style="grid-column:1/-1">Pattern (regex)' +
        '<input class="cf-q-pattern admin-input" value="' + esc(val.pattern || '') + '" placeholder="e.g. ^[A-Za-z]+$"></label>' +
        '<label class="cf-q-val-label" style="grid-column:1/-1">Validation error message' +
        '<input class="cf-q-errmsg admin-input" value="' + esc(val.errMsg || '') + '" placeholder="Please enter a valid response."></label>' +
        '</div>' +
        '</details>' +

        // ── Footer: required toggle + fold toggle
        '<div class="cf-q-card-foot">' +
        '<label class="cf-req-toggle">' +
        '<input type="checkbox" class="cf-q-req"' + (q.required ? ' checked' : '') + '>' +
        '<span>Required</span>' +
        '</label>' +
        '<button type="button" class="cf-q-fold-btn" data-click="cfQFold" title="Collapse question">Fold ↑</button>' +
        '</div>' +

        '</div>';
}

function _cfqPreview(type) {
    if (type === 'text')     return '<input class="cf-q-preview-input" disabled placeholder="Short answer…">';
    if (type === 'textarea') return '<textarea class="cf-q-preview-ta" disabled rows="2" placeholder="Long answer…"></textarea>';
    if (type === 'radio')    return '<div class="cf-q-preview-opts"><label><input type="radio" disabled> Option 1</label><label><input type="radio" disabled> Option 2</label></div>';
    if (type === 'checkbox') return '<div class="cf-q-preview-opts"><label><input type="checkbox" disabled> Option 1</label><label><input type="checkbox" disabled> Option 2</label></div>';
    if (type === 'select')   return '<select class="cf-q-preview-input" disabled><option>Dropdown…</option></select>';
    return '';
}

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
