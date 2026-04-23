// Import data from a JSON file into Firestore.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT='<json>' node seed-import.js <import-file.json> [--dry-run]
//
// The import file must be a JSON object shaped as:
//   {
//     "<collection>": {
//       "<key>": <value>,
//       ...
//     },
//     ...
//   }
//
// Example:
//   {
//     "commandos-dis": {
//       "gamepool": [...],
//       "users":    { "PlayerName": { "points": 10, ... } },
//       "board":    { "tiles": [...], "weekNumber": 16 }
//     },
//     "commandos-admin": {
//       "roles":     [...],
//       "allowlist": [...]
//     },
//     "commandos-bingo": {
//       "board": { "tiles": [...] }
//     }
//   }
//
// Keys already in Firestore are OVERWRITTEN. Use --dry-run to preview without writing.
'use strict';

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Args ────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const file    = args.find(a => !a.startsWith('--'));

if (!file) {
    console.error('Usage: FIREBASE_SERVICE_ACCOUNT=\'<json>\' node seed-import.js <import-file.json> [--dry-run]');
    process.exit(1);
}

// ── Load import data ─────────────────────────────────────────────
let importData;
try {
    importData = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
} catch (err) {
    console.error('Failed to read import file:', err.message);
    process.exit(1);
}

if (typeof importData !== 'object' || Array.isArray(importData) || importData === null) {
    console.error('Import file must be a JSON object: { "<collection>": { "<key>": <value> } }');
    process.exit(1);
}

// ── Firebase init ────────────────────────────────────────────────
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT env var not set'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

// ── Run import ───────────────────────────────────────────────────
async function run() {
    const collections = Object.keys(importData);
    if (collections.length === 0) {
        console.log('Nothing to import — file is empty.');
        return;
    }

    let total = 0;
    for (const col of collections) {
        const keys = Object.keys(importData[col]);
        for (const key of keys) {
            total++;
        }
    }

    console.log(`\nImport file: ${file}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
    console.log(`Entries to write: ${total}\n`);

    for (const col of collections) {
        const keys = Object.keys(importData[col]);
        for (const key of keys) {
            const value = importData[col][key];
            const summary = Array.isArray(value)
                ? `[array, ${value.length} items]`
                : typeof value === 'object' && value !== null
                    ? `{object, ${Object.keys(value).length} keys}`
                    : String(value).slice(0, 60);
            console.log(`  ${col} / ${key}  →  ${summary}`);
            if (!dryRun) {
                await db.collection(col).doc(key).set({ v: value });
            }
        }
    }

    console.log(dryRun ? '\nDry run complete — nothing was written.' : '\nImport complete.');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('\nImport failed:', err.message || err);
    process.exit(1);
});
