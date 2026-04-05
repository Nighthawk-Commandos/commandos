// ═══════════════════════════════════════════════════════════════
//  forms.js — form renderers, state, validation, submission
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Form: Event Log ───────────────────────────────────────────
var EL = { host:'', attendees:[] };

function renderFormEventLog() {
    var h = pageHeader('Event Log','Record a hosted event') +
        '<div class="form-page"><div class="form-card">' +
        fHead('📋','Event Log','Submit a hosted event for tracking') +
        '<div class="form-body">' +
        honeypot('el-hp') +
        fld('field-el-host','Host Username','*',
            '<div class="ac-wrap"><input class="ac-input" id="el-host-inp" placeholder="Type to search…" autocomplete="off"><div class="ac-dropdown" id="el-host-dd"></div></div>',
            'Host username is required.') +
        fld('field-el-date','Date','*','<input type="date" id="el-date">','Date is required.') +
        fld('field-el-type','Event Type','*',
            '<select id="el-type"><option value="" disabled selected>Select type…</option>'+evTypeOpts()+'</select>',
            'Event type is required.') +
        fld('field-el-ss','Screenshot Link','*',
            '<input type="text" id="el-ss" placeholder="https://imgur.com/…">','Screenshot link is required.') +
        '<div class="field-hint">Accepted: Imgur, Gyazo, Prntscr, Lightshot. Discord links not accepted.</div>' +
        fld('field-el-att','Attendees','*',
            '<div class="ac-wrap"><div class="tags-area" id="el-att-area"><input class="tags-input" id="el-att-inp" placeholder="Type to add…"></div><div class="ac-dropdown" id="el-att-dd"></div></div>',
            'At least one attendee is required.') +
        fld('field-el-notes','Notes','','<textarea id="el-notes" placeholder="Any additional context…"></textarea>','') +
        '<div class="cooldown-bar-wrap" id="el-cd-wrap"><div class="cooldown-bar" id="el-cd-bar"></div></div>' +
        '<div class="form-actions"><button class="btn-ghost" onclick="resetEL()">Clear</button>' +
        '<button class="btn-primary" id="el-submit-btn" onclick="submitEL()">Submit Log</button></div>' +
        '</div></div></div>';

    setContent(h);
    EL = { host:'', attendees:[] };
    setToday('el-date');
    initSingleAC('el-host-inp','el-host-dd','pickELHost');
    initMultiAC('el-att-inp','el-att-dd','el-att-area',function(){return EL.attendees;},'addELAtt');
    docOutsideClick([['el-host-inp','el-host-dd'],['el-att-inp','el-att-dd']]);
}

function pickELHost(n)    { EL.host=n; sv('el-host-inp',n); closeAC('el-host-dd'); clrFieldErr('field-el-host'); }
function addELAtt(n)      { if(EL.attendees.indexOf(n)>-1)return; EL.attendees.push(n); renderTags('el-att-area','el-att-inp',EL.attendees,'removeELAtt'); sv('el-att-inp',''); closeAC('el-att-dd'); clrFieldErr('field-el-att'); }
function removeELAtt(n)   { EL.attendees=EL.attendees.filter(function(a){return a!==n;}); renderTags('el-att-area','el-att-inp',EL.attendees,'removeELAtt'); }

function resetEL() {
    EL = { host:'', attendees:[] };
    ['el-host-inp','el-ss','el-notes'].forEach(function(id){sv(id,'');});
    var s=$('el-type'); if(s)s.selectedIndex=0;
    setToday('el-date');
    renderTags('el-att-area','el-att-inp',[],'removeELAtt');
    clrAll(['field-el-host','field-el-date','field-el-type','field-el-ss','field-el-att']);
}

