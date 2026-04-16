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
        scope:         'identify',
        state:         state
    });

    const cookieFlags = isLocalDev
        ? 'HttpOnly; SameSite=Lax; Path=/; Max-Age=300'
        : 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300';

    return {
        statusCode: 302,
        headers: {
            Location:   'https://discord.com/api/oauth2/authorize?' + params.toString(),
            'Set-Cookie': `cmd_oauth_state=${state}; ${cookieFlags}`
        },
        body: ''
    };
};
