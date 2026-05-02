// ── /api/auth/apply — redirect to Discord OAuth (applicant mode) ─
// Identical to auth-login.js except it sets cmd_oauth_mode=apply so
// auth-callback.js skips the group-membership check.  Anyone with a
// verified Roblox account can authenticate — they do not need to be
// in the Nighthawk Commandos division group.
'use strict';

const crypto = require('crypto');

exports.handler = async function (event) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) return { statusCode: 500, body: 'DISCORD_CLIENT_ID not configured' };

    const base      = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
    const isLocalDev = base.startsWith('http://localhost');

    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  base + '/api/auth/discord/callback',
        response_type: 'code',
        scope:         'identify',
        state
    });

    const cookieFlags = isLocalDev
        ? 'HttpOnly; SameSite=Lax; Path=/; Max-Age=300'
        : 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300';

    // Preserve return link if provided
    const rawLink  = (event.queryStringParameters || {}).link || '';
    const safeLink = /^[a-zA-Z0-9_-]{1,60}$/.test(rawLink) ? rawLink : '';

    const cookies = [
        `cmd_oauth_state=${state}; ${cookieFlags}`,
        `cmd_oauth_mode=apply; ${cookieFlags}`
    ];
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
