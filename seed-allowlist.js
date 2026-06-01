// Run once to bootstrap your allowlist entry in Firestore.
// Usage: node seed-allowlist.js   (reads .env automatically if env var not set)
'use strict';

const admin = require('firebase-admin');

// Auto-load .env if FIREBASE_SERVICE_ACCOUNT isn't already in the environment
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const fs = require('fs');
        const lines = fs.readFileSync('.env', 'utf8').split('\n');
        for (const line of lines) {
            const idx = line.indexOf('=');
            if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
    } catch (_) {}
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT env var not set and .env not found'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });

const DISCORD_ID = '256860396831375360';

const entry = {
    discordId:  DISCORD_ID,
    label:      'Cipher',
    addedBy:    'bootstrap',
    addedAt:    0,
    permissions: {
        roleAssign:  true,
        roleEdit:    true,
        disSync:     true,
        disTiles:    true,
        disPoints:   true,
        disRaffle:   true,
        disGamePool: true,
        disAudit:    true,
        mfOfficers:  true,
        mfRemote:    true
    }
};

admin.firestore()
    .collection('commandos-admin')
    .doc('allowlist')
    .set({ v: [entry] })
    .then(() => { console.log('Done — allowlist seeded.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
