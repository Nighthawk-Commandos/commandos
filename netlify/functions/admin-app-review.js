// ── /api/admin/app-review — list and decide on submissions
//
// GET  ?appId=&status=pending  → list submissions for an app
// POST { submissionId, action: 'accept'|'deny', notes? } → record decision
//
// Access: superadmin, contentAdmin, OR member of the app's reviewerGroupId.
'use strict';

const { verifySession, fireStore, getUserAdminPerms, json, addAdminAudit } = require('./_shared');
const { firestoreCollection } = require('./_firebase');

async function canReview(session, app, adminStore, contentStore) {
    const perms = await getUserAdminPerms(session, adminStore);
    if (perms && (perms.superadmin || perms.contentAdmin)) return true;
    if (!app.reviewerGroupId) return false;
    const groups = await contentStore.get('perm-groups', { type: 'json' }).catch(() => []) || [];
    const group  = groups.find(g => g.id === app.reviewerGroupId);
    if (!group) return false;
    // Check direct Discord ID membership
    if ((group.memberDiscordIds || []).includes(session.discordId)) return true;
    // Check Discord role membership
    const userRoles = new Set(Array.isArray(session.discordRoles) ? session.discordRoles : []);
    return (group.discordRoleIds || []).some(rid => userRoles.has(rid));
}

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore   = fireStore('commandos-admin');
    const contentStore = fireStore('commandos-content');
    const col          = firestoreCollection('commandos-submissions');

    // ── GET — list submissions ────────────────────────────────────
    if (event.httpMethod === 'GET') {
        const p      = event.queryStringParameters || {};
        const appId  = p.appId;
        const status = p.status || 'pending';
        if (!appId) return json(400, { error: 'appId required' });

        const apps = await contentStore.get('app-defs', { type: 'json' }).catch(() => []) || [];
        const app  = apps.find(a => a.id === appId);
        if (!app) return json(404, { error: 'App not found' });
        if (!await canReview(session, app, adminStore, contentStore)) return json(403, { error: 'Forbidden' });

        let q = col.where('appId', '==', appId);
        if (['pending','accepted','denied'].includes(status)) q = q.where('status', '==', status);
        const snap = await q.limit(100).get();
        const docs = snap.docs
            .map(d => Object.assign({ id: d.id }, d.data()))
            .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        return json(200, docs);
    }

    // ── POST — accept or deny ─────────────────────────────────────
    if (event.httpMethod === 'POST') {
        if ((event.body || '').length > 4096) return json(413, { error: 'Too large' });
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }

        const { submissionId, action, notes } = body;
        if (!submissionId) return json(400, { error: 'submissionId required' });
        if (action !== 'accept' && action !== 'deny') return json(400, { error: 'action must be accept or deny' });
        if (action === 'deny' && !String(notes || '').trim()) return json(400, { error: 'A reason is required when denying' });

        const docRef = col.doc(submissionId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return json(404, { error: 'Submission not found' });
        const sub = docSnap.data();
        if (sub.status !== 'pending') return json(409, { error: 'This submission has already been ' + sub.status });

        const apps = await contentStore.get('app-defs', { type: 'json' }).catch(() => []) || [];
        const app  = apps.find(a => a.id === sub.appId);
        if (!app) return json(404, { error: 'App definition not found' });
        if (!await canReview(session, app, adminStore, contentStore)) return json(403, { error: 'Forbidden' });

        const adminId = session.robloxUsername || session.discordId;
        await docRef.update({
            status:     action === 'accept' ? 'accepted' : 'denied',
            reviewedBy: adminId,
            reviewNotes: String(notes || '').slice(0, 1000),
            reviewedAt:  Date.now()
        });
        await addAdminAudit(adminStore, adminId, 'APP_REVIEW_' + action.toUpperCase(), {
            submissionId, appId: sub.appId, applicant: sub.robloxUsername, notes: notes || ''
        });
        return json(200, { success: true, action });
    }

    return json(405, { error: 'method_not_allowed' });
};
