// ── /api/admin/roles — role template CRUD
//  GET    → list all role templates
//  POST   → { name, color, permissions }      → create
//  PATCH  → { id, name, color, permissions }  → update
//  DELETE → { id }                            → delete
'use strict';

const { blobsStore, verifySession, getUserAdminPerms, ALL_PERMS, json, addAdminAudit, sendAuditWebhook } = require('./_shared');

function makeId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

// Clamp permissions to what the actor is allowed to grant
function sanitizePerms(requested, actorPerms) {
    const out = {};
    ALL_PERMS.forEach(k => {
        out[k] = (k === 'roleAssign' || k === 'roleEdit')
            ? !!(actorPerms.superadmin && requested && requested[k])
            : !!(actorPerms[k] && requested && requested[k]);
    });
    return out;
}

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = blobsStore('commandos-admin');
    const actorPerms = await getUserAdminPerms(session, adminStore);
    if (!actorPerms) return json(403, { error: 'Forbidden' });

    let roles = [];
    try {
        const raw = await adminStore.get('roles', { type: 'json' });
        roles = Array.isArray(raw) ? raw : [];
    } catch { roles = []; }

    if (event.httpMethod === 'GET') return json(200, roles);

    // All write operations require roleEdit or superadmin
    if (!actorPerms.superadmin && !actorPerms.roleEdit) {
        return json(403, { error: 'Requires roleEdit permission' });
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }

    const adminId = session.robloxUsername || session.discordId;

    if (event.httpMethod === 'POST') {
        const { name, color, permissions } = body;
        if (!name || !name.trim()) return json(400, { error: 'Name required' });
        const newRole = {
            id:          makeId(name.trim()),
            name:        name.trim(),
            color:       color || '#7c4ab8',
            permissions: sanitizePerms(permissions || {}, actorPerms)
        };
        roles.push(newRole);
        await adminStore.set('roles', JSON.stringify(roles));
        await addAdminAudit(adminStore, adminId, 'ROLE_CREATE', { id: newRole.id, name: newRole.name, color: newRole.color });
        await sendAuditWebhook(adminId, 'ROLE_CREATE', { id: newRole.id, name: newRole.name, color: newRole.color });
        return json(200, { success: true, roles });
    }

    if (event.httpMethod === 'PATCH') {
        const { id, name, color, permissions } = body;
        if (!id) return json(400, { error: 'id required' });
        const idx = roles.findIndex(r => r.id === id);
        if (idx === -1) return json(404, { error: 'Role not found' });
        roles[idx] = Object.assign({}, roles[idx], {
            name:        (name || roles[idx].name).trim(),
            color:       color || roles[idx].color,
            permissions: permissions !== undefined
                ? sanitizePerms(permissions, actorPerms)
                : roles[idx].permissions
        });
        await adminStore.set('roles', JSON.stringify(roles));
        await addAdminAudit(adminStore, adminId, 'ROLE_UPDATE', { id, name: roles[idx].name, color: roles[idx].color });
        await sendAuditWebhook(adminId, 'ROLE_UPDATE', { id, name: roles[idx].name, color: roles[idx].color });
        return json(200, { success: true, roles });
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id) return json(400, { error: 'id required' });
        const target = roles.find(r => r.id === id);
        if (!target) return json(404, { error: 'Role not found' });
        roles = roles.filter(r => r.id !== id);
        await adminStore.set('roles', JSON.stringify(roles));
        await addAdminAudit(adminStore, adminId, 'ROLE_DELETE', { id, name: target.name });
        await sendAuditWebhook(adminId, 'ROLE_DELETE', { id, name: target.name });
        return json(200, { success: true, roles });
    }

    return json(405, { error: 'method_not_allowed' });
};
