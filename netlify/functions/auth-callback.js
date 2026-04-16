// ═══════════════════════════════════════════════════════════════
//  auth-callback.js — handle Discord OAuth callback
//  Required env vars:
//    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET,
//    ROWIFI_API_KEY (RoWifi bot token), DISCORD_GUILD_ID
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

const DIVISION_GROUP = 3496996;
const GHOST_GROUP    = 11000162;
const SESSION_COOKIE = 'cmd_session';
const SESSION_TTL    = 7 * 24 * 60 * 60; // 7 days in seconds

// ── Session signing ─────────────────────────────────────────
function signSession(data, secret) {
    // Use standard base64 (not base64url) — must match _shared.js verifySession decode.
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
    const hmac    = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
    return encoded + '.' + hmac;
}

// ── Discord helpers ──────────────────────────────────────────
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     clientId,
            client_secret: clientSecret,
            grant_type:    'authorization_code',
            code,
            redirect_uri:  redirectUri
        }).toString()
    });
    if (!res.ok) throw new Error('discord_token_error');
    return res.json();
}

async function getDiscordUser(accessToken) {
    const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) throw new Error('discord_user_error');
    return res.json();
}

// ── RoWifi ──────────────────────────────────────────────────
async function getRobloxIdViaRowifi(discordId, guildId, apiKey) {
    // RoWifi V2 — requires a bot token/API key
    const url = `https://api.rowifi.xyz/v2/guilds/${guildId}/members/${discordId}`;
    const headers = {};
    if (apiKey) headers['Authorization'] = 'Bot ' + apiKey;

    const res = await fetch(url, { headers });

    if (res.status === 404) return null;     // not linked
    if (res.status === 422) return null;     // not linked (RoWifi format)
    if (!res.ok) throw new Error('rowifi_error');

    const data = await res.json();
    // Handle various response shapes
    return (data.roblox_id || data.robloxId || (data.data && data.data.roblox_id)) || null;
}

// ── Roblox helpers ───────────────────────────────────────────
async function getRobloxUsername(userId) {
    try {
        const res  = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.name || null;
    } catch { return null; }
}

async function getGroupRanks(userId) {
    try {
        const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
        if (!res.ok) return { divisionRank: 0, ghostRank: 0 };
        const data   = await res.json();
        const groups = data.data || [];
        const div    = groups.find(g => g.group && g.group.id === DIVISION_GROUP);
        const ghost  = groups.find(g => g.group && g.group.id === GHOST_GROUP);
        return {
            divisionRank:   div   ? div.role.rank   : 0,
            ghostRank:      ghost ? ghost.role.rank  : 0,
            divisionRoleName:  div   ? div.role.name   : '',
            ghostRoleName:     ghost ? ghost.role.name  : ''
        };
    } catch { return { divisionRank: 0, ghostRank: 0 }; }
}

// ── Handler ──────────────────────────────────────────────────
exports.handler = async function (event) {
    const base          = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
    const clientId      = process.env.DISCORD_CLIENT_ID;
    const clientSecret  = process.env.DISCORD_CLIENT_SECRET;
    const secret        = process.env.SESSION_SECRET;
    const rowifiKey     = process.env.ROWIFI_API_KEY || '';
    const guildId       = process.env.DISCORD_GUILD_ID || '';
    const isLocalDev    = base.startsWith('http://localhost');

    // SESSION_SECRET must be set — a missing or default secret allows session forgery.
    if (!secret) {
        console.error('[auth-callback] FATAL: SESSION_SECRET env var is not set');
        return redirectError('auth_failed');
    }

    const params = new URLSearchParams(event.queryStringParameters || {});
    const code   = params.get('code');
    const state  = params.get('state');

    // Expire the CSRF state cookie regardless of outcome so it can't be replayed.
    const clearStateCookie = isLocalDev
        ? 'cmd_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
        : 'cmd_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

    const redirectError = (err) => ({
        statusCode: 302,
        multiValueHeaders: {
            Location:   ['/?error=' + err],
            'Set-Cookie': [clearStateCookie]
        },
        body: ''
    });

    if (!code)       return redirectError('auth_failed');
    if (!clientId)   return redirectError('auth_failed');
    if (!guildId)    return redirectError('auth_failed');

    // ── OAuth CSRF protection — validate state parameter ──────────
    const stateCookieMatch = (event.headers.cookie || '').match(/(?:^|;\s*)cmd_oauth_state=([^;]+)/);
    const storedState      = stateCookieMatch ? decodeURIComponent(stateCookieMatch[1]) : null;
    if (!state || !storedState || state !== storedState) {
        console.error('[auth-callback] OAuth state mismatch — possible CSRF attempt');
        return redirectError('auth_failed');
    }

    try {
        // 1. Exchange code → Discord access token
        const tokenData   = await exchangeCode(code, clientId, clientSecret, base + '/api/auth/discord/callback');
        const accessToken = tokenData.access_token;

        // 2. Get Discord user
        const discordUser = await getDiscordUser(accessToken);

        // 3. RoWifi lookup → Roblox ID
        let robloxId = null;
        try {
            robloxId = await getRobloxIdViaRowifi(discordUser.id, guildId, rowifiKey);
        } catch (e) {
            if (e.message === 'rowifi_error') return redirectError('rowifi_error');
        }

        if (!robloxId) return redirectError('rowifi_not_linked');

        // 4. Roblox username + group ranks (parallel)
        const [robloxUsername, ranks] = await Promise.all([
            getRobloxUsername(robloxId),
            getGroupRanks(robloxId)
        ]);

        // 5. Must be in division group
        if (ranks.divisionRank === 0) return redirectError('not_in_group');

        // 6. Build session payload
        const nowSec = Math.floor(Date.now() / 1000);
        const session = {
            discordId:        discordUser.id,
            discordUsername:  discordUser.username,
            discordAvatar:    discordUser.avatar || null,
            robloxId:         String(robloxId),
            robloxUsername:   robloxUsername || 'Unknown',
            divisionRank:     ranks.divisionRank,
            divisionRoleName: ranks.divisionRoleName,
            ghostRank:        ranks.ghostRank,
            ghostRoleName:    ranks.ghostRoleName,
            iat:              nowSec,               // issued-at — used for freshness checks
            exp:              nowSec + SESSION_TTL
        };

        const token       = signSession(session, secret);
        const cookieFlags = isLocalDev
            ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`
            : `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;

        return {
            statusCode: 302,
            multiValueHeaders: {
                Location:   ['/'],
                'Set-Cookie': [
                    `${SESSION_COOKIE}=${token}; ${cookieFlags}`,
                    clearStateCookie
                ]
            },
            body: ''
        };

    } catch (err) {
        console.error('Auth callback error:', err);
        return redirectError('auth_failed');
    }
};