function submitEL() {
    var ok = true;
    var host = EL.host||(gv('el-host-inp')||'').trim(); if(!host){setFieldErr('field-el-host','Host required.'); ok=false;} else clrFieldErr('field-el-host');
    var date = gv('el-date')||'';                        if(!date){setFieldErr('field-el-date','Date required.'); ok=false;} else clrFieldErr('field-el-date');
    var type = gv('el-type')||'';                        if(!type){setFieldErr('field-el-type','Type required.'); ok=false;} else clrFieldErr('field-el-type');
    var ss   = (gv('el-ss')||'').trim();                 if(!ss)  {setFieldErr('field-el-ss','Screenshot required.'); ok=false;} else clrFieldErr('field-el-ss');
    if (!EL.attendees.length) { setFieldErr('field-el-att','At least one attendee required.'); ok=false; } else clrFieldErr('field-el-att');
    if (!ok) return;

    btnBusy('el-submit-btn','Submitting…');
    API.submitEventLog({ hp:gv('el-hp')||'', host:host, date:date, eventType:type, screenshot:ss, attendees:EL.attendees.join(', '), notes:(gv('el-notes')||'').trim() })
        .then(function(r){
            btnDone('el-submit-btn','Submit Log');
            if (r&&r.success) { toast('Event logged!','success'); resetEL(); cooldown('el-submit-btn','el-cd-wrap','el-cd-bar',600); }
            else toast((r&&r.error)||'Submission failed.','error');
        }).catch(function(e){ btnDone('el-submit-btn','Submit Log'); toast('Error: '+e.message,'error'); });
}

// ── Form: Edit Event Log ──────────────────────────────────────
var EEL = { attendees:[], event:null };

function renderFormEditEventLog() {
    var h = pageHeader('Edit Event Log','Request a correction to an existing event log entry') +
        '<div class="form-page"><div class="form-card">' +
        fHead('✏️','Edit Event Log','Correction requests require admin approval via Discord') +
        '<div class="form-body">' +
        honeypot('eel-hp') +
        fld('field-eel-id','Event ID','*',
            '<div class="inline-action"><input type="text" id="eel-id" placeholder="e.g. EVT-001"><button class="btn-ghost" type="button" onclick="lookupEELEvent()">Load Event</button></div>',
            'Event ID is required.') +
        '<div id="eel-event-info" style="display:none"></div>' +
        fld('field-eel-field','Field to Edit','*',
            '<select id="eel-field" onchange="eelFieldChange()" disabled>'+
            '<option value="" disabled selected>Load an event first…</option>'+
            '<option value="Host Username">Host Username</option>'+
            '<option value="Event Type">Event Type</option>'+
            '<option value="Screenshot Link">Screenshot Link</option>'+
            '<option value="Attendees">Attendees</option>'+
            '</select>','Field required.') +
        '<div id="eel-nv-wrap" style="display:none"></div>' +
        '<div class="form-actions"><button class="btn-ghost" onclick="resetEEL()">Clear</button>' +
        '<button class="btn-primary" id="eel-submit-btn" onclick="submitEEL()" disabled>Submit Request</button></div>' +
        '</div></div></div>';

    setContent(h);
    EEL = { attendees:[], event:null };
}

