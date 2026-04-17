// ═══════════════════════════════════════════════════════════════
//  dis.js — Deployment Incentive System
//  Sidebar layout matching Division Objectives + Mainframe.
//  Views: board | lb | raffle
//  Admin views delegated to render.js _adminRenderDisTab
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Module state ──────────────────────────────────────────────
var _DIS = {
    state:     null,
    stateHash: null,
    gamepool:  null,
    view:      'board',
    poll:      null,
    loading:   false
};

// ── Entry point ───────────────────────────────────────────────
function renderDISSection() {
    _DIS.view     = 'board';
    _DIS.stateHash = null;

    // Show global loading overlay while fetching initial state
    var ls = document.getElementById('loading-status');
    if (ls) ls.textContent = 'Loading deployment data\u2026';
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('home-screen').classList.add('hidden');

    fetch('/api/dis/state')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            _DIS.state    = data;
            _DIS.stateHash = JSON.stringify(data);
            document.getElementById('loading').classList.add('hidden');
            var hs = document.getElementById('home-screen');
            if (hs) hs.classList.remove('hidden');
            _disPaint();
            _disStartPoll();
            _disStartVisibilityWatch();
        })
        .catch(function (e) {
            document.getElementById('loading').classList.add('hidden');
            var hs = document.getElementById('home-screen');
            if (hs) {
                hs.classList.remove('hidden');
                hs.className = 'obj-mode';
                hs.innerHTML = '<div class="bg-grid"></div>' +
                    '<aside class="obj-sidebar">' +
                    '  <div class="obj-sidebar-logo">' +
                    '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
                    '    <div class="obj-sidebar-title">Deployment<br>Incentive</div>' +
                    '  </div>' +
                    '  <div class="obj-sidebar-back"><button class="obj-hub-btn" data-click="showHomeScreen">\u2190 Hub</button></div>' +
                    '</aside>' +
                    '<main class="obj-main">' +
                    '  <div class="obj-error">Failed to load: ' + esc(e.message) + '</div>' +
                    '</main>';
            }
        });
}

// Called when leaving the DIS section
function disLeave() {
    _disStopPoll();
    _disStopVisibilityWatch();
}

// ── Polling ───────────────────────────────────────────────────
function _disStartPoll() {
    _disStopPoll();
    _DIS.poll = setInterval(function () { _disLoad(false); }, 60000);
}

function _disStopPoll() {
    if (_DIS.poll) { clearInterval(_DIS.poll); _DIS.poll = null; }
}

// ── Visibility watch ──────────────────────────────────────────
var _disVisHandler = null;

function _disStartVisibilityWatch() {
    _disStopVisibilityWatch();
    _disVisHandler = function () {
        if (document.hidden) {
            _disStopPoll();
        } else {
            _disLoad(false);
            _disStartPoll();
        }
    };
    document.addEventListener('visibilitychange', _disVisHandler);
}

function _disStopVisibilityWatch() {
    if (_disVisHandler) {
        document.removeEventListener('visibilitychange', _disVisHandler);
        _disVisHandler = null;
    }
}

// ── Load state from server ────────────────────────────────────
function _disLoad(showSpinner) {
    if (_DIS.loading) return;
    _DIS.loading = true;
    fetch('/api/dis/state')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            _DIS.loading = false;
            var newHash = JSON.stringify(data);
            var unchanged = newHash === _DIS.stateHash;
            _DIS.state = data;
            if (unchanged) return;
            _DIS.stateHash = newHash;
            if (_DIS.view === 'board' && document.getElementById('dis-body')) {
                _disSmartUpdateBoard();
            } else if (document.getElementById('dis-body')) {
                _disRenderView();
            }
        })
        .catch(function (e) {
            _DIS.loading = false;
            if (showSpinner) {
                var b = document.getElementById('dis-body');
                if (b) b.innerHTML = '<div class="obj-error">Failed to load state: ' + esc(e.message) + '</div>';
            }
        });
}

// ── Paint shell (sidebar + main) ──────────────────────────────
function _disPaint() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    var wk = (_DIS.state && _DIS.state.weekNumber) ? _DIS.state.weekNumber : _disWeek();

    var isAdmin = window.AUTH && typeof window.AUTH.canAdminAny === 'function' && window.AUTH.canAdminAny();

    var navItems = [
        { key: 'board',  label: 'Grid' },
        { key: 'lb',     label: 'Leaderboard' },
        { key: 'raffle', label: 'Raffle' }
    ];

    var navHtml = navItems.map(function (n) {
        var active = _DIS.view === n.key;
        return '<div class="obj-nav-item' + (active ? ' active' : '') + '" data-disview="' + n.key + '" data-click="disNavGo">' +
            '<span class="obj-nav-dot"></span>' + esc(n.label) + '</div>';
    }).join('');

    hs.className = 'obj-mode';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" id="dis-sidebar">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos \u2014 Week ' + wk + '</div>' +
        '    <div class="obj-sidebar-title">Deployment<br>Incentive</div>' +
        '  </div>' +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">\u2190 Hub</button>' +
        '  </div>' +
        '  <nav class="obj-nav" id="dis-nav">' +
        '    <div class="obj-nav-group">Views</div>' +
        navHtml +
        '  </nav>' +
        '</aside>' +
        '<main class="obj-main" id="dis-main">' +
        '  <div id="dis-body">' +
        (!_DIS.state ? '<div class="obj-loading">Loading\u2026</div>' : '') +
        '  </div>' +
        '</main>';

    if (_DIS.state) _disRenderView();
}

