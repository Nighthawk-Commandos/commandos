// ── POST /api/callback/process — process a reviewer decision
// Called by the HTML form served from callback-review.js.
// Forwards the decision to Apps Script's processCallback endpoint.
// Body (application/x-www-form-urlencoded):
//   type, action, id, token, reviewer, notes
'use strict';

const PAGE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b0c0f;color:#e8e9ec;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.box{background:#111318;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:36px 42px;max-width:480px;width:100%;text-align:center}
h2{font-size:20px;margin-bottom:10px}
p{color:#6b7280;font-size:13px;line-height:1.7}
.note{margin-top:16px;background:rgba(200,164,74,.07);border:1px solid rgba(200,164,74,.2);border-radius:8px;padding:12px 16px;color:#c8a44a;font-size:12px;line-height:1.6;text-align:left}
`.trim();

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resultPage(success, message) {
    const colour = success ? '#4a9c72' : '#e05252';
    const parts  = message.split('\n\n');
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
        body: `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TNI:C Commandos — Result</title>
<style>${PAGE_CSS}</style>
</head><body>
<div class="box">
  <h2 style="color:${colour}">${success ? 'Done' : 'Error'}</h2>
  <p>${esc(parts[0]).replace(/\n/g, '<br>')}</p>
  ${parts[1] ? `<div class="note">Note: ${esc(parts[1])}</div>` : ''}
</div>
</body></html>`
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    // Parse urlencoded form body
    let params;
    try {
        params = new URLSearchParams(event.body || '');
    } catch {
        return resultPage(false, 'Invalid request body.');
    }

    const type     = (params.get('type')     || '').trim().toLowerCase();
    const action   = (params.get('action')   || '').trim().toLowerCase();
    const id       = (params.get('id')       || '').trim();
    const token    = (params.get('token')    || '').trim();
    const reviewer = (params.get('reviewer') || '').trim();
    const notes    = (params.get('notes')    || '').trim();

    if (!type || !action || !id || !token) return resultPage(false, 'Missing required parameters.');
    if (action !== 'approve' && action !== 'deny') return resultPage(false, 'Invalid action.');
    if (!reviewer) return resultPage(false, 'Reviewer username is required.');

    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) return resultPage(false, 'Server configuration error: SCRIPT_URL not set.');

    try {
        const qs = new URLSearchParams({
            action:  'api',
            fn:      'processCallback',
            payload: JSON.stringify({
                type, action, id, token, reviewer, notes,
                secret: process.env.CALLBACK_SECRET
            })
        });

        const res = await fetch(scriptUrl + '?' + qs.toString());
        if (!res.ok) throw new Error('Apps Script returned HTTP ' + res.status);

        const result = await res.json();
        return resultPage(
            result.success !== false,
            result.message || (result.success ? 'Done.' : 'An unknown error occurred.')
        );
    } catch (err) {
        return resultPage(false, 'Failed to process request: ' + err.message);
    }
};
