// ═══════════════════════════════════════════════════════════════
//  api.js — Apps Script transport + localStorage cache
//  All calls use GET so no CORS preflight fires.
//  Mutations encode payload as ?payload=<json> in the query string.
// ═══════════════════════════════════════════════════════════════

'use strict';

var API = (function () {

    // ── Config ──────────────────────────────────────────────────
    // Set SCRIPT_URL in config.js (not committed to source control).
    var URL        = window.SCRIPT_URL || '';
    var CACHE_TTL  = 5 * 60 * 1000;   // 5 min for main data
    var MEMBER_TTL = 10 * 60 * 1000;  // 10 min for member list

    // ── In-memory fallback (survives page session, faster than LS)
    var _mem = {};

    // ── localStorage helpers ────────────────────────────────────
    function lsGet(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (Date.now() > obj.exp) { localStorage.removeItem(key); return null; }
            return obj.data;
        } catch (_) { return null; }
    }

    function lsSet(key, data, ttl) {
        try {
            localStorage.setItem(key, JSON.stringify({ data: data, exp: Date.now() + ttl }));
        } catch (_) { /* storage full — silently skip */ }
    }

    function lsClear(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    // ── Core fetch — always GET ─────────────────────────────────
    function call(fn, payload) {
        var u = URL + '?action=api&fn=' + encodeURIComponent(fn);
        if (payload && Object.keys(payload).length) {
            u += '&payload=' + encodeURIComponent(JSON.stringify(payload));
        }
        return fetch(u, { method: 'GET', cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    // ── Cached read ─────────────────────────────────────────────
    function cachedCall(cacheKey, fn, payload, ttl) {
        // 1. In-memory hit (fastest)
        if (_mem[cacheKey] && Date.now() < _mem[cacheKey].exp) {
            return Promise.resolve(_mem[cacheKey].data);
        }
        // 2. localStorage hit
        var lsData = lsGet(cacheKey);
        if (lsData) {
            _mem[cacheKey] = { data: lsData, exp: Date.now() + ttl };
            return Promise.resolve(lsData);
        }
        // 3. Network
        return call(fn, payload).then(function (data) {
            _mem[cacheKey] = { data: data, exp: Date.now() + ttl };
            lsSet(cacheKey, data, ttl);
            return data;
        });
    }

    // ── Public API ───────────────────────────────────────────────
    return {

        /** Bust all caches (call after a successful mutation) */
        bustCache: function (key) {
            if (key) { delete _mem[key]; lsClear(key); }
            else { _mem = {}; try { localStorage.clear(); } catch (_) {} }
        },

        /** Main spreadsheet data — heavy, cache aggressively */
        getAllData: function () {
            return cachedCall('c:allData', 'getAllData', null, CACHE_TTL);
        },

        /** Member list — used for autocomplete */
        getGroupMembers: function () {
            return cachedCall('c:members', 'getGroupMembers', null, MEMBER_TTL);
        },

        /** Event lookup — short TTL, keyed by event ID */
        getEventById: function (eventId) {
            var key = 'c:evt:' + eventId;
            return cachedCall(key, 'getEventById', { eventId: eventId }, 60 * 1000);
        },

        /** Exemption days — cache per user for 2 min */
        getExemptionDays: function (username) {
            var key = 'c:exdays:' + username.toLowerCase();
            return cachedCall(key, 'getExemptionDays', { username: username }, 2 * 60 * 1000);
        },

        // ── Mutations — no caching, bust allData on success ───────

        submitEventLog: function (payload) {
            return call('submitEventLog', payload).then(function (r) {
                if (r && r.success) API.bustCache('c:allData');
                return r;
            });
        },

        submitEditEventLog: function (payload) {
            return call('submitEditEventLog', payload).then(function (r) {
                if (r && r.success) {
                    API.bustCache('c:allData');
                    API.bustCache('c:evt:' + (payload.eventId || ''));
                }
                return r;
            });
        },

        submitStatsTransfer: function (payload) {
            return call('submitStatsTransfer', payload).then(function (r) {
                if (r && r.success) API.bustCache('c:allData');
                return r;
            });
        },

        submitExemption: function (payload) {
            return call('submitExemption', payload).then(function (r) {
                if (r && r.success) {
                    API.bustCache('c:allData');
                    API.bustCache('c:exdays:' + (payload.username || '').toLowerCase());
                }
                return r;
            });
        },

        submitMissingAP: function (payload) {
            return call('submitMissingAP', payload);
        },

        /** Force-refresh main data (e.g. manual refresh button) */
        refreshAllData: function () {
            API.bustCache('c:allData');
            return API.getAllData();
        }
    };
})();