// ── Firebase Admin SDK wrapper ──────────────────────────────────
// Provides a fireStore(collection) factory that mirrors the Netlify
// Blobs API (.get / .set) so all function files need minimal changes.
// Data is stored as native Firestore objects (not JSON strings) so
// the Firebase console is human-readable.
// Cache (state-cache, data-cache) still uses Netlify Blobs directly.
'use strict';

const admin = require('firebase-admin');

let _app = null;

function _getApp() {
    if (_app) return _app;
    // In warm Lambda containers the SDK may already be initialized but _app lost.
    if (admin.apps.length > 0) { _app = admin.app(); return _app; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('[_firebase] FIREBASE_SERVICE_ACCOUNT env var is not set');
    const creds = JSON.parse(raw);
    _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
    return _app;
}

function _db() {
    return _getApp().firestore();
}

// Returns an object that mirrors the Netlify Blobs store API.
// collection: e.g. 'commandos-admin', 'commandos-dis', 'commandos-bingo'
function fireStore(collection) {
    return {
        // opts.type === 'json' is the only mode used; always returns parsed object or null.
        async get(key, _opts) {
            try {
                const doc = await _db().collection(collection).doc(key).get();
                if (!doc.exists) return null;
                const data = doc.data();
                return (data && data.v !== undefined) ? data.v : null;
            } catch (err) {
                console.error('[_firebase] get', collection, key, err.message);
                return null;
            }
        },
        // value may be a JSON string (legacy callers) or a native object/array.
        async set(key, value) {
            let parsed = value;
            if (typeof value === 'string') {
                try { parsed = JSON.parse(value); } catch { parsed = value; }
            }
            await _db().collection(collection).doc(key).set({ v: parsed });
        }
    };
}

module.exports = { fireStore };
