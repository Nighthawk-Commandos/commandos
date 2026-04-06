// ============================================================
// TNI:C Commandos Mainframe — Web App Backend
// ============================================================

// ════════════════════════════════════════════════════════════════
// SCRIPT PROPERTIES CACHE
// Fast wrapper around PropertiesService with in-execution memory.
// ════════════════════════════════════════════════════════════════

var _propCache = null;

function getProps() {
    if (!_propCache) _propCache = PropertiesService.getScriptProperties().getProperties();
    return _propCache;
}

function getProp(key) {
    return getProps()[key] || null;
}

// ════════════════════════════════════════════════════════════════
// SPREADSHEET / SHEET CACHE
// Avoids repeated getSheetByName calls within the same execution.
// ════════════════════════════════════════════════════════════════

var _ss = null;
var _sheets = {};
var _extSheets = {};

function getSS() {
    if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
    return _ss;
}

function getSheet(name) {
    if (!_sheets[name]) _sheets[name] = getSS().getSheetByName(name);
    return _sheets[name];
}

function getExtSheet(ssId, sheetName) {
    var key = ssId + '|' + sheetName;
    if (!_extSheets[key]) {
        _extSheets[key] = SpreadsheetApp.openById(ssId).getSheetByName(sheetName);
    }
    return _extSheets[key];
}

// Create-or-get a sheet with optional headers.
function getOrCreateSheet(ss, name, headers) {
    var s = ss.getSheetByName(name);
    if (s) return s;
    s = ss.insertSheet(name);
    if (headers) {
        s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
        s.setFrozenRows(1);
    }
    return s;
}

// ════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════════════════════════

function doGet(e) {
    if (e && e.parameter && e.parameter.action === 'api') {
        return handleApiRequest(e);
    }

    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('TNI:C Commandos Mainframe')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setFaviconUrl('https://i.imgur.com/YA7Ilep.png')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
    try {
        const params = JSON.parse(e.postData.contents);
        const action = params.action;
        const data = params.data || {};

        switch (action) {
            case 'getAllData':
                return respond(getAllData());
            case 'getGroupMembers':
                return respond(getGroupMembers());
            case 'getExemptionDays':
                return respond(getExemptionDays(data.username));
            case 'submitEventLog':
                return respond(submitEventLog(data));
            case 'submitExemption':
                return respond(submitExemption(data));
            case 'submitMissingAP':
                return respond(submitMissingAP(data));
            case 'submitStatsTransfer':
                return respond(submitStatsTransfer(data));
            case 'getEventById':
                return respond(getEventById(data.eventId));
            case 'submitEditEventLog':
                return respond(submitEditEventLog(data));
            default:
                return respond({ error: 'Unknown action: ' + action }, 400);
        }
    } catch (err) {
        return respond({ error: err.message }, 500);
    }
}

function respond(data, statusCode = 200) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
// STATS TRANSFER
// ════════════════════════════════════════════════════════════════

function processTransferDecision(action, id, token) {
    try {
        var s = getOrCreateSheet(getSS(), 'Stats Transfer Log',
            ['Request ID', 'Timestamp', 'Old Username', 'New Username', 'Transfer Type', 'Evidence', 'Status', 'Processed At', 'Token']);
        var lastRow = s.getLastRow();
        if (lastRow < 2) return { success: false, message: 'No pending requests found.' };
        var rows = s.getRange(2, 1, lastRow - 1, 9).getValues();
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (String(row[0]).trim() !== String(id).trim()) continue;
            if (String(row[8]).trim() !== String(token).trim()) return { success: false, message: 'Invalid security token.' };
            if (String(row[6]).trim() !== 'Pending') return { success: false, message: 'This request has already been ' + String(row[6]).toLowerCase() + '.' };
            var sheetRow = i + 2;
            if (action === 'approve') {
                executeStatsTransfer(String(row[2]).trim(), String(row[3]).trim());
                s.getRange(sheetRow, 7, 1, 2).setValues([['Approved', new Date().toISOString()]]);
                return { success: true, message: '"' + String(row[2]).trim() + '" renamed to "' + String(row[3]).trim() + '" across all tracked sheets.' };
            } else {
                s.getRange(sheetRow, 7, 1, 2).setValues([['Denied', new Date().toISOString()]]);
                return { success: true, message: 'Transfer request denied. No changes were made.' };
            }
        }
        return { success: false, message: 'Request ID not found.' };
    } catch (err) { return { success: false, message: 'Error: ' + err.message }; }
}

function executeStatsTransfer(oldName, newName) {
    var ss = getSS();
    var lower = oldName.toLowerCase();
    [{ name: 'JoinLogs', col: 2, startRow: 4 }, { name: 'Honored Tracker', col: 1, startRow: 4 },
        { name: 'Strike Log', col: 1, startRow: 2 }, { name: 'Exemptions', col: 2, startRow: 2 }]
        .forEach(function (def) {
            var s = ss.getSheetByName(def.name); if (!s) return;
            var lastRow = s.getLastRow(); if (lastRow < def.startRow) return;
            var range = s.getRange(def.startRow, def.col, lastRow - def.startRow + 1, 1);
            var vals = range.getValues(), changed = false;
            for (var i = 0; i < vals.length; i++) {
                if (String(vals[i][0]).trim().toLowerCase() === lower) { vals[i][0] = newName; changed = true; }
            }
            if (changed) range.setValues(vals);
        });
    var el = ss.getSheetByName('Event Log');
    if (el && el.getLastRow() >= 2) {
        var elLast = el.getLastRow();
        var bRange = el.getRange(2, 2, elLast - 1, 1), bVals = bRange.getValues(), bChanged = false;
        for (var i = 0; i < bVals.length; i++) {
            if (String(bVals[i][0]).trim().toLowerCase() === lower) { bVals[i][0] = newName; bChanged = true; }
        }
        if (bChanged) bRange.setValues(bVals);
        var gRange = el.getRange(2, 7, elLast - 1, 1), gVals = gRange.getValues(), gChanged = false;
        var pat = new RegExp('(?<![\\w])' + regEscape(oldName) + '(?![\\w])', 'gi');
        for (var i = 0; i < gVals.length; i++) {
            var c = String(gVals[i][0] || '');
            if (c.toLowerCase().indexOf(lower) !== -1) {
                var rep = c.replace(pat, newName);
                if (rep !== c) { gVals[i][0] = rep; gChanged = true; }
            }
        }
        if (gChanged) gRange.setValues(gVals);
    }
}

function regEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function submitStatsTransfer(payload) {
    try {
        var ss = getSS();
        if (payload.hp && payload.hp !== '') return { success: false, error: 'Submission rejected.' };
        var oldName = (payload.oldUsername || '').trim();
        var newName = (payload.newUsername || '').trim();
        var transferType = (payload.transferType || '').trim();
        var evidence = (payload.evidence || '').trim();
        if (!oldName || !newName) return { success: false, error: 'Both usernames are required.' };
        if (oldName.toLowerCase() === newName.toLowerCase()) return { success: false, error: 'Old and new usernames must be different.' };
        if (!transferType) return { success: false, error: 'Transfer type is required.' };
        if (transferType === 'Account Transfer' && !evidence) return { success: false, error: 'Evidence link is required for account transfers.' };
        var s = getOrCreateSheet(ss, 'Stats Transfer Log',
            ['Request ID', 'Timestamp', 'Old Username', 'New Username', 'Transfer Type', 'Evidence', 'Status', 'Processed At', 'Token']);
        var lastRow = s.getLastRow();
        if (lastRow >= 2) {
            var rows = s.getRange(2, 1, lastRow - 1, 7).getValues();
            for (var i = 0; i < rows.length; i++) {
                if (String(rows[i][2]).trim().toLowerCase() === oldName.toLowerCase() && String(rows[i][6]).trim() === 'Pending')
                    return { success: false, error: 'There is already a pending transfer request for "' + oldName + '".' };
            }
        }
        var reqId = 'TR-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        var token = Utilities.getUuid();
        s.appendRow([reqId, new Date().toISOString(), oldName, newName, transferType, evidence || 'N/A', 'Pending', '', token]);
        var webhookUrl = getProp('Username_Transfer_Webhook');
        if (webhookUrl) sendTransferWebhook(webhookUrl, reqId, token, oldName, newName, transferType, evidence);
        return { success: true, requestId: reqId };
    } catch (err) { return { success: false, error: err.message }; }
}

function sendTransferWebhook(webhookUrl, reqId, token, oldName, newName, transferType, evidence) {
    try {
        var base = getProp('NetlifyBaseUrl') + '/api/callback/review';
        var embed = {
            title: 'Stats Transfer Request',
            color: transferType === 'Account Transfer' ? 0xE07C2E : 0x4A7FC8,
            description: 'A stats transfer request requires admin review.',
            fields: [
                { name: 'Request ID', value: '`' + reqId + '`', inline: false },
                { name: 'Type', value: '`' + transferType + '`', inline: true },
                { name: 'Old Username', value: '`' + oldName + '`', inline: true },
                { name: 'New Username', value: '`' + newName + '`', inline: true },
                { name: 'Evidence', value: (evidence && evidence !== 'N/A') ? '[View Screenshot](' + evidence + ')' : 'N/A', inline: false }
            ],
            footer: { text: 'TNI:C Commandos Mainframe  |  Stats Transfer' },
            timestamp: new Date().toISOString()
        };
        var components = [{
            type: 1, components: [
                { type: 2, style: 5, label: 'Approve Transfer', url: base + '?action=approve&type=transfer&id=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) },
                { type: 2, style: 5, label: 'Deny Transfer',   url: base + '?action=deny&type=transfer&id='   + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) }
            ]
        }];
        UrlFetchApp.fetch(webhookUrl + '?with_components=true', {
            method: 'post', contentType: 'application/json',
            payload: JSON.stringify({ embeds: [embed], components: components }), muteHttpExceptions: true
        });
    } catch (err) { Logger.log('Transfer webhook error: ' + err.message); }
}

// ════════════════════════════════════════════════════════════════
// EXEMPTION SYSTEM
// ════════════════════════════════════════════════════════════════

function getMemberRank(username) {
    var lower = username.toLowerCase();
    var sheetNames = ['Activity Tracker', 'Officer Tracker'];
    for (var si = 0; si < sheetNames.length; si++) {
        var s = getSheet(sheetNames[si]); if (!s) continue;
        var lastRow = s.getLastRow(); if (lastRow < 4) continue;
        var vals = s.getRange(4, 1, lastRow - 3, 2).getValues();
        for (var i = 0; i < vals.length; i++) {
            if (String(vals[i][0]).trim().toLowerCase() === lower) return String(vals[i][1]).trim();
        }
    }
    return '';
}

function submitExemption(payload) {
    try {
        var ss = getSS();
        if (payload.hp && payload.hp !== '') return { success: false, error: 'Submission rejected.' };
        if (!isMember(payload.username)) return { success: false, error: 'Username not found in member list.' };
        var rl = checkRateLimit(payload.username, 'exemption', 30);
        if (!rl.allowed) return { success: false, error: 'Please wait ' + rl.remaining + ' min(s) before another exemption.' };
        var endDate = new Date(payload.endDate + 'T00:00:00');
        var startDate = new Date(payload.startDate + 'T00:00:00');
        if (endDate.getDay() !== 1) return { success: false, error: 'Exemptions must end on a Monday.' };
        var sd = startDate.getDay();
        if (sd === 5 || sd === 6 || sd === 0) return { success: false, error: 'Exemptions cannot start on a Friday, Saturday, or Sunday.' };
        var daysRequested = Math.ceil((endDate - startDate) / 86400000);
        var rank = getMemberRank(payload.username);
        var daysInfo = getExemptionDays(payload.username);
        var deptList = (payload.departments || '').split(',').map(function (d) { return d.trim(); }).filter(function (d) { return d; });
        if (deptList.indexOf('Commandos') === -1) deptList.unshift('Commandos');
        var deptsStr = deptList.join(', ');
        var reqId = 'EX-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        var token = Utilities.getUuid();
        getOrCreateSheet(ss, 'Exemption Log',
            ['Request ID', 'Timestamp', 'Username', 'Rank', 'Reason', 'Start Date', 'End Date', 'Departments', 'Status', 'Token'])
            .appendRow([reqId, new Date().toISOString(), payload.username, rank, payload.reason, payload.startDate, payload.endDate, deptsStr, 'Pending', token]);
        submitExemptionForm(payload.username, rank, payload.reason, payload.startDate, payload.endDate, deptList);
        var webhookUrl = getProp('Username_Transfer_Webhook');
        if (webhookUrl) sendExemptionWebhook(webhookUrl, reqId, token, payload.username, rank, payload.reason, payload.startDate, payload.endDate, daysRequested, daysInfo, deptsStr);
        setRateLimit(payload.username, 'exemption');
        return { success: true, requestId: reqId };
    } catch (err) { return { success: false, error: err.message }; }
}

function submitExemptionForm(username, rank, reason, startDate, endDate, deptList) {
    try {
        var params = [
            'entry.89896703=' + encodeURIComponent(username),
            'entry.1970321278=' + encodeURIComponent(rank || 'Unknown'),
            'entry.532276252=' + encodeURIComponent(reason),
            'entry.1198597606=' + encodeURIComponent(startDate),
            'entry.932785517=' + encodeURIComponent(endDate)
        ];
        var allDepts = deptList.slice();
        if (allDepts.indexOf('Commandos') === -1) allDepts.unshift('Commandos');
        allDepts.forEach(function (d) { params.push('entry.1224052388=' + encodeURIComponent(d)); });
        UrlFetchApp.fetch('https://docs.google.com/forms/d/e/1FAIpQLScst5hFg7GzAm2n-ShoYnfcTP6eLFOXUnjrkGnRNAfJh-8SrQ/formResponse',
            { method: 'post', contentType: 'application/x-www-form-urlencoded', payload: params.join('&'), muteHttpExceptions: true, followRedirects: false });
    } catch (err) { Logger.log('Exemption form error: ' + err.message); }
}

