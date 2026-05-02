// ── /api/admin/roles — role template CRUD
//  GET    → list all role templates
//  POST   → { name, color, permissions }      → create
//  PATCH  → { id, name, color, permissions }  → update
//  DELETE → { id }                            → delete
'use strict';

const { fireStore, verifySession, getUserAdminPerms, clearAdminCache, ALL_PERMS, json, addAdminAudit, sendAuditWebhook } = require('./_shared');

function makeId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

// The access-control perms are section-access gates, not admin sub-permissions.
// Anyone with roleEdit (or superadmin) can grant them regardless of whether they
// personally hold them — the same way a gatekeeper doesn't need to go through
// every door they can unlock.
const ACCESS_PERMS = new Set(['viewAdmin','viewObjectives','viewEventLog','editEventLog','bypassMember']);

// Clamp permissions to what the actor is allowed to grant
function sanitizePerms(requested, actorPerms) {
    const canEditRoles = actorPerms.superadmin || actorPerms.roleEdit;
    const out = {};
    ALL_PERMS.forEach(k => {
        if (k === 'roleAssign' || k === 'roleEdit') {
            // System-level perms: superadmin only
            out[k] = !!(actorPerms.superadmin && requested && requested[k]);
        } else if (ACCESS_PERMS.has(k)) {
            // Section-access perms: anyone with roleEdit can grant
            out[k] = !!(canEditRoles && requested && requested[k]);
        } else {
            // All other admin sub-perms: actor must hold the perm themselves
            out[k] = !!(actorPerms[k] && requested && requested[k]);
        }
    });
    return out;
}

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = fireStore('commandos-admin');
    const actorPerms = await getUserAdminPerms(session, adminStore);
    if (!actorPerms) return json(403, { error: 'Forbidden' });

    let roles = [];
    try {
        const raw = await adminStore.get('roles', { type: 'json' });
        roles = Array.isArray(raw) ? raw : [];
    } catch { roles = []; }

    // GET ?grants=1 returns the Discord role → admin role grants list
    if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).grants) {
        const raw = await adminStore.get('discord-role-grants', { type: 'json' }).catch(() => []);
        return json(200, Array.isArray(raw) ? raw : []);
    }
    if (event.httpMethod === 'GET') return json(200, roles);

    // All write operations require roleEdit or superadmin
    if (!actorPerms.superadmin && !actorPerms.roleEdit) {
        return json(403, { error: 'Requires roleEdit permission' });
    }

    if ((event.body || '').length > 8192) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }

    const adminId = session.robloxUsername || session.discordId;

    // POST { grant: { discordRoleId, roleId } } — add a Discord role grant
    if (event.httpMethod === 'POST' && body.grant) {
        const { discordRoleId, roleId } = body.grant;
        if (!discordRoleId || !/^\d{17,20}$/.test(String(discordRoleId))) return json(400, { error: 'discordRoleId must be a valid Discord snowflake' });
        if (!roleId || !roles.some(r => r.id === roleId)) return json(400, { error: 'Unknown roleId' });
        let grants = await adminStore.get('discord-role-grants', { type: 'json' }).catch(() => []) || [];
        if (!Array.isArray(grants)) grants = [];
        if (!grants.some(g => g.discordRoleId === discordRoleId)) {
            grants.push({ discordRoleId: String(discordRoleId), roleId });
            await adminStore.set('discord-role-grants', grants);
            clearAdminCache();
            await addAdminAudit(adminStore, adminId, 'DISCORD_GRANT_ADD', { discordRoleId, roleId });
        }
        return json(200, { success: true, grants });
    }

    // DELETE { grant: { discordRoleId } } — remove a Discord role grant
    if (event.httpMethod === 'DELETE' && body.grant) {
        const { discordRoleId } = body.grant;
        if (!discordRoleId) return json(400, { error: 'discordRoleId required' });
        let grants = await adminStore.get('discord-role-grants', { type: 'json' }).catch(() => []) || [];
        grants = grants.filter(g => g.discordRoleId !== String(discordRoleId));
        await adminStore.set('discord-role-grants', grants);
        clearAdminCache();
        await addAdminAudit(adminStore, adminId, 'DISCORD_GRANT_REMOVE', { discordRoleId });
        return json(200, { success: true, grants });
    }

    if (event.httpMethod === 'POST') {
        const { name, color, permissions, superadminOnly } = body;
        if (!name || !name.trim()) return json(400, { error: 'Name required' });
        if (name.trim().length > 100) return json(400, { error: 'Name max 100 chars' });
        if (color && (typeof color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(color))) {
            return json(400, { error: 'color must be a valid hex color' });
        }
        // superadminOnly roles can only be created by superadmins
        if (superadminOnly && !actorPerms.superadmin) {
            return json(403, { error: 'Only superadmins can create superadmin-only roles' });
        }
        const newRole = {
            id:             makeId(name.trim()),
            name:           name.trim(),
            color:          color || '#7c4ab8',
            permissions:    sanitizePerms(permissions || {}, actorPerms),
            superadminOnly: !!superadminOnly
        };
        roles.push(newRole);
        await adminStore.set('roles', roles);
        clearAdminCache();
        await addAdminAudit(adminStore, adminId, 'ROLE_CREATE', { id: newRole.id, name: newRole.name, superadminOnly: newRole.superadminOnly });
        await sendAuditWebhook(adminId, 'ROLE_CREATE', { id: newRole.id, name: newRole.name, superadminOnly: newRole.superadminOnly });
        return json(200, { success: true, roles });
    }

    if (event.httpMethod === 'PATCH') {
        const { id, name, color, permissions, superadminOnly } = body;
        if (!id || typeof id !== 'string') return json(400, { error: 'id required' });
        if (name && name.trim().length > 100) return json(400, { error: 'Name max 100 chars' });
        if (color && (typeof color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(color))) {
            return json(400, { error: 'color must be a valid hex color' });
        }
        const idx = roles.findIndex(r => r.id === id);
        if (idx === -1) return json(404, { error: 'Role not found' });
        // Changing superadminOnly flag requires superadmin
        const newSuperadminOnly = superadminOnly !== undefined ? !!superadminOnly : roles[idx].superadminOnly;
        if (newSuperadminOnly !== roles[idx].superadminOnly && !actorPerms.superadmin) {
            return json(403, { error: 'Only superadmins can change the superadmin-only flag' });
        }
        roles[idx] = Object.assign({}, roles[idx], {
            name:           (name || roles[idx].name).trim(),
            color:          color || roles[idx].color,
            permissions:    permissions !== undefined ? sanitizePerms(permissions, actorPerms) : roles[idx].permissions,
            superadminOnly: newSuperadminOnly
        });
        await adminStore.set('roles', roles);
        clearAdminCache();
        await addAdminAudit(adminStore, adminId, 'ROLE_UPDATE', { id, name: roles[idx].name });
        await sendAuditWebhook(adminId, 'ROLE_UPDATE', { id, name: roles[idx].name });
        return json(200, { success: true, roles });
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id || typeof id !== 'string') return json(400, { error: 'id required' });
        const target = roles.find(r => r.id === id);
        if (!target) return json(404, { error: 'Role not found' });
        // Superadmin-only roles can only be deleted by superadmins
        if (target.superadminOnly && !actorPerms.superadmin) {
            return json(403, { error: 'Only superadmins can delete superadmin-only roles' });
        }
        roles = roles.filter(r => r.id !== id);
        await adminStore.set('roles', roles);
        clearAdminCache();
        await addAdminAudit(adminStore, adminId, 'ROLE_DELETE', { id, name: target.name });
        await sendAuditWebhook(adminId, 'ROLE_DELETE', { id, name: target.name });
        return json(200, { success: true, roles });
    }

    return json(405, { error: 'method_not_allowed' });
};
