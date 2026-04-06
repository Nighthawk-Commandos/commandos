// ── GET /api/callback/review — serve approve/deny review form
// ?type=transfer|exemption|editeventlog|missingap
// &action=approve|deny
// &id=REQ-ID
// &token=TOKEN
//
// Transfer:           processes directly (no form), calls Apps Script.
// Exemption/Edit/MAP: renders a reviewer form; submission goes to callback-process.
'use strict';

const PAGE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b0c0f;color:#e8e9ec;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.box{background:#111318;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:36px 42px;max-width:480px;width:100%;text-align:center}
h2{font-size:20px;margin-bottom:10px}
p{color:#6b7280;font-size:13px;line-height:1.7}
.note{margin-top:16px;background:rgba(200,164,74,.07);border:1px solid rgba(200,164,74,.2);border-radius:8px;padding:12px 16px;color:#c8a44a;font-size:12px;line-height:1.6;text-align:left}
.spinner{width:28px;height:28px;border:2px solid rgba(255,255,255,.08);border-top-color:#c8a44a;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 18px}
@keyframes spin{to{transform:rotate(360deg)}}
#loader{position:fixed;inset:0;background:#0b0c0f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:100;transition:opacity .3s}
#loader.gone{opacity:0;pointer-events:none}
.lt{font-size:20px;font-weight:700;color:#c8a44a;letter-spacing:.08em}
.ls{font-size:11px;color:#6b7280;letter-spacing:.1em}
#main-box{display:none}
.field{margin-bottom:14px;position:relative}
label{display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:5px}
textarea{width:100%;background:#181b22;border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:9px 12px;color:#e8e9ec;font-family:monospace;font-size:12px;outline:none;transition:border-color .15s;resize:vertical;min-height:70px;line-height:1.5}
.hint{font-size:10px;color:#6b7280;margin-top:4px}
.err{color:#e05252;font-size:11px;margin-top:3px;display:none}
.req-id{font-size:11px;color:#6b7280;margin-bottom:20px;background:rgba(255,255,255,.04);padding:6px 12px;border-radius:6px;display:block;text-align:center}
.sub{font-size:12px;color:#6b7280;margin-bottom:20px;line-height:1.5;text-align:center}
button{width:100%;padding:11px;border-radius:7px;font-family:monospace;font-size:13px;font-weight:600;cursor:pointer;border:none;letter-spacing:.04em;transition:opacity .15s;margin-top:6px}
.btn-approve{background:#4a9c72;color:#fff}.btn-approve:hover{opacity:.88}
.btn-deny{background:#e05252;color:#fff}.btn-deny:hover{opacity:.88}
button:disabled{opacity:.4;cursor:not-allowed}
.ac-wrap{position:relative}
.ac-input{width:100%;background:#181b22;border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:9px 12px;color:#e8e9ec;font-family:monospace;font-size:12px;outline:none;transition:border-color .15s,box-shadow .15s}
.ac-input::placeholder{color:#6b7280}
.ac-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1a1d26;border:1px solid rgba(200,164,74,.25);border-radius:7px;max-height:200px;overflow-y:auto;z-index:999;display:none;box-shadow:0 8px 32px rgba(0,0,0,.6)}
.ac-dropdown.open{display:block}
.ac-option{padding:8px 12px;font-family:monospace;font-size:12px;color:#e8e9ec;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.07);transition:background .1s}
.ac-option:last-child{border-bottom:none}
.ac-option:hover,.ac-option.active{background:rgba(200,164,74,.1);color:#e8c96d}
`.trim();

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapHtml(bodyContent) {
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
        body: `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TNI:C Commandos — Review</title>
<style>${PAGE_CSS}</style>
</head><body>${bodyContent}</body></html>`
    };
}

function resultPage(success, message) {
    const colour = success ? '#4a9c72' : '#e05252';
    const parts  = message.split('\n\n');
    return wrapHtml(
        `<div class="box">` +
        `<h2 style="color:${colour}">${success ? 'Done' : 'Error'}</h2>` +
        `<p>${esc(parts[0]).replace(/\n/g, '<br>')}</p>` +
        (parts[1] ? `<div class="note">Note: ${esc(parts[1])}</div>` : '') +
        `</div>`
    );
}

// notesRequired: which action triggers the notes-required validation
const TYPE_CONFIG = {
    transfer:     { needsForm: false },
    exemption:    { needsForm: true, approveLabel: 'Approve Exemption',      denyLabel: 'Deny Exemption',      notesRequired: 'deny'    },
    editeventlog: { needsForm: true, approveLabel: 'Approve Event Log Edit', denyLabel: 'Deny Event Log Edit', notesRequired: 'approve' },
    missingap:    { needsForm: true, approveLabel: 'Approve Missing AP',     denyLabel: 'Deny Missing AP',     notesRequired: 'deny'    }
};

async function callAppsScript(params) {
    const scriptUrl = process.env.SCRIPT_URL;
    if (!scriptUrl) throw new Error('SCRIPT_URL not configured');
    const qs = new URLSearchParams({
        action:  'api',
        fn:      'processCallback',
        payload: JSON.stringify({ ...params, secret: process.env.CALLBACK_SECRET })
    });
    const res = await fetch(scriptUrl + '?' + qs.toString());
    if (!res.ok) throw new Error('Apps Script returned HTTP ' + res.status);
    return res.json();
}

async function fetchMemberList() {
    try {
        const scriptUrl = process.env.SCRIPT_URL;
        if (!scriptUrl) return [];
        const qs  = new URLSearchParams({ action: 'api', fn: 'getGroupMembers' });
        const res = await fetch(scriptUrl + '?' + qs.toString());
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data.sort() : [];
    } catch { return []; }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const p      = event.queryStringParameters || {};
    const type   = (p.type   || 'transfer').trim().toLowerCase();
    const action = (p.action || '').trim().toLowerCase();
    const id     = (p.id     || '').trim();
    const token  = (p.token  || '').trim();

    if (!action || !id || !token)            return resultPage(false, 'Missing required parameters.');
    if (action !== 'approve' && action !== 'deny') return resultPage(false, 'Invalid action.');

    const cfg = TYPE_CONFIG[type];
    if (!cfg) return resultPage(false, 'Unknown request type: ' + type);

    // ── Transfer: process immediately, no reviewer form needed ───
    if (!cfg.needsForm) {
        try {
            const result = await callAppsScript({ type, action, id, token });
            return resultPage(
                result.success !== false,
                result.message || (result.success ? 'Done.' : 'An unknown error occurred.')
            );
        } catch (err) {
            return resultPage(false, 'Failed to process request: ' + err.message);
        }
    }

    // ── Reviewer form types ──────────────────────────────────────
    const members      = await fetchMemberList();
    const isDeny       = action === 'deny';
    const heading      = isDeny ? cfg.denyLabel : cfg.approveLabel;
    const headingColor = isDeny ? '#e05252' : '#4a9c72';
    const btnClass     = isDeny ? 'btn-deny' : 'btn-approve';
    const notesIsRequired = cfg.notesRequired === action;

    const notesLabel = notesIsRequired
        ? `${isDeny ? 'Reason for Denial' : 'Notes / Reason'} <span style="color:${headingColor}">*</span>`
        : `Notes / Reason <span style="color:#6b7280;font-size:10px">(optional)</span>`;
    const notesErrMsg   = cfg.notesRequired === 'deny' ? 'Reason is required when denying.' : 'Notes are required when approving.';
    const notesPlaceholder = isDeny ? 'Reason for denial...' : 'Optional notes...';

    const processUrl  = (process.env.URL || '') + '/api/callback/process';
    const membersJson = JSON.stringify(members);

    const body = `
<div id="loader"><div class="spinner"></div><div class="lt">TNI:C</div><div class="ls">Loading...</div></div>
<div class="box" id="main-box">
  <h2 style="color:${headingColor};text-align:center;margin-bottom:6px">${esc(heading)}</h2>
  <div class="sub">Confirm your identity and decision.<br>This action cannot be undone.</div>
  <span class="req-id">Request: ${esc(id)}</span>
  <form method="POST" action="${esc(processUrl)}" onsubmit="return validate()">
    <input type="hidden" name="type"   value="${esc(type)}">
    <input type="hidden" name="action" value="${esc(action)}">
    <input type="hidden" name="id"     value="${esc(id)}">
    <input type="hidden" name="token"  value="${esc(token)}">
    <div class="field">
      <label>Your Username <span style="color:${headingColor}">*</span></label>
      <div class="ac-wrap">
        <input type="text" class="ac-input" id="ri" name="reviewer" placeholder="Type to search..." autocomplete="off">
        <div class="ac-dropdown" id="rd"></div>
      </div>
      <div class="hint">Start typing to filter the member list.</div>
      <div class="err" id="er">Reviewer username is required.</div>
    </div>
    <div class="field">
      <label>${notesLabel}</label>
      <textarea id="ni" name="notes" placeholder="${esc(notesPlaceholder)}"></textarea>
      <div class="err" id="en">${esc(notesErrMsg)}</div>
    </div>
    <button type="submit" class="${btnClass}" id="sb">${esc(heading)}</button>
  </form>
</div>
<script>
window.addEventListener('load',function(){
  document.getElementById('main-box').style.display='block';
  var l=document.getElementById('loader');l.classList.add('gone');
  setTimeout(function(){l.style.display='none';},350);
});
var M=${membersJson},nr='${cfg.notesRequired}',ai=-1;
function bd(q){
  var d=document.getElementById('rd');
  var mx=q?M.filter(function(m){return m.toLowerCase().indexOf(q.toLowerCase())>-1;}).slice(0,12):[];
  if(!mx.length){d.classList.remove('open');d.innerHTML='';ai=-1;return;}
  d.innerHTML=mx.map(function(m){return'<div class="ac-option" data-v="'+eh(m)+'" onmousedown="pk(\''+eh(m)+'\')">' + eh(m) + '</div>';}).join('');
  d.classList.add('open');ai=-1;
}
function pk(n){document.getElementById('ri').value=n;document.getElementById('rd').classList.remove('open');document.getElementById('er').style.display='none';ai=-1;}
function kd(e){
  var d=document.getElementById('rd'),o=d.querySelectorAll('.ac-option');
  if(!d.classList.contains('open')||!o.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();ai=Math.min(ai+1,o.length-1);hl(o);}
  else if(e.key==='ArrowUp'){e.preventDefault();ai=Math.max(ai-1,0);hl(o);}
  else if(e.key==='Enter'&&ai>=0){e.preventDefault();pk(o[ai].dataset.v);}
  else if(e.key==='Escape'){d.classList.remove('open');ai=-1;}
}
function hl(o){o.forEach(function(x,i){x.classList.toggle('active',i===ai);});if(ai>=0)o[ai].scrollIntoView({block:'nearest'});}
function eh(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var ri=document.getElementById('ri');
ri.addEventListener('input',function(){bd(ri.value);});
ri.addEventListener('keydown',kd);
ri.addEventListener('focus',function(){if(ri.value.trim())bd(ri.value);});
document.addEventListener('click',function(ev){if(!ri.closest('.ac-wrap').contains(ev.target))document.getElementById('rd').classList.remove('open');});
function validate(){
  var r=ri.value.trim(),ok=true;
  if(!r){document.getElementById('er').style.display='block';ok=false;}else document.getElementById('er').style.display='none';
  var ne=document.getElementById('ni'),en=document.getElementById('en');
  if(ne&&en){
    var n=ne.value.trim(),dec='${action}';
    var need=(nr==='deny'&&dec==='deny')||(nr==='approve'&&dec==='approve');
    if(need&&!n){en.style.display='block';ok=false;}else en.style.display='none';
  }
  if(!ok)return false;
  document.getElementById('sb').disabled=true;document.getElementById('sb').textContent='Processing...';
  return true;
}
<\/script>`;

    return wrapHtml(body);
};