function sendExemptionWebhook(webhookUrl, reqId, token, username, rank, reason, startDate, endDate, daysRequested, daysInfo, deptsStr) {
    try {
        var base = getProp('NetlifyBaseUrl') + '/api/callback/review';
        var daysUsed = daysInfo && daysInfo.found ? String(daysInfo.daysUsed) : 'Unknown';
        var daysRem  = daysInfo && daysInfo.found ? String(daysInfo.daysRemaining) : 'Unknown';
        var hasDays  = daysInfo && daysInfo.found
            ? (Number(daysInfo.daysRemaining) >= daysRequested ? 'Yes' : 'No — only ' + daysRem + ' day(s) remaining')
            : 'Unknown';
        var embed = {
            title: 'Exemption Request', color: 0x674EA7,
            description: 'A new exemption request requires admin review.',
            fields: [
                { name: 'Request ID', value: '`' + reqId + '`', inline: false },
                { name: 'Username', value: '`' + username + '`', inline: true },
                { name: 'Rank', value: '`' + (rank || 'Unknown') + '`', inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Start Date', value: '`' + startDate + '`', inline: true },
                { name: 'End Date', value: '`' + endDate + '`', inline: true },
                { name: 'Days Requested', value: '`' + daysRequested + '`', inline: true },
                { name: 'Days Used', value: '`' + daysUsed + '`', inline: true },
                { name: 'Days Remaining', value: '`' + daysRem + '`', inline: true },
                { name: 'Has Days Available', value: hasDays, inline: false },
                { name: 'Departments', value: deptsStr, inline: false }
            ],
            footer: { text: 'TNI:C Commandos Mainframe  |  Exemption Request' },
            timestamp: new Date().toISOString()
        };
        var components = [{
            type: 1, components: [
                { type: 2, style: 5, label: 'Approve Exemption', url: base + '?action=approve&type=exemption&id=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) },
                { type: 2, style: 5, label: 'Deny Exemption',    url: base + '?action=deny&type=exemption&id='    + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) }
            ]
        }];
        UrlFetchApp.fetch(webhookUrl + '?with_components=true', {
            method: 'post', contentType: 'application/json',
            payload: JSON.stringify({ embeds: [embed], components: components }), muteHttpExceptions: true
        });
    } catch (err) { Logger.log('Exemption webhook error: ' + err.message); }
}

function processExemptionDecision(action, id, token, reviewer, notes) {
    try {
        var logSheet = getOrCreateSheet(getSS(), 'Exemption Log',
            ['Request ID', 'Timestamp', 'Username', 'Rank', 'Reason', 'Start Date', 'End Date', 'Departments', 'Status', 'Token']);
        var lastRow = logSheet.getLastRow();
        if (lastRow < 2) return { success: false, message: 'No pending requests found.' };
        var rows = logSheet.getRange(2, 1, lastRow - 1, 10).getValues();
        var targetRow = -1, username = '';
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() !== String(id).trim()) continue;
            if (String(rows[i][9]).trim() !== String(token).trim()) return { success: false, message: 'Invalid security token.' };
            if (String(rows[i][8]).trim() !== 'Pending') return { success: false, message: 'This request has already been ' + String(rows[i][8]).toLowerCase() + '.' };
            targetRow = i + 2; username = String(rows[i][2]).trim(); break;
        }
        if (targetRow === -1) return { success: false, message: 'Request ID not found.' };
        var statusValue = action === 'approve' ? 'Approved' : 'Denied';
        logSheet.getRange(targetRow, 9).setValue(statusValue);
        try {
            var revSheet = getExtSheet('144RdGpT6ahx9WjtMWnyJe_APjMkb9_eEv70ZqmdgCpk', 'Exemption Review');
            if (revSheet && revSheet.getLastRow() >= 2) {
                var bVals = revSheet.getRange(2, 2, revSheet.getLastRow() - 1, 1).getValues();
                var lower = username.toLowerCase();
                for (var r = 0; r < bVals.length; r++) {
                    if (String(bVals[r][0]).trim().toLowerCase() === lower) {
                        revSheet.getRange(r + 2, 9).setValue(statusValue);
                        revSheet.getRange(r + 2, 10).setValue(reviewer);
                        if (notes) revSheet.getRange(r + 2, 11).setValue(notes);
                        break;
                    }
                }
            }
        } catch (extErr) { Logger.log('Exemption Review external error: ' + extErr.message); }
        return { success: true, message: 'Exemption for "' + username + '" has been ' + action + 'd. Reviewer: ' + reviewer + '.' };
    } catch (err) { return { success: false, message: 'Error: ' + err.message }; }
}

// ════════════════════════════════════════════════════════════════
// EDIT EVENT LOG
// ════════════════════════════════════════════════════════════════

var EDIT_EVENT_COL = { 'Host Username': 2, 'Event Type': 4, 'Screenshot Link': 5, 'Attendees': 7 };
var EDIT_EVENT_KEY = { 'Host Username': 'hostUsername', 'Event Type': 'eventType', 'Screenshot Link': 'screenshot', 'Attendees': 'attendees' };

function getEventById(eventId) {
    try {
        var s = getSheet('Event Log');
        if (!s) return { found: false, error: 'Event Log sheet not found.' };
        var lastRow = s.getLastRow(); if (lastRow < 2) return { found: false, error: 'No events found.' };
        var rows = s.getRange(2, 1, lastRow - 1, 16).getValues();
        var idLower = String(eventId).trim().toLowerCase();
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i][15]).trim().toLowerCase() === idLower) {
                return {
                    found: true, sheetRow: i + 2,
                    hostUsername: cv(rows[i][1]), date: cv(rows[i][2]),
                    eventType: cv(rows[i][3]), screenshot: cv(rows[i][4]),
                    attendees: cv(rows[i][6]), notes: cv(rows[i][7])
                };
            }
        }
        return { found: false, error: 'No event found with that ID.' };
    } catch (err) { return { found: false, error: err.message }; }
}

