// ═══════════════════════════════════════════════════════════════
//  admin-allowlist.js — manage the admin allowlist with permissions
//  GET    /api/admin/allowlist → list entries
//  POST   /api/admin/allowlist → { discordId, label, roleIds, permissions } → add
//  PATCH  /api/admin/allowlist → { discordId, roleIds, permissions }        → update
//  DELETE /api/admin/allowlist → { discordId }                              → remove
//  Supports multiple roles per user via roleIds[] array.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { blobsStore, verifySession, getUserAdminPerms, ALL_PERMS, json, addAdminAudit, sendAuditWebhook } = require('./_shared');

// Clamp requested permissions to what the actor is allowed to grant.
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

function isSubset(targetPerms, actorPerms) {
    if (actorPerms.superadmin) return true;
    const tp = targetPerms || {};
    return ALL_PERMS.every(k => !tp[k] || !!actorPerms[k]);
}

// Normalise roleIds: accepts a single roleId string or roleIds array.
function normaliseRoleIds(body) {
    if (Array.isArray(body.roleIds)) return body.roleIds.filter(Boolean);
    if (typeof body.roleId === 'string' && body.roleId) return [body.roleId];
    return null; // caller decides what to do with null
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

    const actorPerms = await getUserAdminPerms(session, store);
    if (!actorPerms) return json(403, { error: 'forbidden' });

    const method = event.httpMethod;

    // ── GET ──────────────────────────────────────────────────────
    if (method === 'GET') {
        // Only users who can manage roles should see the allowlist (contains Discord IDs + perms).
        if (!actorPerms.superadmin && !actorPerms.roleAssign && !actorPerms.roleEdit) {
            return json(403, { error: 'Requires roleAssign or roleEdit permission' });
        }
        return json(200, list);
    }

    // ── POST (add entry) ─────────────────────────────────────────
    if (method === 'POST') {
        if (!actorPerms.superadmin && !actorPerms.roleAssign) {
            return json(403, { error: 'Requires roleAssign permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId, label, permissions } = body;
        if (!discordId || typeof discordId !== 'string') return json(400, { error: 'discordId required' });
        // Discord IDs are 17–20 digit snowflakes
        if (!/^\d{17,20}$/.test(discordId.trim())) return json(400, { error: 'discordId must be a valid Discord snowflake' });
        if (label && typeof label === 'string' && label.length > 64) return json(400, { error: 'label too long (max 64 chars)' });

        const roleIds = normaliseRoleIds(body);

        // Validate roleIds against the stored roles list and permission scope
        if (roleIds && roleIds.length) {
            const existingRoles = await store.get('roles', { type: 'json' }).catch(() => []) || [];
            const existingIds   = new Set(existingRoles.map(r => r.id));
            const invalidIds    = roleIds.filter(id => !existingIds.has(id));
            if (invalidIds.length) return json(400, { error: 'Unknown role IDs: ' + invalidIds.join(', ') });
            if (!actorPerms.superadmin) {
                for (const roleId of roleIds) {
                    const role     = existingRoles.find(r => r.id === roleId);
                    const badPerms = role && role.permissions
                        ? ALL_PERMS.filter(k => role.permissions[k] && !actorPerms[k])
                        : [];
                    if (badPerms.length) return json(403, { error: 'Cannot assign a role with permissions you do not have: ' + badPerms.join(', ') });
                }
            }
        }

        const entry = { discordId: discordId.trim(), label: (label || discordId).slice(0, 64), addedBy: session.discordId, addedAt: Date.now() };
        if (roleIds && roleIds.length) {
            entry.roleIds = roleIds;
        } else {
            entry.permissions = sanitizePerms(permissions || {}, actorPerms);
        }

        if (!list.some(e => e.discordId === entry.discordId)) {
            list.push(entry);
            await store.set('allowlist', JSON.stringify(list));
            const adminId = session.robloxUsername || session.discordId;
            await addAdminAudit(store, adminId, 'ALLOWLIST_ADD', { discordId: entry.discordId, label: entry.label, roleIds: entry.roleIds });
            await sendAuditWebhook(adminId, 'ALLOWLIST_ADD', { discordId: entry.discordId, label: entry.label, roleIds: entry.roleIds });
        }
        return json(200, { success: true, list });
    }

    // ── PATCH (update roles or permissions of existing entry) ────
    if (method === 'PATCH') {
        if (!actorPerms.superadmin && !actorPerms.roleAssign) {
            return json(403, { error: 'Requires roleAssign permission' });
        }

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
        const { discordId, permissions } = body;
        if (!discordId) return json(400, { error: 'discordId required' });

        const idx = list.findIndex(e => e.discordId === discordId);
        if (idx === -1) return json(404, { error: 'Entry not found' });

        const current = list[idx];
        const roleIds = normaliseRoleIds(body);
        let auditDetails = { discordId };

        if (roleIds !== null) {
            // Validate that all supplied roleIds exist and are within the actor's permission scope
            if (roleIds.length) {
                const existingRoles = await store.get('roles', { type: 'json' }).catch(() => []) || [];
                const existingIds   = new Set(existingRoles.map(r => r.id));
                const invalidIds    = roleIds.filter(id => !existingIds.has(id));
                if (invalidIds.length) return json(400, { error: 'Unknown role IDs: ' + invalidIds.join(', ') });
                if (!actorPerms.superadmin) {
                    for (const roleId of roleIds) {
                        const role     = existingRoles.find(r => r.id === roleId);
                        const badPerms = role && role.permissions
                            ? ALL_PERMS.filter(k => role.permissions[k] && !actorPerms[k])
                            : [];
                        if (badPerms.length) return json(403, { error: 'Cannot assign a role with permissions you do not have: ' + badPerms.join(', ') });
                    }
                }
            }
            // Setting roles — clear direct permissions
            const updated = Object.assign({}, current);
            if (roleIds.length) {
                updated.roleIds = roleIds;
            } else {
                updated.roleIds = [];
            }
            delete updated.roleId;       // remove legacy field
            delete updated.permissions;
            list[idx] = updated;
            auditDetails.roleIds = roleIds;
        } else if (permissions !== undefined) {
            if (!isSubset(current.permissions, actorPerms)) {
                return json(403, { error: 'Cannot edit a user with higher permissions than you' });
            }
            const updated = Object.assign({}, current, { permissions: sanitizePerms(permissions, actorPerms) });
            delete updated.roleId;
            delete updated.roleIds;
            list[idx] = updated;
            auditDetails.permissions = list[idx].permissions;
        }

        await store.set('allowlist', JSON.stringify(list));
        const adminId = session.robloxUsername || session.discordId;
        await addAdminAudit(store, adminId, 'ALLOWLIST_UPDATE', auditDetails);
        await sendAuditWebhook(adminId, 'ALLOWLIST_UPDATE', auditDetails);
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
        if (target && target.permissions && !isSubset(target.permissions, actorPerms)) {
            return json(403, { error: 'Cannot remove a user with higher permissions than you' });
        }

        list = list.filter(e => e.discordId !== discordId);
        await store.set('allowlist', JSON.stringify(list));
        const adminId = session.robloxUsername || session.discordId;
        await addAdminAudit(store, adminId, 'ALLOWLIST_REMOVE', { discordId, label: target ? target.label : discordId });
        await sendAuditWebhook(adminId, 'ALLOWLIST_REMOVE', { discordId, label: target ? target.label : discordId });
        return json(200, { success: true, list });
    }

    return json(405, { error: 'method_not_allowed' });
};
