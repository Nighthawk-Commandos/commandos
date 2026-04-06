// ═══════════════════════════════════════════════════════════════
//  render.js — read-only page renderers + shared DOM helpers
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── CSS class maps (colours live in styles.css) ───────────────
var RANK_CLASSES = {
    'Probationary Trooper':'rk-prob','Commando':'rk-commando','Sentinel':'rk-sentinel',
    'Infiltrator':'rk-infiltrator','Operative':'rk-operative','Specialist':'rk-specialist',
    'Prestige':'rk-prestige','Nighthawk Nine':'rk-nighthawk',
    'Interim Warrant Officer':'rk-iwo','Warrant Officer':'rk-wo',
    'Chief Warrant Officer':'rk-cwo','Captain':'rk-captain',
    'Commandant':'rk-commandant','Developer':'rk-developer','Advisor':'rk-advisor',
    'Deputy Director':'rk-dd','Director':'rk-director'
};
var DEPT_CLASSES = {
    'GHOSTS':'dp-ghosts','PROGRESSION':'dp-prog','WELFARE':'dp-welfare',
    'INTERNAL AFFAIRS':'dp-ia','LIBRARIUM':'dp-lib',
    'Ghosts':'dp-ghosts','Progression':'dp-prog','Welfare':'dp-welfare',
    'Internal Affairs':'dp-ia','Librarium':'dp-lib'
};
// Department colours mirror the CSS dept-head-name colours
var DEPT_COLOURS = {
    'GHOSTS':'#674EA7','Ghosts':'#674EA7',
    'PROGRESSION':'#3D85C6','Progression':'#3D85C6',
    'WELFARE':'#A64D79','Welfare':'#A64D79',
    'INTERNAL AFFAIRS':'#434343','Internal Affairs':'#434343',
    'LIBRARIUM':'#F1C232','Librarium':'#F1C232'
};
var MEDAL_CLASSES = {
    'Legend':'md-legend','Cheerleader':'md-cheerleader',
    'Distinguished Officer':'md-dist-officer',
    "Commandant's Excellence":'md-cmd-exc',
    "Advisor's Honor":'md-adv-honor',
    "Deputy Director's Valor":'md-dd-valor',
    "Director's Merit":'md-dir-merit',
    "Director-General's Virtue":'md-dg-virtue'
};