function submitEditEventLog(payload) {
    try {
        var ss = getSS();
        if (payload.hp && payload.hp !== '') return { success: false, error: 'Submission rejected.' };
        var eventId   = (payload.eventId   || '').trim();
        var fieldName = (payload.fieldName || '').trim();
        var newValue  = (payload.newValue  || '').trim();
        if (!eventId)   return { success: false, error: 'Event ID is required.' };
        if (!fieldName) return { success: false, error: 'Field to edit is required.' };
        if (!newValue)  return { success: false, error: 'New value is required.' };
        if (!EDIT_EVENT_COL[fieldName]) return { success: false, error: 'Invalid field name.' };
        if (fieldName === 'Screenshot Link') { var sc = isValidScreenshotUrl(newValue); if (!sc.valid) return { success: false, error: sc.reason }; }
        if (fieldName === 'Host Username' && !isMember(newValue)) return { success: false, error: 'New host username not found in member list.' };
        var event = getEventById(eventId);
        if (!event.found) return { success: false, error: event.error || 'Event not found.' };
        var reqId = 'EEL-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        var token = Utilities.getUuid();
        getOrCreateSheet(ss, 'Edit Event Log Requests',
            ['Request ID', 'Timestamp', 'Event ID', 'Sheet Row', 'Field', 'Old Value', 'New Value', 'Status', 'Token'])
            .appendRow([reqId, new Date().toISOString(), eventId, event.sheetRow, fieldName, event[EDIT_EVENT_KEY[fieldName]], newValue, 'Pending', token]);
        var webhookUrl = getProp('ProgressionRequestsWebhook') || getProp('Username_Transfer_Webhook');
        if (webhookUrl) sendEditEventLogWebhook(webhookUrl, reqId, token, eventId, fieldName, event[EDIT_EVENT_KEY[fieldName]], newValue, event);
        return { success: true, requestId: reqId };
    } catch (err) { return { success: false, error: err.message }; }
}

function sendEditEventLogWebhook(webhookUrl, reqId, token, eventId, fieldName, oldValue, newValue, event) {
    try {
        var base = getProp('NetlifyBaseUrl') + '/api/callback/review';
        var embed = {
            title: 'Edit Event Log Request', color: 0x3D85C6,
            description: 'A request to edit an event log entry requires review.',
            fields: [
                { name: 'Request ID', value: '`' + reqId + '`', inline: false },
                { name: 'Event ID', value: '`' + eventId + '`', inline: true },
                { name: 'Field to Edit', value: '`' + fieldName + '`', inline: true },
                { name: 'Host', value: '`' + event.hostUsername + '`', inline: true },
                { name: 'Date', value: '`' + event.date + '`', inline: true },
                { name: 'Event Type', value: '`' + event.eventType + '`', inline: true },
                { name: 'Old Value', value: '```\n' + oldValue + '\n```', inline: false },
                { name: 'New Value', value: '```\n' + newValue + '\n```', inline: false }
            ],
            footer: { text: 'TNI:C Commandos Mainframe  |  Edit Event Log' },
            timestamp: new Date().toISOString()
        };
        var components = [{
            type: 1, components: [
                { type: 2, style: 5, label: 'Approve Edit', url: base + '?action=approve&type=editeventlog&id=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) },
                { type: 2, style: 5, label: 'Deny Edit',    url: base + '?action=deny&type=editeventlog&id='    + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) }
            ]
        }];
        var resp = UrlFetchApp.fetch(webhookUrl + '?with_components=true', {
            method: 'post', contentType: 'application/json',
            payload: JSON.stringify({ embeds: [embed], components: components }), muteHttpExceptions: true
        });
        Logger.log('Edit Event Log webhook HTTP ' + resp.getResponseCode());
    } catch (err) { Logger.log('Edit Event Log webhook exception: ' + err.message); }
}

function processEditEventLogDecision(action, id, token, reviewer, notes) {
    try {
        var logSheet = getOrCreateSheet(getSS(), 'Edit Event Log Requests',
            ['Request ID', 'Timestamp', 'Event ID', 'Sheet Row', 'Field', 'Old Value', 'New Value', 'Status', 'Token']);
        var lastRow = logSheet.getLastRow();
        if (lastRow < 2) return { success: false, message: 'No pending requests found.' };
        var rows = logSheet.getRange(2, 1, lastRow - 1, 9).getValues();
        var targetLogRow = -1, sheetRow = -1, fieldName = '', newValue = '';
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() !== String(id).trim()) continue;
            if (String(rows[i][8]).trim() !== String(token).trim()) return { success: false, message: 'Invalid security token.' };
            if (String(rows[i][7]).trim() !== 'Pending') return { success: false, message: 'This request has already been ' + String(rows[i][7]).toLowerCase() + '.' };
            targetLogRow = i + 2; sheetRow = Number(rows[i][3]); fieldName = String(rows[i][4]).trim(); newValue = String(rows[i][6]).trim(); break;
        }
        if (targetLogRow === -1) return { success: false, message: 'Request ID not found.' };
        var statusValue = action === 'approve' ? 'Approved' : 'Denied';
        logSheet.getRange(targetLogRow, 8).setValue(statusValue);
        if (action === 'approve') {
            var eventSheet = getSheet('Event Log');
            if (!eventSheet) return { success: false, message: 'Event Log sheet not found.' };
            var col = EDIT_EVENT_COL[fieldName];
            if (!col) return { success: false, message: 'Invalid field in log.' };
            var writeValue = fieldName === 'Attendees'
                ? newValue.split(',').map(function (a) { return a.trim(); }).filter(function (a) { return a; }).join(', ')
                : newValue;
            eventSheet.getRange(sheetRow, col).setValue(writeValue);
            var existingNotes = cv(eventSheet.getRange(sheetRow, 8).getValue());
            var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
            var noteAppend = '[Edit approved ' + dateStr + ' by ' + reviewer + ': ' + fieldName + ' updated. ' + (notes || 'No reason given') + ']';
            eventSheet.getRange(sheetRow, 8).setValue(existingNotes ? (existingNotes + ' ' + noteAppend) : noteAppend);
            return { success: true, message: 'Edit approved. "' + fieldName + '" has been updated successfully.\n\nPlease update the event log review status in the Progression Staff Mainframe.' };
        }
        return { success: true, message: 'Edit request denied. No changes were made to the event log.' };
    } catch (err) { return { success: false, message: 'Error: ' + err.message }; }
}

// ════════════════════════════════════════════════════════════════
// MISSING AP
// ════════════════════════════════════════════════════════════════

function submitMissingAP(payload) {
    try {
        var ss = getSS();
        if (payload.hp && payload.hp !== '') return { success: false, error: 'Submission rejected.' };
        if (!isMember(payload.username)) return { success: false, error: 'Your username was not found in the member list.' };
        var sc = isValidScreenshotUrl(payload.evidence);
        if (!sc.valid) return { success: false, error: sc.reason };
        var rl = checkRateLimit(payload.username, 'missingap', 5);
        if (!rl.allowed) return { success: false, error: 'Please wait ' + rl.remaining + ' min(s) before another Missing AP request.' };
        var submittedAt = new Date();
        submitMissingAPForm(payload.username, payload.hostUsername, payload.date, payload.eventType, payload.evidence);
        var reqId = 'MAP-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
        var token = Utilities.getUuid();
        getOrCreateSheet(ss, 'Missing AP Log',
            ['Request ID', 'Timestamp', 'Username', 'Host Username', 'Date', 'Event Type', 'Evidence', 'Status', 'Token'])
            .appendRow([reqId, submittedAt.toISOString(), payload.username, payload.hostUsername, payload.date, payload.eventType, payload.evidence, 'Pending', token]);
        var webhookUrl = getProp('ProgressionRequestsWebhook');
        if (webhookUrl) sendMissingAPWebhook(webhookUrl, reqId, token, payload.username, payload.hostUsername, payload.date, payload.eventType, payload.evidence);
        setRateLimit(payload.username, 'missingap');
        return { success: true, requestId: reqId };
    } catch (err) { return { success: false, error: err.message }; }
}

