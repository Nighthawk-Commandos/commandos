// ── /api/admin/perm-groups — permission group CRUD
// Permission groups are named lists of Discord IDs used to gate access
// to specific documents and application reviewer panels.
// GET    → list all groups
// POST   → { name, purpose } → create
// PATCH  → { id, name, addIds?, removeIds? } → update name or membership
// DELETE → { id } → delete
'use strict';

const { fireStore, verifySession, getUserAdminPerms, requireAdmin, clearAdminCache, json, addAdminAudit } = require('./_shared');

function makeId() { return 'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const store = fireStore('commandos-content');
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

    if (event.httpMethod === 'POST') {
        const { name, purpose } = body;
        if (!name || !name.trim()) return json(400, { error: 'Name required' });
        if (name.trim().length > 80) return json(400, { error: 'Name max 80 chars' });
        const validPurposes = ['docs', 'apps', 'general'];
        const safePurpose = validPurposes.includes(purpose) ? purpose : 'general';
        const group = { id: makeId(), name: name.trim(), purpose: safePurpose, memberDiscordIds: [], createdAt: Date.now(), createdBy: adminId };
        groups.push(group);
        await store.set('perm-groups', groups);
        await addAdminAudit(adminStore, adminId, 'PERMGROUP_CREATE', { id: group.id, name: group.name });
        return json(200, { success: true, groups });
    }

    if (event.httpMethod === 'PATCH') {
        const { id, name, addIds, removeIds, addRoleIds, removeRoleIds } = body;
        if (!id) return json(400, { error: 'id required' });
        const idx = groups.findIndex(g => g.id === id);
        if (idx === -1) return json(404, { error: 'Group not found' });
        if (name) groups[idx].name = name.trim().slice(0, 80);

        // User Discord IDs
        if (Array.isArray(addIds)) {
            const valid = addIds.filter(d => /^\d{17,20}$/.test(String(d)));
            const existing = new Set(groups[idx].memberDiscordIds || []);
            valid.forEach(d => existing.add(d));
            groups[idx].memberDiscordIds = [...existing];
        }
        if (Array.isArray(removeIds)) {
            const toRemove = new Set(removeIds.map(String));
            groups[idx].memberDiscordIds = (groups[idx].memberDiscordIds || []).filter(d => !toRemove.has(d));
        }

        // Discord Role IDs (adds everyone with this role automatically)
        if (Array.isArray(addRoleIds)) {
            const valid = addRoleIds.filter(d => /^\d{17,20}$/.test(String(d)));
            const existing = new Set(groups[idx].discordRoleIds || []);
            valid.forEach(d => existing.add(d));
            groups[idx].discordRoleIds = [...existing];
        }
        if (Array.isArray(removeRoleIds)) {
            const toRemove = new Set(removeRoleIds.map(String));
            groups[idx].discordRoleIds = (groups[idx].discordRoleIds || []).filter(d => !toRemove.has(d));
        }

        await store.set('perm-groups', groups);
        await addAdminAudit(adminStore, adminId, 'PERMGROUP_UPDATE', { id, name: groups[idx].name, members: groups[idx].memberDiscordIds.length, roleIds: (groups[idx].discordRoleIds || []).length });
        return json(200, { success: true, groups });
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id) return json(400, { error: 'id required' });
        const target = groups.find(g => g.id === id);
        if (!target) return json(404, { error: 'Group not found' });
        groups = groups.filter(g => g.id !== id);
        await store.set('perm-groups', groups);
        await addAdminAudit(adminStore, adminId, 'PERMGROUP_DELETE', { id, name: target.name });
        return json(200, { success: true, groups });
    }

    return json(405, { error: 'method_not_allowed' });
};