function _disUpdateNavActive() {
    document.querySelectorAll('#dis-nav .obj-nav-item').forEach(function (el) {
        el.classList.toggle('active', el.dataset.disview === _DIS.view);
        var dot = el.querySelector('.obj-nav-dot');
        if (dot) dot.style.background = el.classList.contains('active') ? '' : '';
    });
}

function _disRenderView() {
    if (_DIS.view === 'lb')     return _disRenderLB();
    if (_DIS.view === 'raffle') return _disRenderRaffle();
    return _disRenderBoard();
}

// ── Smart partial board update (poll only) ────────────────────
function _disSmartUpdateBoard() {
    var body = document.getElementById('dis-body');
    if (!body) { _disRenderBoard(); return; }

    var grid = body.querySelector('.dis-grid');
    if (!grid) { _disRenderBoard(); return; }

    var st    = _DIS.state || {};
    var tiles = st.tiles || [];
    var gm    = st.globalMultiplier || 1;
    var claimed = tiles.filter(function (t) { return t.completed; }).length;
    var avail   = tiles.filter(function (t) { return !t.completed && !t.lockedByAdmin; }).length;
    var locked  = 25 - claimed - avail;

    var statNums = body.querySelectorAll('.bingo-stat-num');
    if (statNums.length >= 4) {
        statNums[0].textContent = claimed;
        statNums[1].textContent = avail;
        statNums[2].textContent = locked;
        statNums[3].textContent = gm + (gm !== 1 ? 'x' : '');
    }

    var syncNote = body.querySelector('.dis-sync-note');
    if (st.lastSyncAt) {
        var noteText = 'Last synced: ' + new Date(st.lastSyncAt).toLocaleString();
        if (syncNote) {
            syncNote.textContent = noteText;
        } else {
            var note = document.createElement('div');
            note.className = 'dis-sync-note';
            note.textContent = noteText;
            grid.parentNode.insertBefore(note, grid);
        }
    }

    var tileDivs = grid.querySelectorAll('.dis-tile');
    tiles.forEach(function (tile, i) {
        var el = tileDivs[i];
        if (!el) return;

        var pts = (tile.points || 1) * (tile.multiplier || 1) * gm;
        var wantCls = 'dis-tile' + (tile.completed ? ' dis-tile-claimed' : tile.lockedByAdmin ? ' dis-tile-locked' : '');

        if (el.className !== wantCls) {
            el.className = wantCls;
            var inner =
                '<div class="dis-tile-type">' + esc(tile.eventType) + '</div>' +
                '<div class="dis-tile-game">' + esc(tile.gameName || (tile.gameId ? 'Game ' + tile.gameId : '?')) + '</div>';
            if (tile.completed) {
                inner += '<div class="dis-tile-claimer">' + esc(tile.completedBy || '') + '</div>' +
                    '<div class="dis-status-badge dis-badge-claimed">CLAIMED</div>';
            } else if (tile.lockedByAdmin) {
                inner += '<div class="dis-status-badge dis-badge-locked">LOCKED</div>';
            } else if (tile.multiplier > 1 || gm > 1) {
                inner += '<div class="dis-tile-pts">' + pts + 'pt' + (pts !== 1 ? 's' : '') + '</div>';
            }
            el.innerHTML = inner;
        }
    });

    // Update week number in sidebar label
    var label = document.querySelector('#dis-sidebar .obj-sidebar-label');
    if (label && st.weekNumber) label.textContent = 'Nighthawk Commandos \u2014 Week ' + st.weekNumber;
}

// ── Board view ────────────────────────────────────────────────
function _disRenderBoard() {
    var body = document.getElementById('dis-body');
    if (!body) return;

    var st    = _DIS.state || {};
    var tiles = st.tiles || [];
    var gm    = st.globalMultiplier || 1;
    var claimed = tiles.filter(function (t) { return t.completed; }).length;
    var avail   = tiles.filter(function (t) { return !t.completed && !t.lockedByAdmin; }).length;

    var html =
        '<div class="page-header">' +
        '<div class="eyebrow">LOCK-OUT DEPLOYMENT GRID</div>' +
        '<h1>Deployment Board</h1>' +
        '</div>' +
        '<div class="bingo-stats">' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + claimed + '</div><div class="bingo-stat-lbl">Claimed</div></div>' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + avail + '</div><div class="bingo-stat-lbl">Available</div></div>' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + (25 - claimed - avail) + '</div><div class="bingo-stat-lbl">Locked</div></div>' +
        '<div class="bingo-stat"><div class="bingo-stat-num">' + gm + (gm !== 1 ? 'x' : '') + '</div><div class="bingo-stat-lbl">Multiplier</div></div>' +
        '</div>';

    if (st.lastSyncAt) {
        html += '<div class="dis-sync-note">Last synced: ' + new Date(st.lastSyncAt).toLocaleString() + '</div>';
    }

    html += '<div class="dis-grid">';
    if (tiles.length === 0) {
        html += '<div class="bingo-no-board" style="grid-column:1/-1">No board configured. An admin needs to set up the tiles.</div>';
    } else {
        tiles.forEach(function (tile) {
            var cls = 'dis-tile';
            if (tile.completed)    cls += ' dis-tile-claimed';
            else if (tile.lockedByAdmin) cls += ' dis-tile-locked';

            var pts = (tile.points || 1) * (tile.multiplier || 1) * gm;

            html += '<div class="' + cls + '"' +
                (tile.gameId && !tile.completed && !tile.lockedByAdmin ? ' onclick="window.open(\'https://www.roblox.com/games/' + tile.gameId + '\',\'_blank\')"' : '') + '>' +
                '<div class="dis-tile-type">' + esc(tile.eventType) + '</div>' +
                '<div class="dis-tile-game">' + esc(tile.gameName || (tile.gameId ? 'Game ' + tile.gameId : '?')) + '</div>';

            if (tile.completed) {
                html += '<div class="dis-tile-claimer">' + esc(tile.completedBy || '') + '</div>' +
                    '<div class="dis-status-badge dis-badge-claimed">CLAIMED</div>';
            } else if (tile.lockedByAdmin) {
                html += '<div class="dis-status-badge dis-badge-locked">LOCKED</div>';
            } else if (tile.multiplier > 1 || gm > 1) {
                html += '<div class="dis-tile-pts">' + pts + 'pt' + (pts !== 1 ? 's' : '') + '</div>';
            }
            html += '</div>';
        });
    }
    html += '</div>';

    body.innerHTML = html;
}