function submitMissingAPForm(username, hostUsername, date, eventType, evidence) {
    try {
        var params = [
            'entry.1279105067=' + encodeURIComponent(username),
            'entry.1532691022=' + encodeURIComponent(hostUsername),
            'entry.832507157='  + encodeURIComponent(date),
            'entry.1884059261=' + encodeURIComponent(eventType),
            'entry.800478113='  + encodeURIComponent(evidence)
        ];
        UrlFetchApp.fetch('https://docs.google.com/forms/d/e/1FAIpQLSdlqwaloLxfe2JuorApWlbd81oEKrLd1TMAxUWebNzRFIWSeg/formResponse',
            { method: 'post', contentType: 'application/x-www-form-urlencoded', payload: params.join('&'), muteHttpExceptions: true, followRedirects: false });
    } catch (err) { Logger.log('Missing AP form error: ' + err.message); }
}

function sendMissingAPWebhook(webhookUrl, reqId, token, username, hostUsername, date, eventType, evidence) {
    try {
        var base = getProp('NetlifyBaseUrl') + '/api/callback/review';
        var embed = {
            title: 'Missing AP Request', color: 0xC8A44A,
            description: 'A missing AP request requires review.',
            fields: [
                { name: 'Request ID', value: '`' + reqId + '`', inline: false },
                { name: 'Username', value: '`' + username + '`', inline: true },
                { name: 'Host', value: '`' + hostUsername + '`', inline: true },
                { name: 'Date', value: '`' + date + '`', inline: true },
                { name: 'Event Type', value: '`' + eventType + '`', inline: true },
                { name: 'Evidence', value: '[View Screenshot](' + evidence + ')', inline: false }
            ],
            footer: { text: 'TNI:C Commandos Mainframe  |  Missing AP' },
            timestamp: new Date().toISOString()
        };
        var components = [{
            type: 1, components: [
                { type: 2, style: 5, label: 'Approve Missing AP', url: base + '?action=approve&type=missingap&id=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) },
                { type: 2, style: 5, label: 'Deny Missing AP',    url: base + '?action=deny&type=missingap&id='    + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) }
            ]
        }];
        UrlFetchApp.fetch(webhookUrl + '?with_components=true', {
            method: 'post', contentType: 'application/json',
            payload: JSON.stringify({ embeds: [embed], components: components }), muteHttpExceptions: true
        });
    } catch (err) { Logger.log('Missing AP webhook error: ' + err.message); }
}

function processMissingAPDecision(action, id, token, reviewer, notes) {
    try {
        var logSheet = getOrCreateSheet(getSS(), 'Missing AP Log',
            ['Request ID', 'Timestamp', 'Username', 'Host Username', 'Date', 'Event Type', 'Evidence', 'Status', 'Token']);
        var lastRow = logSheet.getLastRow();
        if (lastRow < 2) return { success: false, message: 'No pending requests found.' };
        // Read 9 cols: A=reqId, B=timestamp, C=username, D=host, E=date, F=eventType, G=evidence, H=status, I=token
        var rows = logSheet.getRange(2, 1, lastRow - 1, 9).getValues();
        var targetLogRow = -1, username = '', hostUsername = '', date = '', eventType = '', submittedAt = '';
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() !== String(id).trim()) continue;
            if (String(rows[i][8]).trim() !== String(token).trim()) return { success: false, message: 'Invalid security token.' };
            if (String(rows[i][7]).trim() !== 'Pending') return { success: false, message: 'This request has already been ' + String(rows[i][7]).toLowerCase() + '.' };
            targetLogRow = i + 2;
            submittedAt  = String(rows[i][1]).trim();
            username     = String(rows[i][2]).trim();
            hostUsername = String(rows[i][3]).trim();
            date         = String(rows[i][4]).trim();
            eventType    = String(rows[i][5]).trim();
            break;
        }
        if (targetLogRow === -1) return { success: false, message: 'Request ID not found.' };

        var statusValue = action === 'approve' ? 'Accepted' : 'Denied';
        logSheet.getRange(targetLogRow, 8).setValue(statusValue);

        try {
            var mapSheet = getExtSheet('1wkCVOzSmPnsl8MqkP1F2fl5WF6pnTRUP4QWspI5zyrs', 'Missing AP');
            if (!mapSheet) {
                Logger.log('Missing AP: external sheet not found');
            } else {
                var mapLastRow = mapSheet.getLastRow();
                if (mapLastRow >= 2) {
                    var mapData = mapSheet.getRange(2, 1, mapLastRow - 1, 5).getValues();
                    var userL = username.toLowerCase();
                    var hostL = hostUsername.toLowerCase();
                    var typeL = eventType.toLowerCase();
                    var dateFmtSlash = date;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        var dp = date.split('-');
                        dateFmtSlash = parseInt(dp[1], 10) + '/' + parseInt(dp[2], 10) + '/' + dp[0];
                    }
                    var submittedMs = submittedAt ? (new Date(submittedAt)).getTime() : 0;
                    if (isNaN(submittedMs)) submittedMs = 0;
                    var bestRow = -1, bestDelta = Infinity;
                    for (var r = 0; r < mapData.length; r++) {
                        var rUser = String(mapData[r][1]).trim().toLowerCase();
                        var rHost = String(mapData[r][2]).trim().toLowerCase();
                        var rType = String(mapData[r][3]).trim().toLowerCase();
                        var rDateRaw = mapData[r][4];
                        if (rUser !== userL) continue;
                        if (rHost !== hostL) continue;
                        if (rType !== typeL) continue;
                        var rDateNorm = '';
                        if (rDateRaw instanceof Date) {
                            rDateNorm = (rDateRaw.getMonth() + 1) + '/' + rDateRaw.getDate() + '/' + rDateRaw.getFullYear();
                        } else {
                            rDateNorm = String(rDateRaw).trim();
                        }
                        if (rDateNorm !== dateFmtSlash) continue;
                        var rowMs = 0, rTimestamp = mapData[r][0];
                        if (rTimestamp instanceof Date) {
                            rowMs = rTimestamp.getTime();
                        } else if (rTimestamp) {
                            var parsed = new Date(rTimestamp);
                            if (!isNaN(parsed.getTime())) rowMs = parsed.getTime();
                        }
                        var delta = (submittedMs && rowMs) ? Math.abs(rowMs - submittedMs) : Infinity;
                        if (delta < bestDelta) { bestDelta = delta; bestRow = r + 2; }
                    }
                    if (bestRow !== -1) {
                        mapSheet.getRange(bestRow, 7).setValue(statusValue);
                        mapSheet.getRange(bestRow, 8).setValue(reviewer);
                        if (notes) mapSheet.getRange(bestRow, 9).setValue(notes);
                        Logger.log('Missing AP: matched external row ' + bestRow + ' (timestamp delta ' + bestDelta + 'ms)');
                    } else {
                        Logger.log('Missing AP: no match for user=' + username + ' host=' + hostUsername + ' date=' + dateFmtSlash + ' type=' + eventType);
                    }
                }
            }
        } catch (extErr) { Logger.log('Missing AP external sheet error: ' + extErr.message); }

        var verb = action === 'approve' ? 'accepted' : 'denied';
        return { success: true, message: 'Missing AP request for "' + username + '" has been ' + verb + '. Reviewer: ' + reviewer + '.' };
    } catch (err) { return { success: false, message: 'Error: ' + err.message }; }
}

