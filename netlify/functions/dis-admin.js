// ── POST /api/dis/admin — all admin actions for the DIS
// Actions: unlock-tile, lock-tile, force-claim, adjust-points,
//          adjust-raffle, set-multiplier, set-tile-eventtype,
//          reset-week, regenerate-board, get-audit,
//          advance-week, advance-month
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json, getCurrentWeekNumber, invalidateCache, addErrorLog, sendErrorWebhook, sendAuditWebhook } = require('./_shared');

async function addAudit(store, adminId, action, details) {
    let log;
    try { log = await store.get('audit', { type: 'json' }); } catch {}
    log = Array.isArray(log) ? log : [];
    log.push({ adminId, action, details, timestamp: new Date().toISOString() });
    if (log.length > 500) log = log.slice(-500);
    await store.set('audit', log);
}

// Permission required per action
const ACTION_PERMS = {
    'unlock-tile':         'disTiles',
    'lock-tile':           'disTiles',
    'force-claim':         'disTiles',
    'set-tile-points':     'disTiles',
    'set-tile-eventtype':  'disTiles',
    'adjust-points':       'disPoints',
    'adjust-raffle':       'disRaffle',
    'reset-user-points':   'disPoints',
    'reset-user-raffle':   'disRaffle',
    'bulk-adjust-points':  'disPoints',
    'bulk-adjust-raffle':  'disRaffle',
    'reset-all-points':    'disSync',
    'reset-all-raffle':    'disSync',
    'set-multiplier':      'disSync',
    'reset-week':          'disSync',
    'regenerate-board':    'disSync',
    'advance-week':        'disSync',
    'advance-month':       'disSync',
    'get-audit':           'disAudit'
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    if ((event.body || '').length > 16384) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }

    // Check permission for this specific action
    const adminStore = fireStore('commandos-admin');
    const perms = await getUserAdminPerms(session, adminStore);
    if (!perms) return json(403, { error: 'Forbidden' });

    const requiredPerm = ACTION_PERMS[body.action];
    if (requiredPerm && !perms[requiredPerm]) {
        return json(403, { error: 'Forbidden: requires ' + requiredPerm + ' permission' });
    }
    if (!requiredPerm && !perms.superadmin) {
        return json(403, { error: 'Forbidden: unknown action' });
    }

    const store   = fireStore('commandos-dis');
    const adminId = session.robloxUsername || session.discordId;

    try {
        return await _handleAction(body, store, adminId);
    } catch (err) {
        await addErrorLog(adminStore, body.action || 'unknown', err, { adminId, action: body.action }).catch(() => {});
        await sendErrorWebhook(
            'DIS Admin Error: ' + (body.action || 'unknown'),
            err.message || String(err),
            { adminId, action: body.action }
        ).catch(() => {});
        return json(500, { error: 'Internal server error: ' + err.message });
    }
};

