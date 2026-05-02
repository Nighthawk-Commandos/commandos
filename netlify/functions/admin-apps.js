// ── /api/admin/apps — application definition CRUD
// GET    → list all application definitions
// POST   → create application definition
// PATCH  → update application definition
// DELETE → delete application definition
'use strict';

const { fireStore, verifySession, getUserAdminPerms, requireAdmin, json, addAdminAudit } = require('./_shared');

function makeId(name) { return 'app-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36); }

const ALLOWED_TYPES = ['text','textarea','select','radio','checkbox'];

function makeSectionId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function sanitizeQuestion(q, i) {
    const type = ALLOWED_TYPES.includes(q.type) ? q.type : 'text';
    const hasOpts = type === 'select' || type === 'radio' || type === 'checkbox';
    const opts = hasOpts && Array.isArray(q.options)
        ? q.options.slice(0, 30).map(String).filter(s => s.trim())
        : [];
    // Per-option routing: { 'Option A': 'section-id' | 'submit' }
    const optionGoTos = (hasOpts && q.optionGoTos && typeof q.optionGoTos === 'object')
        ? Object.fromEntries(opts.map(o => [o, String(q.optionGoTos[o] || '')])) : {};
    return {
        id:          q.id || ('q' + (i + 1)),
        label:       String(q.label || '').slice(0, 300),
        type,
        required:    !!q.required,
        placeholder: q.placeholder ? String(q.placeholder).slice(0, 200) : '',
        description: q.description ? String(q.description).slice(0, 400) : '',
        options:     opts,
        optionGoTos,
        validation: {
            minLen:   Number.isInteger(q.validation?.minLen)  ? q.validation.minLen  : 0,
            maxLen:   Number.isInteger(q.validation?.maxLen)  ? q.validation.maxLen  : 0,
            pattern:  q.validation?.pattern  ? String(q.validation.pattern).slice(0, 300)  : '',
            errMsg:   q.validation?.errMsg   ? String(q.validation.errMsg).slice(0, 200)   : ''
        }
    };
}

function sanitizeSection(sec, i) {
    return {
        id:          sec.id || makeSectionId(),
        title:       sec.title ? String(sec.title).slice(0, 200) : '',
        description: sec.description ? String(sec.description).slice(0, 500) : '',
        nextSection: sec.nextSection ? String(sec.nextSection).slice(0, 60) : 'submit',
        questions:   Array.isArray(sec.questions)
            ? sec.questions.slice(0, 30).map(sanitizeQuestion)
            : []
    };
}

function sanitizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.slice(0, 10).map(t => String(t).trim().slice(0, 50)).filter(Boolean);
}

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminDenied = await requireAdmin(session);
    if (adminDenied) return adminDenied;
    const store = fireStore('commandos-content');
    const adminStore = fireStore('commandos-admin');
    if (session.divisionRank < 246) {
        const perms = await getUserAdminPerms(session, adminStore);
        if (!perms || !perms.contentAdmin) return json(403, { error: 'Requires contentAdmin permission' });
    }

    let apps = [];
    try {
        const raw = await store.get('app-defs', { type: 'json' });
        apps = Array.isArray(raw) ? raw : [];
    } catch { apps = []; }

    if (event.httpMethod === 'GET') return json(200, apps);

    if ((event.body || '').length > 32768) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }
    const adminId = session.robloxUsername || session.discordId;

    // ── POST ──────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
        const { name, description, sections, questions, tags, reviewerGroupId, webhookUrl, webhookColor, webhookMentions } = body;
        if (!name || !name.trim()) return json(400, { error: 'Name required' });
        // Support both sections (new) and flat questions (legacy)
        const safeSections = Array.isArray(sections) && sections.length
            ? sections.slice(0, 20).map(sanitizeSection)
            : [{ id: makeSectionId(), title: '', description: '', nextSection: 'submit',
                 questions: Array.isArray(questions) ? questions.slice(0, 30).map(sanitizeQuestion) : [] }];
        const totalQs = safeSections.reduce((n, s) => n + s.questions.length, 0);
        if (totalQs === 0) return json(400, { error: 'At least one question required' });
        const id = makeId(name.trim());
        const app = {
            id, name: name.trim(),
            description: (description || '').slice(0, 500),
            status: 'open',
            tags: sanitizeTags(tags),
            sections: safeSections,
            reviewerGroupId: reviewerGroupId || null,
            webhookUrl:      webhookUrl || null,
            webhookColor:    Number(webhookColor) || 0x00C2E9,
            webhookMentions: (webhookMentions || '<@&1170401285435039764><@&1075785656502071437>').slice(0, 500),
            createdAt: Date.now(),
            createdBy: adminId
        };
        apps.push(app);
        try { await store.set('app-defs', apps); } catch (e) { return json(500, { error: 'Storage error: ' + e.message }); }
        addAdminAudit(adminStore, adminId, 'APP_CREATE', { id, name: app.name }).catch(() => {});
        return json(200, { success: true, app });
    }

    // ── PATCH ─────────────────────────────────────────────────────
    if (event.httpMethod === 'PATCH') {
        const { id, name, description, status, sections, questions, tags, reviewerGroupId, webhookUrl, webhookColor, webhookMentions } = body;
        if (!id) return json(400, { error: 'id required' });
        const idx = apps.findIndex(a => a.id === id);
        if (idx === -1) return json(404, { error: 'App not found' });
        const a = apps[idx];
        if (name !== undefined) a.name = String(name).trim().slice(0, 200);
        if (description !== undefined) a.description = String(description).slice(0, 500);
        if (status === 'open' || status === 'closed') a.status = status;
        if (Array.isArray(tags)) a.tags = sanitizeTags(tags);
        if (Array.isArray(sections)) {
            a.sections = sections.slice(0, 20).map(sanitizeSection);
            delete a.questions; // migrate to sections format
        } else if (Array.isArray(questions)) {
            a.sections = [{ id: makeSectionId(), title: '', description: '', nextSection: 'submit',
                            questions: questions.slice(0, 30).map(sanitizeQuestion) }];
            delete a.questions;
        }
        if (reviewerGroupId !== undefined) a.reviewerGroupId = reviewerGroupId || null;
        if (webhookUrl !== undefined) a.webhookUrl = webhookUrl || null;
        if (webhookColor !== undefined) a.webhookColor = Number(webhookColor) || 0x00C2E9;
        if (webhookMentions !== undefined) a.webhookMentions = String(webhookMentions).slice(0, 500);
        try { await store.set('app-defs', apps); } catch (e) { return json(500, { error: 'Storage error: ' + e.message }); }
        addAdminAudit(adminStore, adminId, 'APP_UPDATE', { id, name: a.name, status: a.status }).catch(() => {});
        return json(200, { success: true, app: a });
    }

    // ── DELETE ────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
        const { id } = body;
        if (!id) return json(400, { error: 'id required' });
        const target = apps.find(a => a.id === id);
        if (!target) return json(404, { error: 'App not found' });
        apps = apps.filter(a => a.id !== id);
        try { await store.set('app-defs', apps); } catch (e) { return json(500, { error: 'Storage error: ' + e.message }); }
        addAdminAudit(adminStore, adminId, 'APP_DELETE', { id, name: target.name }).catch(() => {});
        return json(200, { success: true });
    }

    return json(405, { error: 'method_not_allowed' });
};