// ════════════════════════════════════════════════════════════════
// CALLBACK DISPATCHER  (called by Netlify via processCallback)
// ════════════════════════════════════════════════════════════════

function processCallback(payload) {
    var secret = getProp('CallbackSecret');
    if (!secret || payload.secret !== secret) return { success: false, message: 'Unauthorized.' };

    var type     = (payload.type     || '').trim().toLowerCase();
    var action   = (payload.action   || '').trim();
    var id       = (payload.id       || '').trim();
    var token    = (payload.token    || '').trim();
    var reviewer = (payload.reviewer || '').trim();
    var notes    = (payload.notes    || '').trim();

    if (type === 'transfer')     return processTransferDecision(action, id, token);
    if (type === 'exemption')    return processExemptionDecision(action, id, token, reviewer, notes);
    if (type === 'editeventlog') return processEditEventLogDecision(action, id, token, reviewer, notes);
    if (type === 'missingap')    return processMissingAPDecision(action, id, token, reviewer, notes);

    return { success: false, message: 'Unknown callback type: ' + type };
}

// ════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ════════════════════════════════════════════════════════════════

function getAllData() {
    var ss = getSS();
    return {
        settings: getSettings(ss),
        activity: getActivityTracker(ss),
        officers: getOfficerTracker(ss),
        honored: getHonoredTracker(ss),
        departments: getDepartmentsTracker(ss),
        weeklyEvents: getEvents(ss, 'Weekly Events', ['Username', 'Date', 'Event Type', 'Screenshot', 'AP Value', 'OP Value', 'Attendees']),
        monthlyEvents: getEvents(ss, 'Monthly Events', ['Username', 'Date', 'Event Type', 'AP Value', 'OP Value', 'Attendees'])
    };
}

function getSettings(ss) {
    var s = ss.getSheetByName('Settings'); if (!s) return {};
    var d = s.getDataRange().getValues();
    var out = { quotaWeek: '', weekNumber: '', month: '', year: '', quarter: '', contacts: [], eventTypes: [], ranks: [], officerRanks: [], deptQuotas: [], stats: {}, globalExemption: false, memberExemption: false, officerExemption: false };
    var knownDepts = { 'Ghosts': 1, 'Progression': 1, 'Welfare': 1, 'Internal Affairs': 1, 'Librarium': 1 };
    for (var r = 0; r < d.length; r++) {
        var row = d[r];
        var b = cv(row[1]), c = cv(row[2]), dd = cv(row[3]), e = cv(row[4]), f = cv(row[5]), g = cv(row[6]), h = cv(row[7]), ii = cv(row[8]), j = cv(row[9]);
        if (r === 3) { out.quotaWeek = fmtDate(row[1]); out.weekNumber = c; out.month = dd; out.year = e; out.quarter = f; }
        if (r >= 4 && b && b !== 'Contact') out.contacts.push(b);
        if (!out._stopEvents && r >= 4 && c && c !== 'Event') { if (c === 'Total Hosted') out._stopEvents = true; else out.eventTypes.push({ name: c, ap: dd, op: e, qty: f }); }
        if (knownDepts[g]) out.deptQuotas.push({ name: g, quota: h });
        if (r >= 4 && ii && ii !== 'Officer Quota' && ii !== 'Global Exemption' && ii !== 'Member Exemption' && ii !== 'Officer Exemption') out.officerRanks.push({ name: ii, quota: j });
        if (c === 'Total Hosted') out.stats.totalHosted = dd;
        if (c === 'All Time R/D Events') out.stats.allTimeRD = dd;
        if (c === 'All Time Wins') out.stats.allTimeWins = dd;
        if (c === 'Win Rate') out.stats.winRate = typeof dd === 'number' ? (dd * 100).toFixed(1) + '%' : dd;
        if (c === 'Top Host') out.stats.topHost = dd;
        if (c === 'Peak Performance') out.stats.peakPerf = dd;
        if (ii === 'Global Exemption') out.globalExemption = row[9] === true;
        if (ii === 'Member Exemption') out.memberExemption = row[9] === true;
        if (ii === 'Officer Exemption') out.officerExemption = row[9] === true;
    }
    var deptNames = out.deptQuotas.map(function (d) { return d.name; });
    for (var r = 0; r < d.length; r++) {
        var g = cv(d[r][6]), h = cv(d[r][7]);
        if (r >= 4 && g && g !== 'Quota' && g !== 'Department Quotas' && deptNames.indexOf(g) === -1) out.ranks.push({ name: g, quota: h });
    }
    out.contacts   = out.contacts.filter(function (x) { return x && x !== 'Contact'; }).slice(0, 10);
    out.eventTypes = out.eventTypes.filter(function (x) { return x.name && x.name !== 'Event'; }).slice(0, 15);
    out.ranks      = out.ranks.filter(function (x) { return x.name; });
    out.officerRanks = out.officerRanks.filter(function (x) { return x.name; });
    return out;
}

function getActivityTracker(ss) {
    var s = ss.getSheetByName('Activity Tracker'); if (!s) return { title: '', subtitle: '', members: [] };
    var lastRow = s.getLastRow();
    var out = { title: cv(s.getRange('A1').getValue()), subtitle: cv(s.getRange('A2').getValue()), members: [] };
    if (lastRow < 4) return out;
    s.getRange(4, 1, lastRow - 3, 15).getValues().forEach(function (r) {
        var un = cv(r[0]); if (!un) return;
        out.members.push({
            username: un, rank: cv(r[1]), strikes: r[2] !== '' ? Number(r[2]) : 0, assignment: cv(r[3]),
            joinDate: fmtDate(r[4]), dueDate: fmtDate(r[5]), daysLeft: r[6] !== '' ? cv(r[6]) : '', ap: r[7] !== '' ? Number(r[7]) : 0,
            status: cv(r[8]), rd: r[9] !== '' ? Number(r[9]) : 0, wins: r[10] !== '' ? Number(r[10]) : 0,
            winrate: r[11] !== '' ? (Number(r[11]) * 100).toFixed(1) + '%' : '0%', totalPts: r[12] !== '' ? Number(r[12]) : 0,
            department: cv(r[13]), notes: cv(r[14])
        });
    });
    return out;
}

