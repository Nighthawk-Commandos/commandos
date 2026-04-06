// ═══════════════════════════════════════════════════════════════
//  dis.js — Deployment Incentive System
//  Lock-out deployment grid with persistent data, admin controls,
//  audit logs, points, weighted raffle, real-time polling.
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Module state ──────────────────────────────────────────────
var _DIS = {
    state:     null,       // { tiles, globalMultiplier, weekNumber, leaderboard, stats, lastSyncAt }
    stateHash: null,       // JSON fingerprint of last rendered state
    gamepool:  null,       // [{ gameId, name, eventTypes }]
    view:      'board',    // 'board' | 'lb' | 'raffle' | 'admin'
    adminTab:  'sync',     // 'sync' | 'tiles' | 'points' | 'raffle' | 'gamepool' | 'audit'
    poll:      null,
    loading:   false
};

// ── Entry point ───────────────────────────────────────────────
function renderDISSection() {
    _DIS.view = 'board';
    _DIS.adminTab = 'sync';
    _DIS.stateHash = null; // force full render on first load
    _disPaint();
    _disLoad(true);
    _disStartPoll();
    _disStartVisibilityWatch();
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

// ── Visibility watch — pause poll when tab is hidden ──────────
// Saves requests when users have the tab open but aren't looking at it.
// On return, refreshes immediately then restarts the 60s interval.
var _disVisHandler = null;

function _disStartVisibilityWatch() {
    _disStopVisibilityWatch();
    _disVisHandler = function () {
        if (document.hidden) {
            _disStopPoll();
        } else {
            _disLoad(false);   // immediate refresh on return
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
            if (_DIS.view === 'admin') return; // never clobber admin inputs
            if (unchanged) return;             // nothing changed, skip re-render
            _DIS.stateHash = newHash;
            // Partial update for board view; full re-render for leaderboard/raffle
            if (_DIS.view === 'board' && document.getElementById('dis-body')) {
                _disSmartUpdateBoard();
            } else {
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

// ── Paint shell (header + nav tabs) ──────────────────────────
function _disPaint() {
    var hs = document.getElementById('home-screen');
    if (!hs) return;
    var isAdmin = window.AUTH && window.AUTH.canAccessAdmin && window.AUTH.canAccessAdmin();
    var wk = (_DIS.state && _DIS.state.weekNumber) ? _DIS.state.weekNumber : _disWeek();

    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<div class="home-inner" style="padding-top:40px">' +
        '<div class="dis-wrap">' +
        '<div class="dis-header">' +
        '<div class="dis-header-left">' +
        '<div class="dis-eyebrow">WEEK ' + wk + ' \u2014 LOCK-OUT DEPLOYMENT GRID</div>' +
        '<div class="dis-title">Deployment Incentive System</div>' +
        '</div>' +
        '<div class="dis-nav">' +
        '<button class="dis-nav-btn' + (_DIS.view === 'board'  ? ' active' : '') + '" data-click="disBoardView">Grid</button>' +
        '<button class="dis-nav-btn' + (_DIS.view === 'lb'     ? ' active' : '') + '" data-click="disLeaderboardView">Leaderboard</button>' +
        (isAdmin ? '<button class="dis-nav-btn' + (_DIS.view === 'admin'  ? ' active' : '') + '" data-click="disAdminView">Admin</button>' : '') +
        '<button class="dis-nav-btn" data-click="showHomeScreen">\u2190 Hub</button>' +
        '</div>' +
        '</div>' +
        '<div id="dis-body">' +
        (!_DIS.state ? '<div class="obj-loading">Loading\u2026</div>' : '') +
        '</div>' +
        '</div>' +
        '</div>';

    if (_DIS.state) _disRenderView();
}

function _disRenderView() {
    if (_DIS.view === 'lb')    return _disRenderLB();
    if (_DIS.view === 'raffle') return _disRenderRaffle();
    if (_DIS.view === 'admin') return _disRenderAdmin();
    return _disRenderBoard();
}

// ── Smart partial board update (poll only) ────────────────────
// Updates stat numbers, sync note, and only tiles that changed state.
// Never rebuilds the entire grid so scroll position and layout are preserved.
function _disSmartUpdateBoard() {
    var body = document.getElementById('dis-body');
    if (!body) { _disRenderBoard(); return; }

    // If the grid doesn't exist yet, do a full render
    var grid = body.querySelector('.dis-grid');
    if (!grid) { _disRenderBoard(); return; }

    var st    = _DIS.state || {};
    var tiles = st.tiles || [];
    var gm    = st.globalMultiplier || 1;
    var claimed = tiles.filter(function (t) { return t.completed; }).length;
    var avail   = tiles.filter(function (t) { return !t.completed && !t.lockedByAdmin; }).length;
    var locked  = 25 - claimed - avail;

    // Update stat numbers in-place
    var statNums = body.querySelectorAll('.bingo-stat-num');
    if (statNums.length >= 4) {
        statNums[0].textContent = claimed;
        statNums[1].textContent = avail;
        statNums[2].textContent = locked;
        statNums[3].textContent = gm + (gm !== 1 ? 'x' : '');
    }

    // Update or insert sync note
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

    // Update only tiles whose state changed
    var tileDivs = grid.querySelectorAll('.dis-tile');
    tiles.forEach(function (tile, i) {
        var el = tileDivs[i];
        if (!el) return;

        var pts = (tile.points || 1) * (tile.multiplier || 1) * gm;
        var wantCls = 'dis-tile' + (tile.completed ? ' dis-tile-claimed' : tile.lockedByAdmin ? ' dis-tile-locked' : '');

        // Only rebuild the tile if its CSS class changed (i.e. status changed)
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
                (tile.gameId ? ' onclick="window.open(\'https://www.roblox.com/games/' + tile.gameId + '\',\'_blank\')"' : '') + '>' +
                '<div class="dis-tile-type">' + esc(tile.eventType) + '</div>' +
                '<div class="dis-tile-game">' + esc(tile.gameName || (tile.gameId ? 'Game ' + tile.gameId : '?')) + '</div>';

            if (tile.completed) {
                html += '<div class="dis-tile-claimer">' + esc(tile.completedBy || '') + '</div>' +
                    '<div class="dis-status-badge dis-badge-claimed">CLAIMED</div>';
            } else if (tile.lockedByAdmin) {
                html += '<div class="dis-status-badge dis-badge-locked">LOCKED</div>';
            } else {
                if (tile.multiplier > 1 || gm > 1) {
                    html += '<div class="dis-tile-pts">' + pts + 'pt' + (pts !== 1 ? 's' : '') + '</div>';
                }
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
    if (entries.length === 0) {
        body.innerHTML = '<div class="empty">No entries yet.</div>';
        return;
    }

    var html = '<div class="tbl-wrap"><table>' +
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
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Weekly Raffle</h3>' +
        '<p class="admin-desc">Weighted raffle — each raffle entry counts as one ticket. ' +
        'Total entries this week: <strong style="color:var(--accent2)">' + totalEntries + '</strong>.</p>' +
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

// ── Admin view ────────────────────────────────────────────────
function _disRenderAdmin() {
    var body = document.getElementById('dis-body');
    if (!body) return;

    var tabs = [
        { key: 'sync',     label: 'Sync' },
        { key: 'tiles',    label: 'Tiles' },
        { key: 'points',   label: 'Points' },
        { key: 'raffle',   label: 'Raffle' },
        { key: 'gamepool', label: 'Game Pool' },
        { key: 'audit',    label: 'Audit Log' }
    ];

    var tabHtml = '<div class="dis-admin-tabs">';
    tabs.forEach(function (t) {
        tabHtml += '<button class="dis-admin-tab' + (_DIS.adminTab === t.key ? ' active' : '') + '" data-tab="' + t.key + '" onclick="disAdminTab(this)">' + t.label + '</button>';
    });
    tabHtml += '</div><div id="dis-admin-body"></div>';

    body.innerHTML = tabHtml;
    _disRenderAdminTab();
}

function disAdminTab(el) {
    _DIS.adminTab = el.dataset.tab;
    document.querySelectorAll('.dis-admin-tab').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
    _disRenderAdminTab();
}

function _disRenderAdminTab() {
    var body = document.getElementById('dis-admin-body');
    if (!body) return;
    var tab = _DIS.adminTab;
    if (tab === 'sync')     _disAdminSync(body);
    else if (tab === 'tiles')    _disAdminTiles(body);
    else if (tab === 'points')   _disAdminPoints(body);
    else if (tab === 'raffle')   _disAdminRaffle(body);
    else if (tab === 'gamepool') _disAdminGamePool(body);
    else if (tab === 'audit')    _disAdminAudit(body);
}

// ── Admin: Sync ────────────────────────────────────────────────
function _disAdminSync(body) {
    var st = _DIS.state || {};
    body.innerHTML =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Sync from Google Sheets</h3>' +
        '<p class="admin-desc">Fetches event log rows from the mainframe Apps Script and claims any matching unclaimed tiles. ' +
        'The sync matches each row\'s (Game ID + Event Type) against available tiles. ' +
        'First valid submission claims the tile globally.</p>' +
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
        '<p class="admin-desc">Override the current week number displayed. Resets require using the Tiles tab.</p>' +
        '</div>';
}

// ── Admin: Tiles ───────────────────────────────────────────────
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
            '<td>' + esc(tile.eventType) + '</td>' +
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

// ── Admin: Points ──────────────────────────────────────────────
function _disAdminPoints(body) {
    var lb = (_DIS.state && _DIS.state.leaderboard) ? _DIS.state.leaderboard : [];

    var html =
        '<div class="info-block" style="margin-bottom:16px">' +
        '<h3>Points Management</h3>' +
        '<p class="admin-desc">Manually adjust points or raffle entries for any officer. ' +
        'Use positive values to add, negative to subtract.</p></div>';

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

// ── Admin: Raffle ──────────────────────────────────────────────
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

// ── Admin: Game Pool ───────────────────────────────────────────
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
        '<p class="admin-desc">Define the games used when generating the bingo board. ' +
        'Each game needs a Roblox Game ID (from the URL) and a list of event types.</p></div>';

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
                '<td>' + esc(g.name || '') + '</td>' +
                '<td style="color:var(--muted);font-size:11px">' + esc((g.eventTypes || []).join(', ')) + '</td>' +
                '<td style="text-align:right"><button class="admin-remove-btn" onclick="disRemoveGame(' + i + ')">Remove</button></td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
    }

    body.innerHTML = html;
}

// ── Admin: Audit Log ───────────────────────────────────────────
function _disAdminAudit(body) {
    body.innerHTML = '<div class="obj-loading">Loading audit log\u2026</div>';
    fetch('/api/dis/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-audit' })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var log = data.log || [];
            if (log.length === 0) {
                body.innerHTML = '<div class="empty">No audit log entries.</div>';
                return;
            }
            var html = '<div class="tbl-wrap"><table>' +
                '<thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead><tbody>';
            log.slice().reverse().forEach(function (entry) {
                html += '<tr>' +
                    '<td style="white-space:nowrap;font-size:11px">' + new Date(entry.timestamp).toLocaleString() + '</td>' +
                    '<td>' + esc(entry.adminId || '') + '</td>' +
                    '<td><span class="badge b-constant">' + esc(entry.action) + '</span></td>' +
                    '<td style="font-size:11px;color:var(--muted);word-break:break-all">' + esc(JSON.stringify(entry.details || {})) + '</td>' +
                    '</tr>';
            });
            body.innerHTML = html + '</tbody></table></div>';
        })
        .catch(function (e) {
            body.innerHTML = '<div class="obj-error">Failed to load audit log: ' + esc(e.message) + '</div>';
        });
}

// ═══════════════════════════════════════════════════════════════
//  Action functions (called from onclick / data-click)
// ═══════════════════════════════════════════════════════════════

// ── Trigger sync from Apps Script ─────────────────────────────
function disTriggerSync() {
    var btn = document.getElementById('dis-sync-btn');
    var result = document.getElementById('dis-sync-result');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching events\u2026'; }

    var url = window.SCRIPT_URL;
    if (!url) { toast('SCRIPT_URL not configured', 'error'); return; }

    // Step 1: Fetch events from Apps Script
    var _fetchedTotal = 0;
    fetch(url + '?action=api&fn=getDeploymentEvents', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (json) {
            var events = (json && json.events) ? json.events : [];
            _fetchedTotal = events.length;

            if (events.length === 0) {
                // Show what the Apps Script actually returned to aid debugging
                var raw = JSON.stringify(json).slice(0, 200);
                if (result) result.innerHTML =
                    '<div class="field-warn">Apps Script returned 0 events. Response: <code style="font-size:10px;word-break:break-all">' + esc(raw) + '</code></div>';
                if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
                return null;
            }

            if (btn) btn.textContent = 'Processing ' + events.length + ' rows\u2026';

            // Step 2: Send to server for processing
            return fetch('/api/dis/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: events })
            }).then(function (r) { return r.json(); });
        })
        .then(function (res) {
            if (!res) return; // handled above (0 events case)
            if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
            if (res.error) throw new Error(res.error);

            var claimed  = res.claimed  || 0;
            var skipped  = res.skipped  || 0;
            var notFound = res.notFound || 0;
            var total    = res.total    || 0;

            var lines = [];
            lines.push(claimed + ' new tile(s) claimed');
            lines.push(skipped + ' already taken');
            if (notFound > 0) lines.push(notFound + ' had no matching tile (check event type / game ID)');
            lines.push(total + ' total rows from spreadsheet');

            var cls = claimed > 0 ? 'field-info' : 'field-warn';
            if (result) result.innerHTML = '<div class="' + cls + ' mt"><strong>Sync complete.</strong><br>' +
                lines.map(function (l) { return esc(l); }).join('<br>') + '</div>';

            var toastMsg = 'Sync: ' + claimed + ' claimed, ' + skipped + ' taken, ' + notFound + ' unmatched';
            toast(toastMsg, claimed > 0 ? 'success' : 'error');
            _disLoad(false);
        })
        .catch(function (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Sync Now'; }
            if (result) result.innerHTML = '<div class="field-warn">Sync failed: ' + esc(e.message) + '</div>';
            toast('Sync failed: ' + e.message, 'error');
        });
}

// ── Unlock / lock tile ─────────────────────────────────────────
function disUnlockTile(pos) {
    _disAdminAction({ action: 'unlock-tile', position: pos }, 'Tile unlocked');
}

function disLockTile(pos) {
    _disAdminAction({ action: 'lock-tile', position: pos }, 'Tile locked');
}

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

// ── Points / raffle ────────────────────────────────────────────
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

// ── Global multiplier ──────────────────────────────────────────
function disSetGlobalMultiplier() {
    var inp = document.getElementById('dis-mult-input');
    var val = inp ? parseFloat(inp.value) : NaN;
    if (isNaN(val) || val < 0.5) { toast('Enter a valid multiplier (≥ 0.5)', 'error'); return; }
    _disAdminAction({ action: 'set-multiplier', value: val }, 'Global multiplier set to ' + val + 'x');
}

// ── Reset week ─────────────────────────────────────────────────
function disResetWeek() {
    if (!confirm('This will clear ALL tile claims and user progress for the current week. Cannot be undone. Continue?')) return;
    _disAdminAction({ action: 'reset-week' }, 'Week progress reset');
}

// ── Regenerate board ───────────────────────────────────────────
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

    // Animated draw
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
                    '<div style="background:rgba(200,164,74,.1);border:1px solid rgba(200,164,74,.3);padding:20px;text-align:center">' +
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
    var id   = document.getElementById('dis-gp-id');
    var name = document.getElementById('dis-gp-name');
    var types= document.getElementById('dis-gp-types');
    if (!id || !id.value.trim()) { toast('Enter a Game ID', 'error'); return; }
    var eventTypes = (types && types.value) ? types.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['Event'];

    var pool = (_DIS.gamepool || []).slice();
    pool.push({ gameId: id.value.trim(), name: (name && name.value.trim()) || '', eventTypes: eventTypes });
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
            var body = document.getElementById('dis-admin-body');
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
            _disLoad(false);
            if (_DIS.view === 'admin') {
                setTimeout(function () { _disRenderAdmin(); }, 300);
            }
        })
        .catch(function (e) { toast('Action failed: ' + e.message, 'error'); });
}

// ── Nav handlers ───────────────────────────────────────────────
function disBoardView() {
    _DIS.view = 'board'; _disPaint();
}

function disLeaderboardView() {
    _DIS.view = 'lb'; _disPaint();
}

function disAdminView() {
    _DIS.view = 'admin'; _disPaint();
}

function disRaffleView() {
    _DIS.view = 'raffle'; _disPaint();
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
