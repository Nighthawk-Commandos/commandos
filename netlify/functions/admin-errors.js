// ── GET /api/admin/errors — view the error log
//  Requires: disAudit permission
'use strict';

const { blobsStore, verifySession, getUserAdminPerms, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = blobsStore('commandos-admin');
    const perms      = await getUserAdminPerms(session, adminStore);
    if (!perms || (!perms.disAudit && !perms.superadmin)) {
        return json(403, { error: 'Forbidden: requires disAudit permission' });
    }

    const log = await adminStore.get('error-log', { type: 'json' }).catch(() => []);
    return json(200, { log: Array.isArray(log) ? log : [] });
};
