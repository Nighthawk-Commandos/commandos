// ═══════════════════════════════════════════════════════════════
//  admin-allowlist.js — manage the admin allowlist with permissions
//  GET    /api/admin/allowlist → list entries
//  POST   /api/admin/allowlist → { discordId, label, permissions } → add
//  PATCH  /api/admin/allowlist → { discordId, permissions }        → update perms
//  DELETE /api/admin/allowlist → { discordId }                     → remove
//  Requires: divisionRank >= 246 OR already on the list.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { blobsStore, verifySession, getUserAdminPerms, ALL_PERMS, json, addAdminAudit } = require('./_shared');

// Clamp requested permissions to what the actor is allowed to grant.
// Only superadmin can grant roleManager.
function sanitizePerms(requested, actorPerms) {
    const out = {};
    ALL_PERMS.forEach(k => {
        if (k === 'roleAssign' || k === 'roleEdit') {
            out[k] = !!(actorPerms.superadmin && requested && requested[k]);
        } else {
            out[k] = !!(actorPerms[k] && requested && requested[k]);
        }
    });
    return out;
}

// Returns true if every perm in target that is true is also true in actor.
function isSubset(targetPerms, actorPerms) {
    if (actorPerms.superadmin) return true;
    const tp = targetPerms || {};
    return ALL_PERMS.every(k => !tp[k] || !!actorPerms[k]);
}

exports.handler = async function (event) {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'not_authenticated' });

    const store = blobsStore('commandos-admin');
    let list = [];
    try {
        const raw = await store.get('allowlist', { type: 'json' });
        list = Array.isArray(raw) ? raw : [];
    } catch { list = []; }

    // Compute actor permissions (null if not an admin at all)
    const actorPerms = await getUserAdminPerms(session, store);

    // Access check: must have some admin access to use this endpoint
    if (!actorPerms) return json(403, { error: 'forbidden' });

    const method = event.httpMethod;

    // ── GET ──────────────────────────────────────────────────────
    if (method === 'GET') {
        return json(200, list);
    }

    // ── POST (add entry) ─────────────────────────────────────────
    if (method === 'POST') {
        if (!actorPerms.superadmin && !actorPerms.roleAssign) {
            return json(403, { error: 'Requires roleAssign permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId, label, roleId, permissions } = body;
        if (!discordId) return json(400, { error: 'discordId required' });

        const entry = { discordId, label: label || discordId, addedBy: session.discordId, addedAt: Date.now() };
        if (roleId) {
            entry.roleId = roleId;
        } else {
            entry.permissions = sanitizePerms(permissions || {}, actorPerms);
        }

        if (!list.some(e => e.discordId === discordId)) {
            list.push(entry);
            await store.set('allowlist', JSON.stringify(list));
            const adminId = session.robloxUsername || session.discordId;
            await addAdminAudit(store, adminId, 'ALLOWLIST_ADD', { discordId, label: entry.label, roleId: entry.roleId });
        }
        return json(200, { success: true, list });
    }

    // ── PATCH (update role or permissions of existing entry) ─────
    if (method === 'PATCH') {
        if (!actorPerms.superadmin && !actorPerms.roleAssign) {
            return json(403, { error: 'Requires roleAssign permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId, roleId, permissions } = body;
        if (!discordId) return json(400, { error: 'discordId required' });

        const idx = list.findIndex(e => e.discordId === discordId);
        if (idx === -1) return json(404, { error: 'Entry not found' });

        const current = list[idx];
        let auditDetails = { discordId };

        if (roleId !== undefined) {
            if (roleId) {
                list[idx] = Object.assign({}, current, { roleId, permissions: undefined });
                delete list[idx].permissions;
            } else {
                list[idx] = Object.assign({}, current, { permissions: {} });
                delete list[idx].roleId;
            }
            auditDetails.roleId = roleId || null;
        } else if (permissions !== undefined) {
            if (!isSubset(current.permissions, actorPerms)) {
                return json(403, { error: 'Cannot edit a user with higher permissions than you' });
            }
            list[idx] = Object.assign({}, current, { permissions: sanitizePerms(permissions, actorPerms) });
            delete list[idx].roleId;
            auditDetails.permissions = list[idx].permissions;
        }

        await store.set('allowlist', JSON.stringify(list));
        const adminId = session.robloxUsername || session.discordId;
        await addAdminAudit(store, adminId, 'ALLOWLIST_UPDATE', auditDetails);
        return json(200, { success: true, list });
    }

    // ── DELETE ───────────────────────────────────────────────────
    if (method === 'DELETE') {
        if (!actorPerms.superadmin && !actorPerms.roleAssign) {
            return json(403, { error: 'Requires roleAssign permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId } = body;
        if (!discordId) return json(400, { error: 'discordId required' });

        const target = list.find(e => e.discordId === discordId);
        if (target && !isSubset(target.permissions, actorPerms)) {
            return json(403, { error: 'Cannot remove a user with higher permissions than you' });
        }

        list = list.filter(e => e.discordId !== discordId);
        await store.set('allowlist', JSON.stringify(list));
        const adminId = session.robloxUsername || session.discordId;
        await addAdminAudit(store, adminId, 'ALLOWLIST_REMOVE', { discordId, label: target ? target.label : discordId });
        return json(200, { success: true, list });
    }

    return json(405, { error: 'method_not_allowed' });
};
