// ═══════════════════════════════════════════════════════════════
//  bingo.js — Officer Bingo System section
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── State ─────────────────────────────────────────────────────
var _bingoBoard     = null;  // { tiles: [{position, eventType, label}], weekNumber }
var _bingoProgress  = null;  // { weekNumber, completedTiles: [], completedBoards, raffleEntries }
var _bingoView      = 'dashboard'; // 'dashboard' | 'leaderboard' | 'admin'
var _bingoSyncing   = false;

// ── Entry point ───────────────────────────────────────────────
function renderBingoSection() {
    _bingoView = 'dashboard';
    _bingoPaintShell();
    _bingoLoadAll();
}

// ── Shell (header + nav tabs) ─────────────────────────────────
function _bingoPaintShell() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    var canAdmin = window.AUTH && window.AUTH.canAccessAdmin && window.AUTH.canAccessAdmin();
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner" style="padding-top:48px">' +
        '<div class="bingo-wrap">' +
        '<div class="bingo-header">' +
        '<div class="bingo-header-left">' +
        '<div class="bingo-eyebrow">WEEK ' + _bingoWeek() + ' &mdash; INCENTIVE PROGRAMME</div>' +
        '<div class="bingo-title">Officer Bingo System</div>' +
        '</div>' +
        '<div class="bingo-nav">' +
        '<button class="bingo-nav-btn' + (_bingoView === 'dashboard'   ? ' active' : '') + '" data-click="bingoDashboard">Board</button>' +
        '<button class="bingo-nav-btn' + (_bingoView === 'leaderboard' ? ' active' : '') + '" data-click="bingoLeaderboard">Leaderboard</button>' +
        (canAdmin ? '<button class="bingo-nav-btn' + (_bingoView === 'admin' ? ' active' : '') + '" data-click="bingoAdmin">Admin</button>' : '') +
        '<button class="bingo-nav-btn" data-click="showHomeScreen">&#8592; Hub</button>' +
        '</div>' +
        '</div>' +
        '<div id="bingo-body"><div class="obj-loading">Loading&#8230;</div></div>' +
        '</div>' +
        '</div>';
}

// ── Load board + progress concurrently ───────────────────────
function _bingoLoadAll() {
    var boardProm    = fetch('/api/bingo/board').then(function (r) { return r.json(); });
    var progProm     = fetch('/api/bingo/progress').then(function (r) { return r.json(); });
    Promise.all([boardProm, progProm])
        .then(function (results) {
            _bingoBoard    = results[0];
            _bingoProgress = results[1];
            _bingoRenderView();
        })
        .catch(function (e) {
            var body = document.getElementById('bingo-body');
            if (body) body.innerHTML = '<div class="obj-error">Failed to load: ' + esc(e.message) + '</div>';
        });
}

function _bingoRenderView() {
    if (_bingoView === 'leaderboard') { _bingoRenderLeaderboard(); }
    else if (_bingoView === 'admin')  { _bingoRenderAdmin(); }
    else                               { _bingoRenderDashboard(); }
}

// ── Dashboard ─────────────────────────────────────────────────
function _bingoRenderDashboard() {
    var body = document.getElementById('bingo-body');
    if (!body) return;

    var prog  = _bingoProgress  || { completedTiles: [], completedBoards: 0, raffleEntries: 0 };
    var board = _bingoBoard     || { tiles: [] };
    var done  = Array.isArray(prog.completedTiles) ? prog.completedTiles : [];
    var total = board.tiles ? board.tiles.length : 0;

    var html =
        '<div class="bingo-stats">' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + done.length + ' / ' + total + '</div><div class="bingo-stat-lbl">Tiles Done</div></div>' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + (prog.completedBoards || 0) + '</div><div class="bingo-stat-lbl">Boards Cleared</div></div>' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + (prog.raffleEntries || 0) + '</div><div class="bingo-stat-lbl">Raffle Entries</div></div>' +
        '</div>';

    html += '<div class="bingo-sync-row">' +
        '<div class="bingo-sync-info">Sync your progress against the event log to update completed tiles.</div>' +
        '<button class="btn-bingo-primary" data-click="bingoSync" id="bingo-sync-btn">' +
        (_bingoSyncing ? 'Syncing&#8230;' : 'Sync Progress') +
        '</button>' +
        '</div>';

    html += '<div class="bingo-grid">';
    if (!board.tiles || board.tiles.length === 0) {
        html += '<div class="bingo-no-board">No board configured for this week.<br>An admin needs to set up the tiles.</div>';
    } else {
        board.tiles.forEach(function (tile) {
            var completed = done.indexOf(tile.position) !== -1;
            html += '<div class="bingo-tile' + (completed ? ' completed' : '') + '">' +
                '<div class="bingo-tile-type">' + esc(tile.eventType) + '</div>' +
                (tile.label ? '<div class="bingo-tile-label">' + esc(tile.label) + '</div>' : '') +
                (completed ? '<div class="bingo-tile-done">Done</div>' : '') +
                '</div>';
        });
    }
    html += '</div>';

    body.innerHTML = html;
}

