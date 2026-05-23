// ── POST /api/apply/submit — submit an application
// Requires any valid session (including applicantMode).
// Looks up group 1174414 rank at submission time.
// Sends a Discord webhook after storing the submission.
'use strict';

const { verifyAnySession, fireStore, json, sendDiscordWebhook } = require('./_shared');
const { firestoreCollection }                                   = require('./_firebase');

const GROUP_DIVISION  = 3496996;
const GROUP_GHOST     = 11000162;
const GROUP_SECONDARY = 1174414;

async function getExtraRank(userId) {
    try {
        const res = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
        if (!res.ok) return { rank: 0, roleName: '' };
        const data   = await res.json();
        const groups = data.data || [];
        const g      = groups.find(g => g.group && g.group.id === GROUP_SECONDARY);
        return g ? { rank: g.role.rank, roleName: g.role.name } : { rank: 0, roleName: '' };
    } catch { return { rank: 0, roleName: '' }; }
}

async function sendWebhook(app, session, extraRank) {
    if (!app.webhookUrl) return;
    const base = (process.env.URL || '').replace(/\/$/, '');
    const fields = [
        { name: 'Roblox',      value: `[${session.robloxUsername}](https://www.roblox.com/users/${session.robloxId}/profile)`, inline: true },
        { name: 'Discord',     value: `<@${session.discordId}>`, inline: true },
        { name: 'TNI:C Rank',  value: session.divisionRoleName || '—', inline: true }
    ];
    if (session.ghostRoleName) fields.push({ name: 'Ghost Rank', value: session.ghostRoleName, inline: true });
    if (extraRank.rank > 0 && extraRank.roleName) fields.push({ name: 'TNI Rank', value: extraRank.roleName, inline: true });

    const payload = {
        content: app.webhookMentions || '<@&1170401285435039764><@&1075785656502071437>',
        embeds: [{
            title:       `${app.name} — New Submission`,
            description: `**${session.robloxUsername}** has submitted an application for **${app.name}**.\n[Review on the Mainframe](${base}/?link=apply-review)`,
            color:       app.webhookColor || 0x00C2E9,
            fields,
            timestamp:   new Date().toISOString()
        }]
    };
    // sendDiscordWebhook auto-appends the Syntax footer
    await sendDiscordWebhook(app.webhookUrl, payload);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const session = verifyAnySession(event.headers.cookie || event.headers.Cookie);
    if (!session) return json(401, { error: 'You must be logged in to apply' });

    if ((event.body || '').length > 32768) return json(413, { error: 'Submission too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_body' }); }

    const { appId, answers } = body;
    if (!appId) return json(400, { error: 'appId required' });
    if (!answers || typeof answers !== 'object') return json(400, { error: 'answers required' });

    // Load app definition
    const store = fireStore('commandos-content');
    const apps  = await store.get('app-defs', { type: 'json' }).catch(() => []) || [];
    const app   = apps.find(a => a.id === appId);
    if (!app) return json(404, { error: 'Application not found' });
    if (app.status !== 'open') return json(403, { error: 'This application is currently closed' });

    // Flatten questions from sections (or legacy flat format)
    const allQuestions = Array.isArray(app.sections)
        ? app.sections.flatMap(s => Array.isArray(s.questions) ? s.questions : [])
        : (Array.isArray(app.questions) ? app.questions : []);
    const missing = allQuestions.filter(q => q.required && !String(answers[q.id] || '').trim());
    if (missing.length) return json(400, { error: 'Missing required answers: ' + missing.map(q => q.label).join(', ') });

    // Check for duplicate pending submission (avoid composite index — filter status in JS)
    const col = firestoreCollection('commandos-submissions');
    const existingSnap = await col
        .where('appId', '==', appId)
        .where('discordId', '==', session.discordId)
        .limit(20)
        .get();
    const hasPending = existingSnap.docs.some(d => d.data().status === 'pending');
    if (hasPending) return json(409, { error: 'You already have a pending submission for this application' });

    // Fetch group 1174414 rank live
    const extraRank = await getExtraRank(session.robloxId);

    // Sanitize answers (accept any key present in answers that matches a question id)
    const safeAnswers = {};
    allQuestions.forEach(q => {
        safeAnswers[q.id] = String(answers[q.id] || '').slice(0, 2000);
    });

    const submission = {
        appId,
        appName:           app.name,
        robloxId:          session.robloxId,
        robloxUsername:    session.robloxUsername,
        discordId:         session.discordId,
        discordUsername:   session.discordUsername,
        divisionRank:      session.divisionRank || 0,
        divisionRoleName:  session.divisionRoleName || '',
        ghostRank:         session.ghostRank || 0,
        ghostRoleName:     session.ghostRoleName || '',
        group1174414Rank:      extraRank.rank,
        group1174414RoleName:  extraRank.roleName,
        answers:           safeAnswers,
        status:            'pending',
        reviewedBy:        null,
        reviewNotes:       null,
        reviewedAt:        null,
        submittedAt:       Date.now()
    };

    const docRef = await col.add(submission);
    submission.id = docRef.id;
    await docRef.update({ id: docRef.id });

    // Send webhook (non-blocking)
    sendWebhook(app, session, extraRank).catch(() => {});

    return json(200, { success: true, submissionId: docRef.id });
};
