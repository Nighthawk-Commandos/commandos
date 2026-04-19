// ── GET /api/admin/perms — return current user's admin permissions
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = fireStore('commandos-admin');
    const perms = await getUserAdminPerms(session, adminStore);

    if (!perms) return json(403, { error: 'Forbidden' });

    return json(200, perms);
};
