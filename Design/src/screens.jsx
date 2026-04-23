// Active call panel + screen-pop overlay + case intake + scheduling + events

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

// ========== INCOMING-CALL SCREEN-POP ==========
function ScreenPop({open, onAnswer, onDismiss}) {
  const [counter, setCounter] = useStateC(3);
  useEffectC(() => {
    if (!open) { setCounter(3); return; }
    const t = setTimeout(() => setCounter(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [open, counter]);
  if (!open) return null;
  const m = PERSONAS.complex;
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(20,16,25,0.48)', backdropFilter:'blur(8px)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'80px 20px'}}>
      <div style={{width:560, background:'#fff', borderRadius:24, boxShadow:'var(--wc-shadow-lg)', overflow:'hidden', animation:'wcPopIn .28s ease-out'}}>
        <div style={{padding:'16px 22px', background:'linear-gradient(90deg, var(--wc-brand-500), var(--wc-brand-400))', color:'#fff', display:'flex', alignItems:'center', gap:10}}>
          <Icon.phoneIn size={18} color="#fff" stroke={2.2}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:15}}>Incoming call · Five9</div>
            <div style={{fontSize:12, opacity:0.9}}>ANI matched in <strong>{3-counter}.{Math.floor(Math.random()*9)}s</strong> · IVR: {INBOUND_CALL.ivrPath}</div>
          </div>
          <div style={{fontFamily:'Azeret Mono, monospace', fontSize:12, opacity:0.9}}>Queue {INBOUND_CALL.queueWait}</div>
        </div>
        <div style={{padding:'22px 24px', display:'flex', gap:18, alignItems:'center'}}>
          <Avatar initials={m.initials} size={72} tone="brand"/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:20}}>{m.name}</div>
            <div style={{fontSize:13, color:'var(--wc-base-500)', marginTop:2}}>{m.age} · {m.plan} · {m.language}</div>
            <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
              <Badge tone="error" size="sm" dot>{m.riskTier}</Badge>
              <Badge tone="success" size="sm" dot>Consent on file</Badge>
              <Badge tone="info" size="sm">3 active cases</Badge>
            </div>
          </div>
        </div>
        <div style={{padding:'0 24px 16px'}}>
          <div style={{padding:14, background:'var(--wc-base-50)', borderRadius:12, display:'flex', gap:12, alignItems:'flex-start'}}>
            <Icon.alert size={16} color="var(--wc-brand-500)" stroke={2}/>
            <div style={{flex:1, fontSize:13, color:'var(--wc-base-700)', lineHeight:1.55}}>
              <strong>Recent context:</strong> {INBOUND_CALL.recentContext}. Food insecurity case (CS-8841) — Freestore pickup confirmed for Thu. Caller typically calls re: rides + pharmacy bundles.
            </div>
          </div>
        </div>
        <div style={{padding:'0 24px 22px', display:'flex', gap:10}}>
          <Btn variant="secondary" size="lg" style={{flex:1}} onClick={onDismiss}>Send to voicemail</Btn>
          <Btn variant="brand" size="lg" style={{flex:2}} leading={<Icon.phone size={16} color="#fff"/>} onClick={onAnswer}>Answer · Open profile</Btn>
        </div>
      </div>
    </div>
  );
}

