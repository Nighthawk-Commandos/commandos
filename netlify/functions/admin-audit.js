// ── GET /api/admin/audit — read the admin dashboard audit log
// Requires disAudit permission (same gate as DIS audit).
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = fireStore('commandos-admin');
    const perms = await getUserAdminPerms(session, adminStore);
    if (!perms || !perms.disAudit) return json(403, { error: 'Requires disAudit permission' });

    const log = await adminStore.get('audit', { type: 'json' }).catch(() => []) || [];
    return json(200, { log });
};