function lookupEELEvent() {
    var id=(gv('eel-id')||'').trim(); if(!id){setFieldErr('field-eel-id','Event ID required.'); return;} clrFieldErr('field-eel-id');
    var info=$('eel-event-info');
    if(info){info.style.display='block'; info.innerHTML='<div class="field-hint italic">Loading…</div>';}
    API.getEventById(id).then(function(r){
        if (!$('eel-event-info')) return;
        if (r&&r.found) {
            EEL.event=r;
            info.innerHTML='<div class="field-info">'+
                '<div class="info-row"><span class="ik">Host</span><span class="iv">'+esc(r.hostUsername)+'</span></div>'+
                '<div class="info-row"><span class="ik">Date</span><span class="iv">'+esc(r.date)+'</span></div>'+
                '<div class="info-row"><span class="ik">Event Type</span><span class="iv">'+esc(r.eventType)+'</span></div>'+
                '<div class="info-row"><span class="ik">Attendees</span><span class="iv wrap-right">'+esc(r.attendees)+'</span></div>'+
                '<div class="info-row"><span class="ik">Screenshot</span><span class="iv wrap-right"><a href="'+esc(r.screenshot)+'" target="_blank" rel="noopener" class="link-accent">'+esc(r.screenshot)+'</a></span></div>'+
                '</div>';
            var sel=$('eel-field'); if(sel){sel.disabled=false; sel.selectedIndex=0;}
            $('eel-nv-wrap').style.display='none';
            $('eel-submit-btn').disabled=true;
        } else {
            EEL.event=null;
            info.innerHTML='<div class="field-warn">Event not found. Check the ID and try again.</div>';
            var sel=$('eel-field'); if(sel)sel.disabled=true;
            $('eel-submit-btn').disabled=true;
        }
    }).catch(function(e){ if($('eel-event-info'))info.innerHTML='<div class="field-warn">Error: '+esc(e.message)+'</div>'; });
}

function eelFieldChange() {
    var f=gv('eel-field')||'', wrap=$('eel-nv-wrap'), ev=EEL.event;
    if(!wrap||!f||!ev)return;
    wrap.style.display='block'; EEL.attendees=[];

    if (f==='Host Username') {
        wrap.innerHTML=fld('field-eel-nv','New Host Username','*',
            '<div class="ac-wrap"><input class="ac-input" id="eel-nv-inp" placeholder="Type to search…" autocomplete="off"><div class="ac-dropdown" id="eel-nv-dd"></div></div>',
            'Required.');
        initSingleAC('eel-nv-inp','eel-nv-dd','pickEELHost');
        docOutsideClick([['eel-nv-inp','eel-nv-dd']]);
    } else if (f==='Event Type') {
        wrap.innerHTML=fld('field-eel-nv','New Event Type','*','<select id="eel-nv-sel">'+evTypeOpts()+'</select>','Required.');
    } else if (f==='Screenshot Link') {
        wrap.innerHTML=fld('field-eel-nv','New Screenshot Link','*','<input type="text" id="eel-nv-text" placeholder="https://imgur.com/…">','Required.')+
            '<div class="field-hint">Accepted: Imgur, Gyazo, Prntscr, Lightshot. Discord links not accepted.</div>';
    } else if (f==='Attendees') {
        var existing=ev.attendees?ev.attendees.split(',').map(function(a){return a.trim();}).filter(Boolean):[];
        EEL.attendees=existing.slice();
        wrap.innerHTML=fld('field-eel-nv','Attendees','*',
            '<div class="ac-wrap"><div class="tags-area" id="eel-att-area"><input class="tags-input" id="eel-att-inp" placeholder="Add or remove…"></div><div class="ac-dropdown" id="eel-att-dd"></div></div>',
            'Required.');
        renderTags('eel-att-area','eel-att-inp',EEL.attendees,'removeEELAtt');
        initMultiAC('eel-att-inp','eel-att-dd','eel-att-area',function(){return EEL.attendees;},'addEELAtt');
        docOutsideClick([['eel-att-inp','eel-att-dd']]);
    }
    $('eel-submit-btn').disabled=false;
}

function pickEELHost(n)   { sv('eel-nv-inp',n); closeAC('eel-nv-dd'); clrFieldErr('field-eel-nv'); }
function addEELAtt(n)     { if(EEL.attendees.indexOf(n)>-1)return; EEL.attendees.push(n); renderTags('eel-att-area','eel-att-inp',EEL.attendees,'removeEELAtt'); sv('eel-att-inp',''); closeAC('eel-att-dd'); clrFieldErr('field-eel-nv'); }
function removeEELAtt(n)  { EEL.attendees=EEL.attendees.filter(function(a){return a!==n;}); renderTags('eel-att-area','eel-att-inp',EEL.attendees,'removeEELAtt'); }

