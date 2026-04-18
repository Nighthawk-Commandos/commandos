# TNI:C Commandos Mainframe

Division management web app for the Nighthawk Commandos (TNI:C). Handles activity tracking, officer management, event logging, the Deployment Incentive System (DIS), and administration — all gated behind Discord auth and Roblox rank verification.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS SPA (no framework, no build step) |
| Hosting | Netlify (static + Functions) |
| Serverless | Netlify Functions (Node.js, CommonJS) |
| State storage | Netlify Blobs |
| Data backend | Google Apps Script (spreadsheet as database) |
| Auth | Discord OAuth2 → RoWifi API → Roblox Group Rank API |
| Sessions | HMAC-SHA256 signed cookie (`cmd_session`, 7-day TTL) |

---

## Sections

### Commandos Mainframe
Main data view pulled from the Google Apps Script backend. Requires division group membership.

- Activity Tracker — member AP, status, strikes, departments
- Officer Tracker — officer OP, status, assignments
- Honored Tracker — medals and awards
- Department Members — per-department member lists
- Weekly / Monthly Events — event log history
- Submission Forms — Event Log, Edit Event Log, Stats Transfer, Exemption, Missing AP

### Division Objectives
Monthly directives and per-department task tracking. Requires rank 243 (Officer) or above.

### Deployment Incentive System (DIS)
Competitive lock-out tile board where officers claim tiles by hosting events and earn raffle entries. Includes a leaderboard and raffle view. Requires rank 235 (Officer) or above.

Admin controls (sync, tile assignment, points, raffle, game pool, audit log) are accessible from both the DIS sidebar and the Admin Dashboard.

### Admin Dashboard
System administration panel. Access is granted by rank 246+ or an explicit allowlist entry.

| Permission | What it controls |
|---|---|
| `roleAssign` | Add/remove/reassign users on the allowlist |
| `roleEdit` | Create/edit/delete role templates |
| `mfOfficers` | Add/remove officers from the tracker via Apps Script |
| `mfRemote` | Remote mainframe functions |
| `disSync` | Sync DIS board with current officer roster |
| `disTiles` | Manually claim/unclaim tiles |
| `disPoints` | Edit officer points directly |
| `disRaffle` | Manage raffle entries |
| `disGamePool` | Edit the game pool |
| `disAudit` | View the DIS audit log and error log |

Users can be assigned multiple roles; permissions are unioned across all assigned roles.

---

## Project Structure

```
commandos/
├── index.html                 # Single-page shell, loads all JS/CSS
├── css/
│   └── styles.css             # All styles (dark theme, sidebar layout, components)
├── js/
│   ├── config.js              # SCRIPT_URL + OBJECTIVES_URL — NOT committed (see Setup)
│   ├── api.js                 # Apps Script transport + localStorage/memory cache
│   ├── auth.js                # Discord OAuth client logic, session management
│   ├── render.js              # Page renderers, admin dashboard, shared DOM helpers
│   ├── forms.js               # Submission form renderers + handlers
│   ├── dis.js                 # Deployment Incentive System UI + polling
│   ├── objectives.js          # Division Objectives section
│   └── app.js                 # Boot, navigation, home screen, quick links
├── netlify/
│   └── functions/
│       ├── _shared.js         # Shared utilities: session verify, admin perms, webhooks, error log
│       ├── auth-login.js      # GET /api/auth/discord — Discord OAuth redirect
│       ├── auth-callback.js   # GET /api/auth/discord/callback — token exchange + session
│       ├── auth-me.js         # GET /api/auth/me — session info
│       ├── auth-logout.js     # GET /api/auth/logout — clear session cookie
│       ├── admin-allowlist.js # GET/POST/PATCH/DELETE /api/admin/allowlist
│       ├── admin-roles.js     # GET/POST/PATCH/DELETE /api/admin/roles
│       ├── admin-perms.js     # GET /api/admin/perms — current user's permissions
│       ├── admin-audit.js     # GET /api/admin/audit — admin audit log
│       ├── admin-errors.js    # GET /api/admin/errors — error log
│       ├── admin-officers.js  # POST /api/admin/officers — add/remove via Apps Script
│       ├── dis-state.js       # GET /api/dis/state
│       ├── dis-sync.js        # POST /api/dis/sync
│       ├── dis-admin.js       # POST /api/dis/admin — all DIS admin actions
│       ├── dis-gamepool.js    # GET/POST /api/dis/gamepool
│       ├── mainframe-data.js  # GET /api/mainframe/data — server-side cached proxy
│       ├── callback-review.js # GET /api/callback/review
│       └── callback-process.js# POST /api/callback/process
├── appscript_code.js          # Google Apps Script backend (deploy separately)
├── netlify.toml               # Build config, redirects, cache/security headers
└── package.json
```

---

## Caching Architecture

The main data endpoint (`getAllData`) is served through three cache layers to keep Apps Script call volume low regardless of concurrent users:

