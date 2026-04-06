// ═══════════════════════════════════════════════════════════════
//  auth.js — client-side auth state, rank helpers, session load
//  Exposes window.AUTH (populated by AUTH.load())
// ═══════════════════════════════════════════════════════════════
'use strict';

window.AUTH = {
    user:   null,   // null = not logged in, object = session data
    loaded: false,

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
    // Admin dashboard: rank 246+ OR on the allowlist (checked server-side too)
    canAccessAdmin: function () {
        var u = window.AUTH.user;
        return !!(u && u.divisionRank >= 246);
    },

    // ── Logout ────────────────────────────────────────────────
    logout: function () {
        window.location.href = '/api/auth/logout';
    }
};