function getEELVal() {
    var f=gv('eel-field')||'';
    if(f==='Host Username')   return (gv('eel-nv-inp')||'').trim();
    if(f==='Event Type')      return gv('eel-nv-sel')||'';
    if(f==='Screenshot Link') return (gv('eel-nv-text')||'').trim();
    if(f==='Attendees')       return EEL.attendees.join(', ');
    return '';
}

function resetEEL() {
    EEL={attendees:[],event:null}; sv('eel-id','');
    var info=$('eel-event-info'); if(info){info.style.display='none'; info.innerHTML='';}
    var sel=$('eel-field'); if(sel){sel.disabled=true; sel.selectedIndex=0;}
    var wrap=$('eel-nv-wrap'); if(wrap){wrap.style.display='none'; wrap.innerHTML='';}
    var btn=$('eel-submit-btn'); if(btn)btn.disabled=true;
    clrAll(['field-eel-id','field-eel-field','field-eel-nv']);
}

function submitEEL() {
    var ok=true;
    var id=(gv('eel-id')||'').trim(); if(!id||!EEL.event){setFieldErr('field-eel-id','Load a valid event first.'); ok=false;} else clrFieldErr('field-eel-id');
    var f=gv('eel-field')||'';        if(!f){setFieldErr('field-eel-field','Field required.'); ok=false;} else clrFieldErr('field-eel-field');
    var nv=getEELVal();               if(!nv||(f==='Attendees'&&!EEL.attendees.length)){setFieldErr('field-eel-nv','New value required.'); ok=false;} else clrFieldErr('field-eel-nv');
    if(!ok)return;

    btnBusy('eel-submit-btn','Submitting…');
    API.submitEditEventLog({hp:gv('eel-hp')||'',eventId:id,fieldName:f,newValue:nv})
        .then(function(r){
            btnDone('eel-submit-btn','Submit Request');
            if(r&&r.success){toast('Edit request submitted!','success'); resetEEL();}
            else toast((r&&r.error)||'Submission failed.','error');
        }).catch(function(e){btnDone('eel-submit-btn','Submit Request'); toast('Error: '+e.message,'error');});
}

// ── Form: Stats Transfer ──────────────────────────────────────
function renderFormTransfer() {
    var h = pageHeader('Stats Transfer','Request a username change or account transfer') +
        '<div class="form-page"><div class="form-card">' +
        fHead('🔄','Stats Transfer','Changes applied only after an admin approves via Discord.') +
        '<div class="form-body">' +
        honeypot('tr-hp') +
        fld('field-tr-type','Transfer Type','*',
            '<select id="tr-type" onchange="trTypeChange()"><option value="" disabled selected>Select type…</option>'+
            '<option value="Username Change">Username Change — same account, new name</option>'+
            '<option value="Account Transfer">Account Transfer — different account, same player</option>'+
            '</select>','Transfer type required.') +
        fld('field-tr-old','Old Username','*','<input type="text" id="tr-old" placeholder="Username currently in the sheets">','Old username required.') +
        fld('field-tr-new','New Username','*','<input type="text" id="tr-new" placeholder="New username to replace it with">','New username required.') +
        '<div id="tr-ev-field" style="display:none">' +
        fld('field-tr-ev','Evidence of Account Ownership','*','<input type="text" id="tr-ev" placeholder="https://imgur.com/…">','Evidence required for account transfers.') +
        '<div class="field-hint">Accepted: Imgur, Gyazo, Prntscr. Discord links not accepted.</div>' +
        '</div>' +
        '<div id="tr-result"></div>' +
        '<div class="form-actions"><button class="btn-ghost" onclick="resetTR()">Clear</button>' +
        '<button class="btn-primary" id="tr-submit-btn" onclick="submitTR()">Submit Request</button></div>' +
        '</div></div></div>';
    setContent(h);
}

