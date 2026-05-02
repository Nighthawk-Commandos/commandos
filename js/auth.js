// ═══════════════════════════════════════════════════════════════
//  auth.js — client-side auth state, rank helpers, session load
//
//  AUTH is a module-private object exported as a named constant.
//  Internal state lives in a closure — never exposed on window.
//
//  Call initAuth(session) before AUTH.load() to consume a
//  pre-fetched session and skip the /api/auth/me round-trip.
// ═══════════════════════════════════════════════════════════════

var _user       = null;
var _loaded     = false;
var _adminPerms = null;

export var AUTH = {
    get user()       { return _user; },
    get loaded()     { return _loaded; },
    get adminPerms() { return _adminPerms; },

    load: function () {
        if (_loaded) return Promise.resolve(_user);
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('not_authenticated');
                return r.json();
            })
            .then(function (data) {
                if (!data || data.authenticated === false) {
                    _user = null; _loaded = true; return null;
                }
                _user   = data;
                _loaded = true;
                return data;
            })
            .catch(function () {
                _user   = null;
                _loaded = true;
                return null;
            });
    },

    loadAdminPerms: function () {
        return fetch('/api/admin/perms', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { _adminPerms = data || null; })
            .catch(function () { _adminPerms = null; });
    },

    isLoggedIn: function () { return !!_user; },
    isInDivision: function () {
        return !!(_user && _user.divisionRank > 0);
    },
    canSubmitOfficerForms: function () {
        if (!_user) return false;
        return _user.divisionRank >= 235 || _user.ghostRank >= 7;
    },
    canAccessHigherSections: function () {
        return !!(_user && _user.divisionRank >= 243);
    },
    canAccessAdmin: function () {
        return AUTH.canAdminAny();
    },
    canAccessEventStats: function () {
        if (_user && _user.divisionRank >= 246) return true;
        var p = _adminPerms;
        return !!(p && p.eventsStats);
    },
    canAccessContent: function () {
        if (_user && _user.divisionRank >= 246) return true;
        var p = _adminPerms;
        return !!(p && p.contentAdmin);
    },
    // Apply hub is always accessible — non-members authenticate via /api/auth/apply
    canApply: function () { return true; },
    // Docs hub is always accessible — server returns only public docs for non-members
    canViewDocs: function () { return true; },
    canAdminAny: function () {
        if (_user && _user.divisionRank >= 246) return true;
        var p = _adminPerms;
        return !!(p && (p.roleAssign || p.roleEdit || p.disSync || p.disTiles ||
                        p.disPoints || p.disRaffle || p.disGamePool || p.disAudit ||
                        p.mfOfficers || p.mfRemote || p.eventsStats || p.contentAdmin));
    },
    canAdminTab: function (tab) {
        if (_user && _user.divisionRank >= 246) return true;
        var p = _adminPerms;
        if (!p) return false;
        var map = {
            sync:     'disSync',
            tiles:    'disTiles',
            points:   'disPoints',
            raffle:   'disRaffle',
            gamepool: 'disGamePool',
            audit:    'disAudit',
            errors:   'disAudit'
        };
        if (tab === 'roles')     return !!(p.roleAssign || p.roleEdit);
        if (tab === 'mainframe') return !!(p.mfOfficers || p.mfRemote);
        if (tab === 'content')   return !!p.contentAdmin;
        if (tab === 'events')    return !!p.eventsStats;
        return !!p[map[tab]];
    },
    logout: function () {
        location.href = '/api/auth/logout';
    }
};

// Called by app.js with the pre-fetched session from the boot
// script so AUTH.load() can skip a second /api/auth/me fetch.
export function initAuth(session) {
    // Only accept sessions that represent a real authenticated user (must have discordId)
    if (session && session.discordId) {
        _user   = session;
        _loaded = true;
    }
}
