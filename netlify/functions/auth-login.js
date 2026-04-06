// ═══════════════════════════════════════════════════════════════
//  auth-login.js — redirect to Discord OAuth
//  Env vars required: DISCORD_CLIENT_ID, URL (auto-set by Netlify)
// ═══════════════════════════════════════════════════════════════
'use strict';

exports.handler = async function () {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
        return { statusCode: 500, body: 'DISCORD_CLIENT_ID not configured' };
    }
    const base = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  base + '/api/auth/discord/callback',
        response_type: 'code',
        scope:         'identify',
    });
    return {
        statusCode: 302,
        headers: { Location: 'https://discord.com/api/oauth2/authorize?' + params.toString() },
        body: ''
    };
};
