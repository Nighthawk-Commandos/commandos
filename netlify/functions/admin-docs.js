// ── /api/admin/docs — document CRUD
// Documents have metadata (title, slug, permGroupIds, public flag) stored
// in the 'docs' array, and content stored separately as 'doc-{id}'.
// GET          → list all doc metadata
// POST         → { title, slug, content, public, permGroupIds } → create
// PATCH        → { id, title?, content?, public?, permGroupIds? } → update
// DELETE       → { id } → delete
'use strict';

const { fireStore, verifySession, getUserAdminPerms, requireAdmin, json, addAdminAudit } = require('./_shared');

function makeId(slug) { return 'doc-' + slug.replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    // Allow rank 246+ outright; allowlist users need the contentAdmin permission
    const adminDenied = await requireAdmin(session);
    if (adminDenied) return adminDenied;
    const store = fireStore('commandos-content');
    const adminStore = fireStore('commandos-admin');
    if (session.divisionRank < 246) {
        const perms = await getUserAdminPerms(session, adminStore);
        if (!perms || !perms.contentAdmin) return json(403, { error: 'Requires contentAdmin permission' });
    }

    let docs = [];
    try {
        const raw = await store.get('docs', { type: 'json' });
        docs = Array.isArray(raw) ? raw : [];
    } catch { docs = []; }

    if (event.httpMethod === 'GET') {
        // Include content for admin view
        const withContent = await Promise.all(docs.map(async d => {
            try {
                const content = await store.get('doc-' + d.id, { type: 'json' });
                return Object.assign({}, d, { content: content || '' });
            } catch { return Object.assign({}, d, { content: '' }); }
        }));
        return json(200, withContent);
    }

    if ((event.body || '').length > 262144) return json(413, { error: 'Content too large (max 256 KB)' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
    const adminId = session.robloxUsername || session.discordId;

    if (event.httpMethod === 'POST') {
        const { title, slug, content, public: isPublic, permGroupIds } = body;
        if (!title || !title.trim()) return json(400, { error: 'Title required' });
        const safeSlug = slugify(slug || title);
        if (!safeSlug) return json(400, { error: 'Cannot derive slug from title' });
        if (docs.some(d => d.slug === safeSlug)) return json(409, { error: 'Slug already exists' });
        const id = makeId(safeSlug);
        const meta = {
            id, slug: safeSlug, title: title.trim(),
            public: !!isPublic,
            permGroupIds: Array.isArray(permGroupIds) ? permGroupIds : [],
            createdAt: Date.now(), updatedAt: Date.now()
        };
        docs.push(meta);
        await Promise.all([
            store.set('docs', docs),
            store.set('doc-' + id, content || '')
        ]);
        await addAdminAudit(adminStore, adminId, 'DOC_CREATE', { id, title: meta.title, slug: meta.slug });
        return json(200, { success: true, doc: meta });
    }

    if (event.httpMethod === 'PATCH') {
        const { id, title, content, public: isPublic, permGroupIds } = body;
        if (!id) return json(400, { error: 'id required' });
        const idx = docs.findIndex(d => d.id === id);
        if (idx === -1) return json(404, { error: 'Document not found' });
        if (title !== undefined) docs[idx].title = title.trim().slice(0, 200);
        if (isPublic !== undefined) docs[idx].public = !!isPublic;
        if (Array.isArray(permGroupIds)) docs[idx].permGroupIds = permGroupIds;
        docs[idx].updatedAt = Date.now();
        const saves = [store.set('docs', docs)];
        if (content !== undefined) saves.push(store.set('doc-' + id, content));
        await Promise.all(saves);
        await addAdminAudit(adminStore, adminId, 'DOC_UPDATE', { id, title: docs[idx].title });
        return json(200, { success: true, doc: docs[idx] });
    }

    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id) return json(400, { error: 'id required' });
        const target = docs.find(d => d.id === id);
        if (!target) return json(404, { error: 'Document not found' });
        docs = docs.filter(d => d.id !== id);
        await store.set('docs', docs);
        await addAdminAudit(adminStore, adminId, 'DOC_DELETE', { id, title: target.title });
        return json(200, { success: true });
    }

    return json(405, { error: 'method_not_allowed' });
};