function getOfficerTracker(ss) {
    var s = ss.getSheetByName('Officer Tracker'); if (!s) return { title: '', subtitle: '', officers: [] };
    var lastRow = s.getLastRow();
    var out = { title: cv(s.getRange('A1').getValue()), subtitle: cv(s.getRange('A2').getValue()), officers: [] };
    if (lastRow < 4) return out;
    s.getRange(4, 1, lastRow - 3, 13).getValues().forEach(function (r) {
        var un = cv(r[0]); if (!un) return;
        out.officers.push({
            username: un, rank: cv(r[1]), strikes: r[2] !== '' ? Number(r[2]) : 0, assignment: cv(r[3]),
            officerPts: r[4] !== '' ? Number(r[4]) : 0, status: cv(r[5]), rd: r[6] !== '' ? Number(r[6]) : 0,
            wins: r[7] !== '' ? Number(r[7]) : 0, winrate: r[8] !== '' ? (Number(r[8]) * 100).toFixed(1) + '%' : '0%',
            totalPts: r[9] !== '' ? Number(r[9]) : 0, joinDate: fmtDate(r[10]), department: cv(r[11]), notes: cv(r[12])
        });
    });
    return out;
}

function getHonoredTracker(ss) {
    var s = ss.getSheetByName('Honored Tracker'); if (!s) return { disclaimer: '', members: [] };
    var lastRow = s.getLastRow();
    var out = { disclaimer: cv(s.getRange('A2').getValue()), members: [] };
    if (lastRow < 4) return out;
    s.getRange(4, 1, lastRow - 3, 14).getValues().forEach(function (r) {
        var un = cv(r[0]); if (!un) return;
        var medals = [];
        if (r[1] === true) medals.push('Legend');
        if (r[2] === true) medals.push('Cheerleader');
        if (r[3] === true) medals.push('Distinguished Officer');
        if (r[4] === true) medals.push("Commandant's Excellence");
        if (r[5] === true) medals.push("Advisor's Honor");
        if (r[6] === true) medals.push("Deputy Director's Valor");
        if (r[7] === true) medals.push("Director's Merit");
        if (r[8] === true) medals.push("Director-General's Virtue");
        out.members.push({
            username: un, medals: medals, totalPts: r[9] !== '' ? Number(r[9]) : 0,
            rd: r[10] !== '' ? Number(r[10]) : 0, wins: r[11] !== '' ? Number(r[11]) : 0,
            winrate: r[12] !== '' ? (Number(r[12]) * 100).toFixed(1) + '%' : '0%', notes: cv(r[13])
        });
    });
    return out;
}

function getDepartmentsTracker(ss) {
    var s = ss.getSheetByName('Departments Tracker'); if (!s) return [];
    var lastRow = s.getLastRow(); if (lastRow < 6) return [];
    var deptCols = [{ nc: 1, uc: 1, rc: 2, tc: 2 }, { nc: 4, uc: 4, rc: 5, tc: 5 }, { nc: 7, uc: 7, rc: 8, tc: 8 }, { nc: 10, uc: 10, rc: 11, tc: 11 }, { nc: 13, uc: 13, rc: 14, tc: 14 }];
    var allData = s.getRange(1, 1, Math.min(lastRow, 100), 16).getValues(), depts = [];
    deptCols.forEach(function (dc) {
        var deptName = cv(allData[2][dc.nc]), total = allData[3][dc.tc], members = [];
        for (var r = 5; r < allData.length; r++) { var un = cv(allData[r][dc.uc]); if (un) members.push({ username: un, rank: cv(allData[r][dc.rc]) }); }
        if (deptName) depts.push({ name: deptName, total: total || members.length, members: members });
    });
    return depts;
}

function getEvents(ss, sheetName, headers) {
    var s = ss.getSheetByName(sheetName); if (!s) return { title: '', total: 0, events: [] };
    var lastRow = s.getLastRow();
    var out = { title: cv(s.getRange('A1').getValue()), total: 0, events: [] };
    var row2 = s.getRange(2, 1, 1, 7).getValues()[0];
    for (var c = 0; c < row2.length; c++) { if (typeof row2[c] === 'number') { out.total = row2[c]; } }
    if (lastRow < 4) return out;
    s.getRange(4, 1, lastRow - 3, headers.length).getValues().forEach(function (r) {
        var un = cv(r[0]); if (!un || un === '#N/A') return;
        var ev = {}; headers.forEach(function (h, i) { ev[h] = i === 1 ? fmtDate(r[i]) : cv(r[i]); }); out.events.push(ev);
    });
    return out;
}

function getGroupMembers() {
    var s = getSheet('GroupMembers');
    if (!s || s.getLastRow() < 2) return [];
    return s.getRange(2, 1, s.getLastRow() - 1, 1).getValues()
        .map(function (r) { return String(r[0]).trim(); }).filter(function (v) { return v; });
}

// ════════════════════════════════════════════════════════════════
// RATE LIMITING  (Spreadsheet Cache sheet)
// ════════════════════════════════════════════════════════════════

function getCacheSheet() {
    var ss = getSS(), s = ss.getSheetByName('Cache'); if (s) return s;
    s = ss.insertSheet('Cache');
    s.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Timestamp']]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.hideSheet();
    return s;
}

function cacheGet(key) {
    var s = getCacheSheet(), lastRow = s.getLastRow(); if (lastRow < 2) return null;
    var data = s.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) if (String(data[i][0]).trim() === key) return String(data[i][1]).trim();
    return null;
}

function cacheSet(key, value) {
    var s = getCacheSheet(), lastRow = s.getLastRow(), now = new Date().toISOString();
    if (lastRow >= 2) {
        var keys = s.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < keys.length; i++) {
            if (String(keys[i][0]).trim() === key) { s.getRange(i + 2, 2, 1, 2).setValues([[value, now]]); return; }
        }
    }
    s.appendRow([key, value, now]);
}

function checkRateLimit(username, formType, cooldownMinutes) {
    var key = 'rl_' + formType + '_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_');
    var lastStr = cacheGet(key);
    if (!lastStr) return { allowed: true };
    var diffMin = (new Date() - new Date(lastStr)) / 60000;
    if (diffMin < cooldownMinutes) return { allowed: false, remaining: Math.ceil(cooldownMinutes - diffMin) };
    return { allowed: true };
}

function setRateLimit(username, formType) {
    cacheSet('rl_' + formType + '_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_'), new Date().toISOString());
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function isValidScreenshotUrl(url) {
    if (!url) return { valid: false, reason: 'Screenshot link is required.' };
    var lower = url.toLowerCase();
    var blocked = ['discord.com', 'discord.gg', 'discordapp.com', 'cdn.discordapp.com', 'media.discordapp.net'];
    for (var i = 0; i < blocked.length; i++) if (lower.indexOf(blocked[i]) !== -1) return { valid: false, reason: 'Discord links are not accepted. Please use Imgur, Gyazo, Prntscr, or a similar image host.' };
    var allowed = ['imgur.com', 'gyazo.com', 'prnt.sc', 'prntscr.com', 'lightshot.com', 'postimg.cc', 'ibb.co', 'pasteboard.co', 'i.imgur.com'];
    for (var j = 0; j < allowed.length; j++) if (lower.indexOf(allowed[j]) !== -1) return { valid: true };
    return { valid: false, reason: 'Screenshot must be from an accepted host (Imgur, Gyazo, Prntscr, Lightshot, etc.).' };
}