// ========== ACTIVE CALL DOCK (persistent bottom bar) ==========
function ActiveCallDock({active, onEnd, onOpenNotes, notesOpen}) {
  const [sec, setSec] = useStateC(0);
  const [muted, setMuted] = useStateC(false);
  const [paused, setPaused] = useStateC(false);
  useEffectC(() => {
    if (!active) { setSec(0); return; }
    if (paused) return;
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [active, paused]);
  if (!active) return null;

  const mm = String(Math.floor(sec/60)).padStart(2,'0');
  const ss = String(sec%60).padStart(2,'0');
  // CPT thresholds: 99441 = 5–10 min, 99442 = 11–20, 99443 = 21–30
  let cpt = '—', tone='info', pct=0, label='Not yet billable';
  if (sec >= 5*60 && sec < 11*60) { cpt='99441'; tone='info'; pct=(sec-0)/(11*60)*100; label='Billable · 99441 (5–10m)'; }
  else if (sec >= 11*60 && sec < 21*60) { cpt='99442'; tone='warning'; pct=(sec-11*60)/(10*60)*100; label='Billable · 99442 (11–20m)'; }
  else if (sec >= 21*60) { cpt='99443'; tone='error'; pct=100; label='Billable · 99443 (21–30m)'; }
  else pct = sec/(5*60)*100;

  return (
    <div style={{position:'fixed', bottom:16, left:88, right:16, zIndex:40, background:'var(--wc-base-700)', color:'#fff', borderRadius:20, padding:'12px 18px', display:'flex', alignItems:'center', gap:16, boxShadow:'var(--wc-shadow-lg)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{width:10, height:10, borderRadius:'50%', background:'var(--wc-success-500)', boxShadow:'0 0 0 0 rgba(16,185,129,0.7)', animation:'wcPulse 1.6s infinite'}}/>
        <span style={{fontSize:12, fontWeight:600, opacity:0.8}}>Five9 · Live</span>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10, borderLeft:'1px solid rgba(255,255,255,0.2)', paddingLeft:14}}>
        <Avatar initials="DA" size={32} tone="brand"/>
        <div>
          <div style={{fontSize:13, fontWeight:700, fontFamily:'Inter'}}>Dolores M. Alvarez</div>
          <div style={{fontSize:11, opacity:0.7}}>{INBOUND_CALL.ani} · Spanish</div>
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10, borderLeft:'1px solid rgba(255,255,255,0.2)', paddingLeft:14}}>
        <Icon.timer size={16} color="#fff"/>
        <span style={{fontFamily:'Azeret Mono, monospace', fontSize:18, fontWeight:600}}>{mm}:{ss}</span>
      </div>
      <div style={{flex:1, display:'flex', alignItems:'center', gap:12, borderLeft:'1px solid rgba(255,255,255,0.2)', paddingLeft:14, minWidth:0}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
            <span style={{fontSize:11, opacity:0.85}}>{label}</span>
            <span style={{fontSize:11, fontFamily:'Azeret Mono, monospace', opacity:0.85}}>CPT {cpt}</span>
          </div>
          <div style={{height:6, borderRadius:3, background:'rgba(255,255,255,0.12)', overflow:'hidden'}}>
            <div style={{height:'100%', width:`${Math.min(100,pct)}%`, background: tone==='error'?'var(--wc-error-500)':tone==='warning'?'var(--wc-warning-500)':'var(--wc-info-500)', transition:'width .5s, background .3s'}}/>
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:6, alignItems:'center'}}>
        <CallIconBtn active={muted} onClick={()=>setMuted(!muted)} Icon={muted?Icon.micOff:Icon.mic} title="Mute"/>
        <CallIconBtn active={paused} onClick={()=>setPaused(!paused)} Icon={paused?Icon.play:Icon.pause} title="Hold"/>
        <CallIconBtn active={notesOpen} onClick={onOpenNotes} Icon={Icon.file} title="Notes"/>
        <Btn variant="danger" size="sm" onClick={onEnd} leading={<Icon.x size={14} color="#fff"/>}>End call</Btn>
      </div>
    </div>
  );
}
function CallIconBtn({active, onClick, Icon: IconC, title}) {
  return (
    <button onClick={onClick} title={title} style={{width:38, height:38, borderRadius:12, border:0, cursor:'pointer', background: active?'var(--wc-brand-500)':'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center'}}>
      <IconC size={16} color="#fff"/>
    </button>
  );
}

