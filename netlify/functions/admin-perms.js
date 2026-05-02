// ── GET /api/admin/perms — return current user's admin permissions + perm group memberships
'use strict';

const { fireStore, verifySession, getUserAdminPerms, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore    = fireStore('commandos-admin');
    const contentStore  = fireStore('commandos-content');
    const perms = await getUserAdminPerms(session, adminStore);

    // Also look up which perm groups the user belongs to (for profile display)
    let memberGroups = [];
    try {
        const groups = await contentStore.get('perm-groups', { type: 'json' }).catch(() => []) || [];
        const userRoles = new Set(Array.isArray(session.discordRoles) ? session.discordRoles : []);
        memberGroups = groups
            .filter(g =>
                (g.memberDiscordIds || []).includes(session.discordId) ||
                (g.discordRoleIds   || []).some(rid => userRoles.has(rid))
            )
            .map(g => ({ id: g.id, name: g.name, purpose: g.purpose || 'general' }));
    } catch { /* non-blocking */ }

    // Non-admins get null perms but may still have perm group memberships
    const out = perms || { superadmin: false };
    out.memberGroups = memberGroups;

    return json(200, out);
};
