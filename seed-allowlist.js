// Run once to bootstrap your allowlist entry in Firestore.
// Usage: FIREBASE_SERVICE_ACCOUNT='<json>' node seed-allowlist.js
'use strict';

const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT env var not set'); process.exit(1); }

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
