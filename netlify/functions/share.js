// ── GET /share?link=<key> — Discord / Slack embed handler ───────
// Returns a lightweight HTML page with Open Graph meta tags so that
// sharing a quick link in Discord shows a rich embed preview.
// Human users are immediately redirected to the real SPA at /?link=...
// Discord's bot reads the OG tags but never follows the redirect.
'use strict';

const SITE_NAME  = 'TNI:C Commandos';
const SITE_IMAGE = 'https://i.imgur.com/YA7Ilep.png';

// Title + description per link key (mirrors _handleQuickLink keys in app.js)
const LINK_META = {
    'mainframe':         { title: 'Mainframe',                   desc: 'Access the TNI:C Commandos Mainframe stats, trackers, and event log.' },
    'settings':          { title: 'Event Settings',              desc: 'View current event types, weekly quotas, and group configuration.' },
    'activity':          { title: 'Activity Tracker',            desc: 'Track member AP, attendance, and weekly activity progress.' },
    'officers':          { title: 'Officer Tracker',             desc: 'View officer standings, OP totals, and deployment stats.' },
    'honored':           { title: 'Honored Members',             desc: 'View honored members and their commendation medals.' },
    'departments':       { title: 'Department Tracker',          desc: 'View department rosters and member assignments.' },
    'weekly':            { title: 'Weekly Events',               desc: 'Browse all events logged this week.' },
    'monthly':           { title: 'Monthly Events',              desc: 'Browse all events logged this month.' },
    'form-eventlog':     { title: 'Log an Event',                desc: 'Submit a new hosted event to the Commandos event log.' },
    'form-editeventlog': { title: 'Edit Event Log',              desc: 'Request a correction to an existing event log entry.' },
    'form-transfer':     { title: 'Stats Transfer',              desc: 'Request a stats transfer to a new Roblox username.' },
    'form-exemption':    { title: 'Activity Exemption',          desc: 'Request an activity exemption from the weekly quota.' },
    'form-missingap':    { title: 'Missing AP Request',          desc: 'Report missing Activity Points from an attended event.' },
    'div-objectives':    { title: 'Division Objectives',         desc: 'View current operational objectives for all Commandos divisions.' },
    'deployment':        { title: 'Deployment Incentive System', desc: 'View the DIS board, claim tiles, and check this week\'s leaderboard.' },
    'division-stats':    { title: 'Division Statistics',           desc: 'Event stats, officer leaderboards, and group audit log for Nighthawk Commandos.' },
    'docs':              { title: 'Document Hub',                  desc: 'Division documents, guides, and reference materials for TNI:C Commandos.' },
    'apply':             { title: 'Application Hub',               desc: 'Apply for division roles or programmes in Nighthawk Commandos.' },
    'apply-mine':        { title: 'My Applications',               desc: 'Track the status of your submitted applications to Nighthawk Commandos.' },
    'apply-review':      { title: 'Application Review',            desc: 'Review submitted applications for Nighthawk Commandos.' },
    'profile':           { title: 'My Profile',                    desc: 'View your Nighthawk Commandos Mainframe profile and permissions.' },
    'event-stats':       { title: 'Division Statistics',           desc: 'Event stats, officer leaderboards, and group audit log for Nighthawk Commandos.' },
    'admin':             { title: 'Admin Panel',                 desc: 'TNI:C Commandos administration tools.' }
};

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
    const p    = event.queryStringParameters || {};
    const link = (p.link || '').trim().toLowerCase();
    const meta = LINK_META[link] || { title: 'Mainframe', desc: 'TNI:C Commandos — Nighthawk Battalion.' };

    const fullTitle = SITE_NAME + ' — ' + meta.title;
    const dest      = '/?link=' + encodeURIComponent(link || 'mainframe');
    const canonical = (process.env.URL || '') + '/share?link=' + encodeURIComponent(link);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>

<!-- Open Graph (Discord, Slack, iMessage) -->
<meta property="og:type"        content="website">
<meta property="og:site_name"   content="${esc(SITE_NAME)}">
<meta property="og:title"       content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(meta.desc)}">
<meta property="og:image"       content="${esc(SITE_IMAGE)}">
<meta property="og:url"         content="${esc(canonical)}">

<!-- Twitter / X card -->
<meta name="twitter:card"        content="summary">
<meta name="twitter:title"       content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(meta.desc)}">
<meta name="twitter:image"       content="${esc(SITE_IMAGE)}">

<!-- Instant redirect for humans — Discord bot ignores this -->
<meta http-equiv="refresh" content="0;url=${esc(dest)}">
<style>body{background:#0b0c0f;color:#e8e9ec;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#c8a44a}</style>
</head>
<body>
<div>
  <div style="font-size:11px;letter-spacing:.1em;color:#6b7280;margin-bottom:8px">REDIRECTING</div>
  <div style="font-size:18px;font-weight:700;margin-bottom:12px">${esc(fullTitle)}</div>
  <div style="font-size:12px;color:#6b7280">${esc(meta.desc)}</div>
  <div style="margin-top:16px;font-size:11px;color:#6b7280">If you are not redirected, <a href="${esc(dest)}">click here</a>.</div>
</div>
<script>location.replace(${JSON.stringify(dest)});<\/script>
</body>
</html>`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
        },
        body: html
    };
};