// ========== CALL NOTES SIDE PANEL ==========
function CallNotesPanel({open, onClose}) {
  const [text, setText] = useStateC('Caller sounds well. Confirmed Thu Freestore pickup.\n\nReports mild SOB after walking to mailbox — advised PCP same-day if persistent.\n\n');
  const [outcome, setOutcome] = useStateC('resolved');
  const [saved, setSaved] = useStateC(true);
  useEffectC(() => {
    if (!open) return;
    setSaved(false);
    const t = setTimeout(()=>setSaved(true), 900);
    return ()=>clearTimeout(t);
  }, [text, open]);
  if (!open) return null;
  return (
    <aside style={{position:'fixed', top:60, right:0, bottom:0, width:420, background:'#fff', borderLeft:'1px solid var(--wc-base-200)', boxShadow:'var(--wc-shadow-lg)', zIndex:30, display:'flex', flexDirection:'column'}}>
      <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--wc-base-200)'}}>
        <div>
          <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:15}}>Interaction notes</div>
          <div style={{fontSize:12, color:'var(--wc-base-500)', display:'flex', alignItems:'center', gap:6, marginTop:2}}>
            {saved ? <><Icon.check size={12} color="var(--wc-success-700)"/> Saved just now</> : <>Saving…</>}
          </div>
        </div>
        <button onClick={onClose} style={{background:'transparent', border:0, cursor:'pointer'}}><Icon.x size={18} color="var(--wc-base-600)"/></button>
      </div>
      <div style={{padding:18, display:'flex', flexDirection:'column', gap:14, overflowY:'auto', flex:1}}>
        <Field label="Topic" hint="Predicted from recent case">
          <Select value="food-insecurity" options={[{value:'food-insecurity', label:'Food insecurity follow-up'},{value:'rx', label:'Prescription / pharmacy'},{value:'ride', label:'Ride / transportation'},{value:'general', label:'General check-in'}]}/>
        </Field>
        <Field label="Notes">
          <Textarea rows={10} value={text} onChange={setText}/>
        </Field>
        <Field label="Outcome">
          <Select value={outcome} onChange={setOutcome} options={[{value:'resolved',label:'Resolved'},{value:'followup',label:'Follow-up scheduled'},{value:'escalated',label:'Escalated to provider'},{value:'voicemail',label:'Left voicemail'}]}/>
        </Field>
        <div style={{padding:12, background:'var(--wc-info-100)', borderRadius:12, display:'flex', gap:10}}>
          <Icon.link size={14} color="var(--wc-info-700)"/>
          <div style={{fontSize:12, color:'var(--wc-info-700)', lineHeight:1.5}}>
            This interaction will auto-link to <strong>CS-8841</strong> (Food insecurity) and append to Dolores' timeline when the call ends.
          </div>
        </div>
      </div>
      <div style={{padding:'12px 18px', borderTop:'1px solid var(--wc-base-200)', display:'flex', gap:8, background:'#fff'}}>
        <Btn variant="secondary" size="md" style={{flex:1}}>Send SMS follow-up</Btn>
        <Btn variant="primary" size="md" style={{flex:1}}>Save & close</Btn>
      </div>
    </aside>
  );
}

