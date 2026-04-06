// ═══════════════════════════════════════════════════════════════
//  auth.js — client-side auth state, rank helpers, session load
//  Exposes window.AUTH (populated by AUTH.load())
// ═══════════════════════════════════════════════════════════════
'use strict';

window.AUTH = {
    user:       null,   // null = not logged in, object = session data
    loaded:     false,
    adminPerms: null,   // null = not loaded; object = { superadmin, roleManager, disSync, ... }

    // ── Load current session from server ──────────────────────
    load: function () {
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('not_authenticated');
                return r.json();
            })
            .then(function (data) {
                window.AUTH.user   = data;
                window.AUTH.loaded = true;
                return data;
            })
            .catch(function () {
                window.AUTH.user   = null;
                window.AUTH.loaded = true;
                return null;
            });
    },

    // ── Load admin permissions from server ────────────────────
    loadAdminPerms: function () {
        return fetch('/api/admin/perms', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { window.AUTH.adminPerms = data || null; })
            .catch(function () { window.AUTH.adminPerms = null; });
    },

    // ── Access helpers ────────────────────────────────────────
    isLoggedIn: function () {
        return !!window.AUTH.user;
    },
    isInDivision: function () {
        var u = window.AUTH.user;
        return !!(u && u.divisionRank > 0);
    },
    // Event Log / Edit Event Log: rank 235+ in division OR rank 7+ in ghost sub-div
    canSubmitOfficerForms: function () {
        var u = window.AUTH.user;
        if (!u) return false;
        return u.divisionRank >= 235 || u.ghostRank >= 7;
    },
    // Division Objectives & Deployment Incentive System
    canAccessHigherSections: function () {
        var u = window.AUTH.user;
        return !!(u && u.divisionRank >= 243);
    },
    // Legacy: still used in dis.js raffle view
    canAccessAdmin: function () {
        return window.AUTH.canAdminAny();
    },
    // Unified admin: rank 246+ OR any admin permission granted
    canAdminAny: function () {
        var u = window.AUTH.user;
        if (u && u.divisionRank >= 246) return true;
        var p = window.AUTH.adminPerms;
        return !!(p && (p.roleManager || p.disSync || p.disTiles || p.disPoints || p.disRaffle || p.disGamePool || p.disAudit || p.mfOfficers || p.mfRemote));
    },
    // Check if user can access a specific admin tab
    canAdminTab: function (tab) {
        var u = window.AUTH.user;
        if (u && u.divisionRank >= 246) return true;
        var p = window.AUTH.adminPerms;
        if (!p) return false;
        var map = {
            roles:      'roleManager',
            sync:       'disSync',
            tiles:      'disTiles',
            points:     'disPoints',
            raffle:     'disRaffle',
            gamepool:   'disGamePool',
            audit:      'disAudit',
            mainframe:  null   // mainframe tab visible if ANY mf perm is held
        };
        if (tab === 'mainframe') return !!(p.mfOfficers || p.mfRemote);
        return !!p[map[tab]];
    },

    // ── Logout ────────────────────────────────────────────────
    logout: function () {
        window.location.href = '/api/auth/logout';
    }
};
