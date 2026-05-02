// ── GET /api/docs/list — list documents accessible to the current user
// Public docs are visible to all. Private docs require the user's Discord ID
// to be in one of the doc's permGroupIds groups.
'use strict';

const { verifySession, fireStore, json } = require('./_shared');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    const store   = fireStore('commandos-content');

    try {
        const [docs, groups] = await Promise.all([
            store.get('docs', { type: 'json' }).catch(() => []),
            store.get('perm-groups', { type: 'json' }).catch(() => [])
        ]);
        const docList  = Array.isArray(docs)   ? docs   : [];
        const groupList = Array.isArray(groups) ? groups : [];

        // Build a set of group IDs the user belongs to (direct or via Discord role)
        const userDiscordRoles = session ? new Set(Array.isArray(session.discordRoles) ? session.discordRoles : []) : new Set();
        const myGroupIds = session
            ? new Set(groupList.filter(g =>
                (g.memberDiscordIds || []).includes(session.discordId) ||
                (g.discordRoleIds   || []).some(rid => userDiscordRoles.has(rid))
              ).map(g => g.id))
            : new Set();

        const visible = docList.filter(d =>
            d.public ||
            (session && (d.permGroupIds || []).some(gid => myGroupIds.has(gid)))
        ).map(d => ({ id: d.id, slug: d.slug, title: d.title, updatedAt: d.updatedAt }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' },
            body: JSON.stringify(visible)
        };
    } catch (err) {
        return json(502, { error: 'Failed to list documents: ' + err.message });
    }
};