// ========== CASE INTAKE MODAL ==========
function CaseIntakeModal({open, onClose, persona}) {
  const m = PERSONAS[persona];
  const [type, setType] = useStateC('sdoh');
  const [title, setTitle] = useStateC('');
  const [priority, setPriority] = useStateC('med');
  const [sla, setSla] = useStateC('48h');
  const [notes, setNotes] = useStateC('');
  if (!open) return null;
  return (
    <ModalShell onClose={onClose} title="Create case" subtitle={`For ${m.name} · ${m.planId}`}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Field label="Case type" required>
          <Select value={type} onChange={setType} options={[
            {value:'sdoh', label:'SDoH referral'},
            {value:'clinical', label:'Clinical'},
            {value:'outreach', label:'Outreach'},
            {value:'events', label:'Events / RSVP'},
            {value:'pharmacy', label:'Pharmacy (MediCircle)'},
          ]}/>
        </Field>
        <Field label="Priority" required>
          <div style={{display:'flex', gap:6}}>
            {[['low','Low','info'],['med','Med','warning'],['high','High','error']].map(([v,l,t]) => (
              <Chip key={v} selected={priority===v} onClick={()=>setPriority(v)}>{l}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Title" required>
          <Input value={title} onChange={setTitle} placeholder="Short summary of the case…"/>
        </Field>
        <Field label="SLA target">
          <Select value={sla} onChange={setSla} options={['24h','48h','72h','1 week']}/>
        </Field>
      </div>
      <div style={{marginTop:14}}>
        <Field label="Notes / context">
          <Textarea rows={4} value={notes} onChange={setNotes} placeholder="What prompted this case? Member context, referring system, etc."/>
        </Field>
      </div>
      <div style={{marginTop:14, padding:14, background:'var(--wc-info-100)', borderRadius:12, display:'flex', alignItems:'flex-start', gap:10}}>
        <Icon.shield size={16} color="var(--wc-info-700)"/>
        <div style={{fontSize:12, color:'var(--wc-info-700)', lineHeight:1.5}}>
          <strong>Duplicate check:</strong> No open cases match this type+member in the last 30 days. Safe to create.
        </div>
      </div>
      <div style={{marginTop:20, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:12, color:'var(--wc-base-500)'}}>Will auto-assign by geo + language rules</div>
        <div style={{display:'flex', gap:8}}>
          <Btn variant="secondary" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" disabled={!title}>Create case</Btn>
        </div>
      </div>
    </ModalShell>
  );
}

// ========== SCHEDULE MODAL ==========
function ScheduleModal({open, onClose, persona}) {
  const m = PERSONAS[persona];
  const [day, setDay] = useStateC(2);
  const [slot, setSlot] = useStateC(null);
  const [modality, setModality] = useStateC('tele');
  if (!open) return null;
  const days = ['Mon Apr 21','Tue Apr 22','Wed Apr 23','Thu Apr 24','Fri Apr 25'];
  const slots = ['9:00','9:30','10:00','10:30','11:00','1:00','1:30','2:00','3:00','3:30'];
  const taken = ['10:30','1:30','3:00'];
  return (
    <ModalShell onClose={onClose} title="Schedule appointment" subtitle={`On behalf of ${m.name}`}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14}}>
        <Field label="Modality" required>
          <div style={{display:'flex', gap:6}}>
            <Chip selected={modality==='tele'} onClick={()=>setModality('tele')}>Telehealth</Chip>
            <Chip selected={modality==='in'} onClick={()=>setModality('in')}>In-person</Chip>
            <Chip selected={modality==='phone'} onClick={()=>setModality('phone')}>Phone</Chip>
          </div>
        </Field>
        <Field label="Visit type" required>
          <Select options={['Follow-up check-in','Action plan review','Annual wellness visit','New patient intake']}/>
        </Field>
      </div>
      <Field label="Provider">
        <Select options={['Dr. Nisha Patel — PCP','Dr. Omar Reyes — Cardiology','Alicia Park — Case Manager']}/>
      </Field>
      <div style={{marginTop:14}}>
        <div style={{fontSize:12, fontWeight:600, color:'var(--wc-base-700)', marginBottom:8, fontFamily:'Inter'}}>Pick a time</div>
        <div style={{display:'flex', gap:6, marginBottom:10}}>
          {days.map((d,i) => <Chip key={d} selected={day===i} onClick={()=>{setDay(i); setSlot(null);}}>{d}</Chip>)}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6}}>
          {slots.map(s => {
            const isTaken = taken.includes(s);
            return (
              <button key={s} disabled={isTaken} onClick={()=>setSlot(s)} style={{
                height:38, border:'1px solid var(--wc-base-200)', borderRadius:10, cursor: isTaken?'not-allowed':'pointer',
                background: slot===s?'var(--wc-base-700)': isTaken?'var(--wc-base-50)':'#fff',
                color: slot===s?'#fff': isTaken?'var(--wc-base-400)':'var(--wc-base-700)',
                fontFamily:'Inter', fontSize:13, fontWeight:600,
              }}>{s}{isTaken && <span style={{display:'block',fontSize:9,fontWeight:400}}>taken</span>}</button>
            );
          })}
        </div>
      </div>
      <div style={{marginTop:14, padding:12, background:'var(--wc-success-100)', borderRadius:12, display:'flex', alignItems:'center', gap:10}}>
        <Icon.check size={16} color="var(--wc-success-700)"/>
        <div style={{fontSize:12, color:'var(--wc-success-700)'}}>
          <strong>Eligibility verified</strong> · In-network · Copay $0 · Verified {new Date().toLocaleDateString()}
        </div>
      </div>
      <div style={{marginTop:20, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:12, color:'var(--wc-base-500)'}}>Reminders: SMS 48h + 2h · Email 24h</div>
        <div style={{display:'flex', gap:8}}>
          <Btn variant="secondary" size="md" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="md" disabled={!slot}>Book {slot && `· ${days[day]} ${slot}`}</Btn>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({onClose, title, subtitle, children}) {
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(20,16,25,0.48)', backdropFilter:'blur(6px)', zIndex:150, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'80px 20px', overflowY:'auto'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:640, maxWidth:'100%', background:'#fff', borderRadius:24, boxShadow:'var(--wc-shadow-lg)', animation:'wcPopIn .2s ease-out'}}>
        <div style={{padding:'18px 24px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--wc-base-200)'}}>
          <div>
            <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:18}}>{title}</div>
            {subtitle && <div style={{fontSize:12, color:'var(--wc-base-500)', marginTop:2}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:'transparent', border:0, cursor:'pointer'}}><Icon.x size={20} color="var(--wc-base-600)"/></button>
        </div>
        <div style={{padding:'20px 24px 22px'}}>{children}</div>
      </div>
    </div>
  );
}