// ── DOM shorthand ─────────────────────────────────────────────
function $(id)       { return document.getElementById(id); }
function gv(id)      { var el=$(id); return el ? el.value : ''; }
function sv(id, v)   { var el=$(id); if (el) el.value = v; }
function setHTML(id, html) { var el=$(id); if (el) el.innerHTML = html; }

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ea(s) {  // escape for inline JS attribute string
    if (!s) return '';
    return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
function fmt2(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return esc(String(v));
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
function fmtPct(v) {
    if (!v) return '—';
    var n = parseFloat(v);
    return isNaN(n) ? esc(String(v)) : n.toFixed(2) + '%';
}
function setToday(id) {
    var el = $(id); if (!el) return;
    var t = new Date();
    el.value = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
}

// ── Toast ─────────────────────────────────────────────────────
var _toastTimer = null;
function toast(msg, type) {
    var t = $('toast'); if (!t) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    t.textContent = msg;
    t.className = 'toast toast-' + (type || 'success') + ' show';
    _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4000);
}

// ── Button state helpers ──────────────────────────────────────
function btnBusy(id, label) { var b=$(id); if(b){b.disabled=true; b.textContent=label||'Loading…';} }
function btnDone(id, label) { var b=$(id); if(b){b.disabled=false; b.textContent=label;} }

// ── Cooldown bar ──────────────────────────────────────────────
var _cdTimer = null;
function cooldown(btnId, wrapId, barId, secs) {
    var btn=$(btnId), wrap=$(wrapId), bar=$(barId);
    if (!btn) return;
    btn.disabled = true;
    if (wrap) { wrap.style.display='block'; if(bar) bar.style.width='100%'; }
    var rem = secs, orig = btn.textContent;
    btn.textContent = 'Wait ' + rem + 's…';
    if (_cdTimer) clearInterval(_cdTimer);
    _cdTimer = setInterval(function () {
        rem--;
        if (bar) bar.style.width = (rem / secs * 100) + '%';
        btn.textContent = 'Wait ' + rem + 's…';
        if (rem <= 0) {
            clearInterval(_cdTimer);
            btn.disabled = false;
            btn.textContent = orig;
            if (wrap) wrap.style.display = 'none';
        }
    }, 1000);
}

// ── Shared template builders ──────────────────────────────────
function pageHeader(title, sub) {
    return '<div class="ph"><div class="ey">TNI:C Commandos Mainframe</div><h1>' + esc(title) + '</h1>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}
function statCard(n, label) {
    return '<div class="sc"><div class="n">' + esc(String(n)) + '</div><div class="l">' + esc(label) + '</div></div>';
}
function kvRow(k, v) {
    var kH = (typeof k === 'string' && k.charAt(0) === '<') ? k : esc(String(k));
    var vH = (typeof v === 'string' && v.charAt(0) === '<') ? v : esc(String(v));
    return '<div class="kv"><span class="k">' + kH + '</span><span class="v">' + vH + '</span></div>';
}
function flagBadge(on) {
    return on ? '<span class="flag flag-on">Enabled</span>' : '<span class="flag flag-off">Disabled</span>';
}
function statusBadge(s) {
    var cls = {Constant:'b-constant',Complete:'b-complete',Exempt:'b-exempt',Incomplete:'b-incomplete'};
    return '<span class="badge ' + (cls[s]||'b-incomplete') + '">' + esc(s||'—') + '</span>';
}
function rankPill(r) {
    if (!r) return '<span class="muted-val">—</span>';
    var cls = RANK_CLASSES[r];
    if (!cls) return '<span class="rank-plain">' + esc(r) + '</span>';
    return '<span class="rank-pill ' + cls + '">' + esc(r) + '</span>';
}
function deptPill(n) {
    if (!n) return '';
    var cls = DEPT_CLASSES[n] || DEPT_CLASSES[n.toUpperCase()];
    if (!cls) return '<span class="rank-plain">' + esc(n) + '</span>';
    return '<span class="dept-pill ' + cls + '">' + esc(n) + '</span>';
}
function deptPills(s) {
    if (!s) return '<span class="muted-val">—</span>';
    return s.split(',').map(function(d){return deptPill(d.trim());}).join(' ');
}
function filterBtn(id, f, label, on) {
    return '<button class="filter-btn' + (on?' on':'') + '" id="' + id + '" onclick="setActFilter(\'' + f + '\',this)">' + label + '</button>';
}
function noResults(cols) {
    return '<tr><td colspan="' + cols + '" class="no-results">No results</td></tr>';
}
function evTypeOpts() {
    return ['Raid/Defense WIN','Raid/Defense LOSS','Tryout','Practice Raid','Spar','Border Patrol','Game Night','Welfare Event']
        .map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join('');
}

// ── Debounce ──────────────────────────────────────────────────
function debounce(fn, ms) {
    var t;
    return function() {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, ms);
    };
}

// ── Settings ──────────────────────────────────────────────────
function renderSettings(D) {
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

function renderActivity(D) {
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

function renderActivityRows(members) {
    var q = (gv('act-search')||'').toLowerCase();
    var filtered = members.filter(function(m){
        return (actFilter==='all' || m.status===actFilter) &&
            (!q || m.username.toLowerCase().indexOf(q)>-1 ||
                (m.rank||'').toLowerCase().indexOf(q)>-1 ||
                (m.department||'').toLowerCase().indexOf(q)>-1);
    });
    var cnt = $('act-count');
    if (cnt) cnt.textContent = filtered.length + ' member' + (filtered.length===1?'':'s');

    // Build rows as a single string for one innerHTML write
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

function setActFilter(f, btn) {
    actFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on');
    renderActivityRows(window._D.activity.members);
}

// ── Officer Tracker ───────────────────────────────────────────
function renderOfficers(D) {
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

function renderOfficerRows(officers) {
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
function renderHonored(D) {
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

function renderHonoredRows(members) {
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
function renderDepartments(D) {
    var depts = D.departments;
    var h = pageHeader('Department Members','');
    h += '<div class="stats">';
    depts.forEach(function(d){ h+=statCard(d.total,d.name); });
    h += '</div>';
    h += '<div class="toolbar"><input class="search" id="dept-search" placeholder="Search member…"></div>';
    h += '<div class="dept-grid" id="dept-grid">'+buildDeptBlocks(depts,'')+'</div>';
    return h;
}

function buildDeptBlocks(depts, q) {
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
function renderEvents(ev, cols, title) {
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

function setMembers(members) { GROUP_MEMBERS = members || []; }

function openAC(id)  { var d=$(id); if(d) d.classList.add('open'); }
function closeAC(id) { var d=$(id); if(d) d.classList.remove('open'); }

function buildAC(ddId, query, exclude, onSel) {
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
        return '<div class="ac-option" onmousedown="'+onSel+'(\''+ea(m)+'\')">'+esc(m)+'</div>';
    }).join('');
    openAC(ddId);
}

function initSingleAC(inpId, ddId, onSel) {
    var inp = $(inpId); if (!inp) return;
    var debouncedBuild = debounce(function(){ buildAC(ddId, inp.value, [], onSel); }, 120);
    inp.addEventListener('input', debouncedBuild);
    inp.addEventListener('keydown', function(e){ if(e.key==='Escape') closeAC(ddId); });
    inp.addEventListener('focus', function(){ if(inp.value.trim()) buildAC(ddId, inp.value, [], onSel); });
}

function initMultiAC(inpId, ddId, areaId, getSel, onSel) {
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
            if (sel.length) window[onSel.replace('add','remove')](sel[sel.length-1]);
        }
    });
}

function renderTags(areaId, inpId, items, removeFn) {
    var area=$(areaId), inp=$(inpId); if(!area||!inp) return;
    area.querySelectorAll('.tag').forEach(function(t){t.remove();});
    var frag = document.createDocumentFragment();
    items.forEach(function(name){
        var tag = document.createElement('span'); tag.className='tag';
        tag.innerHTML = esc(name)+'<i class="tag-remove" onmousedown="event.preventDefault();'+removeFn+'(\''+ea(name)+'\')">×</i>';
        frag.appendChild(tag);
    });
    area.insertBefore(frag, inp);
    inp.placeholder = items.length ? 'Add more…' : 'Type to search…';
}

function docOutsideClick(pairs) {
    // pairs: [[inputId, dropdownId], ...]
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

window._ADMIN = { tab: null, roles: [], list: [] };

// Permission definitions (flat list — used for pill rendering and toggle lookup)
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

// Permission groups — used to render toggles in role create/edit forms
var ADMIN_PERM_GROUPS = [
    { label: 'System',    keys: ['roleAssign', 'roleEdit'] },
    { label: 'Mainframe', keys: ['mfOfficers', 'mfRemote'] },
    { label: 'DIS',       keys: ['disSync', 'disTiles', 'disPoints', 'disRaffle', 'disGamePool', 'disAudit'] }
];

function renderUnifiedAdmin() {
    var ap = window.AUTH.adminPerms;
    var hs = document.getElementById('home-screen');
    if (!hs) return;

    // Determine which tabs the user can see
    var tabDefs = [
        { key: 'roles',     label: 'Roles',     canSee: window.AUTH.canAdminTab('roles')     },
        { key: 'mainframe', label: 'Mainframe', canSee: window.AUTH.canAdminTab('mainframe') },
        { key: 'sync',      label: 'Sync',      canSee: window.AUTH.canAdminTab('sync')      },
        { key: 'tiles',     label: 'Tiles',     canSee: window.AUTH.canAdminTab('tiles')     },
        { key: 'points',    label: 'Points',    canSee: window.AUTH.canAdminTab('points')    },
        { key: 'raffle',    label: 'Raffle',    canSee: window.AUTH.canAdminTab('raffle')    },
        { key: 'gamepool',  label: 'Game Pool', canSee: window.AUTH.canAdminTab('gamepool')  },
        { key: 'audit',     label: 'Audit Log', canSee: window.AUTH.canAdminTab('audit')     }
    ].filter(function (t) { return t.canSee; });

    if (tabDefs.length === 0) {
        hs.innerHTML =
            '<div class="bg-grid"></div><div class="home-inner" style="padding-top:40px">' +
            '<div class="dis-wrap"><div class="info-block">' +
            '<p class="admin-desc">You do not have any admin permissions.</p>' +
            '<button class="btn-ghost" style="margin-top:12px" data-click="showHomeScreen">&#8592; Back to Hub</button>' +
            '</div></div></div>';
        return;
    }

    // Pick default tab if needed
    if (!_ADMIN.tab || !tabDefs.some(function (t) { return t.key === _ADMIN.tab; })) {
        _ADMIN.tab = tabDefs[0].key;
    }

    var tabHtml = tabDefs.map(function (t) {
        return '<button class="dis-admin-tab' + (_ADMIN.tab === t.key ? ' active' : '') +
            '" onclick="adminTab(\'' + t.key + '\')">' + esc(t.label) + '</button>';
    }).join('');

    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner" style="padding-top:40px">' +
        '<div class="dis-wrap">' +
        '<div class="dis-header">' +
        '<div class="dis-header-left">' +
        '<div class="dis-eyebrow">NIGHTHAWK COMMANDOS &mdash; SYSTEM</div>' +
        '<div class="dis-title">Admin Dashboard</div>' +
        '</div>' +
        '<div class="dis-nav">' +
        '<button class="dis-nav-btn" data-click="showHomeScreen">&#8592; Hub</button>' +
        '</div>' +
        '</div>' +
        '<div class="dis-admin-tabs">' + tabHtml + '</div>' +
        '<div id="admin-body"></div>' +
        '</div></div>';

    _adminRenderTab();
}

function adminTab(key) {
    _ADMIN.tab = key;
    var tabs = document.querySelectorAll('.dis-admin-tab');
    tabs.forEach(function (b) {
        b.classList.toggle('active', b.textContent.trim() === _getAdminTabLabel(key));
    });
    // Re-match by onclick attribute is cleaner:
    tabs.forEach(function (b) {
        b.classList.remove('active');
        if (b.getAttribute('onclick') === 'adminTab(\'' + key + '\')') b.classList.add('active');
    });
    _adminRenderTab();
}

function _getAdminTabLabel(key) {
    var map = { roles: 'Roles', mainframe: 'Mainframe', sync: 'Sync', tiles: 'Tiles', points: 'Points', raffle: 'Raffle', gamepool: 'Game Pool', audit: 'Audit Log' };
    return map[key] || key;
}

function _adminRenderTab() {
    var body = document.getElementById('admin-body');
    if (!body) return;
    var tab = _ADMIN.tab;
    if (tab === 'roles')     { _adminRenderRoles(body);     return; }
    if (tab === 'mainframe') { _adminRenderMainframe(body); return; }
    _adminRenderDisTab(tab, body);
}

// ── Mainframe tab ─────────────────────────────────────────────
function _adminRenderMainframe(body) {
    var ap = window.AUTH.adminPerms || {};
    var isSuperadmin = !!(window.AUTH.user && window.AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var canOfficers  = isSuperadmin || !!ap.mfOfficers;
    var canRemote    = isSuperadmin || !!ap.mfRemote;

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Mainframe Admin</h3>' +
        '<p class="admin-desc">Administrative tools for the Commandos Mainframe.</p></div>';

    if (canOfficers) {
        html +=
            '<div class="info-block" style="margin-bottom:16px">' +
            '<h3>Officers Tracker</h3>' +
            '<p class="admin-desc" id="admin-mf-officers-desc">Manage officers — add or remove entries from the tracker.</p>' +
            '<div id="admin-mf-officers"><p class="admin-desc" style="color:var(--muted)">Coming soon.</p></div>' +
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
}

// ── DIS tab wrapper (ensures state is loaded first) ───────────
function _adminRenderDisTab(tabKey, body) {
    if (!_DIS.state) {
        body.innerHTML = '<div class="obj-loading">Loading DIS state\u2026</div>';
        fetch('/api/dis/state')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                _DIS.state = data;
                _adminRenderDisTabContent(tabKey, body);
            })
            .catch(function (e) {
                body.innerHTML = '<div class="obj-error">Failed to load DIS state: ' + esc(e.message) + '</div>';
            });
        return;
    }
    _adminRenderDisTabContent(tabKey, body);
}

function _adminRenderDisTabContent(tabKey, body) {
    if (tabKey === 'sync')          _disAdminSync(body);
    else if (tabKey === 'tiles')    _disAdminTiles(body);
    else if (tabKey === 'points')   _disAdminPoints(body);
    else if (tabKey === 'raffle')   _disAdminRaffle(body);
    else if (tabKey === 'gamepool') _disAdminGamePool(body);
    else if (tabKey === 'audit')    _disAdminAudit(body);
}

// After a DIS admin action succeeds, refresh the tab content
function _adminRefreshDisTab() {
    var body = document.getElementById('admin-body');
    if (!body) return;
    fetch('/api/dis/state')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            _DIS.state = data;
            _adminRenderDisTabContent(_ADMIN.tab, body);
        });
}

// ── Roles tab ─────────────────────────────────────────────────
function adminPermToggle(btn) {
    btn.classList.toggle('on');
}

function _readPermToggles(container) {
    var perms = {};
    container.querySelectorAll('.admin-perm-toggle').forEach(function (btn) {
        perms[btn.dataset.perm] = btn.classList.contains('on');
    });
    return perms;
}

// Renders grouped permission toggle buttons for create/edit forms
function _adminRenderPermToggles(existingPerms) {
    var ap = window.AUTH.adminPerms || {};
    var isSuperadmin = !!(window.AUTH.user && window.AUTH.user.divisionRank >= 246) || !!ap.superadmin;
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
                (canToggle ? ' onclick="adminPermToggle(this)"' : ' disabled') + '>' + esc(d.label) + '</button>';
        });
        html += '</div></div>';
    });
    return html;
}

