// ── /api/admin/perm-groups — permission group CRUD
// Permission groups are named lists of Discord IDs / role IDs used to gate
// access to documents, app reviewer panels, and (via roleId) admin permissions.
// GET    → list all groups
// POST   → { name, purpose, roleId? } → create
// PATCH  → { id, name?, purpose?, roleId?, addIds?, removeIds?, addRoleIds?, removeRoleIds? } → update
// DELETE → { id } → delete
'use strict';

const {
    fireStore, verifySession, getUserAdminPerms, requireAdmin,
    clearAdminCache, clearContentPGCache, json,
    addAdminAudit, sendAuditWebhook
} = require('./_shared');

function makeId() { return 'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const store      = fireStore('commandos-content');
    const adminStore = fireStore('commandos-admin');

    const adminDenied = await requireAdmin(session);
    if (adminDenied) return adminDenied;
    if (session.divisionRank < 246) {
        const perms = await getUserAdminPerms(session, adminStore);
        if (!perms || !perms.contentAdmin) return json(403, { error: 'Requires contentAdmin permission' });
    }

    let groups = [];
    try {
        const raw = await store.get('perm-groups', { type: 'json' });
        groups = Array.isArray(raw) ? raw : [];
    } catch { groups = []; }

    if (event.httpMethod === 'GET') return json(200, groups);

    if ((event.body || '').length > 32768) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
    const adminId = session.robloxUsername || session.discordId;

    // ── CREATE ──────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
        const { name, purpose, roleId } = body;
        if (!name || !name.trim()) return json(400, { error: 'Name required' });
        if (name.trim().length > 80) return json(400, { error: 'Name max 80 chars' });
        const validPurposes = ['docs', 'apps', 'general'];
        const safePurpose = validPurposes.includes(purpose) ? purpose : 'general';
        const group = {
            id: makeId(), name: name.trim(), purpose: safePurpose,
            roleId: roleId || null,
            memberDiscordIds: [], discordRoleIds: [],
            createdAt: Date.now(), createdBy: adminId
        };
        groups.push(group);
        await store.set('perm-groups', groups);
        clearContentPGCache();
        const auditDetails = { id: group.id, name: group.name, purpose: group.purpose, roleId: group.roleId || 'none' };
        await Promise.all([
            addAdminAudit(adminStore, adminId, 'PERMGROUP_CREATE', auditDetails),
            sendAuditWebhook(adminId, 'PERMGROUP_CREATE', auditDetails)
        ]);
        return json(200, { success: true, groups });
    }

    // ── UPDATE ──────────────────────────────────────────────────
    if (event.httpMethod === 'PATCH') {
        const { id, name, purpose, roleId, addIds, removeIds, addRoleIds, removeRoleIds } = body;
        if (!id) return json(400, { error: 'id required' });
        const idx = groups.findIndex(g => g.id === id);
        if (idx === -1) return json(404, { error: 'Group not found' });

        const changes = [];

        if (name && name.trim() !== groups[idx].name) {
            groups[idx].name = name.trim().slice(0, 80);
            changes.push('name');
        }
        if (purpose && ['docs','apps','general'].includes(purpose) && purpose !== groups[idx].purpose) {
            groups[idx].purpose = purpose;
            changes.push('purpose');
        }

        // roleId: null clears it, a string sets it, undefined leaves it unchanged
        if (roleId !== undefined) {
            const prev = groups[idx].roleId || null;
            groups[idx].roleId = roleId || null;
            if (prev !== groups[idx].roleId) changes.push('roleId');
        }

        // User Discord IDs
        if (Array.isArray(addIds) && addIds.length) {
            const valid = addIds.filter(d => /^\d{17,20}$/.test(String(d)));
            const existing = new Set(groups[idx].memberDiscordIds || []);
            valid.forEach(d => existing.add(d));
            groups[idx].memberDiscordIds = [...existing];
            if (valid.length) changes.push('addIds:' + valid.length);
        }
        if (Array.isArray(removeIds) && removeIds.length) {
            const toRemove = new Set(removeIds.map(String));
            const before = (groups[idx].memberDiscordIds || []).length;
            groups[idx].memberDiscordIds = (groups[idx].memberDiscordIds || []).filter(d => !toRemove.has(d));
            const removed = before - groups[idx].memberDiscordIds.length;
            if (removed) changes.push('removeIds:' + removed);
        }

        // Discord Role IDs
        if (Array.isArray(addRoleIds) && addRoleIds.length) {
            const valid = addRoleIds.filter(d => /^\d{17,20}$/.test(String(d)));
            const existing = new Set(groups[idx].discordRoleIds || []);
            valid.forEach(d => existing.add(d));
            groups[idx].discordRoleIds = [...existing];
            if (valid.length) changes.push('addRoleIds:' + valid.length);
        }
        if (Array.isArray(removeRoleIds) && removeRoleIds.length) {
            const toRemove = new Set(removeRoleIds.map(String));
            const before = (groups[idx].discordRoleIds || []).length;
            groups[idx].discordRoleIds = (groups[idx].discordRoleIds || []).filter(d => !toRemove.has(d));
            const removed = before - groups[idx].discordRoleIds.length;
            if (removed) changes.push('removeRoleIds:' + removed);
        }

        await store.set('perm-groups', groups);
        clearContentPGCache();
        const auditDetails = {
            id,
            name:    groups[idx].name,
            roleId:  groups[idx].roleId || 'none',
            members: groups[idx].memberDiscordIds.length,
            roleIds: (groups[idx].discordRoleIds || []).length,
            changes: changes.join(', ') || 'none'
        };
        await Promise.all([
            addAdminAudit(adminStore, adminId, 'PERMGROUP_UPDATE', auditDetails),
            sendAuditWebhook(adminId, 'PERMGROUP_UPDATE', auditDetails)
        ]);
        return json(200, { success: true, groups });
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id) return json(400, { error: 'id required' });
        const target = groups.find(g => g.id === id);
        if (!target) return json(404, { error: 'Group not found' });
        groups = groups.filter(g => g.id !== id);
        await store.set('perm-groups', groups);
        clearContentPGCache();
        const auditDetails = { id, name: target.name, roleId: target.roleId || 'none' };
        await Promise.all([
            addAdminAudit(adminStore, adminId, 'PERMGROUP_DELETE', auditDetails),
            sendAuditWebhook(adminId, 'PERMGROUP_DELETE', auditDetails)
        ]);
        return json(200, { success: true, groups });
    }

    return json(405, { error: 'method_not_allowed' });
};