// ========== EVENTS PAGE ==========
function EventsPage() {
  const rows = [
    {id:'E101', title:'Walking group — Eden Park loop', when:'Thu Apr 22 · 10:00 AM', where:'Eden Park', facilitator:'Maria López', circle:'Avondale', rsvps:14, cap:20, predict:'High'},
    {id:'E102', title:'Diabetes-friendly potluck', when:'Sat Apr 24 · 6:00 PM', where:'Avondale CC', facilitator:'Maria López', circle:'Avondale', rsvps:8, cap:18, predict:'Med'},
    {id:'E103', title:'Coffee & Conversation', when:'Sat Apr 24 · 9:30 AM', where:'Awakenings Café', facilitator:'James Oduya', circle:'Hyde Park', rsvps:11, cap:15, predict:'High'},
    {id:'E104', title:'Virtual townhall: Medicare AEP', when:'Wed Apr 28 · 4:00 PM', where:'Zoom', facilitator:'James Oduya', circle:'All', rsvps:42, cap:200, predict:'Low'},
    {id:'E105', title:'Intro meeting · new members', when:'Fri Apr 30 · 11:00 AM', where:'Avondale CC', facilitator:'Maria López', circle:'Avondale', rsvps:5, cap:12, predict:'Med'},
  ];
  const [selected, setSelected] = useStateC(new Set());
  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  return (
    <div style={{padding:'28px 32px', maxWidth:1280, margin:'0 auto'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18}}>
        <div>
          <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:28, margin:0}}>Events</h1>
          <div style={{fontSize:14, color:'var(--wc-base-500)', marginTop:4}}>{rows.length} upcoming · 3 circles</div>
        </div>
        <Btn variant="primary" size="md" leading={<Icon.plus size={15} color="#fff"/>}>New event</Btn>
      </div>
      <Card pad={0}>
        <div style={{padding:'14px 18px', borderBottom:'1px solid var(--wc-base-200)', display:'flex', alignItems:'center', gap:10}}>
          <Chip selected>All events</Chip>
          <Chip>In-person</Chip>
          <Chip>Virtual</Chip>
          <Chip>This week</Chip>
          <div style={{flex:1}}/>
          {selected.size > 0 && (
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <span style={{fontSize:13, color:'var(--wc-base-500)'}}>{selected.size} selected</span>
              <Btn size="sm" variant="secondary" leading={<Icon.chat size={14} color="currentColor"/>}>Bulk SMS</Btn>
              <Btn size="sm" variant="secondary">Export</Btn>
            </div>
          )}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'28px 2fr 1fr 1fr 120px 120px 80px', gap:0}}>
          <HeadCell></HeadCell><HeadCell>Event</HeadCell><HeadCell>When / Where</HeadCell><HeadCell>Facilitator</HeadCell><HeadCell>RSVPs</HeadCell><HeadCell>Prediction</HeadCell><HeadCell></HeadCell>
          {rows.map(r => (
            <React.Fragment key={r.id}>
              <BodyCell><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)}/></BodyCell>
              <BodyCell>
                <div style={{fontWeight:600, fontSize:14}}>{r.title}</div>
                <div style={{fontSize:12, color:'var(--wc-base-500)', fontFamily:'Azeret Mono, monospace'}}>{r.id} · {r.circle}</div>
              </BodyCell>
              <BodyCell>
                <div style={{fontSize:13}}>{r.when}</div>
                <div style={{fontSize:12, color:'var(--wc-base-500)'}}>{r.where}</div>
              </BodyCell>
              <BodyCell>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <Avatar initials={r.facilitator.split(' ').map(s=>s[0]).join('')} size={26} tone="gold"/>
                  <span style={{fontSize:13}}>{r.facilitator}</span>
                </div>
              </BodyCell>
              <BodyCell>
                <div style={{fontSize:13, fontWeight:600}}>{r.rsvps} <span style={{color:'var(--wc-base-500)', fontWeight:400}}>/ {r.cap}</span></div>
                <div style={{height:4, background:'var(--wc-base-100)', borderRadius:2, marginTop:4, overflow:'hidden'}}>
                  <div style={{height:'100%', width:`${r.rsvps/r.cap*100}%`, background:'var(--wc-brand-500)'}}/>
                </div>
              </BodyCell>
              <BodyCell><Badge tone={r.predict==='High'?'success':r.predict==='Med'?'gold':'neutral'} size="sm">{r.predict}</Badge></BodyCell>
              <BodyCell><Btn size="sm" variant="tertiary" trailing={<Icon.chevR size={12} color="currentColor"/>}>Open</Btn></BodyCell>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}
