// ── GET /api/admin/perms — return current user's admin permissions + perm group memberships
'use strict';

const { fireStore, verifySession, getUserAdminPerms, getAdminData, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore   = fireStore('commandos-admin');
    const contentStore = fireStore('commandos-content');
    const perms = await getUserAdminPerms(session, adminStore);

    // Build the list of role templates that apply to this user (for profile display)
    let appliedRoles = [];
    try {
        const { list, roles, grants, rankSettings } = await getAdminData(adminStore);
        const userDiscordRoles = new Set(Array.isArray(session.discordRoles) ? session.discordRoles : []);

        // Roles from direct allowlist entry
        const entry = list.find(e => e.discordId === session.discordId);
        if (entry) {
            const ids = Array.isArray(entry.roleIds) && entry.roleIds.length
                ? entry.roleIds : (entry.roleId ? [entry.roleId] : []);
            ids.forEach(rid => {
                const r = roles.find(x => x.id === rid);
                if (r) appliedRoles.push({ name: r.name, color: r.color || '#7c4ab8', source: 'direct' });
            });
        }

        // Roles from Discord role grants
        (grants || []).filter(g => userDiscordRoles.has(g.discordRoleId)).forEach(g => {
            const ids = Array.isArray(g.roleIds) && g.roleIds.length
                ? g.roleIds : (g.roleId ? [g.roleId] : []);
            ids.forEach(rid => {
                const r = roles.find(x => x.id === rid);
                if (r && !appliedRoles.some(a => a.name === r.name)) {
                    appliedRoles.push({ name: r.name, color: r.color || '#7c4ab8', source: 'grant' });
                }
            });
        });

        // Roles from perm groups
        const groups = await contentStore.get('perm-groups', { type: 'json' }).catch(() => []) || [];
        groups.filter(g => {
            const hasRoles = (Array.isArray(g.roleIds) && g.roleIds.length) || g.roleId;
            return hasRoles && (
                (g.memberDiscordIds || []).includes(session.discordId) ||
                (g.discordRoleIds   || []).some(rid => userDiscordRoles.has(rid))
            );
        }).forEach(g => {
            const ids = Array.isArray(g.roleIds) && g.roleIds.length
                ? g.roleIds : (g.roleId ? [g.roleId] : []);
            ids.forEach(rid => {
                const r = roles.find(x => x.id === rid);
                if (r && !appliedRoles.some(a => a.name === r.name)) {
                    appliedRoles.push({ name: r.name, color: r.color || '#7c4ab8', source: 'group' });
                }
            });
        });

        // Rank-based level labels (from rank settings)
        const rs = rankSettings || {};
        if (rs.officerRankId && session.divisionRank >= rs.officerRankId) {
            appliedRoles.push({ name: 'Officer Level', color: '#c8a44a', source: 'rank' });
        }
        if (rs.highCommandRankId && session.divisionRank >= rs.highCommandRankId) {
            appliedRoles.push({ name: 'High Command Level', color: '#b090d8', source: 'rank' });
        }
        if (rs.superadminDiscordRoleId && userDiscordRoles.has(rs.superadminDiscordRoleId)) {
            appliedRoles.push({ name: 'Superadmin (Discord Role)', color: '#b090d8', source: 'rank' });
        }
    } catch { /* non-blocking */ }

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

    const out = perms || { superadmin: false };
    out.memberGroups  = memberGroups;
    out.appliedRoles  = appliedRoles;

    return json(200, out);
};