// ── Leaderboard ───────────────────────────────────────────────
function _bingoRenderLeaderboard() {
    var body = document.getElementById('bingo-body');
    if (!body) return;
    body.innerHTML = '<div class="obj-loading">Loading leaderboard&#8230;</div>';

    fetch('/api/bingo/leaderboard')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var entries = data.entries || [];
            if (entries.length === 0) {
                body.innerHTML = '<div class="empty">No entries for this week yet.</div>';
                return;
            }

            var html = '<div class="tbl-wrap"><table class="bingo-lb-table">' +
                '<thead><tr>' +
                '<th style="width:40px">#</th>' +
                '<th>Officer</th>' +
                '<th style="text-align:right">Tiles</th>' +
                '<th style="text-align:right">Boards</th>' +
                '<th style="text-align:right">Entries</th>' +
                '</tr></thead><tbody>';

            entries.forEach(function (e) {
                var rankClass = e.rank === 1 ? ' top1' : e.rank === 2 ? ' top2' : e.rank === 3 ? ' top3' : '';
                html += '<tr>' +
                    '<td class="bingo-lb-rank' + rankClass + '">' + e.rank + '</td>' +
                    '<td class="bingo-lb-user">' + esc(e.username) + '</td>' +
                    '<td class="bingo-lb-num">' + e.completedTiles + ' / 25</td>' +
                    '<td class="bingo-lb-num">' + e.completedBoards + '</td>' +
                    '<td class="bingo-lb-num">' + e.raffleEntries + '</td>' +
                    '</tr>';
            });

            html += '</tbody></table></div>';
            body.innerHTML = html;
        })
        .catch(function (e) {
            body.innerHTML = '<div class="obj-error">Failed to load leaderboard: ' + esc(e.message) + '</div>';
        });
}

// ── Admin config ──────────────────────────────────────────────
function _bingoRenderAdmin() {
    var body = document.getElementById('bingo-body');
    if (!body) return;

    var board = _bingoBoard || { tiles: [] };
    var tiles = board.tiles && board.tiles.length === 25
        ? board.tiles
        : Array.from({ length: 25 }, function (_, i) { return { position: i, eventType: '', label: '' }; });

    var html = '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Board Configuration</h3>' +
        '<p class="admin-desc">Set the event type and optional label for each of the 25 bingo tiles. ' +
        'Event type must match exactly what appears in the event log (e.g. "Raid", "Training"). ' +
        'Officers complete a tile by having a matching event logged under their username.</p>' +
        '</div>' +
        '<div class="bingo-admin-grid" id="bingo-admin-grid">';

    tiles.forEach(function (tile, i) {
        html += '<div class="bingo-admin-tile">' +
            '<div class="bingo-admin-tile-num">Tile ' + (i + 1) + '</div>' +
            '<input class="bingo-admin-input" placeholder="Event Type" data-pos="' + i + '" data-field="eventType" value="' + esc(tile.eventType) + '">' +
            '<input class="bingo-admin-input" placeholder="Label (opt)" data-pos="' + i + '" data-field="label" value="' + esc(tile.label || '') + '">' +
            '</div>';
    });

    html += '</div>' +
        '<div class="bingo-admin-actions">' +
        '<button class="btn-bingo-primary" data-click="bingoSaveBoard" id="bingo-save-btn">Save Board</button>' +
        '<button class="btn-ghost" style="font-size:11px" data-click="bingoRegenerate">Randomise Event Types</button>' +
        '<button class="btn-ghost" style="font-size:11px;border-color:rgba(224,82,82,.3);color:var(--red)" data-click="bingoResetWeek">Reset Week Progress</button>' +
        '</div>';

    body.innerHTML = html;
}

