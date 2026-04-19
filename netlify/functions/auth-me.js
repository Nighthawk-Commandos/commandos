// ═══════════════════════════════════════════════════════════════
//  auth-me.js — verify session cookie and return user data
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

function verifySession(token, secret) {
    if (!token || !token.includes('.')) return null;
    const dot     = token.lastIndexOf('.');
    const encoded = token.slice(0, dot);
    const hmac    = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
    if (!/^[0-9a-f]{64}$/.test(hmac)) return null;
    const eq = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'));
    if (!eq) return null;
    try {
        const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch { return null; }
}

function parseCookies(header) {
    if (!header) return {};
    return Object.fromEntries(
        header.split(';').map(c => {
            const idx = c.indexOf('=');
            if (idx < 0) return [c.trim(), ''];
            return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
        })
    );
}

exports.handler = async function (event) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        console.error('[auth-me] FATAL: SESSION_SECRET env var is not set');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
            body: JSON.stringify({ error: 'server_misconfigured' })
        };
    }

    const cookies = parseCookies(event.headers.cookie || '');
    const token   = cookies['cmd_session'];

    const secHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

    if (!token) {
        return { statusCode: 200, headers: secHeaders, body: JSON.stringify({ authenticated: false }) };
    }

    const session = verifySession(token, secret);
    if (!session) {
        return { statusCode: 200, headers: secHeaders, body: JSON.stringify({ authenticated: false }) };
    }

    return {
        statusCode: 200,
        headers: secHeaders,
        body: JSON.stringify(session)
    };
};
