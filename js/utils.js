// ═══════════════════════════════════════════════════════════════
//  utils.js — pure DOM/string helpers shared across all modules
//  No app-state dependencies. Safe to import from any module.
// ═══════════════════════════════════════════════════════════════

// ── CSS class maps ────────────────────────────────────────────
export var RANK_CLASSES = {
    'Probationary Trooper':'rk-prob','Commando':'rk-commando','Sentinel':'rk-sentinel',
    'Infiltrator':'rk-infiltrator','Operative':'rk-operative','Specialist':'rk-specialist',
    'Prestige':'rk-prestige','Nighthawk Nine':'rk-nighthawk',
    'Interim Warrant Officer':'rk-iwo','Warrant Officer':'rk-wo',
    'Chief Warrant Officer':'rk-cwo','Captain':'rk-captain',
    'Commandant':'rk-commandant','Developer':'rk-developer','Advisor':'rk-advisor',
    'Deputy Director':'rk-dd','Director':'rk-director'
};
export var DEPT_CLASSES = {
    'GHOSTS':'dp-ghosts','PROGRESSION':'dp-prog','WELFARE':'dp-welfare',
    'INTERNAL AFFAIRS':'dp-ia','LIBRARIUM':'dp-lib',
    'Ghosts':'dp-ghosts','Progression':'dp-prog','Welfare':'dp-welfare',
    'Internal Affairs':'dp-ia','Librarium':'dp-lib'
};
export var DEPT_COLOURS = {
    'GHOSTS':'#674EA7','Ghosts':'#674EA7',
    'PROGRESSION':'#3D85C6','Progression':'#3D85C6',
    'WELFARE':'#A64D79','Welfare':'#A64D79',
    'INTERNAL AFFAIRS':'#434343','Internal Affairs':'#434343',
    'LIBRARIUM':'#F1C232','Librarium':'#F1C232'
};
export var MEDAL_CLASSES = {
    'Legend':'md-legend','Cheerleader':'md-cheerleader',
    'Distinguished Officer':'md-dist-officer',
    "Commandant's Excellence":'md-cmd-exc',
    "Advisor's Honor":'md-adv-honor',
    "Deputy Director's Valor":'md-dd-valor',
    "Director's Merit":'md-dir-merit',
    "Director-General's Virtue":'md-dg-virtue'
};

// ── DOM shorthand ─────────────────────────────────────────────
export function $(id)       { return document.getElementById(id); }
export function gv(id)      { var el=$(id); return el ? el.value : ''; }
export function sv(id, v)   { var el=$(id); if (el) el.value = v; }
export function setHTML(id, html) { var el=$(id); if (el) el.innerHTML = html; }

// ── String escaping ───────────────────────────────────────────
export function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function ea(s) {
    if (!s) return '';
    return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
export function fmt2(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return esc(String(v));
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
export function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    var n = parseFloat(v);
    if (isNaN(n)) return esc(String(v));
    return (n * 100).toFixed(2) + '%';
}
export function setToday(id) {
    var el = $(id); if (!el) return;
    var t = new Date();
    el.value = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
}

// ── Debounce ──────────────────────────────────────────────────
export function debounce(fn, ms) {
    var t;
    return function() {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, ms);
    };
}

// ── Toast ─────────────────────────────────────────────────────
var _toastTimer = null;
export function toast(msg, type) {
    var t = $('toast'); if (!t) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    t.textContent = msg;
    t.className = 'toast toast-' + (type || 'success') + ' show';
    _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4000);
}

// ── Button state helpers ──────────────────────────────────────
export function btnBusy(id, label) { var b=$(id); if(b){b.disabled=true; b.textContent=label||'Loading…';} }
export function btnDone(id, label) { var b=$(id); if(b){b.disabled=false; b.textContent=label;} }

// ── Cooldown bar ──────────────────────────────────────────────
var _cdTimer = null;
export function cooldown(btnId, wrapId, barId, secs) {
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
export function pageHeader(title, sub) {
    return '<div class="ph"><div class="ey">Nighthawk Commandos Mainframe</div><h1>' + esc(title) + '</h1>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}
export function statCard(n, label) {
    return '<div class="sc"><div class="n">' + esc(String(n)) + '</div><div class="l">' + esc(label) + '</div></div>';
}
export function kvRow(k, v) {
    var kH = (typeof k === 'string' && k.charAt(0) === '<') ? k : esc(String(k));
    var vH = (typeof v === 'string' && v.charAt(0) === '<') ? v : esc(String(v));
    return '<div class="kv"><span class="k">' + kH + '</span><span class="v">' + vH + '</span></div>';
}
export function flagBadge(on) {
    return on ? '<span class="flag flag-on">Enabled</span>' : '<span class="flag flag-off">Disabled</span>';
}
export function statusBadge(s) {
    var cls = {Constant:'b-constant',Complete:'b-complete',Exempt:'b-exempt',Incomplete:'b-incomplete'};
    return '<span class="badge ' + (cls[s]||'b-incomplete') + '">' + esc(s||'—') + '</span>';
}
export function rankPill(r) {
    if (!r) return '<span class="muted-val">—</span>';
    var cls = RANK_CLASSES[r];
    if (!cls) return '<span class="rank-plain">' + esc(r) + '</span>';
    return '<span class="rank-pill ' + cls + '">' + esc(r) + '</span>';
}
export function deptPill(n) {
    if (!n) return '';
    var cls = DEPT_CLASSES[n] || DEPT_CLASSES[n.toUpperCase()];
    if (!cls) return '<span class="rank-plain">' + esc(n) + '</span>';
    return '<span class="dept-pill ' + cls + '">' + esc(n) + '</span>';
}
export function deptPills(s) {
    if (!s) return '<span class="muted-val">—</span>';
    return s.split(',').map(function(d){return deptPill(d.trim());}).join(' ');
}
export function filterBtn(id, f, label, on) {
    return '<button class="filter-btn' + (on?' on':'') + '" id="' + id + '" data-click="setActFilter" data-filter="' + f + '">' + label + '</button>';
}
export function noResults(cols) {
    return '<tr><td colspan="' + cols + '" class="no-results">No results</td></tr>';
}
export function evTypeOpts() {
    return ['Raid/Defense WIN','Raid/Defense LOSS','Tryout','Practice Raid','Spar','Border Patrol','Game Night','Welfare Event']
        .map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join('');
}

// ── Form field helpers ────────────────────────────────────────
export function fld(id, label, req, inputHtml, errMsg) {
    return '<div class="field" id="'+id+'"><label>'+esc(label)+(req?' <span class="req-star">*</span>':'')+' </label>'+
        inputHtml+(errMsg?'<div class="field-error">'+esc(errMsg)+'</div>':'')+'</div>';
}
export function fHead(icon, title, desc) {
    return '<div class="form-card-head">'+
        '<div><div class="form-card-title">'+esc(title)+'</div><div class="form-card-desc">'+esc(desc)+'</div></div></div>';
}
export function honeypot(id) {
    return '<div class="hp-wrap"><input type="text" id="'+id+'" tabindex="-1" autocomplete="off"></div>';
}
export function setFieldErr(id, msg) {
    var f=$(id); if(!f)return; f.classList.add('has-error');
    var e=f.querySelector('.field-error'); if(e){if(msg)e.textContent=msg; e.style.display='block';}
}
export function clrFieldErr(id) {
    var f=$(id); if(!f)return; f.classList.remove('has-error');
    var e=f.querySelector('.field-error'); if(e) e.style.display='none';
}
export function clrAll(ids) { ids.forEach(clrFieldErr); }
