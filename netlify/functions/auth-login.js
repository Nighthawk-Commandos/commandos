// ═══════════════════════════════════════════════════════════════
//  auth-login.js — redirect to Discord OAuth
//  Env vars required: DISCORD_CLIENT_ID, URL (auto-set by Netlify)
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

exports.handler = async function (event) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
        return { statusCode: 500, body: 'DISCORD_CLIENT_ID not configured' };
    }
    const base       = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
    const isLocalDev = base.startsWith('http://localhost');

    // Generate a cryptographically-random state token to prevent OAuth CSRF.
    // The token is stored in a short-lived HttpOnly cookie; the callback MUST
    // echo back the same value — any mismatch means the request was forged.
    const state = crypto.randomBytes(16).toString('hex'); // 32 hex chars

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  base + '/api/auth/discord/callback',
        response_type: 'code',
        scope:         'identify guilds.members.read',
        state:         state
    });

    const cookieFlags = isLocalDev
        ? 'HttpOnly; SameSite=Lax; Path=/; Max-Age=300'
        : 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300';

    // Preserve optional return-to link (e.g. ?link=admin) through the OAuth round-trip.
    // Validated strictly so it can never be used as an open redirect.
    const rawLink  = (event.queryStringParameters || {}).link || '';
    const safeLink = /^[a-zA-Z0-9_-]{1,60}$/.test(rawLink) ? rawLink : '';

    const cookies = [`cmd_oauth_state=${state}; ${cookieFlags}`];
    if (safeLink) cookies.push(`cmd_oauth_return=${safeLink}; ${cookieFlags}`);

    return {
        statusCode: 302,
        multiValueHeaders: {
            Location:    ['https://discord.com/api/oauth2/authorize?' + params.toString()],
            'Set-Cookie': cookies
        },
        body: ''
    };
};
