// ═══════════════════════════════════════════════════════════════
//  division-audit.js
//  GET /api/division/audit
//
//  Returns paginated Roblox group audit log entries from Firestore.
//  Entries are written by statssheet_app_script.js after each sync.
//  All filtering is done client-side — this endpoint only paginates.
//
//  Duplicate prevention: statssheet_app_script.js uses Firestore
//  batch commit `update` (create-or-replace by document ID). Document
//  IDs are {timestampMs}_{userId}_{action}, matching the sheet's
//  dedup key. Identical entries always map to the same document, so
//  even if the same run is retried no duplicates are created.
//
//  Query params:
//    limit    max records per page  (default: 200, max: 500)
//    before   Unix ms cursor — return only entries older than this
// ═══════════════════════════════════════════════════════════════
'use strict';

const { verifySession, json }   = require('./_shared');
const { requireEventStats }     = require('./_events-shared');
const { firestoreCollection }   = require('./_firebase');

const COLLECTION = 'commandos-division-audit';

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const denied  = await requireEventStats(session);
    if (denied) return denied;

    const p      = event.queryStringParameters || {};
    const limit  = Math.min(Math.max(1, parseInt(p.limit) || 200), 500);
    const before = p.before ? parseInt(p.before) : null;

    try {
        const col = firestoreCollection(COLLECTION);

        let q = col.orderBy('timestamp', 'desc');
        if (before && !isNaN(before)) q = q.where('timestamp', '<', before);
        q = q.limit(limit + 1);

        const snap    = await q.get();
        const entries = snap.docs.slice(0, limit).map(d => d.data());
        const hasMore = snap.docs.length > limit;
        const nextCursor = hasMore && entries.length > 0
            ? entries[entries.length - 1].timestamp
            : null;

        return json(200, { entries, nextCursor, hasMore });
    } catch (err) {
        console.error('[division-audit]', err.message);
        return json(502, { error: 'Failed to fetch audit log: ' + err.message });
    }
};