// ── Leaderboard ───────────────────────────────────────────────
function _disRenderLB() {
    var body = document.getElementById('dis-body');
    if (!body) return;

    var entries = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];

    var html = '<div class="page-header"><div class="eyebrow">MONTHLY STANDINGS</div><h1>Leaderboard</h1></div>';

    if (entries.length === 0) {
        body.innerHTML = html + '<div class="empty">No entries yet.</div>';
        return;
    }

    html += '<div class="tbl-wrap"><table>' +
        '<thead><tr>' +
        '<th style="width:40px">#</th>' +
        '<th>Officer</th>' +
        '<th style="text-align:right">Points</th>' +
        '<th style="text-align:right">Tiles</th>' +
        '<th style="text-align:right">Raffle Entries</th>' +
        '</tr></thead><tbody>';

    entries.forEach(function (e) {
        var rankCls = e.rank === 1 ? 'top1' : e.rank === 2 ? 'top2' : e.rank === 3 ? 'top3' : '';
        html += '<tr>' +
            '<td class="bingo-lb-rank ' + rankCls + '">' + e.rank + '</td>' +
            '<td class="bingo-lb-user">' + esc(e.username) + '</td>' +
            '<td class="bingo-lb-num">' + e.points + '</td>' +
            '<td class="bingo-lb-num">' + e.tiles + '</td>' +
            '<td class="bingo-lb-num">' + e.raffleEntries + '</td>' +
            '</tr>';
    });

    body.innerHTML = html + '</tbody></table></div>';
}

// ── Raffle view ────────────────────────────────────────────────
function _disRenderRaffle() {
    var body = document.getElementById('dis-body');
    if (!body) return;

    var entries = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];
    var totalEntries = entries.reduce(function (s, e) { return s + (e.raffleEntries || 0); }, 0);

    var html =
        '<div class="page-header"><div class="eyebrow">WEIGHTED RAFFLE</div><h1>Raffle</h1></div>' +
        '<div class="info-block" style="margin-bottom:16px">' +
        '<p class="admin-desc">Each raffle entry counts as one ticket. ' +
        'Total entries this month: <strong style="color:var(--accent2)">' + totalEntries + '</strong>.</p>' +
        '</div>' +
        '<div class="tbl-wrap" style="margin-bottom:16px"><table>' +
        '<thead><tr><th>Officer</th><th style="text-align:right">Entries</th><th style="text-align:right">Chance</th></tr></thead><tbody>';

    entries.filter(function (e) { return (e.raffleEntries || 0) > 0; }).forEach(function (e) {
        var pct = totalEntries > 0 ? ((e.raffleEntries / totalEntries) * 100).toFixed(1) : '0.0';
        html += '<tr><td>' + esc(e.username) + '</td>' +
            '<td style="text-align:right;color:var(--accent2)">' + e.raffleEntries + '</td>' +
            '<td style="text-align:right;color:var(--muted)">' + pct + '%</td></tr>';
    });

    html += '</tbody></table></div>';

    var isAdmin = window.AUTH && window.AUTH.canAccessAdmin && window.AUTH.canAccessAdmin();
    if (isAdmin) {
        html += '<button class="btn-dis-primary" id="dis-raffle-btn" data-click="disRunRaffle">Run Raffle</button>' +
            '<div id="dis-raffle-result" style="margin-top:20px"></div>';
    }

    body.innerHTML = html;
}

