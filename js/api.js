// ═══════════════════════════════════════════════════════════════
//  api.js — auth-gated Netlify proxy transport + localStorage cache
//
//  All requests go through server-side Netlify functions that
//  verify the session cookie. Apps Script URLs are never exposed
//  to the client.
//
//  Reads:     GET /api/mainframe/query?fn=...&payload=...
//  Mutations: POST /api/mainframe/submit  { fn, payload }
//  Main data: GET /api/mainframe/data     (existing proxy)
// ═══════════════════════════════════════════════════════════════

export var API = (function () {

    var CACHE_TTL  = 60 * 60 * 1000;
    var MEMBER_TTL = 60 * 60 * 1000;

    var _mem = {};

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
        } catch (_) {}
    }

    function lsClear(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    function query(fn, payload) {
        var u = '/api/mainframe/query?fn=' + encodeURIComponent(fn);
        if (payload && Object.keys(payload).length) {
            u += '&payload=' + encodeURIComponent(JSON.stringify(payload));
        }
        return fetch(u, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function submit(fn, payload) {
        return fetch('/api/mainframe/submit', {
            method:      'POST',
            credentials: 'same-origin',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ fn: fn, payload: payload || {} })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function cachedCall(cacheKey, fn, payload, ttl) {
        if (_mem[cacheKey] && Date.now() < _mem[cacheKey].exp) {
            return Promise.resolve(_mem[cacheKey].data);
        }
        var lsData = lsGet(cacheKey);
        if (lsData) {
            _mem[cacheKey] = { data: lsData, exp: Date.now() + ttl };
            return Promise.resolve(lsData);
        }
        return query(fn, payload).then(function (data) {
            _mem[cacheKey] = { data: data, exp: Date.now() + ttl };
            lsSet(cacheKey, data, ttl);
            return data;
        });
    }

    return {
        bustCache: function (key) {
            if (key) { delete _mem[key]; lsClear(key); }
            else { _mem = {}; try { localStorage.clear(); } catch (_) {} }
        },

        checkVersion: function () {
            return fetch('/api/version', { credentials: 'same-origin', cache: 'no-store' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (!data || !data.v) return;
                    try {
                        var stored = localStorage.getItem('c:deployVer');
                        if (stored !== null && stored !== data.v) {
                            _mem = {};
                            localStorage.clear();
                        }
                        localStorage.setItem('c:deployVer', data.v);
                    } catch (_) {}
                })
                .catch(function () {});
        },

        getAllData: function () {
            if (_mem['c:allData'] && Date.now() < _mem['c:allData'].exp) {
                return Promise.resolve(_mem['c:allData'].data);
            }
            var lsData = lsGet('c:allData');
            if (lsData) {
                _mem['c:allData'] = { data: lsData, exp: Date.now() + CACHE_TTL };
                return Promise.resolve(lsData);
            }
            return fetch('/api/mainframe/data', { credentials: 'same-origin', cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    _mem['c:allData'] = { data: data, exp: Date.now() + CACHE_TTL };
                    lsSet('c:allData', data, CACHE_TTL);
                    return data;
                });
        },

        getGroupMembers: function () {
            return cachedCall('c:members', 'getGroupMembers', null, MEMBER_TTL);
        },

        getEventById: function (eventId) {
            return cachedCall('c:evt:' + eventId, 'getEventById', { eventId: eventId }, 60 * 1000);
        },

        getExemptionDays: function (username) {
            return cachedCall('c:exdays:' + username.toLowerCase(), 'getExemptionDays', { username: username }, 2 * 60 * 1000);
        },

        submitEventLog: function (payload) {
            return submit('submitEventLog', payload).then(function (r) {
                if (r && r.success) API.bustCache('c:allData');
                return r;
            });
        },

        submitEditEventLog: function (payload) {
            return submit('submitEditEventLog', payload).then(function (r) {
                if (r && r.success) {
                    API.bustCache('c:allData');
                    API.bustCache('c:evt:' + (payload.eventId || ''));
                }
                return r;
            });
        },

        submitStatsTransfer: function (payload) {
            return submit('submitStatsTransfer', payload).then(function (r) {
                if (r && r.success) API.bustCache('c:allData');
                return r;
            });
        },

        submitExemption: function (payload) {
            return submit('submitExemption', payload).then(function (r) {
                if (r && r.success) {
                    API.bustCache('c:allData');
                    API.bustCache('c:exdays:' + (payload.username || '').toLowerCase());
                }
                return r;
            });
        },

        submitMissingAP: function (payload) {
            return submit('submitMissingAP', payload);
        },

        refreshAllData: function () {
            API.bustCache('c:allData');
            return API.getAllData();
        }
    };
})();