function isMember(username) {
    var s = getSheet('GroupMembers'); if (!s) return true;
    var lastRow = s.getLastRow(); if (lastRow < 2) return false;
    var lower = username.toLowerCase();
    var vals = s.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim().toLowerCase() === lower) return true;
    return false;
}

function isDuplicateEvent(host, eventType, dateStr, screenshot) {
    var s = getSheet('Weekly Events'); if (!s) return false;
    var lastRow = s.getLastRow(); if (lastRow < 4) return false;
    var rows = s.getRange(4, 1, lastRow - 3, 4).getValues();
    var hostL = host.toLowerCase(), typeL = eventType.toLowerCase(), ssL = (screenshot || '').toLowerCase();
    for (var i = 0; i < rows.length; i++) {
        var rHost = cv(rows[i][0]).toLowerCase(), rDate = fmtDate(rows[i][1]), rType = cv(rows[i][2]).toLowerCase(), rSS = cv(rows[i][3]).toLowerCase();
        if (rHost === hostL && rType === typeL && rDate === dateStr) return true;
        if (ssL && rSS && ssL === rSS) return true;
    }
    return false;
}

function submitEventLog(payload) {
    try {
        var ss = getSS();
        if (payload.hp && payload.hp !== '') return { success: false, error: 'Submission rejected.' };
        if (!isMember(payload.host)) return { success: false, error: 'Host username not found in member list.' };
        var rl = checkRateLimit(payload.host, 'eventlog', 10);
        if (!rl.allowed) return { success: false, error: 'Please wait ' + rl.remaining + ' minute(s) before submitting another event log.' };
        var sc = isValidScreenshotUrl(payload.screenshot); if (!sc.valid) return { success: false, error: sc.reason };
        var attendeeList = (payload.attendees || '').split(',').map(function (a) { return a.trim(); }).filter(function (a) { return a !== ''; });
        var dateForForm = payload.date || '';
        var parts = (payload.date || '').split('-');
        var fmtd = parts.length === 3 ? parseInt(parts[2]) + '/' + parseInt(parts[1]) + '/' + parts[0] : payload.date;
        if (isDuplicateEvent(payload.host, payload.eventType, fmtd, payload.screenshot)) return { success: false, error: 'A matching event has already been logged.' };
        var formParams = [
            'entry.1495060717=' + encodeURIComponent(payload.host),
            'entry.356661387='  + encodeURIComponent(dateForForm),
            'entry.274921376='  + encodeURIComponent(payload.eventType),
            'entry.568072216='  + encodeURIComponent(payload.screenshot),
            'entry.133730432='  + encodeURIComponent(String(attendeeList.length)),
            'entry.1169437077=' + encodeURIComponent(payload.attendees),
            'entry.805183300='  + encodeURIComponent(payload.notes || '')
        ];
        UrlFetchApp.fetch('https://docs.google.com/forms/d/e/1FAIpQLSdPH6K-9bVJnGedfZ6BXg84eP1DegU7qrqx0Vrdf8ROSPQzRA/formResponse',
            { method: 'post', contentType: 'application/x-www-form-urlencoded', payload: formParams.join('&'), muteHttpExceptions: true, followRedirects: false });
        setRateLimit(payload.host, 'eventlog');
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

function getExemptionDays(username) {
    try {
        var s = getExtSheet('144RdGpT6ahx9WjtMWnyJe_APjMkb9_eEv70ZqmdgCpk', 'Exemption Day Tracker');
        if (!s) return { found: false, error: 'Sheet not found.' };
        var lastRow = s.getLastRow(); if (lastRow < 2) return { found: false };
        var vals = s.getRange(2, 1, lastRow - 1, 3).getValues();
        var lower = username.toLowerCase();
        for (var i = 0; i < vals.length; i++) {
            if (String(vals[i][0]).trim().toLowerCase() === lower)
                return { found: true, username: String(vals[i][0]).trim(), daysUsed: vals[i][1], daysRemaining: vals[i][2] };
        }
        return { found: false };
    } catch (err) { return { found: false, error: err.message }; }
}

function cv(v) { if (v === null || v === undefined) return ''; if (v instanceof Date) return fmtDate(v); return String(v).trim(); }
function fmtDate(v) { if (!v || v === 'Not Found' || v === '') return cv(v); if (v instanceof Date) return v.getDate() + '/' + (v.getMonth() + 1) + '/' + v.getFullYear(); return String(v).trim(); }

function handleApiRequest(e) {
    var fn = (e.parameter.fn || '').trim();
    var payload = {};

    if (e.parameter.payload) {
        try { payload = JSON.parse(e.parameter.payload); } catch (_) { }
    }

    var result;
    try {
        switch (fn) {
            case 'getAllData':          result = getAllData(); break;
            case 'getGroupMembers':    result = getGroupMembers(); break;
            case 'getEventById':       result = getEventById(payload.eventId || ''); break;
            case 'getExemptionDays':   result = getExemptionDays(payload.username || ''); break;
            case 'submitEventLog':     result = submitEventLog(payload); break;
            case 'submitEditEventLog': result = submitEditEventLog(payload); break;
            case 'submitStatsTransfer':result = submitStatsTransfer(payload); break;
            case 'submitExemption':    result = submitExemption(payload); break;
            case 'submitMissingAP':    result = submitMissingAP(payload); break;
            case 'getDeploymentEvents':result = getDeploymentEvents(); break;
            case 'processCallback':    result = processCallback(payload); break;
            default: result = { error: 'Unknown function: ' + fn };
        }
    } catch (err) {
        result = { error: err.message };
    }

    return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
// DEPLOYMENT EVENTS  (for DIS sync)
// Fixed: reads 8 columns (A–H); gameId is in column H (index 7)
// ════════════════════════════════════════════════════════════════

function getDeploymentEvents() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Monthly Events');
    if (!sheet) return { events: [] };

    var startRow = 4;
    var lastRow  = sheet.getLastRow();
    if (lastRow < startRow) return { events: [] };

    var numRows = lastRow - startRow + 1;
    var data    = sheet.getRange(startRow, 1, numRows, 8).getValues(); // A–H

    var events = [];
    for (var i = 0; i < data.length; i++) {
        var row       = data[i];
        var username  = String(row[0] || '').trim(); // col A
        var eventType = String(row[2] || '').trim(); // col C
        var rawGameId = String(row[7] || '').trim(); // col H  ← fixed from row[6]

        if (!username || !eventType || !rawGameId) continue;

        events.push({
            date:      row[1] ? String(row[1]) : '',
            username:  username,
            eventType: eventType,
            gameId:    rawGameId
        });
    }

    return { events: events };
}