// ── Admin: Sync tab ────────────────────────────────────────────
function _disAdminSync(body) {
    var st = _DIS.state || {};
    body.innerHTML =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Sync from Google Sheets</h3>' +
        '<p class="admin-desc">Fetches event log rows from the mainframe Apps Script and claims any matching unclaimed tiles.</p>' +
        (st.lastSyncAt ? '<p class="admin-desc">Last sync: ' + new Date(st.lastSyncAt).toLocaleString() + '</p>' : '') +
        '</div>' +
        '<div class="dis-admin-actions">' +
        '<button class="btn-dis-primary" id="dis-sync-btn" onclick="disTriggerSync()">Sync Now</button>' +
        '</div>' +
        '<div id="dis-sync-result" style="margin-top:16px"></div>' +
        '<hr style="border-color:var(--border);margin:24px 0">' +
        '<div class="info-block">' +
        '<h3>Global Multiplier</h3>' +
        '<p class="admin-desc">Multiplies the base points for all unclaimed tiles.</p>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:12px">' +
        '<input id="dis-mult-input" class="admin-input" type="number" min="1" max="10" step="0.5" value="' + (st.globalMultiplier || 1) + '" style="width:100px">' +
        '<button class="btn-dis-primary" onclick="disSetGlobalMultiplier()">Set Multiplier</button>' +
        '</div></div>' +
        '<hr style="border-color:var(--border);margin:24px 0">' +
        '<div class="info-block">' +
        '<h3>Week Control</h3>' +
        '<p class="admin-desc">Advance to next week: awards +1 raffle ticket to top 5 officers by tiles, then resets the board for a new week. Points and raffle entries carry forward through the month.</p>' +
        '<div class="dis-admin-actions" style="margin-top:12px">' +
        '<button class="btn-dis-primary" style="background:rgba(124,74,184,.2)" onclick="disAdvanceWeek()">Advance to Next Week</button>' +
        '</div>' +
        '<div id="dis-advance-week-result" style="margin-top:12px"></div>' +
        '</div>' +
        '<hr style="border-color:var(--border);margin:24px 0">' +
        '<div class="info-block">' +
        '<h3>Month Control</h3>' +
        '<p class="admin-desc">Advance to next month: archives all-time stats, then resets all points, tiles, and raffle entries.</p>' +
        '<div class="dis-admin-actions" style="margin-top:12px">' +
        '<button class="btn-ghost" style="font-size:11px;color:var(--red);border-color:rgba(224,82,82,.3)" onclick="disAdvanceMonth()">Advance to Next Month</button>' +
        '</div>' +
        '<div id="dis-advance-month-result" style="margin-top:12px"></div>' +
        '</div>';
}

// ── Admin: Tiles tab ───────────────────────────────────────────
function _disAdminTiles(body) {
    var tiles = (_DIS.state && _DIS.state.tiles) ? _DIS.state.tiles : [];
    var gm = (_DIS.state && _DIS.state.globalMultiplier) || 1;

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Tile Moderation</h3>' +
        '<p class="admin-desc">Unlock, lock, or force-assign individual tiles. You can also set per-tile multipliers.</p>' +
        '<div class="dis-admin-actions" style="margin-top:12px">' +
        '<button class="btn-ghost" style="font-size:11px;color:var(--red);border-color:rgba(224,82,82,.3)" onclick="disResetWeek()">Reset All Progress</button>' +
        '<button class="btn-dis-primary" onclick="disRegenerateBoard()">Regenerate Board</button>' +
        '</div></div>';

    if (tiles.length === 0) {
        html += '<div class="empty">No tiles configured.</div>';
        body.innerHTML = html;
        return;
    }

    html += '<div class="tbl-wrap"><table>' +
        '<thead><tr><th>#</th><th>Event Type</th><th>Game</th><th>Status</th><th>Claimed By</th><th>Base Pts</th><th style="text-align:right">Actions</th></tr></thead>' +
        '<tbody>';

    tiles.forEach(function (tile) {
        var status    = tile.completed ? 'Claimed' : tile.lockedByAdmin ? 'Locked' : 'Available';
        var statusCls = tile.completed ? 'b-complete' : tile.lockedByAdmin ? 'b-incomplete' : 'b-exempt';
        var basePts   = tile.points || 1;
        var pos       = tile.position;

        html += '<tr>' +
            '<td>' + (pos + 1) + '</td>' +
            '<td style="white-space:nowrap">' +
            '<input id="dis-tet-' + pos + '" class="admin-input" value="' + esc(tile.eventType || '') + '" style="width:110px;padding:2px 4px;height:26px;font-size:12px"> ' +
            '<button class="admin-remove-btn" style="border-color:rgba(74,127,200,.3);color:var(--blue)" onclick="disSetTileEventType(' + pos + ')">Set</button>' +
            '</td>' +
            '<td style="max-width:120px;white-space:normal">' + esc(tile.gameName || tile.gameId || '?') + '</td>' +
            '<td><span class="badge ' + statusCls + '">' + status + '</span></td>' +
            '<td>' + (tile.completedBy ? esc(tile.completedBy) : '<span style="color:var(--muted)">—</span>') + '</td>' +
            '<td style="white-space:nowrap">' +
            '<input id="dis-tp-' + pos + '" class="admin-input" type="number" min="1" value="' + basePts + '" style="width:52px;padding:2px 4px;height:26px;font-size:12px"> ' +
            '<button class="admin-remove-btn" style="border-color:rgba(120,90,200,.3);color:#a580e0" onclick="disSetTilePoints(' + pos + ')">Set</button>' +
            '</td>' +
            '<td style="text-align:right;white-space:nowrap">';

        if (tile.completed) {
            html += '<button class="admin-remove-btn" onclick="disUnlockTile(' + pos + ')">Unlock</button> ';
        }
        if (!tile.lockedByAdmin && !tile.completed) {
            html += '<button class="admin-remove-btn" style="border-color:rgba(200,164,74,.3);color:var(--accent)" onclick="disLockTile(' + pos + ')">Lock</button> ';
        }
        if (tile.lockedByAdmin) {
            html += '<button class="admin-remove-btn" style="border-color:rgba(74,156,114,.3);color:var(--green)" onclick="disUnlockTile(' + pos + ')">Unlock</button> ';
        }
        html += '<button class="admin-remove-btn" style="border-color:rgba(74,127,200,.3);color:var(--blue)" onclick="disForceClaim(' + pos + ')">Force Claim</button>';
        html += '</td></tr>';
    });

    html += '</tbody></table></div>';
    body.innerHTML = html;
}

