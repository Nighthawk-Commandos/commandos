// ═══════════════════════════════════════════════════════════════
//  objectives.js — Division Objectives section
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Render entry point (called from app.js enterObjectives) ───
function renderObjectivesSection() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;

    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner" style="padding-top:48px">' +
        '<div class="obj-wrap">' +
        '<div class="obj-back-row">' +
        '<button class="btn-ghost" style="font-size:11px" data-click="showHomeScreen">&#8592; Hub</button>' +
        '<span class="obj-month" style="margin-bottom:0">DIVISION OBJECTIVES</span>' +
        '</div>' +
        '<div class="obj-loading" id="obj-loading">Loading objectives data&#8230;</div>' +
        '<div id="obj-content" style="display:none"></div>' +
        '</div>' +
        '</div>';

    var url = window.OBJECTIVES_URL;
    if (!url || url.indexOf('YOUR_') !== -1) {
        _objError('OBJECTIVES_URL is not configured in config.js');
        return;
    }

    fetch(url + '?action=api', { redirect: 'follow' })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (json) {
            if (!json.success) throw new Error(json.error || 'Unknown error');
            _objRender(json.data);
        })
        .catch(function (e) {
            _objError('Failed to load objectives: ' + e.message);
        });
}

// ── Render objectives data ─────────────────────────────────────
function _objRender(data) {
    var loading = document.getElementById('obj-loading');
    var content = document.getElementById('obj-content');
    if (!loading || !content) return;
    loading.style.display = 'none';
    content.style.display = '';

    var depts = data.departments || [];
    var month = data.month || '';

    var totalObj = 0, doneObj = 0;
    depts.forEach(function (d) {
        (d.objectives || []).forEach(function (o) {
            totalObj++;
            if (o.completed) doneObj++;
        });
    });

    var pct = totalObj > 0 ? Math.round((doneObj / totalObj) * 100) : 0;

    var html =
        '<div class="obj-header">' +
        '<div class="obj-header-left">' +
        '<div class="obj-month">' + esc(month) + '</div>' +
        '<div class="obj-title">Division Objectives</div>' +
        '</div>' +
        '<div style="text-align:right">' +
        '<div style="font-family:\'Syne\',sans-serif;font-size:28px;font-weight:800;color:var(--accent2);line-height:1">' + pct + '%</div>' +
        '<div style="font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-top:3px">' + doneObj + ' / ' + totalObj + ' complete</div>' +
        '</div>' +
        '</div>';

    // Division-wide objectives (if any)
    if (data.divisionObjectives && data.divisionObjectives.length > 0) {
        html += '<div class="obj-dept-card" style="margin-bottom:16px">' +
            '<div class="obj-dept-head">' +
            '<div class="obj-dept-dot" style="background:var(--accent)"></div>' +
            '<div class="obj-dept-name" style="color:var(--accent2)">Division-Wide</div>' +
            '<div class="obj-dept-prog">' + _objProgress(data.divisionObjectives) + '</div>' +
            '</div>' +
            '<div class="obj-list">' + _objItems(data.divisionObjectives) + '</div>' +
            '</div>';
    }

    html += '<div class="obj-grid">';
    depts.forEach(function (dept) {
        var objs = dept.objectives || [];
        var color = dept.color || 'var(--accent)';
        html +=
            '<div class="obj-dept-card">' +
            '<div class="obj-dept-head">' +
            '<div class="obj-dept-dot" style="background:' + esc(color) + '"></div>' +
            '<div class="obj-dept-name" style="color:' + esc(color) + '">' + esc(dept.name) + '</div>' +
            '<div class="obj-dept-prog">' + _objProgress(objs) + '</div>' +
            '</div>' +
            '<div class="obj-list">' + _objItems(objs) + '</div>' +
            '</div>';
    });
    html += '</div>';

    content.innerHTML = html;
}

function _objProgress(objectives) {
    var done = (objectives || []).filter(function (o) { return o.completed; }).length;
    return done + ' / ' + (objectives || []).length;
}

function _objItems(objectives) {
    if (!objectives || objectives.length === 0) {
        return '<div class="obj-item"><span style="color:var(--muted);font-size:11px">No objectives set.</span></div>';
    }
    return objectives.map(function (o) {
        var done = !!o.completed;
        return '<div class="obj-item">' +
            '<div class="obj-check' + (done ? ' done' : '') + '"></div>' +
            '<div class="obj-item-text' + (done ? ' done' : '') + '">' + esc(o.text) + '</div>' +
            '</div>';
    }).join('');
}

function _objError(msg) {
    var loading = document.getElementById('obj-loading');
    if (loading) loading.style.display = 'none';
    var content = document.getElementById('obj-content');
    if (content) {
        content.style.display = '';
        content.innerHTML = '<div class="obj-error">' + esc(msg) + '</div>';
    }
}
