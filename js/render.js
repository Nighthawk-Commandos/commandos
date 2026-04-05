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