// ── Admin: Points tab ──────────────────────────────────────────
function _disAdminPoints(body) {
    var lb = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Points Management</h3>' +
        '<p class="admin-desc">Manually adjust points or raffle entries. Use positive values to add, negative to subtract.</p></div>';

    html += '<div class="dis-inline-form" style="margin-bottom:24px">' +
        '<input id="dis-pts-user" class="admin-input" placeholder="Roblox username" style="flex:1">' +
        '<input id="dis-pts-amt" class="admin-input" type="number" placeholder="Points delta" style="width:130px">' +
        '<button class="btn-dis-primary" onclick="disAdjustPoints()">Adjust Points</button>' +
        '</div>';

    if (lb.length > 0) {
        html += '<div class="tbl-wrap"><table>' +
            '<thead><tr><th>Officer</th><th style="text-align:right">Points</th><th style="text-align:right">Tiles</th><th style="text-align:right">Entries</th></tr></thead><tbody>';
        lb.forEach(function (e) {
            html += '<tr><td>' + esc(e.username) + '</td>' +
                '<td style="text-align:right;color:var(--accent2)">' + e.points + '</td>' +
                '<td style="text-align:right;color:var(--muted)">' + e.tiles + '</td>' +
                '<td style="text-align:right;color:var(--muted)">' + e.raffleEntries + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    body.innerHTML = html;
}

// ── Admin: Raffle tab ──────────────────────────────────────────
function _disAdminRaffle(body) {
    var lb = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];
    var total = lb.reduce(function (s, e) { return s + (e.raffleEntries || 0); }, 0);

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Raffle Management</h3>' +
        '<p class="admin-desc">Adjust raffle entries manually, or run the weighted raffle. ' +
        'Total entries: <strong style="color:var(--accent2)">' + total + '</strong>.</p></div>';

    html += '<div class="dis-inline-form" style="margin-bottom:24px">' +
        '<input id="dis-rfl-user" class="admin-input" placeholder="Roblox username" style="flex:1">' +
        '<input id="dis-rfl-amt" class="admin-input" type="number" placeholder="Entries delta" style="width:130px">' +
        '<button class="btn-dis-primary" onclick="disAdjustRaffle()">Adjust Entries</button>' +
        '</div>';

    html += '<div style="margin-bottom:24px">' +
        '<button class="btn-dis-primary" style="font-size:13px;padding:12px 28px" id="dis-raffle-run-btn" onclick="disRunRaffle()">Run Weighted Raffle</button>' +
        '</div>' +
        '<div id="dis-raffle-result"></div>';

    if (lb.length > 0) {
        html += '<div class="tbl-wrap"><table>' +
            '<thead><tr><th>Officer</th><th style="text-align:right">Entries</th><th style="text-align:right">Chance</th></tr></thead><tbody>';
        lb.filter(function (e) { return (e.raffleEntries || 0) > 0; }).forEach(function (e) {
            var pct = total > 0 ? ((e.raffleEntries / total) * 100).toFixed(1) : '0.0';
            html += '<tr><td>' + esc(e.username) + '</td>' +
                '<td style="text-align:right;color:var(--accent2)">' + e.raffleEntries + '</td>' +
                '<td style="text-align:right;color:var(--muted)">' + pct + '%</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    body.innerHTML = html;
}

// ── Admin: Game Pool tab ───────────────────────────────────────
function _disAdminGamePool(body) {
    body.innerHTML = '<div class="obj-loading">Loading game pool\u2026</div>';
    fetch('/api/dis/gamepool')
        .then(function (r) { return r.json(); })
        .then(function (pool) {
            _DIS.gamepool = Array.isArray(pool) ? pool : [];
            _disRenderGamePool(body);
        })
        .catch(function (e) {
            body.innerHTML = '<div class="obj-error">Failed to load: ' + esc(e.message) + '</div>';
        });
}

function _disRenderGamePool(body) {
    var pool = _DIS.gamepool || [];

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Game Pool</h3>' +
        '<p class="admin-desc">Define the games used when generating the board. Each game needs a Roblox Game ID and event types.</p></div>';

    html += '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Add Game</h3>' +
        '<div class="dis-inline-form">' +
        '<input id="dis-gp-id" class="admin-input" placeholder="Game ID (e.g. 1234567890)" style="width:180px">' +
        '<input id="dis-gp-name" class="admin-input" placeholder="Display name" style="flex:1">' +
        '<input id="dis-gp-types" class="admin-input" placeholder="Event types (comma-separated)" style="flex:2">' +
        '<button class="btn-dis-primary" onclick="disAddGame()">Add</button>' +
        '</div></div>';

    if (pool.length === 0) {
        html += '<div class="empty">No games in pool.</div>';
    } else {
        html += '<div class="tbl-wrap"><table>' +
            '<thead><tr><th>Game ID</th><th>Name</th><th>Event Types</th><th style="text-align:right">Actions</th></tr></thead><tbody>';
        pool.forEach(function (g, i) {
            html += '<tr>' +
                '<td style="font-family:\'DM Mono\',monospace;font-size:11px">' + esc(String(g.gameId)) + '</td>' +
                '<td><input id="dis-gp-edit-name-' + i + '" class="admin-input" value="' + esc(g.name || '') + '" style="width:130px;padding:2px 4px;height:26px;font-size:12px"></td>' +
                '<td><input id="dis-gp-edit-types-' + i + '" class="admin-input" value="' + esc((g.eventTypes || []).join(', ')) + '" style="width:220px;padding:2px 4px;height:26px;font-size:12px"></td>' +
                '<td style="text-align:right;white-space:nowrap">' +
                '<button class="admin-remove-btn" style="border-color:rgba(74,156,114,.3);color:var(--green)" onclick="disEditGame(' + i + ')">Save</button> ' +
                '<button class="admin-remove-btn" onclick="disRemoveGame(' + i + ')">Remove</button>' +
                '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
    }

    body.innerHTML = html;
}

// ── Admin: Audit Log tab ───────────────────────────────────────
function _disAdminAudit(body) {
    body.innerHTML = '<div class="obj-loading">Loading audit log\u2026</div>';
    Promise.all([
        fetch('/api/dis/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-audit' })
        }).then(function (r) { return r.json(); }).catch(function () { return { log: [] }; }),
        fetch('/api/admin/audit', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : { log: [] }; })
            .catch(function () { return { log: [] }; })
    ]).then(function (results) {
        var disLog   = (results[0].log || []).map(function (e) { return Object.assign({}, e, { _src: 'DIS' }); });
        var adminLog = (results[1].log || []).map(function (e) { return Object.assign({}, e, { _src: 'ADM' }); });
        var log = disLog.concat(adminLog).sort(function (a, b) {
            return (b.timestamp || '').localeCompare(a.timestamp || '');
        });

        if (log.length === 0) {
            body.innerHTML = '<div class="empty">No audit log entries.</div>';
            return;
        }

        var srcColors = { DIS: 'b-bronze', ADM: 'b-silver' };

        var html = '<div class="tbl-wrap"><table>' +
            '<thead><tr><th>Time</th><th>Admin</th><th>Source</th><th>Action</th><th>Details</th></tr></thead><tbody>';
        log.forEach(function (entry) {
            var srcClass = srcColors[entry._src] || 'b-constant';
            html += '<tr>' +
                '<td style="white-space:nowrap;font-size:11px">' + new Date(entry.timestamp).toLocaleString() + '</td>' +
                '<td>' + esc(entry.adminId || '') + '</td>' +
                '<td><span class="badge ' + srcClass + '">' + esc(entry._src) + '</span></td>' +
                '<td><span class="badge b-constant">' + esc(entry.action) + '</span></td>' +
                '<td style="font-size:11px;color:var(--muted);word-break:break-all">' + esc(JSON.stringify(entry.details || {})) + '</td>' +
                '</tr>';
        });
        body.innerHTML = html + '</tbody></table></div>';
    }).catch(function (e) {
        body.innerHTML = '<div class="obj-error">Failed to load audit log: ' + esc(e.message) + '</div>';
    });
}

// ── Action: Advance week ───────────────────────────────────────
function disAdvanceWeek() {
    if (!confirm('Advance to next week?\n\nThis will:\n• Award +1 raffle ticket to the top 5 officers by tiles\n• Reset all tile claims for the new week\n• Keep current points and raffle entries\n\nCannot be undone.')) return;

    var btn    = document.getElementById('dis-advance-week-btn');
    var result = document.getElementById('dis-advance-week-result');
    if (btn) btn.disabled = true;

    fetch('/api/dis/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance-week' })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (btn) btn.disabled = false;
            if (res.error) throw new Error(res.error);

            var top5Names = (res.top5 || []).map(function (e) { return e.username + ' (' + e.tiles + ' tiles)'; }).join(', ');
            var msg = 'Week advanced to Week ' + res.weekNumber + '.';
            if (top5Names) msg += '\n\nTop 5 awarded +1 raffle ticket: ' + top5Names;

            if (result) result.innerHTML = '<div class="field-info" style="margin-top:8px"><strong>Done!</strong><br>' + esc(msg).replace(/\n/g, '<br>') + '</div>';
            toast('Week advanced to Week ' + res.weekNumber, 'success');
            _disLoad(false);
        })
        .catch(function (e) {
            if (btn) btn.disabled = false;
            if (result) result.innerHTML = '<div class="field-warn">Failed: ' + esc(e.message) + '</div>';
            toast('Advance week failed: ' + e.message, 'error');
        });
}

