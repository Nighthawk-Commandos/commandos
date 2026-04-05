// ═══════════════════════════════════════════════════════════════
//  app.js — boot, navigation, search wire-up, data refresh
// ═══════════════════════════════════════════════════════════════

'use strict';

// Shared data store — render.js and forms.js read window._D
window._D = null;

// ── Content setter (used by render.js forms.js and here) ──────
function setContent(html) {
    document.getElementById('content').innerHTML = html;
}

// ── Navigation ────────────────────────────────────────────────
var PAGES = {
    settings:            function(){ setContent(renderSettings(window._D)); },
    activity:            function(){ setContent(renderActivity(window._D)); wireActivity(); },
    officers:            function(){ setContent(renderOfficers(window._D)); wireOfficers(); },
    honored:             function(){ setContent(renderHonored(window._D)); wireHonored(); },
    departments:         function(){ setContent(renderDepartments(window._D)); wireDepts(); },
    weekly:              function(){ setContent(renderEvents(window._D.weeklyEvents,['Username','Date','Event Type','AP Value','OP Value','Attendees'],'Weekly Events')); },
    monthly:             function(){ setContent(renderEvents(window._D.monthlyEvents,['Username','Date','Event Type','AP Value','OP Value','Attendees'],'Monthly Events')); },
    'form-eventlog':     renderFormEventLog,
    'form-editeventlog': renderFormEditEventLog,
    'form-transfer':     renderFormTransfer,
    'form-exemption':    renderFormExemption,
    'form-missingap':    renderFormMissingAP
};

function go(key, el) {
    document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
    el.classList.add('active');
    document.getElementById('main').scrollTop = 0;
    document.getElementById('sidebar').classList.remove('open');
    actFilter = 'all'; // reset tracker filter on page change
    if (PAGES[key]) PAGES[key]();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── Search wire-up (debounced) ────────────────────────────────
function wireActivity() {
    renderActivityRows(window._D.activity.members);
    var inp = document.getElementById('act-search');
    if (!inp) return;
    var fn = debounce(function(){ renderActivityRows(window._D.activity.members); }, 160);
    inp.addEventListener('input', fn);
}

function wireOfficers() {
    renderOfficerRows(window._D.officers.officers);
    var inp = document.getElementById('off-search');
    if (!inp) return;
    var fn = debounce(function(){ renderOfficerRows(window._D.officers.officers); }, 160);
    inp.addEventListener('input', fn);
}

function wireHonored() {
    renderHonoredRows(window._D.honored.members);
    var inp = document.getElementById('hon-search');
    if (!inp) return;
    var fn = debounce(function(){ renderHonoredRows(window._D.honored.members); }, 160);
    inp.addEventListener('input', fn);
}

function wireDepts() {
    var inp = document.getElementById('dept-search');
    if (!inp) return;
    var fn = debounce(function(){
        var q = inp.value.toLowerCase();
        var grid = document.getElementById('dept-grid');
        if (grid) grid.innerHTML = buildDeptBlocks(window._D.departments, q);
    }, 160);
    inp.addEventListener('input', fn);
}

// ── Manual refresh ────────────────────────────────────────────
function refreshData() {
    var btn = document.getElementById('refresh-btn');
    if (btn) { btn.disabled=true; btn.textContent='Refreshing…'; }
    API.refreshAllData().then(function(d){
        window._D = d;
        toast('Data refreshed','success');
        if (btn) { btn.disabled=false; btn.textContent='↻ Refresh'; }
        // Re-render the current active page
        var active = document.querySelector('.nav-item.active');
        if (active) { var key=active.dataset.key; if(key&&PAGES[key]) PAGES[key](); }
    }).catch(function(e){
        toast('Refresh failed: '+e.message,'error');
        if (btn) { btn.disabled=false; btn.textContent='↻ Refresh'; }
    });
}

// ── Boot ──────────────────────────────────────────────────────
(function boot() {
    if (!window.SCRIPT_URL || window.SCRIPT_URL.indexOf('YOUR_DEPLOYMENT_ID_HERE') !== -1) {
        document.getElementById('loading').classList.add('hidden');
        setContent(
            '<div style="max-width:540px;padding:8px 0">' +
            '<div class="ph"><div class="ey">Setup Required</div><h1>Set Your Script URL</h1>' +
            '<div class="sub">Edit config.js and replace YOUR_DEPLOYMENT_ID_HERE with your Apps Script /exec URL.</div></div>' +
            '<div class="info-block" style="margin-top:20px;line-height:1.9">' +
            '<div class="kv"><span class="k">1. Apps Script</span><span class="v" style="color:var(--muted)">Deploy → Manage Deployments → New</span></div>' +
            '<div class="kv"><span class="k">2. Access</span><span class="v" style="color:var(--muted)">Execute as: Me · Who: Anyone</span></div>' +
            '<div class="kv"><span class="k">3. Copy URL</span><span class="v" style="color:var(--muted)">The /exec URL from the dialog</span></div>' +
            '<div class="kv"><span class="k">4. Paste into config.js</span><span class="v" style="color:var(--muted)">SCRIPT_URL = \'…\'</span></div>' +
            '<div class="kv"><span class="k">5. Add handleApiRequest()</span><span class="v" style="color:var(--muted)">See Code.gs.patch.js</span></div>' +
            '</div></div>'
        );
        return;
    }

    var loadingStatus = document.getElementById('loading-status');

    // Fire both requests in parallel — they are independent
    Promise.all([
        API.getAllData(),
        API.getGroupMembers()
    ]).then(function(results) {
        window._D = results[0];
        setMembers(results[1] || []);

        // Render default page
        setContent(renderSettings(window._D));
        document.getElementById('loading').classList.add('hidden');
    }).catch(function(err) {
        if (loadingStatus) loadingStatus.textContent = 'Error loading data: ' + err.message;
    });
})();