function trTypeChange() { var t=gv('tr-type')||''; var ef=$('tr-ev-field'); if(ef)ef.style.display=(t==='Account Transfer')?'block':'none'; }

function resetTR() {
    ['tr-old','tr-new','tr-ev'].forEach(function(id){sv(id,'');});
    var s=$('tr-type'); if(s)s.selectedIndex=0;
    var ef=$('tr-ev-field'); if(ef)ef.style.display='none';
    clrAll(['field-tr-type','field-tr-old','field-tr-new','field-tr-ev']);
    var r=$('tr-result'); if(r)r.innerHTML='';
}

function submitTR() {
    var ok=true;
    var type=(gv('tr-type')||'').trim(); if(!type){setFieldErr('field-tr-type','Type required.'); ok=false;} else clrFieldErr('field-tr-type');
    var oldU=(gv('tr-old')||'').trim();  if(!oldU){setFieldErr('field-tr-old','Old username required.'); ok=false;} else clrFieldErr('field-tr-old');
    var newU=(gv('tr-new')||'').trim();  if(!newU){setFieldErr('field-tr-new','New username required.'); ok=false;} else clrFieldErr('field-tr-new');
    var ev=(gv('tr-ev')||'').trim(); if(type==='Account Transfer'&&!ev){setFieldErr('field-tr-ev','Evidence required.'); ok=false;} else clrFieldErr('field-tr-ev');
    if(!ok)return;

    btnBusy('tr-submit-btn','Submitting…');
    API.submitStatsTransfer({hp:gv('tr-hp')||'',oldUsername:oldU,newUsername:newU,transferType:type,evidence:ev})
        .then(function(r){
            btnDone('tr-submit-btn','Submit Request');
            if(r&&r.success){
                toast('Request submitted!','success');
                var res=$('tr-result');
                if(res)res.innerHTML='<div class="field-info" style="margin-top:4px">'+
                    '<div class="info-row"><span class="ik">Request ID</span><span class="iv">'+esc(r.requestId)+'</span></div>'+
                    '<div class="info-row"><span class="ik">Status</span><span class="iv">Pending admin approval</span></div></div>';
            } else toast((r&&r.error)||'Submission failed.','error');
        }).catch(function(e){btnDone('tr-submit-btn','Submit Request'); toast('Error: '+e.message,'error');});
}

// ── Form: Exemption ───────────────────────────────────────────
var EX = { username:'', departments:[] };

function renderFormExemption() {
    var h = pageHeader('Exemption Request','Submit an activity exemption') +
        '<div class="form-page"><div class="form-card">' +
        fHead('🛡️','Exemption','Start date Mon–Thu · End date must be a Monday.') +
        '<div class="form-body">' +
        honeypot('ex-hp') +
        fld('field-ex-user','Username','*',
            '<div class="ac-wrap"><input class="ac-input" id="ex-user-inp" placeholder="Type to search…" autocomplete="off"><div class="ac-dropdown" id="ex-user-dd"></div></div>',
            'Username required.') +
        '<div id="ex-days-info"></div>' +
        fld('field-ex-reason','Reason','*','<input type="text" id="ex-reason" placeholder="Reason for exemption">','Reason required.') +
        fld('field-ex-start','Start Date','*','<input type="date" id="ex-start" onchange="calcExDays()">','Start date required.') +
        fld('field-ex-end','End Date (must be Monday)','*','<input type="date" id="ex-end" onchange="calcExDays()">','End date required.') +
        '<div id="ex-calc-info"></div>' +
        fld('field-ex-dept','Departments','*',
            '<div class="ac-wrap">'+
            '<div class="tags-area" id="ex-dept-area"><input class="tags-input" id="ex-dept-inp" placeholder="Select departments…" readonly onfocus="toggleExDeptDD()" autocomplete="off"></div>'+
            '<div class="ac-dropdown" id="ex-dept-dd">'+
            ['Ghosts','Progression','Welfare','IA','Librarium','N/A'].map(function(d){
                return '<div class="ac-option" onmousedown="toggleExDept(\''+d+'\')">'+d+'</div>';
            }).join('')+
            '</div>'+
            '</div>','At least one department required.') +
        '<div class="cooldown-bar-wrap" id="ex-cd-wrap"><div class="cooldown-bar" id="ex-cd-bar"></div></div>' +
        '<div class="form-actions"><button class="btn-ghost" onclick="resetEX()">Clear</button>' +
        '<button class="btn-primary" id="ex-submit-btn" onclick="submitEX()">Submit Exemption</button></div>' +
        '</div></div></div>';

    setContent(h);
    EX = { username:'', departments:[] };
    initSingleAC('ex-user-inp','ex-user-dd','pickEXUser');
    var area=$('ex-dept-area'); if(area) area.addEventListener('click', toggleExDeptDD);
    docOutsideClick([['ex-user-inp','ex-user-dd'],['ex-dept-inp','ex-dept-dd']]);
}

