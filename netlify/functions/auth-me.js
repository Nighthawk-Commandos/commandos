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
    // Constant-time compare
    if (expected.length !== hmac.length) return null;
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
    const secret  = process.env.SESSION_SECRET || 'change-this-secret-in-netlify-env';
    const cookies = parseCookies(event.headers.cookie || '');
    const token   = cookies['cmd_session'];

    if (!token) {
        return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_authenticated' }) };
    }

    const session = verifySession(token, secret);
    if (!session) {
        return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_session' }) };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(session)
    };
};
