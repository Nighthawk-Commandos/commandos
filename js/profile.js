// ═══════════════════════════════════════════════════════════════
//  profile.js — User Profile section
//  Shows identity info not visible on the home screen, permissions,
//  and the deployment version (sourced from window._sysVersion).
// ═══════════════════════════════════════════════════════════════

import { esc } from './utils.js';
import { AUTH } from './auth.js';

export function renderProfileSection() {
    var u   = AUTH.user || {};
    var ap  = AUTH.adminPerms || {};
    var isSA = !!(u.divisionRank >= 246) || !!ap.superadmin;

    var avatarUrl = u.discordAvatar
        ? 'https://cdn.discordapp.com/avatars/' + u.discordId + '/' + u.discordAvatar + '.png'
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

    var ver = window._sysVersion || null;

    var PERM_LABELS = {
        roleAssign:   'Assign Users',  roleEdit:    'Edit Roles',
        disSync:      'DIS Sync',      disTiles:    'DIS Tiles',
        disPoints:    'DIS Points',    disRaffle:   'DIS Raffle',
        disGamePool:  'Game Pool',     disAudit:    'DIS Audit',
        mfOfficers:   'Officers',      mfRemote:    'Remote Access',
        eventsStats:  'Event Stats',   contentAdmin:'Content Admin'
    };

    var activePerms = Object.keys(PERM_LABELS).filter(function (k) { return ap[k]; });
    var permPills   = isSA
        ? '<span class="profile-perm-pill superadmin">Superadmin — All Access</span>'
        : activePerms.map(function (k) {
            return '<span class="profile-perm-pill">' + esc(PERM_LABELS[k]) + '</span>';
        }).join('');
    var hasPerms = isSA || activePerms.length > 0;

    var hs = document.getElementById('home-screen');
    if (!hs) return;
    hs.className = 'obj-mode';
    hs.innerHTML =
        '<div class="bg-grid"></div>' +
        '<aside class="obj-sidebar" data-accent="gray">' +
        '  <div class="obj-sidebar-logo">' +
        '    <div class="obj-sidebar-label">Nighthawk Commandos</div>' +
        '    <div class="obj-sidebar-title">My<br>Profile</div>' +
        '  </div>' +
        '  <div class="profile-sidebar-avatar">' +
        '    <img src="' + esc(avatarUrl) + '" alt="Avatar" class="profile-sidebar-img">' +
        '    <div class="profile-sidebar-name">' + esc(u.robloxUsername || '') + '</div>' +
        (u.divisionRoleName ? '<div class="profile-sidebar-rank">' + esc(u.divisionRoleName) + '</div>' : '') +
        (u.ghostRank > 0 && u.ghostRoleName ? '<div class="profile-sidebar-ghost">Ghost · ' + esc(u.ghostRoleName) + '</div>' : '') +
        '  </div>' +
        '  <nav class="obj-nav"><div class="obj-nav-group">Account</div>' +
        '    <div class="obj-nav-item active"><span class="obj-nav-dot"></span>Overview</div>' +
        '  </nav>' +
        '  <div class="obj-sidebar-back">' +
        '    <button class="obj-hub-btn" data-click="showHomeScreen">← Back to Hub</button>' +
        (ver ? '<div class="sidebar-version">' + esc(ver) + '</div>' : '') +
        '  </div>' +
        '</aside>' +

        '<main class="obj-main profile-main">' +

        // Hero card
        '<div class="profile-hero">' +
        '  <img src="' + esc(avatarUrl) + '" alt="Avatar" class="profile-hero-avatar">' +
        '  <div class="profile-hero-info">' +
        '    <div class="profile-hero-name">' + esc(u.robloxUsername || u.discordUsername || 'Unknown') + '</div>' +
        '    <div class="profile-hero-meta">' +
        (u.discordUsername ? '<span class="profile-hero-chip">@' + esc(u.discordUsername) + '</span>' : '') +
        (u.divisionRoleName ? '<span class="profile-hero-chip profile-hero-chip-rank">' + esc(u.divisionRoleName) + '</span>' : '') +
        (u.ghostRank > 0 && u.ghostRoleName ? '<span class="profile-hero-chip profile-hero-chip-ghost">Ghost · ' + esc(u.ghostRoleName) + '</span>' : '') +
        (isSA ? '<span class="profile-hero-chip profile-hero-chip-sa">Superadmin</span>' : '') +
        '    </div>' +
        '  </div>' +
        '</div>' +

        // Identity cards
        '<div class="profile-section-label">Identity</div>' +
        '<div class="profile-cards-grid">' +
        _infoCard('Roblox Username', u.robloxUsername || '—') +
        _infoCard('Roblox ID', u.robloxId || '—', '#') +
        _infoCard('Discord Tag', u.discordUsername ? '@' + u.discordUsername : '—') +
        _infoCard('Discord ID', u.discordId || '—', '#') +
        '</div>' +

        // Ranks & standing
        '<div class="profile-section-label">Ranks &amp; Standing</div>' +
        '<div class="profile-cards-grid">' +
        _rankCard('Division', u.divisionRoleName || '—', u.divisionRank || 0, '#c8a44a') +
        (u.ghostRank > 0
            ? _rankCard('Ghost', u.ghostRoleName || '—', u.ghostRank, '#9ca3af')
            : '') +
        '</div>' +

        // Quick links
        '<div class="profile-section-label">Quick Links</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
        (u.robloxId
            ? '<a href="https://www.roblox.com/users/' + esc(String(u.robloxId)) + '/profile" target="_blank" rel="noopener noreferrer" class="profile-link-btn">Roblox Profile</a>'
            : '') +
        (u.discordId
            ? '<span class="profile-link-btn profile-link-btn-muted" title="Discord User ID: ' + esc(String(u.discordId)) + '">Discord ID: ' + esc(String(u.discordId)) + '</span>'
            : '') +
        '</div>' +

        // Permissions
        '<div class="profile-section-label">Mainframe Permissions</div>' +
        (hasPerms
            ? '<div class="profile-perm-pills">' + permPills + '</div>'
            : '<p class="profile-no-perms">No special admin permissions assigned.</p>') +

        // Permission Groups
        _renderPermGroups(ap) +

        // Session / system
        '<div class="profile-section-label">Session</div>' +
        '<div class="profile-cards-grid">' +
        _infoCard('Member Status', u.applicantMode ? 'Applicant' : (u.divisionRank > 0 ? 'Active Member' : 'Guest')) +
        _infoCard('Session Mode', u.applicantMode ? 'Applicant Mode' : 'Member Mode') +
        (ver ? _infoCard('Mainframe Version', ver) : '') +
        '</div>' +

        (u.applicantMode
            ? '<div class="profile-session-note" style="margin-top:8px">You are authenticated as an <strong>applicant</strong>. Division membership is not required for your current session.</div>'
            : '') +

        '</main>';
}