function toggleExDeptDD() { var dd=$('ex-dept-dd'); if(dd)dd.classList.toggle('open'); }

function toggleExDept(name) {
    var idx=EX.departments.indexOf(name);
    if(idx===-1) EX.departments.push(name); else EX.departments.splice(idx,1);
    renderExDeptTags();
    var dd=$('ex-dept-dd');
    if(dd) dd.querySelectorAll('.ac-option').forEach(function(o){
        if(o.textContent===name) o.style.background = EX.departments.indexOf(name)>-1?'rgba(200,164,74,.15)':'';
    });
    if(EX.departments.length) clrFieldErr('field-ex-dept');
}

function renderExDeptTags() {
    var area=$('ex-dept-area'), inp=$('ex-dept-inp'); if(!area||!inp)return;
    area.querySelectorAll('.tag').forEach(function(t){t.remove();});
    var frag=document.createDocumentFragment();
    EX.departments.forEach(function(name){
        var tag=document.createElement('span'); tag.className='tag';
        tag.innerHTML=esc(name)+'<i class="tag-remove" onmousedown="event.preventDefault();event.stopPropagation();toggleExDept(\''+ea(name)+'\')">×</i>';
        frag.appendChild(tag);
    });
    area.insertBefore(frag,inp);
    inp.placeholder=EX.departments.length?'':'Select departments…';
}

function pickEXUser(name) {
    EX.username=name; sv('ex-user-inp',name); closeAC('ex-user-dd'); clrFieldErr('field-ex-user');
    var info=$('ex-days-info');
    if(info) info.innerHTML='<div class="field-hint italic">Looking up exemption days…</div>';
    API.getExemptionDays(name).then(function(r){
        if(!$('ex-days-info'))return;
        var info=$('ex-days-info');
        info.innerHTML = r&&r.found
            ? '<div class="field-info">'+
            '<div class="info-row"><span class="ik">Days Used</span><span class="iv">'+esc(String(r.daysUsed))+'</span></div>'+
            '<div class="info-row"><span class="ik">Days Remaining</span><span class="iv">'+esc(String(r.daysRemaining))+'</span></div></div>'
            : '<div class="field-hint">No exemption record found for this user.</div>';
        calcExDays();
    }).catch(function(){ var i=$('ex-days-info'); if(i)i.innerHTML='<div class="field-hint">Could not retrieve exemption days.</div>'; });
}