// ── Action: Advance month ──────────────────────────────────────
function disAdvanceMonth() {
    if (!confirm('Advance to next month?\n\nThis will:\n• Archive this month\'s stats to the all-time leaderboard\n• Reset ALL points, tiles, and raffle entries\n• Reset week counter to 1\n\nThis CANNOT be undone.')) return;

    var result = document.getElementById('dis-advance-month-result');

    fetch('/api/dis/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance-month' })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            if (result) result.innerHTML = '<div class="field-info" style="margin-top:8px"><strong>Month advanced!</strong><br>' +
                esc(res.usersArchived + ' officers archived. All stats reset.') + '</div>';
            toast('Month reset complete', 'success');
            _disLoad(false);
        })
        .catch(function (e) {
            if (result) result.innerHTML = '<div class="field-warn">Failed: ' + esc(e.message) + '</div>';
            toast('Advance month failed: ' + e.message, 'error');
        });
}

// ── Action: Trigger sync ───────────────────────────────────────
function disTriggerSync() {
    var btn = document.getElementById('dis-sync-btn');
    var result = document.getElementById('dis-sync-result');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching events\u2026'; }

    var url = window.SCRIPT_URL;
    if (!url) { toast('SCRIPT_URL not configured', 'error'); return; }

    fetch(url + '?action=api&fn=getDeploymentEvents', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (json) {
            var events = (json && json.events) ? json.events : [];
            if (events.length === 0) {
                var raw = JSON.stringify(json).slice(0, 200);
                if (result) result.innerHTML = '<div class="field-warn">Apps Script returned 0 events. Response: <code style="font-size:10px;word-break:break-all">' + esc(raw) + '</code></div>';
                if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
                return null;
            }
            if (btn) btn.textContent = 'Processing ' + events.length + ' rows\u2026';
            return fetch('/api/dis/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: events })
            }).then(function (r) { return r.json(); });
        })
        .then(function (res) {
            if (!res) return;
            if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
            if (res.error) throw new Error(res.error);
            var lines = [
                res.claimed  + ' new tile(s) claimed',
                res.skipped  + ' already taken',
                (res.notFound > 0 ? res.notFound + ' had no matching tile' : null),
                res.total    + ' total rows from spreadsheet'
            ].filter(Boolean);
            var cls = res.claimed > 0 ? 'field-info' : 'field-warn';
            if (result) result.innerHTML = '<div class="' + cls + ' mt"><strong>Sync complete.</strong><br>' +
                lines.map(function (l) { return esc(l); }).join('<br>') + '</div>';
            toast('Sync: ' + res.claimed + ' claimed, ' + res.skipped + ' taken', res.claimed > 0 ? 'success' : 'error');
            _disLoad(false);
        })
        .catch(function (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
            if (result) result.innerHTML = '<div class="field-warn">Sync failed: ' + esc(e.message) + '</div>';
            toast('Sync failed: ' + e.message, 'error');
        });
}