// ── Sync ──────────────────────────────────────────────────────
function bingoSync() {
    if (_bingoSyncing) return;
    _bingoSyncing = true;
    var btn = document.getElementById('bingo-sync-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Syncing&#8230;'; }

    // Collect events from mainframe data
    var events = [];
    if (window._D) {
        var weekly  = (window._D.weeklyEvents  || []);
        var monthly = (window._D.monthlyEvents || []);
        // Each event row: [Username, Date, Event Type, AP Value, OP Value, Attendees]
        function parseRows(rows) {
            rows.forEach(function (row) {
                if (Array.isArray(row) && row[0] && row[2]) {
                    events.push({ username: String(row[0]).trim(), eventType: String(row[2]).trim(), date: row[1] || '' });
                }
            });
        }
        parseRows(weekly);
        parseRows(monthly);
    }

    fetch('/api/bingo/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: events })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            _bingoSyncing = false;
            if (result.error) throw new Error(result.error);
            _bingoProgress = {
                weekNumber: result.weekNumber,
                completedTiles: _bingoProgress ? _bingoProgress.completedTiles : [],
                completedBoards: result.completedBoards,
                raffleEntries: result.raffleEntries
            };
            // Refetch real progress
            return fetch('/api/bingo/progress').then(function (r) { return r.json(); });
        })
        .then(function (prog) {
            _bingoProgress = prog;
            _bingoSyncing = false;
            var msg = 'Progress synced. ' + prog.completedTiles.length + ' / 25 tiles complete.';
            if (prog.raffleEntries > 0) msg += ' ' + prog.raffleEntries + ' raffle entr' + (prog.raffleEntries === 1 ? 'y' : 'ies') + ' earned.';
            toast(msg, 'success');
            _bingoRenderDashboard();
        })
        .catch(function (e) {
            _bingoSyncing = false;
            toast('Sync failed: ' + e.message, 'error');
            var btn2 = document.getElementById('bingo-sync-btn');
            if (btn2) { btn2.disabled = false; btn2.innerHTML = 'Sync Progress'; }
        });
}

// ── Save board (admin) ────────────────────────────────────────
function bingoSaveBoard() {
    var grid = document.getElementById('bingo-admin-grid');
    if (!grid) return;
    var tiles = [];
    for (var i = 0; i < 25; i++) {
        var etInput = grid.querySelector('[data-pos="' + i + '"][data-field="eventType"]');
        var lblInput = grid.querySelector('[data-pos="' + i + '"][data-field="label"]');
        var et = etInput ? etInput.value.trim() : '';
        var lbl = lblInput ? lblInput.value.trim() : '';
        if (!et) {
            toast('Tile ' + (i + 1) + ' is missing an event type', 'error');
            return;
        }
        tiles.push({ position: i, eventType: et, label: lbl });
    }

    var btn = document.getElementById('bingo-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    fetch('/api/bingo/board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiles: tiles })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result.error) throw new Error(result.error);
            _bingoBoard = Object.assign({}, _bingoBoard || {}, { tiles: tiles });
            toast('Board saved for week ' + result.weekNumber, 'success');
            if (btn) { btn.disabled = false; btn.textContent = 'Save Board'; }
        })
        .catch(function (e) {
            toast('Save failed: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Save Board'; }
        });
}

// ── Regenerate random (admin) ─────────────────────────────────
function bingoRegenerate() {
    if (!confirm('This will create a new random board and POST it. Current tiles will be replaced. Continue?')) return;

    fetch('/api/bingo/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result.error) throw new Error(result.error);
            _bingoBoard = { tiles: result.tiles, weekNumber: result.weekNumber };
            toast('Board regenerated for week ' + result.weekNumber, 'success');
            _bingoRenderAdmin();
        })
        .catch(function (e) { toast('Regenerate failed: ' + e.message, 'error'); });
}

// ── Reset week progress (admin) ───────────────────────────────
function bingoResetWeek() {
    if (!confirm('This will erase ALL officer progress for the current week. This cannot be undone. Continue?')) return;

    fetch('/api/bingo/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-week' })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result.error) throw new Error(result.error);
            toast('Week ' + result.weekNumber + ' progress reset', 'success');
        })
        .catch(function (e) { toast('Reset failed: ' + e.message, 'error'); });
}

// ── Nav switches ──────────────────────────────────────────────
function bingoDashboard() {
    _bingoView = 'dashboard';
    _bingoPaintShell();
    _bingoRenderDashboard();
}

function bingoLeaderboard() {
    _bingoView = 'leaderboard';
    _bingoPaintShell();
    _bingoRenderLeaderboard();
}

function bingoAdmin() {
    _bingoView = 'admin';
    _bingoPaintShell();
    _bingoRenderAdmin();
}

// ── Helpers ───────────────────────────────────────────────────
function _bingoWeek() {
    var now = new Date();
    var start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    var day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}