function calcExDays() {
    var sv2=gv('ex-start')||'', ev2=gv('ex-end')||'', info=$('ex-calc-info'); if(!info||!sv2||!ev2)return;
    var s=new Date(sv2+'T00:00:00'), e=new Date(ev2+'T00:00:00');
    if(e<=s){info.innerHTML='<div class="field-warn">End date must be after start date.</div>';return;}
    var days=Math.ceil((e-s)/86400000), sd=s.getDay(), msgs=[];
    if(sd<1||sd>4) msgs.push('Start date must be Monday–Thursday.');
    if(e.getDay()!==1) msgs.push('End date must be a Monday.');
    if(msgs.length){info.innerHTML='<div class="field-warn">'+msgs.map(esc).join('<br>')+'</div>';return;}
    info.innerHTML='<div class="field-info"><div class="info-row"><span class="ik">Days Requested</span><span class="iv">'+days+'</span></div></div>';
}

function resetEX() {
    EX={username:'',departments:[]};
    ['ex-user-inp','ex-reason','ex-start','ex-end'].forEach(function(id){sv(id,'');});
    renderExDeptTags();
    var dd=$('ex-dept-dd'); if(dd)dd.querySelectorAll('.ac-option').forEach(function(o){o.style.background='';});
    clrAll(['field-ex-user','field-ex-reason','field-ex-start','field-ex-end','field-ex-dept']);
    var di=$('ex-days-info'); if(di)di.innerHTML='';
    var ci=$('ex-calc-info'); if(ci)ci.innerHTML='';
}

function submitEX() {
    var ok=true;
    var user=EX.username||(gv('ex-user-inp')||'').trim(); if(!user){setFieldErr('field-ex-user','Username required.'); ok=false;} else clrFieldErr('field-ex-user');
    var reason=(gv('ex-reason')||'').trim();               if(!reason){setFieldErr('field-ex-reason','Reason required.'); ok=false;} else clrFieldErr('field-ex-reason');
    var start=gv('ex-start')||'';                          if(!start){setFieldErr('field-ex-start','Start date required.'); ok=false;} else clrFieldErr('field-ex-start');
    var end=gv('ex-end')||'';                              if(!end){setFieldErr('field-ex-end','End date required.'); ok=false;} else clrFieldErr('field-ex-end');
    if(!EX.departments.length){setFieldErr('field-ex-dept','At least one department required.'); ok=false;} else clrFieldErr('field-ex-dept');
    if(!ok)return;

    if(start&&end){
        var s=new Date(start+'T00:00:00'), e=new Date(end+'T00:00:00'), sd=s.getDay();
        if(sd===0||sd===5||sd===6){setFieldErr('field-ex-start','Start must be Mon–Thu.'); return;}
        if(e.getDay()!==1){setFieldErr('field-ex-end','End must be a Monday.'); return;}
        if(e<=s){setFieldErr('field-ex-end','End must be after start.'); return;}
    }

    btnBusy('ex-submit-btn','Submitting…');
    API.submitExemption({hp:gv('ex-hp')||'',username:user,reason:reason,startDate:start,endDate:end,departments:EX.departments.join(', ')})
        .then(function(r){
            btnDone('ex-submit-btn','Submit Exemption');
            if(r&&r.success){toast('Exemption submitted!','success'); resetEX(); cooldown('ex-submit-btn','ex-cd-wrap','ex-cd-bar',1800);}
            else toast((r&&r.error)||'Submission failed.','error');
        }).catch(function(e){btnDone('ex-submit-btn','Submit Exemption'); toast('Error: '+e.message,'error');});
}

// ── Form: Missing AP ──────────────────────────────────────────
var MA = { username:'', host:'' };