// ── Unlock / lock tile ─────────────────────────────────────────
function disUnlockTile(pos) { _disAdminAction({ action: 'unlock-tile', position: pos }, 'Tile unlocked'); }
function disLockTile(pos)   { _disAdminAction({ action: 'lock-tile',   position: pos }, 'Tile locked');   }

function disForceClaim(pos) {
    var user = prompt('Roblox username to assign tile ' + (pos + 1) + ' to:');
    if (!user || !user.trim()) return;
    _disAdminAction({ action: 'force-claim', position: pos, username: user.trim() }, 'Tile assigned to ' + user.trim());
}

function disSetTilePoints(pos) {
    var inp = document.getElementById('dis-tp-' + pos);
    var val = inp ? parseInt(inp.value, 10) : NaN;
    if (isNaN(val) || val < 1) { toast('Points must be a positive integer', 'error'); return; }
    _disAdminAction({ action: 'set-tile-points', position: pos, points: val }, 'Tile ' + (pos + 1) + ' set to ' + val + ' pt' + (val !== 1 ? 's' : ''));
}

function disSetTileEventType(pos) {
    var input = document.getElementById('dis-tet-' + pos);
    if (!input) return;
    var eventType = input.value.trim();
    if (!eventType) { toast('Enter an event type', 'error'); return; }
    _disAdminAction({ action: 'set-tile-eventtype', position: pos, eventType: eventType }, 'Event type updated');
}

// ── Points / raffle adjustments ────────────────────────────────
function disAdjustPoints() {
    var user = document.getElementById('dis-pts-user');
    var amt  = document.getElementById('dis-pts-amt');
    if (!user || !amt || !user.value.trim() || !amt.value) { toast('Enter username and amount', 'error'); return; }
    _disAdminAction({ action: 'adjust-points', username: user.value.trim(), delta: parseFloat(amt.value) }, 'Points updated');
    user.value = ''; amt.value = '';
}

function disAdjustRaffle() {
    var user = document.getElementById('dis-rfl-user');
    var amt  = document.getElementById('dis-rfl-amt');
    if (!user || !amt || !user.value.trim() || !amt.value) { toast('Enter username and amount', 'error'); return; }
    _disAdminAction({ action: 'adjust-raffle', username: user.value.trim(), delta: parseInt(amt.value, 10) }, 'Raffle entries updated');
    user.value = ''; amt.value = '';
}

function disSetGlobalMultiplier() {
    var inp = document.getElementById('dis-mult-input');
    var val = inp ? parseFloat(inp.value) : NaN;
    if (isNaN(val) || val < 0.5) { toast('Enter a valid multiplier (\u2265 0.5)', 'error'); return; }
    _disAdminAction({ action: 'set-multiplier', value: val }, 'Global multiplier set to ' + val + 'x');
}

