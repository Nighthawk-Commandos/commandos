// ── /api/admin/rank-settings — rank-based permission configuration
// GET  → return current rank settings (superadmin only)
// PATCH → { officerRankId?, highCommandRankId?, superadminDiscordRoleId?,
//            officerPerms?, highCommandPerms? } → update settings (superadmin only)
'use strict';

const { fireStore, verifySession, getUserAdminPerms, clearAdminCache, ALL_PERMS, json, addAdminAudit } = require('./_shared');

exports.handler = async (event) => {
    const session = verifySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'Unauthorized' });

    const adminStore = fireStore('commandos-admin');
    const actorPerms = await getUserAdminPerms(session, adminStore);
    if (!actorPerms || !actorPerms.superadmin) return json(403, { error: 'Superadmin required' });

    let settings = {};
    try {
        const raw = await adminStore.get('rank-settings', { type: 'json' });
        settings = raw && typeof raw === 'object' ? raw : {};
    } catch { settings = {}; }

    if (event.httpMethod === 'GET') return json(200, settings);

    if (event.httpMethod !== 'PATCH') return json(405, { error: 'method_not_allowed' });

    if ((event.body || '').length > 8192) return json(413, { error: 'Request too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }

    const { officerRankId, highCommandRankId, superadminDiscordRoleId,
            officerPerms, highCommandPerms } = body;

    if (officerRankId !== undefined) {
        settings.officerRankId = officerRankId ? parseInt(officerRankId, 10) || null : null;
    }
    if (highCommandRankId !== undefined) {
        settings.highCommandRankId = highCommandRankId ? parseInt(highCommandRankId, 10) || null : null;
    }
    if (superadminDiscordRoleId !== undefined) {
        if (superadminDiscordRoleId && !/^\d{17,20}$/.test(String(superadminDiscordRoleId))) {
            return json(400, { error: 'superadminDiscordRoleId must be a valid Discord snowflake' });
        }
        settings.superadminDiscordRoleId = superadminDiscordRoleId || null;
    }
    if (officerPerms !== undefined && typeof officerPerms === 'object') {
        const safe = {};
        ALL_PERMS.forEach(k => { safe[k] = !!(officerPerms && officerPerms[k]); });
        settings.officerPerms = safe;
    }
    if (highCommandPerms !== undefined && typeof highCommandPerms === 'object') {
        const safe = {};
        ALL_PERMS.forEach(k => { safe[k] = !!(highCommandPerms && highCommandPerms[k]); });
        settings.highCommandPerms = safe;
    }

    await adminStore.set('rank-settings', settings);
    clearAdminCache();

    const adminId = session.robloxUsername || session.discordId;
    await addAdminAudit(adminStore, adminId, 'RANK_SETTINGS_UPDATE', {
        officerRankId:           settings.officerRankId  || 'unset',
        highCommandRankId:       settings.highCommandRankId || 'unset',
        superadminDiscordRoleId: settings.superadminDiscordRoleId || 'unset'
    });

    return json(200, { success: true, settings });
};