function renderFormMissingAP() {
    var h = pageHeader('Missing AP Request','Request activity points for an unlogged event') +
        '<div class="form-page"><div class="form-card">' +
        fHead('⚡','Missing AP','Submit evidence of attendance for a missing AP award') +
        '<div class="form-body">' +
        honeypot('ma-hp') +
        fld('field-ma-user','Your Username','*',
            '<div class="ac-wrap"><input class="ac-input" id="ma-user-inp" placeholder="Type to search…" autocomplete="off"><div class="ac-dropdown" id="ma-user-dd"></div></div>',
            'Your username required.') +
        fld('field-ma-host','Host Username','*',
            '<div class="ac-wrap"><input class="ac-input" id="ma-host-inp" placeholder="Type to search…" autocomplete="off"><div class="ac-dropdown" id="ma-host-dd"></div></div>',
            'Host username required.') +
        fld('field-ma-date','Date of Event','*','<input type="date" id="ma-date">','Date required.') +
        fld('field-ma-type','Event Type','*',
            '<select id="ma-type"><option value="" disabled selected>Select type…</option>'+evTypeOpts()+'</select>','Event type required.') +
        fld('field-ma-ev','Evidence (Screenshot)','*','<input type="text" id="ma-ev" placeholder="https://imgur.com/…">','Screenshot required.') +
        '<div class="field-hint">Accepted: Imgur, Gyazo, Prntscr, Lightshot. Discord links not accepted.</div>' +
        '<div class="cooldown-bar-wrap" id="ma-cd-wrap"><div class="cooldown-bar" id="ma-cd-bar"></div></div>' +
        '<div class="form-actions"><button class="btn-ghost" onclick="resetMA()">Clear</button>' +
        '<button class="btn-primary" id="ma-submit-btn" onclick="submitMA()">Submit Request</button></div>' +
        '</div></div></div>';

    setContent(h);
    MA={username:'',host:''};
    setToday('ma-date');
    initSingleAC('ma-user-inp','ma-user-dd','pickMAUser');
    initSingleAC('ma-host-inp','ma-host-dd','pickMAHost');
    docOutsideClick([['ma-user-inp','ma-user-dd'],['ma-host-inp','ma-host-dd']]);
}

function pickMAUser(n) { MA.username=n; sv('ma-user-inp',n); closeAC('ma-user-dd'); clrFieldErr('field-ma-user'); }
function pickMAHost(n) { MA.host=n;     sv('ma-host-inp',n); closeAC('ma-host-dd'); clrFieldErr('field-ma-host'); }

function resetMA() {
    MA={username:'',host:''};
    ['ma-user-inp','ma-host-inp','ma-ev'].forEach(function(id){sv(id,'');});
    var s=$('ma-type'); if(s)s.selectedIndex=0;
    setToday('ma-date');
    clrAll(['field-ma-user','field-ma-host','field-ma-date','field-ma-type','field-ma-ev']);
}

function submitMA() {
    var ok=true;
    var user=MA.username||(gv('ma-user-inp')||'').trim(); if(!user){setFieldErr('field-ma-user','Your username required.'); ok=false;} else clrFieldErr('field-ma-user');
    var host=MA.host||(gv('ma-host-inp')||'').trim();     if(!host){setFieldErr('field-ma-host','Host required.'); ok=false;} else clrFieldErr('field-ma-host');
    var date=gv('ma-date')||'';                           if(!date){setFieldErr('field-ma-date','Date required.'); ok=false;} else clrFieldErr('field-ma-date');
    var type=gv('ma-type')||'';                           if(!type){setFieldErr('field-ma-type','Type required.'); ok=false;} else clrFieldErr('field-ma-type');
    var ev=(gv('ma-ev')||'').trim();                      if(!ev){setFieldErr('field-ma-ev','Screenshot required.'); ok=false;} else clrFieldErr('field-ma-ev');
    if(!ok)return;

    btnBusy('ma-submit-btn','Submitting…');
    API.submitMissingAP({hp:gv('ma-hp')||'',username:user,hostUsername:host,date:date,eventType:type,evidence:ev})
        .then(function(r){
            btnDone('ma-submit-btn','Submit Request');
            if(r&&r.success){toast('Missing AP request submitted!','success'); resetMA(); cooldown('ma-submit-btn','ma-cd-wrap','ma-cd-bar',300);}
            else toast((r&&r.error)||'Submission failed.','error');
        }).catch(function(e){btnDone('ma-submit-btn','Submit Request'); toast('Error: '+e.message,'error');});
}