function _adminRenderRoles(body) {
    body.innerHTML = '<div class="obj-loading">Loading\u2026</div>';
    Promise.all([
        fetch('/api/admin/roles',     { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
        fetch('/api/admin/allowlist', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    ]).then(function (results) {
        _adminBuildRolesUI(body, Array.isArray(results[0]) ? results[0] : [], Array.isArray(results[1]) ? results[1] : []);
    }).catch(function (e) {
        body.innerHTML = '<div class="obj-error">Failed to load: ' + esc(e.message) + '</div>';
    });
}

function _adminBuildRolesUI(body, roles, list) {
    window._ADMIN.roles = roles;
    window._ADMIN.list  = list;
    var ap = window.AUTH.adminPerms || {};
    var isSuperadmin = !!(window.AUTH.user && window.AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var canAssign    = isSuperadmin || !!ap.roleAssign;   // add/remove/reassign users
    var canEditRoles = isSuperadmin || !!ap.roleEdit;     // create/edit/delete role templates

    var html = '';

    // ── Section 1: Role Templates ─────────────────────────────
    html += '<div class="admin-section-title">Role Templates</div><div class="admin-role-grid">';

    roles.forEach(function (role) {
        var enabledPerms = ADMIN_PERM_DEFS.filter(function (d) { return role.permissions && role.permissions[d.key]; });
        html += '<div class="admin-role-card" style="border-left-color:' + esc(role.color || '#7c4ab8') + '" id="admin-role-card-' + esc(role.id) + '">' +
            _adminRoleCardViewHTML(role, enabledPerms, canEditRoles) + '</div>';
    });

    if (canEditRoles) {
        html += '<div class="admin-role-card" style="border-left-color:var(--border)">' +
            '<div id="admin-new-role-collapsed">' +
            '<button class="btn-dis-primary" style="width:100%;font-size:12px" onclick="adminShowNewRole()">+ Create Role</button>' +
            '</div>' +
            '<div id="admin-new-role-expanded" style="display:none" class="admin-role-edit-form">' +
            '<div class="admin-role-form-row">' +
            '<input id="admin-new-role-name" class="admin-input" placeholder="Role name" style="flex:1;min-width:0">' +
            '<input id="admin-new-role-color" class="admin-color-input" type="color" value="#7c4ab8">' +
            '</div>' +
            _adminRenderPermToggles({}) +
            '<div class="admin-role-form-row" style="margin-top:4px">' +
            '<button class="btn-dis-primary" style="flex:1;font-size:12px" onclick="adminSaveNewRole()">Save Role</button>' +
            '<button class="admin-role-btn" style="white-space:nowrap" onclick="adminCancelNewRole()">Cancel</button>' +
            '</div></div></div>';
    }

    html += '</div>'; // end grid

    // ── Section 2: Users ─────────────────────────────────────
    html += '<div class="admin-section-title" style="margin-top:28px">Assigned Users</div>';

    if (list.length) {
        html += '<div class="admin-user-list">';
        list.forEach(function (e) {
            html += '<div class="admin-user-row">' +
                '<div class="admin-user-label">' + esc(e.label || e.discordId) + '</div>' +
                '<div class="admin-user-id">' + esc(e.discordId) + '</div>';
            if (canAssign) {
                html += _adminRoleSelectHTML(roles, e.roleId || '', e.discordId) +
                    '<button class="admin-remove-btn" onclick="adminRemoveUser(\'' + esc(e.discordId) + '\')">Remove</button>';
            } else {
                var assignedRole = e.roleId ? roles.find(function (r) { return r.id === e.roleId; }) : null;
                html += '<span style="font-size:11px;color:var(--muted)">' + esc(assignedRole ? assignedRole.name : '—') + '</span>';
            }
            html += '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="empty" style="margin-bottom:16px">No users on the admin list.</div>';
    }

    if (canAssign) {
        html += '<div class="info-block" style="margin-top:12px"><h3>Add User</h3>' +
            '<div class="dis-inline-form" style="margin-bottom:10px">' +
            '<input id="admin-new-user-id" class="admin-input" placeholder="Discord ID" style="width:180px">' +
            '<input id="admin-new-user-label" class="admin-input" placeholder="Display name (optional)" style="flex:1">' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
            '<label style="font-size:12px;color:var(--muted)">Role:</label>' +
            _adminRoleSelectHTML(roles, '', 'new-user') +
            '</div>' +
            '<button class="btn-dis-primary" onclick="adminAddUser()">Add User</button></div>';
    }

    body.innerHTML = html;
}

// ── Role card view HTML (injected inside the card wrapper) ────
function _adminRoleCardViewHTML(role, enabledPerms, canManage) {
    var html = '<div class="admin-role-card-header"><div class="admin-role-name">' + esc(role.name) + '</div>';
    if (canManage) {
        html += '<div class="admin-role-actions">' +
            '<button class="admin-role-btn" onclick="adminEditRole(\'' + esc(role.id) + '\')">Edit</button>' +
            '<button class="admin-role-btn danger" onclick="adminDeleteRole(\'' + esc(role.id) + '\')">Delete</button>' +
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

// ── Role <select> helper ──────────────────────────────────────
function _adminRoleSelectHTML(roles, currentRoleId, discordId) {
    var isNew = (discordId === 'new-user');
    var html = '<select class="admin-role-select"' +
        (isNew ? ' id="admin-new-user-role"' : ' onchange="adminAssignRole(this,\'' + esc(discordId) + '\')"') + '>';
    html += '<option value=""' + (!currentRoleId ? ' selected' : '') + '>\u2014 No role</option>';
    roles.forEach(function (r) {
        html += '<option value="' + esc(r.id) + '"' + (r.id === currentRoleId ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    });
    return html + '</select>';
}

// ── Role card inline edit ─────────────────────────────────────
function adminEditRole(id) {
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
        '<button class="btn-dis-primary" style="flex:1;font-size:12px" onclick="adminSaveRole(\'' + esc(id) + '\')">Save</button>' +
        '<button class="admin-role-btn" style="white-space:nowrap" onclick="adminCancelEditRole(\'' + esc(id) + '\')">Cancel</button>' +
        '</div></div>';
    var colorInput = document.getElementById('admin-edit-role-color');
    if (colorInput) colorInput.addEventListener('input', function () { card.style.borderLeftColor = colorInput.value; });
}

function adminCancelEditRole(id) {
    var role = (_ADMIN.roles || []).find(function (r) { return r.id === id; });
    if (!role) { _adminReloadRoles(); return; }
    var card = document.getElementById('admin-role-card-' + id);
    if (!card) return;
    var ap = window.AUTH.adminPerms || {};
    var isSuperadmin = !!(window.AUTH.user && window.AUTH.user.divisionRank >= 246) || !!ap.superadmin;
    var enabledPerms = ADMIN_PERM_DEFS.filter(function (d) { return role.permissions && role.permissions[d.key]; });
    card.innerHTML = _adminRoleCardViewHTML(role, enabledPerms, isSuperadmin || !!ap.roleEdit);
}

function adminSaveRole(id) {
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

function adminDeleteRole(id) {
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

function adminShowNewRole() {
    var c = document.getElementById('admin-new-role-collapsed');
    var e = document.getElementById('admin-new-role-expanded');
    if (c) c.style.display = 'none';
    if (e) e.style.display = '';
}

function adminCancelNewRole() {
    var c = document.getElementById('admin-new-role-collapsed');
    var e = document.getElementById('admin-new-role-expanded');
    if (c) c.style.display = '';
    if (e) e.style.display = 'none';
}

function adminSaveNewRole() {
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

// ── User management ────────────────────────────────────────────
function adminAssignRole(selectEl, discordId) {
    selectEl.disabled = true;
    fetch('/api/admin/allowlist', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: discordId, roleId: selectEl.value })
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('Role assigned', 'success'); _adminReloadRoles(); }
            else { selectEl.disabled = false; toast('Error: ' + (res.error || 'Unknown'), 'error'); }
        }).catch(function () { selectEl.disabled = false; toast('Request failed', 'error'); });
}

function adminAddUser() {
    var id     = ((document.getElementById('admin-new-user-id')    || {}).value || '').trim();
    var label  = ((document.getElementById('admin-new-user-label') || {}).value || '').trim();
    var roleEl = document.getElementById('admin-new-user-role');
    var roleId = roleEl ? roleEl.value : '';
    if (!id) { toast('Enter a Discord ID', 'error'); return; }
    var body = { discordId: id, label: label || id };
    if (roleId) body.roleId = roleId;
    fetch('/api/admin/allowlist', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) { toast('User added', 'success'); _adminReloadRoles(); }
            else toast('Error: ' + (res.error || 'Unknown'), 'error');
        }).catch(function () { toast('Request failed', 'error'); });
}

function adminRemoveUser(discordId) {
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
    if (body && _ADMIN.tab === 'roles') _adminRenderRoles(body);
}

// ── Form field helpers ────────────────────────────────────────
function fld(id, label, req, inputHtml, errMsg) {
    return '<div class="field" id="'+id+'"><label>'+esc(label)+(req?' <span class="req-star">*</span>':'')+' </label>'+
        inputHtml+(errMsg?'<div class="field-error">'+esc(errMsg)+'</div>':'')+'</div>';
}
function fHead(icon, title, desc) {
    return '<div class="form-card-head"><div class="form-card-icon">'+icon+'</div>'+
        '<div><div class="form-card-title">'+esc(title)+'</div><div class="form-card-desc">'+esc(desc)+'</div></div></div>';
}
function honeypot(id) {
    return '<div class="hp-wrap"><input type="text" id="'+id+'" tabindex="-1" autocomplete="off"></div>';
}
function setFieldErr(id, msg) {
    var f=$(id); if(!f)return; f.classList.add('has-error');
    var e=f.querySelector('.field-error'); if(e){if(msg)e.textContent=msg; e.style.display='block';}
}
function clrFieldErr(id) {
    var f=$(id); if(!f)return; f.classList.remove('has-error');
    var e=f.querySelector('.field-error'); if(e) e.style.display='none';
}
function clrAll(ids) { ids.forEach(clrFieldErr); }

