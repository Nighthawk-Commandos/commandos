// ═══════════════════════════════════════════════════════════════
//  auth-logout.js — clear session cookie and redirect home
// ═══════════════════════════════════════════════════════════════
'use strict';

exports.handler = async function () {
    return {
        statusCode: 302,
        headers: {
            Location:     '/',
            'Set-Cookie': 'cmd_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        },
        body: ''
    };
};
