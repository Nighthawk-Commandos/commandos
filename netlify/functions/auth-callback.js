// ═══════════════════════════════════════════════════════════════
//  auth-callback.js — handle Discord OAuth callback
//  Required env vars:
//    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET,
//    ROWIFI_API_KEY (RoWifi bot token), DISCORD_GUILD_ID
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const { fireStore, getUserAdminPerms } = require('./_shared');

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
    if (!res.ok) {
        const errBody = await res.text().catch(() => '(unreadable)');
        console.error('[auth-callback] Discord token exchange failed:', res.status, errBody);
        throw new Error('discord_token_error');
    }
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

// ── Discord guild member role helpers ───────────────────────────
// Primary: OAuth user token with guilds.members.read scope (reliable, no bot
//          permission requirements).
// Fallback: bot token via ROWIFI_API_KEY — requires Server Members Intent on
//           the bot application, which may not always be enabled.
async function getGuildMemberRoles(oauthToken, userId, guildId, botToken) {
    // Try the user's own OAuth token first
    if (oauthToken && guildId) {
        try {
            const res = await fetch(
                `https://discord.com/api/users/@me/guilds/${guildId}/member`,
                { headers: { Authorization: 'Bearer ' + oauthToken } }
            );
            if (res.ok) {
                const member = await res.json();
                if (Array.isArray(member.roles)) return member.roles;
            }
        } catch (_) {}
    }
    // Fallback: bot token (requires Server Members Intent)
    if (!botToken || !guildId) return [];
    try {
        const res = await fetch(
            `https://discord.com/api/guilds/${guildId}/members/${userId}`,
            { headers: { Authorization: 'Bot ' + botToken } }
        );
        if (!res.ok) return [];
        const member = await res.json();
        return Array.isArray(member.roles) ? member.roles : [];
    } catch { return []; }
}

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

    // Detect applicant mode (set by auth-apply.js) — skips the group membership check
    const modeMatch   = (event.headers.cookie || '').match(/(?:^|;\s*)cmd_oauth_mode=([^;]+)/);
    const isApplyMode = modeMatch && decodeURIComponent(modeMatch[1]) === 'apply';
    const clearModeCookie = isLocalDev
        ? 'cmd_oauth_mode=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
        : 'cmd_oauth_mode=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

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

        // 4. Roblox username, group ranks, and Discord guild roles (parallel)
        // discordRoles uses OAuth token first (guilds.members.read scope), bot token as fallback.
        const [robloxUsername, ranks, discordRoles] = await Promise.all([
            getRobloxUsername(robloxId),
            getGroupRanks(robloxId),
            getGuildMemberRoles(accessToken, discordUser.id, guildId, rowifiKey)
        ]);

        // 5. Must be in division group — unless applicant-mode OR a bypassMember perm is granted
        if (ranks.divisionRank === 0 && !isApplyMode) {
            // Check whether any Discord role grant gives this user the bypassMember perm.
            // Build a minimal session-like object with just the fields getUserAdminPerms needs.
            let canBypass = false;
            try {
                const partialSession = { discordId: discordUser.id, robloxId: String(robloxId), divisionRank: 0, discordRoles };
                const perms = await getUserAdminPerms(partialSession, fireStore('commandos-admin'));
                canBypass = !!(perms && perms.bypassMember);
            } catch (_) { /* never block login on a perm-check failure */ }
            if (!canBypass) return redirectError('not_in_group');
        }

        // 6. Build session payload
        const nowSec = Math.floor(Date.now() / 1000);
        // Applicant sessions get a shorter TTL (24 h) and the applicantMode flag
        const ttl     = isApplyMode ? 24 * 60 * 60 : SESSION_TTL;
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
            discordRoles:     discordRoles,  // Discord role IDs in the guild — used for role-based perm grants
            applicantMode:    isApplyMode && ranks.divisionRank === 0,
            iat:              nowSec,
            exp:              nowSec + ttl
        };

        const token       = signSession(session, secret);
        const cookieFlags = isLocalDev
            ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl}`
            : `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttl}`;

        // Read the return-to link stored by auth-login.js, validated again for safety.
        const returnMatch = (event.headers.cookie || '').match(/(?:^|;\s*)cmd_oauth_return=([^;]+)/);
        const rawReturn   = returnMatch ? decodeURIComponent(returnMatch[1]) : '';
        const safeReturn  = /^[a-zA-Z0-9_-]{1,60}$/.test(rawReturn) ? rawReturn : '';
        const clearReturnCookie = isLocalDev
            ? 'cmd_oauth_return=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
            : 'cmd_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

        return {
            statusCode: 302,
            multiValueHeaders: {
                Location:   [safeReturn ? '/?link=' + encodeURIComponent(safeReturn) : '/'],
                'Set-Cookie': [
                    `${SESSION_COOKIE}=${token}; ${cookieFlags}`,
                    clearStateCookie,
                    clearReturnCookie,
                    clearModeCookie
                ]
            },
            body: ''
        };

    } catch (err) {
        console.error('Auth callback error:', err);
        return redirectError('auth_failed');
    }
};