function HeadCell({children}) { return <div style={{padding:'10px 14px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--wc-base-500)', background:'var(--wc-base-50)', borderBottom:'1px solid var(--wc-base-200)'}}>{children}</div>; }
function BodyCell({children}) { return <div style={{padding:'14px', borderBottom:'1px solid var(--wc-base-100)', display:'flex', alignItems:'center', fontSize:13, color:'var(--wc-base-700)', fontFamily:'Inter'}}><div style={{width:'100%'}}>{children}</div></div>; }

// ========== QUEUE (Home) ==========
function QueuePage({onOpenMember, tweaks}) {
  return (
    <div style={{padding:'28px 32px', maxWidth:1280, margin:'0 auto'}}>
      <div style={{marginBottom:18}}>
        <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:28, margin:0}}>My queue</h1>
        <div style={{fontSize:14, color:'var(--wc-base-500)', marginTop:4}}>{QUEUE.length} open cases · 1 overdue · SLA health 94%</div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18}}>
        <KPI label="Open" value={QUEUE.length} delta="+2 today"/>
        <KPI label="Overdue SLA" value="1" delta="CS-9012" tone="error"/>
        <KPI label="High priority (≥80)" value={QUEUE.filter(q=>q.priority>=80).length} tone="warning"/>
        <KPI label="Avg age" value="5.2d"/>
      </div>
      <Card pad={0}>
        <div style={{padding:'14px 18px', borderBottom:'1px solid var(--wc-base-200)', display:'flex', gap:8}}>
          <Chip selected>All</Chip>
          <Chip>SDoH</Chip>
          <Chip>Clinical</Chip>
          <Chip>Outreach</Chip>
        </div>
        <div>
          {QUEUE.sort((a,b)=>b.priority-a.priority).map(q => (
            <div key={q.id} onClick={()=>q.memberKey && onOpenMember(q.memberKey)} style={{display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:'1px solid var(--wc-base-100)', cursor: q.memberKey?'pointer':'default'}}>
              <PriorityChip priority={q.priority} tone={q.priority>=80?'error':q.priority>=60?'warning':'info'} style={tweaks.priorityStyle}/>
              <Avatar initials={q.member.split(' ').map(s=>s[0]).slice(0,2).join('')} size={36} tone="brand"/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:14, fontWeight:600}}>{q.title}</div>
                <div style={{fontSize:12, color:'var(--wc-base-500)', display:'flex', gap:10}}>
                  <span style={{fontFamily:'Azeret Mono, monospace'}}>{q.id}</span>
                  <span>· {q.member}</span>
                  <span>· {q.type}</span>
                  <span>· {q.age} old</span>
                </div>
              </div>
              {q.flag && <Badge tone={q.flag==='Overdue'?'error':q.flag==='High'?'warning':'info'} size="sm">{q.flag}</Badge>}
              <Badge tone={q.sla.includes('Overdue')?'error':q.sla.includes('left')?'warning':'success'} size="sm">{q.sla}</Badge>
              <Icon.chevR size={16} color="var(--wc-base-500)"/>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
function KPI({label, value, delta, tone='neutral'}) {
  const t = tone==='error'?{c:'var(--wc-error-700)'}:tone==='warning'?{c:'#8a5c00'}:{c:'var(--wc-base-700)'};
  return (
    <Card pad={16}>
      <div style={{fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--wc-base-500)'}}>{label}</div>
      <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:28, margin:'6px 0 2px', color:t.c}}>{value}</div>
      {delta && <div style={{fontSize:12, color:'var(--wc-base-500)'}}>{delta}</div>}
    </Card>
  );
}

