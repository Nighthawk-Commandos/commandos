// ── GET /api/docs/view?id= — fetch a single document's content
// Same permission check as docs-list.js.
'use strict';

const { verifySession, fireStore, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const id      = (event.queryStringParameters || {}).id;
    if (!id) return json(400, { error: 'id required' });

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const store   = fireStore('commandos-content');

    try {
        const [docs, groups] = await Promise.all([
            store.get('docs', { type: 'json' }).catch(() => []),
            store.get('perm-groups', { type: 'json' }).catch(() => [])
        ]);
        const docList  = Array.isArray(docs)   ? docs   : [];
        const groupList = Array.isArray(groups) ? groups : [];

        const meta = docList.find(d => d.id === id || d.slug === id);
        if (!meta) return json(404, { error: 'Document not found' });

        const userDiscordRoles = session ? new Set(Array.isArray(session.discordRoles) ? session.discordRoles : []) : new Set();
        const myGroupIds = session
            ? new Set(groupList.filter(g =>
                (g.memberDiscordIds || []).includes(session.discordId) ||
                (g.discordRoleIds   || []).some(rid => userDiscordRoles.has(rid))
              ).map(g => g.id))
            : new Set();

        const canView = meta.public || (session && (meta.permGroupIds || []).some(gid => myGroupIds.has(gid)));
        if (!canView) return json(403, { error: 'You do not have permission to view this document' });

        const content = await store.get('doc-' + meta.id, { type: 'json' }).catch(() => '') || '';
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' },
            body: JSON.stringify({ ...meta, content })
        };
    } catch (err) {
        return json(502, { error: 'Failed to load document: ' + err.message });
    }
};