```
Browser request
  → (1) In-memory cache (per tab, instant)
  → (2) localStorage cache (1 hour TTL)
  → (3) Netlify CDN edge cache (s-maxage=300, stale-while-revalidate=120)
  → (4) Netlify Blobs cache (5-minute TTL, one write per window)
  → (5) Apps Script origin (called at most once per 5 minutes globally)
```

---

## Blobs Stores

| Store | Keys | Contents |
|---|---|---|
| `commandos-admin` | `allowlist`, `roles`, `audit`, `error-log` | Admin users, role templates, audit log, error log |
| `commandos-dis` | `board`, `users`, `state-cache`, `week-history`, `alltime`, `audit`, `gamepool` | DIS game state |
| `commandos-main` | `data-cache` | Cached `getAllData` response from Apps Script |

---

## Setup

### 1. Netlify environment variables

Set these in Netlify → Site Settings → Environment Variables:

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | Discord application client secret |
| `SESSION_SECRET` | Random secret for HMAC session signing (generate with `openssl rand -hex 32`) |
| `ROWIFI_API_KEY` | RoWifi API key for Discord→Roblox account linking |
| `DISCORD_GUILD_ID` | Your Discord server ID |
| `SCRIPT_URL` | Your Google Apps Script `/exec` deployment URL |
| `NETLIFY_SITE_ID` | Your Netlify site ID (used for Blobs access) |
| `NETLIFY_ACCESS_TOKEN` | Netlify personal access token (used for Blobs access) |
| `DISCORD_ERROR_WEBHOOK_URL` | Discord webhook URL for error notifications |
| `DISCORD_AUDIT_WEBHOOK_URL` | Discord webhook URL for admin audit embeds |
| `CALLBACK_SECRET` | Shared secret between Netlify and Apps Script for callback auth |

### 2. Apps Script script properties

In your Apps Script project → Project Settings → Script Properties:

| Property | Description |
|---|---|
| `CallbackSecret` | Must match `CALLBACK_SECRET` env var above |
| `NetlifyBaseUrl` | Your Netlify site URL (e.g. `https://your-site.netlify.app`) |
| `Username_Transfer_Webhook` | Discord webhook for transfer/exemption request notifications |
| `ProgressionRequestsWebhook` | Discord webhook for edit event log / missing AP notifications |

### 3. `js/config.js` (not committed)

Create this file locally and on Netlify (or inject it via environment):

```js
window.SCRIPT_URL      = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
window.OBJECTIVES_URL  = 'https://script.google.com/macros/s/YOUR_OBJECTIVES_ID/exec';
```

### 4. Discord application

In your Discord Developer Portal application:
- Add redirect URI: `https://your-site.netlify.app/api/auth/discord/callback`
- Scopes needed: `identify`, `guilds.members.read`

### 5. Local development

```bash
npm install
netlify dev
```

Requires the [Netlify CLI](https://docs.netlify.com/cli/get-started/). Create a `.env` file with the environment variables listed above for local use.

---

## Quick Links

Navigate directly to a section or form after auth by appending `?link=<key>` to the URL:

| Link key | Destination |
|---|---|
| `mainframe` | Commandos Mainframe (settings page) |
| `form-eventlog` | Event Log form |
| `form-editeventlog` | Edit Event Log form |
| `form-transfer` | Stats Transfer form |
| `form-exemption` | Exemption form |
| `form-missingap` | Missing AP form |
| `div-objectives` | Division Objectives |
| `deployment` | Deployment Incentive System |
| `admin` | Admin Dashboard |

Example: `https://your-site.netlify.app/?link=form-eventlog`

---

## DIS Week / Month Advancement

From the Admin Dashboard → Sync tab (or DIS → Admin → Sync):

**Advance to Next Week** — awards +1 raffle entry to the top 5 officers by tiles claimed, saves a week history snapshot, resets all tile claims for the new week.

**Advance to Next Month** — archives all-time stats (tiles, points, raffle entries) to the persistent month log, then resets everyone's stats to zero for the new month.

Both actions post an embed to the audit webhook and write an entry to the DIS audit log.

---

## Audit & Error Logging

All successful admin actions are written to the audit log (`commandos-admin/audit`) and posted as Discord embeds to the audit webhook. Audited actions include:

- Role create / update / delete
- Allowlist user add / update / remove
- Officer add / remove
- Game pool updates
- All DIS admin actions (tile unlock/lock/claim, points/raffle adjustments, week/month advance, etc.)

Failed actions are **not** audited. Instead, they are written to the error log (`commandos-admin/error-log`) and posted to the error webhook. The error log is viewable from Admin Dashboard → Errors (requires `disAudit` permission).

---

## Rank Thresholds

| Rank | Access |
|---|---|
| Any division member (rank > 0) | Commandos Mainframe read access + transfer/exemption/missing AP forms |
| 235 in division OR 7 in ghost | Event Log + Edit Event Log submission forms |
| 243+ in division | Division Objectives + Deployment Incentive System |
| 246+ in division | Admin Dashboard (full superadmin) |
| Allowlist entry | Admin Dashboard (permissions defined by assigned roles) |