function _infoCard(label, value, icon) {
    return '<div class="profile-info-card">' +
        '<div class="profile-info-card-label">' + esc(icon) + ' ' + esc(label) + '</div>' +
        '<div class="profile-info-card-value">' + esc(String(value)) + '</div>' +
        '</div>';
}

function _rankCard(group, roleName, rankNum, color) {
    return '<div class="profile-info-card">' +
        '<div class="profile-info-card-label" style="color:' + color + '">◈ ' + esc(group) + '</div>' +
        '<div class="profile-info-card-value" style="color:' + color + '">' + esc(roleName) + '</div>' +
        (rankNum > 0 ? '<div style="font-size:10px;color:var(--muted);margin-top:3px">Rank ' + rankNum + '</div>' : '') +
        '</div>';
}

function _renderPermGroups(ap) {
    var groups = (ap && Array.isArray(ap.memberGroups)) ? ap.memberGroups : [];
    if (!groups.length) return '';
    var PURPOSE_LABELS = { docs: 'Document Access', apps: 'App Reviewer', general: 'General' };
    return '<div class="profile-section-label">Permission Groups</div>' +
        '<div class="profile-cards-grid">' +
        groups.map(function (g) {
            var purposeLabel = PURPOSE_LABELS[g.purpose] || g.purpose || 'General';
            return '<div class="profile-info-card">' +
                '<div class="profile-info-card-label">🔐 ' + esc(purposeLabel) + '</div>' +
                '<div class="profile-info-card-value">' + esc(g.name) + '</div>' +
                '</div>';
        }).join('') + '</div>';
}

function _idRow(label, value) {
    return '<div class="profile-id-row">' +
        '<span class="profile-id-label">' + esc(label) + '</span>' +
        '<span class="profile-id-value">' + esc(String(value || '—')) + '</span>' +
        '</div>';
}