function disResetWeek() {
    if (!confirm('This will clear ALL tile claims and user progress for the current week. Cannot be undone. Continue?')) return;
    _disAdminAction({ action: 'reset-week' }, 'Week progress reset');
}

function disRegenerateBoard() {
    if (!confirm('Generate a new random board from the game pool? Current tiles will be replaced.')) return;
    _disAdminAction({ action: 'regenerate-board' }, 'Board regenerated');
}

// ── Run weighted raffle ────────────────────────────────────────
function disRunRaffle() {
    var btn = document.getElementById('dis-raffle-run-btn') || document.getElementById('dis-raffle-btn');
    var resultEl = document.getElementById('dis-raffle-result');
    if (btn) btn.disabled = true;

    var lb = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];
    var pool = [];
    lb.forEach(function (e) {
        for (var i = 0; i < (e.raffleEntries || 0); i++) pool.push(e.username);
    });

    if (pool.length === 0) {
        toast('No raffle entries to draw from', 'error');
        if (btn) btn.disabled = false;
        return;
    }

    if (resultEl) resultEl.innerHTML = '<div style="font-family:\'Syne\',sans-serif;font-size:13px;color:var(--muted)">Drawing\u2026</div>';

    var ticks = 0, maxTicks = 25;
    var anim = setInterval(function () {
        ticks++;
        var idx = Math.floor(Math.random() * pool.length);
        if (resultEl && ticks < maxTicks) {
            resultEl.innerHTML = '<div style="font-family:\'Syne\',sans-serif;font-size:18px;color:var(--accent);opacity:0.6">' + esc(pool[idx]) + '</div>';
        }
        if (ticks >= maxTicks) {
            clearInterval(anim);
            var winner = pool[Math.floor(Math.random() * pool.length)];
            if (resultEl) {
                resultEl.innerHTML =
                    '<div style="background:rgba(200,164,74,.1);border:1px solid rgba(200,164,74,.3);padding:20px;text-align:center;border-radius:8px">' +
                    '<div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px">WINNER</div>' +
                    '<div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:800;color:var(--accent2)">' + esc(winner) + '</div>' +
                    '</div>';
            }
            if (btn) btn.disabled = false;
        }
    }, 80);
}

// ── Game pool actions ──────────────────────────────────────────
function disAddGame() {
    var id    = document.getElementById('dis-gp-id');
    var name  = document.getElementById('dis-gp-name');
    var types = document.getElementById('dis-gp-types');
    if (!id || !id.value.trim()) { toast('Enter a Game ID', 'error'); return; }
    var eventTypes = (types && types.value) ? types.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['Event'];
    var pool = (_DIS.gamepool || []).slice();
    pool.push({ gameId: id.value.trim(), name: (name && name.value.trim()) || '', eventTypes: eventTypes });
    _disSaveGamePool(pool);
}

function disEditGame(idx) {
    var nameEl  = document.getElementById('dis-gp-edit-name-'  + idx);
    var typesEl = document.getElementById('dis-gp-edit-types-' + idx);
    var pool    = (_DIS.gamepool || []).slice();
    if (!pool[idx]) { toast('Game not found', 'error'); return; }
    var name       = nameEl  ? nameEl.value.trim()  : (pool[idx].name || '');
    var eventTypes = typesEl
        ? typesEl.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        : pool[idx].eventTypes;
    if (!eventTypes.length) { toast('Enter at least one event type', 'error'); return; }
    pool[idx] = Object.assign({}, pool[idx], { name: name, eventTypes: eventTypes });
    _disSaveGamePool(pool);
}

function disRemoveGame(idx) {
    if (!confirm('Remove this game from the pool?')) return;
    var pool = (_DIS.gamepool || []).slice();
    pool.splice(idx, 1);
    _disSaveGamePool(pool);
}

function _disSaveGamePool(pool) {
    fetch('/api/dis/gamepool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool: pool })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            _DIS.gamepool = pool;
            toast('Game pool saved (' + pool.length + ' games)', 'success');
            var body = document.getElementById('admin-body');
            if (body) _disAdminGamePool(body);
        })
        .catch(function (e) { toast('Save failed: ' + e.message, 'error'); });
}

// ── Generic admin action helper ────────────────────────────────
function _disAdminAction(payload, successMsg) {
    fetch('/api/dis/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.error) throw new Error(res.error);
            toast(successMsg, 'success');
            if (typeof _adminRefreshDisTab === 'function') {
                setTimeout(_adminRefreshDisTab, 300);
            }
        })
        .catch(function (e) { toast('Action failed: ' + e.message, 'error'); });
}

// ── Nav handler ────────────────────────────────────────────────
function disNavGo(el) {
    var view = el && el.dataset ? el.dataset.disview : el;
    if (!view) return;
    _DIS.view = view;
    _disUpdateNavActive();
    var main = document.getElementById('dis-main');
    if (main) main.scrollTop = 0;
    _disRenderView();
}

// ── Helpers ───────────────────────────────────────────────────
function _disWeek() {
    var now = new Date();
    var start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    var day = start.getUTCDay() || 7;
    if (day !== 4) start.setUTCDate(start.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((now.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7);
}