// ========== BILLING PAGE (simple) ==========
function BillingPage() {
  const rows = [
    {id:'TI-92014', member:'Dolores M. Alvarez', cpt:'99442', time:'14:32', provider:'Alicia Park', date:'Apr 18', status:'Queued', amount:'$38.14'},
    {id:'TI-92011', member:'Robert J. Chen', cpt:'99441', time:'6:47', provider:'Jordan Lee', date:'Apr 18', status:'Synced', amount:'$22.05'},
    {id:'TI-92008', member:'Harold Grieves', cpt:'99443', time:'23:11', provider:'Dr. Patel', date:'Apr 17', status:'Missing fields', amount:'—'},
    {id:'TI-92001', member:'Linnea O\'Brien', cpt:'99442', time:'12:05', provider:'Alicia Park', date:'Apr 17', status:'Synced', amount:'$38.14'},
    {id:'TI-91996', member:'Dolores M. Alvarez', cpt:'99441', time:'4:03', provider:'Alicia Park', date:'Apr 13', status:'Synced', amount:'$22.05'},
  ];
  return (
    <div style={{padding:'28px 32px', maxWidth:1280, margin:'0 auto'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18}}>
        <div>
          <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:28, margin:0}}>Billing & time tracking</h1>
          <div style={{fontSize:14, color:'var(--wc-base-500)', marginTop:4}}>Auto-synced with Candid/Bridge · last sync 3 min ago</div>
        </div>
        <Btn variant="primary" size="md">Export batch · CSV</Btn>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18}}>
        <KPI label="This week" value="$4,284"/>
        <KPI label="Queued to sync" value="12"/>
        <KPI label="Missing fields" value="3" tone="error"/>
        <KPI label="CPT 99443 (long)" value="7"/>
      </div>
      <Card pad={0}>
        <div style={{display:'grid', gridTemplateColumns:'140px 1.4fr 100px 120px 1fr 120px 140px 80px', gap:0}}>
          <HeadCell>Interaction</HeadCell><HeadCell>Member</HeadCell><HeadCell>CPT</HeadCell><HeadCell>Time</HeadCell><HeadCell>Provider</HeadCell><HeadCell>Date</HeadCell><HeadCell>Sync status</HeadCell><HeadCell>Amt</HeadCell>
          {rows.map(r => (
            <React.Fragment key={r.id}>
              <BodyCell><span style={{fontFamily:'Azeret Mono, monospace', fontSize:12}}>{r.id}</span></BodyCell>
              <BodyCell>{r.member}</BodyCell>
              <BodyCell><Badge tone="neutral" size="sm" style={{fontFamily:'Azeret Mono, monospace'}}>{r.cpt}</Badge></BodyCell>
              <BodyCell><span style={{fontFamily:'Azeret Mono, monospace'}}>{r.time}</span></BodyCell>
              <BodyCell>{r.provider}</BodyCell>
              <BodyCell>{r.date}</BodyCell>
              <BodyCell><Badge tone={r.status==='Synced'?'success':r.status==='Queued'?'info':'error'} size="sm" dot>{r.status}</Badge></BodyCell>
              <BodyCell style={{fontWeight:600}}>{r.amount}</BodyCell>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, {ScreenPop, ActiveCallDock, CallNotesPanel, CaseIntakeModal, ScheduleModal, EventsPage, QueuePage, BillingPage});