async function _handleAction(body, store, adminId) {

    // ── get-audit ────────────────────────────────────────────────
    if (body.action === 'get-audit') {
        const log = await store.get('audit', { type: 'json' }).catch(() => []);
        return json(200, { log: log || [] });
    }

    // ── unlock-tile ──────────────────────────────────────────────
    if (body.action === 'unlock-tile') {
        const pos = Number(body.position);
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        const tile     = board.tiles[pos];
        if (!tile) return json(404, { error: 'Tile not found' });
        const prevUser = tile.completedBy;

        if (tile.completed && prevUser) {
            let users = await store.get('users', { type: 'json' }).catch(() => ({}));
            users = users || {};
            if (users[prevUser]) {
                const gm  = board.globalMultiplier || 1;
                const pts = (tile.points || 1) * (tile.multiplier || 1) * gm;
                users[prevUser].points      = Math.max(0, (users[prevUser].points || 0) - pts);
                users[prevUser].claimedTiles = (users[prevUser].claimedTiles || []).filter(p => p !== pos);
                await store.set('users', users);
            }
        }

        board.tiles[pos] = Object.assign({}, tile, {
            completed: false, completedBy: null, completedAt: null, lockedByAdmin: false
        });
        board.updatedAt = new Date().toISOString();

        await store.set('board', board);
        await addAudit(store, adminId, 'UNLOCK_TILE', { position: pos, prevUser });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'UNLOCK_TILE', { position: pos + 1, prevUser: prevUser || '—' });
        return json(200, { ok: true });
    }

    // ── lock-tile ─────────────────────────────────────────────────
    if (body.action === 'lock-tile') {
        const pos = Number(body.position);
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        board.tiles[pos] = Object.assign({}, board.tiles[pos], { lockedByAdmin: true });
        board.updatedAt  = new Date().toISOString();

        await store.set('board', board);
        await addAudit(store, adminId, 'LOCK_TILE', { position: pos });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'LOCK_TILE', { position: pos + 1 });
        return json(200, { ok: true });
    }

    // ── force-claim ───────────────────────────────────────────────
    if (body.action === 'force-claim') {
        const pos      = Number(body.position);
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });
        if (!username) return json(400, { error: 'Username required' });
        if (username.length > 50) return json(400, { error: 'Username too long (max 50 chars)' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};

        const tile = board.tiles[pos];
        const gm   = board.globalMultiplier || 1;
        const pts  = (tile.points || 1) * (tile.multiplier || 1) * gm;

        board.tiles[pos] = Object.assign({}, tile, {
            completed:    true,
            completedBy:  username,
            completedAt:  new Date().toISOString(),
            lockedByAdmin: false
        });
        board.updatedAt = new Date().toISOString();

        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].points = (users[username].points || 0) + pts;
        if (!(users[username].claimedTiles || []).includes(pos)) {
            (users[username].claimedTiles = users[username].claimedTiles || []).push(pos);
        }

        await store.set('board', board);
        await store.set('users', users);
        await addAudit(store, adminId, 'FORCE_CLAIM', { position: pos, username, points: pts });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'FORCE_CLAIM', { position: pos + 1, username, points: pts });
        return json(200, { ok: true });
    }

    // ── adjust-points ─────────────────────────────────────────────
    if (body.action === 'adjust-points') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        const delta    = Number(body.delta);
        if (!username)  return json(400, { error: 'Username required' });
        if (username.length > 50) return json(400, { error: 'Username too long (max 50 chars)' });
        if (isNaN(delta) || !Number.isFinite(delta)) return json(400, { error: 'Delta must be a finite number' });
        if (Math.abs(delta) > 10000) return json(400, { error: 'Delta too large (max ±10000 per operation)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].points = Math.max(0, (users[username].points || 0) + delta);

        await store.set('users', users);
        await addAudit(store, adminId, 'ADJUST_POINTS', { username, delta, newTotal: users[username].points });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'ADJUST_POINTS', { username, delta, newTotal: users[username].points });
        return json(200, { ok: true, newPoints: users[username].points });
    }

    // ── adjust-raffle ─────────────────────────────────────────────
    if (body.action === 'adjust-raffle') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        const delta    = parseInt(body.delta, 10);
        if (!username)  return json(400, { error: 'Username required' });
        if (username.length > 50) return json(400, { error: 'Username too long (max 50 chars)' });
        if (isNaN(delta)) return json(400, { error: 'Delta must be an integer' });
        if (Math.abs(delta) > 500) return json(400, { error: 'Delta too large (max ±500 per operation)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) users[username] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
        users[username].raffleEntries = Math.max(0, (users[username].raffleEntries || 0) + delta);

        await store.set('users', users);
        await addAudit(store, adminId, 'ADJUST_RAFFLE', { username, delta, newTotal: users[username].raffleEntries });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'ADJUST_RAFFLE', { username, delta, newTotal: users[username].raffleEntries });
        return json(200, { ok: true, newEntries: users[username].raffleEntries });
    }

    // ── reset-user-points ─────────────────────────────────────────
    if (body.action === 'reset-user-points') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        if (!username) return json(400, { error: 'Username required' });
        if (username.length > 50) return json(400, { error: 'Username too long (max 50 chars)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) return json(404, { error: 'User not found' });
        const prev = users[username].points || 0;
        users[username].points = 0;

        await store.set('users', users);
        await addAudit(store, adminId, 'RESET_USER_POINTS', { username, prev });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'RESET_USER_POINTS', { username, prev });
        return json(200, { ok: true });
    }

    // ── reset-user-raffle ─────────────────────────────────────────
    if (body.action === 'reset-user-raffle') {
        const username = typeof body.username === 'string' ? body.username.trim() : null;
        if (!username) return json(400, { error: 'Username required' });
        if (username.length > 50) return json(400, { error: 'Username too long (max 50 chars)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        if (!users[username]) return json(404, { error: 'User not found' });
        const prev = users[username].raffleEntries || 0;
        users[username].raffleEntries = 0;

        await store.set('users', users);
        await addAudit(store, adminId, 'RESET_USER_RAFFLE', { username, prev });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'RESET_USER_RAFFLE', { username, prev });
        return json(200, { ok: true });
    }

    // ── reset-all-points ──────────────────────────────────────────
    if (body.action === 'reset-all-points') {
        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        let affected = 0;
        for (const un of Object.keys(users)) {
            if ((users[un].points || 0) !== 0) { users[un].points = 0; affected++; }
        }
        await store.set('users', users);
        await addAudit(store, adminId, 'RESET_ALL_POINTS', { affected });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'RESET_ALL_POINTS', { affected });
        return json(200, { ok: true, affected });
    }

    // ── reset-all-raffle ──────────────────────────────────────────
    if (body.action === 'reset-all-raffle') {
        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        let affected = 0;
        for (const un of Object.keys(users)) {
            if ((users[un].raffleEntries || 0) !== 0) { users[un].raffleEntries = 0; affected++; }
        }
        await store.set('users', users);
        await addAudit(store, adminId, 'RESET_ALL_RAFFLE', { affected });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'RESET_ALL_RAFFLE', { affected });
        return json(200, { ok: true, affected });
    }

    // ── bulk-adjust-points ────────────────────────────────────────
    if (body.action === 'bulk-adjust-points') {
        const usernames = Array.isArray(body.usernames) ? body.usernames.map(u => String(u).trim()).filter(Boolean) : [];
        const delta     = Number(body.delta);
        if (!usernames.length)                            return json(400, { error: 'At least one username required' });
        if (usernames.length > 100)                       return json(400, { error: 'Too many usernames (max 100)' });
        if (isNaN(delta) || !Number.isFinite(delta))      return json(400, { error: 'Delta must be a finite number' });
        if (Math.abs(delta) > 10000)                      return json(400, { error: 'Delta too large (max ±10000)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        for (const un of usernames) {
            if (!users[un]) users[un] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
            users[un].points = Math.max(0, (users[un].points || 0) + delta);
        }
        await store.set('users', users);
        await addAudit(store, adminId, 'BULK_ADJUST_POINTS', { usernames, delta, count: usernames.length });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'BULK_ADJUST_POINTS', { count: usernames.length, delta });
        return json(200, { ok: true, affected: usernames.length });
    }

    // ── bulk-adjust-raffle ────────────────────────────────────────
    if (body.action === 'bulk-adjust-raffle') {
        const usernames = Array.isArray(body.usernames) ? body.usernames.map(u => String(u).trim()).filter(Boolean) : [];
        const delta     = parseInt(body.delta, 10);
        if (!usernames.length)       return json(400, { error: 'At least one username required' });
        if (usernames.length > 100)  return json(400, { error: 'Too many usernames (max 100)' });
        if (isNaN(delta))            return json(400, { error: 'Delta must be an integer' });
        if (Math.abs(delta) > 500)   return json(400, { error: 'Delta too large (max ±500)' });

        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};
        for (const un of usernames) {
            if (!users[un]) users[un] = { points: 0, raffleEntries: 0, claimedTiles: [], history: [] };
            users[un].raffleEntries = Math.max(0, (users[un].raffleEntries || 0) + delta);
        }
        await store.set('users', users);
        await addAudit(store, adminId, 'BULK_ADJUST_RAFFLE', { usernames, delta, count: usernames.length });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'BULK_ADJUST_RAFFLE', { count: usernames.length, delta });
        return json(200, { ok: true, affected: usernames.length });
    }

    // ── set-tile-points ───────────────────────────────────────────
    if (body.action === 'set-tile-points') {
        const pos = Number(body.position);
        const pts = Number(body.points);
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });
        if (isNaN(pts) || pts < 1 || !Number.isInteger(pts)) return json(400, { error: 'Points must be a positive integer' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        const prev = (board.tiles[pos] || {}).points || 1;
        board.tiles[pos] = Object.assign({}, board.tiles[pos], { points: pts });
        board.updatedAt  = new Date().toISOString();

        await store.set('board', board);
        await addAudit(store, adminId, 'SET_TILE_POINTS', { position: pos, prev, points: pts });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'SET_TILE_POINTS', { position: pos + 1, prev, points: pts });
        return json(200, { ok: true });
    }

    // ── set-tile-eventtype ────────────────────────────────────────
    if (body.action === 'set-tile-eventtype') {
        const pos       = Number(body.position);
        const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : null;
        if (isNaN(pos) || pos < 0 || pos > 24) return json(400, { error: 'Invalid position' });
        if (!eventType) return json(400, { error: 'Event type required' });
        if (eventType.length > 100) return json(400, { error: 'Event type too long (max 100 chars)' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });

        const prev = (board.tiles[pos] || {}).eventType || '';
        board.tiles[pos] = Object.assign({}, board.tiles[pos], { eventType });
        board.updatedAt  = new Date().toISOString();

        await store.set('board', board);
        await addAudit(store, adminId, 'SET_TILE_EVENTTYPE', { position: pos, prev, eventType });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'SET_TILE_EVENTTYPE', { position: pos + 1, prev, eventType });
        return json(200, { ok: true });
    }

    // ── set-multiplier ────────────────────────────────────────────
    if (body.action === 'set-multiplier') {
        const val = Number(body.value);
        if (isNaN(val) || val < 0.5 || val > 100) return json(400, { error: 'Multiplier must be between 0.5 and 100' });

        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (!board) return json(404, { error: 'No board' });
        board.globalMultiplier = val;
        board.updatedAt        = new Date().toISOString();

        await store.set('board', board);
        await addAudit(store, adminId, 'SET_MULTIPLIER', { globalMultiplier: val });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'SET_MULTIPLIER', { globalMultiplier: val });
        return json(200, { ok: true, globalMultiplier: val });
    }

    // ── reset-week ────────────────────────────────────────────────
    if (body.action === 'reset-week') {
        let board = await store.get('board', { type: 'json' }).catch(() => null);
        if (board && board.tiles) {
            board.tiles = board.tiles.map(t => Object.assign({}, t, {
                completed: false, completedBy: null, completedAt: null
            }));
            board.updatedAt  = new Date().toISOString();
            board.lastSyncAt = null;
        }

        await Promise.all([
            store.set('users', {}),
            board ? store.set('board', board) : Promise.resolve(),
            invalidateCache()
        ]);
        await addAudit(store, adminId, 'RESET_WEEK', { weekNumber: getCurrentWeekNumber() });
        await sendAuditWebhook(adminId, 'RESET_WEEK', { weekNumber: getCurrentWeekNumber() });
        return json(200, { ok: true });
    }

    // ── advance-week ──────────────────────────────────────────────
    // Awards +1 raffle entry to top 5 by tiles claimed this week,
    // saves a week snapshot, resets tile claims for next week.
    // User points + raffle entries carry forward through the month.
    if (body.action === 'advance-week') {
        let board = await store.get('board', { type: 'json' }).catch(() => null);
        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};

        const weekNumber = (board && board.weekNumber) || getCurrentWeekNumber();

        // Rank all users by tiles claimed this week (claimedTiles.length before reset)
        const ranked = Object.entries(users)
            .map(([username, data]) => ({
                username,
                tiles:         (data.claimedTiles || []).length,
                points:        data.points || 0,
                raffleEntries: data.raffleEntries || 0
            }))
            .filter(e => e.tiles > 0)
            .sort((a, b) => b.tiles - a.tiles || b.points - a.points);

        const top5 = ranked.slice(0, 5);

        // Award +1 raffle entry to each of the top 5
        for (const winner of top5) {
            if (users[winner.username]) {
                users[winner.username].raffleEntries = (users[winner.username].raffleEntries || 0) + 1;
            }
        }

        // Save a week history snapshot BEFORE clearing tile claims
        let weekHistory = await store.get('week-history', { type: 'json' }).catch(() => []);
        if (!Array.isArray(weekHistory)) weekHistory = [];
        weekHistory.push({
            weekNumber,
            archivedAt: new Date().toISOString(),
            top5:       top5.map(e => ({ username: e.username, tiles: e.tiles, points: e.points })),
            snapshot:   ranked.map(e => ({ username: e.username, tiles: e.tiles, points: e.points }))
        });
        if (weekHistory.length > 52) weekHistory = weekHistory.slice(-52); // keep 1 year

        // Reset claimedTiles for all users (keep points + raffleEntries)
        for (const username of Object.keys(users)) {
            users[username].claimedTiles = [];
            if (!Array.isArray(users[username].history)) users[username].history = [];
        }

        // Reset board tile claims, increment week number
        const nextWeek = weekNumber + 1;
        if (board && board.tiles) {
            board.tiles = board.tiles.map(t => Object.assign({}, t, {
                completed: false, completedBy: null, completedAt: null
            }));
            board.weekNumber = nextWeek;
            board.updatedAt  = new Date().toISOString();
            board.lastSyncAt = null;
        }

        await Promise.all([
            store.set('users',        users),
            board ? store.set('board', board) : Promise.resolve(),
            store.set('week-history', weekHistory),
            invalidateCache()
        ]);

        const auditDetails = {
            weekNumber,
            nextWeek,
            top5: top5.map(e => e.username + ' (' + e.tiles + ' tiles)').join(', ') || 'none'
        };
        await addAudit(store, adminId, 'ADVANCE_WEEK', auditDetails);
        await sendAuditWebhook(adminId, 'ADVANCE_WEEK', auditDetails);

        return json(200, {
            ok: true,
            weekNumber: nextWeek,
            top5: top5.map(e => ({ username: e.username, tiles: e.tiles, raffleAwarded: 1 }))
        });
    }

    // ── advance-month ─────────────────────────────────────────────
    // Archives all-time stats, then resets everything for the new month.
    if (body.action === 'advance-month') {
        let board = await store.get('board', { type: 'json' }).catch(() => null);
        let users = await store.get('users', { type: 'json' }).catch(() => ({}));
        users = users || {};

        const monthLabel = new Date().toISOString().slice(0, 7); // e.g. "2026-04"
        const weekNumber = (board && board.weekNumber) || getCurrentWeekNumber();

        // Build monthly snapshot for all-time leaderboard
        const monthSnapshot = Object.entries(users).map(([username, data]) => ({
            username,
            points:        data.points        || 0,
            tiles:         (data.claimedTiles || []).length,
            raffleEntries: data.raffleEntries  || 0
        })).filter(e => e.points > 0 || e.tiles > 0 || e.raffleEntries > 0);

        // Load and append to all-time archive
        let alltime = await store.get('alltime', { type: 'json' }).catch(() => []);
        if (!Array.isArray(alltime)) alltime = [];
        alltime.push({
            month:      monthLabel,
            archivedAt: new Date().toISOString(),
            entries:    monthSnapshot
        });
        // Keep 24 months
        if (alltime.length > 24) alltime = alltime.slice(-24);

        // Full reset: clear all user data
        const emptyUsers = {};

        // Reset board tiles and week number
        if (board && board.tiles) {
            board.tiles = board.tiles.map(t => Object.assign({}, t, {
                completed: false, completedBy: null, completedAt: null
            }));
            board.weekNumber    = 1;
            board.updatedAt     = new Date().toISOString();
            board.lastSyncAt    = null;
            board.globalMultiplier = 1;
        }

        await Promise.all([
            store.set('users',   emptyUsers),
            store.set('alltime', alltime),
            board ? store.set('board', board) : Promise.resolve(),
            invalidateCache()
        ]);

        const auditDetails = {
            month:            monthLabel,
            usersArchived:    monthSnapshot.length,
            previousWeekNum:  weekNumber
        };
        await addAudit(store, adminId, 'ADVANCE_MONTH', auditDetails);
        await sendAuditWebhook(adminId, 'ADVANCE_MONTH', auditDetails);

        return json(200, {
            ok: true,
            month: monthLabel,
            usersArchived: monthSnapshot.length
        });
    }

    // ── regenerate-board ──────────────────────────────────────────
    if (body.action === 'regenerate-board') {
        const gamepool = await store.get('gamepool', { type: 'json' }).catch(() => []) || [];
        if (gamepool.length < 25) {
            return json(400, { error: 'Game pool must have at least 25 entries. Currently has ' + gamepool.length + '.' });
        }

        const pool = gamepool.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const tiles = pool.slice(0, 25).map((g, idx) => {
            const types     = Array.isArray(g.eventTypes) && g.eventTypes.length > 0 ? g.eventTypes : ['Event'];
            const eventType = types[Math.floor(Math.random() * types.length)];
            return {
                position:     idx,
                gameId:       String(g.gameId),
                gameName:     g.name || null,
                eventType,
                completed:    false,
                completedBy:  null,
                completedAt:  null,
                points:       1,
                multiplier:   1,
                lockedByAdmin: false
            };
        });

        const weekNumber = getCurrentWeekNumber();
        const board = {
            tiles,
            globalMultiplier: 1,
            weekNumber,
            updatedAt:  new Date().toISOString(),
            lastSyncAt: null
        };

        await store.set('board', board);
        await addAudit(store, adminId, 'REGENERATE_BOARD', { weekNumber, tiles: tiles.length });
        await invalidateCache();
        await sendAuditWebhook(adminId, 'REGENERATE_BOARD', { weekNumber, tiles: tiles.length });
        return json(200, { ok: true, weekNumber, tiles: tiles.length });
    }

    return json(400, { error: 'Unknown action: ' + body.action });
}
