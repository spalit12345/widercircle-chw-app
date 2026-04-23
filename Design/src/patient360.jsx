// Patient 360 — the hero page. Sticky member header + tabbed body + activity feed.
const { useState: useStateP360, useMemo: useMemoP360 } = React;

function Patient360({persona, tweaks, onStartCall}) {
  const m = PERSONAS[persona];
  const activity = ACTIVITY[persona] || [];
  const cases = CASES[persona] || [];
  const events = EVENTS[persona] || [];
  const [tab, setTab] = useStateP360('overview');

  const leftLayout = tweaks.headerLayout === 'left';

  return (
    <div style={{display:'flex', gap:0, height:'calc(100vh - 60px)', background:'var(--wc-base-50)'}}>
      {leftLayout && <MemberSidePanel member={m} onStartCall={onStartCall}/>}
      <div style={{flex:1, overflowY:'auto', minWidth:0}}>
        {!leftLayout && <MemberTopHeader member={m} onStartCall={onStartCall}/>}
        <div style={{padding:'20px 28px 60px', maxWidth: 1200, margin:'0 auto'}}>
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              {id:'overview', label:'Overview'},
              {id:'activity', label:'Activity', count: activity.length},
              {id:'cases', label:'Cases', count: cases.length},
              {id:'clinical', label:'Clinical'},
              {id:'sdoh', label:'SDoH & Social'},
              {id:'events', label:'Events', count: events.length},
            ]}
          />
          <div style={{marginTop:20}}>
            {tab==='overview' && <OverviewTab member={m} activity={activity} cases={cases} events={events} tweaks={tweaks} onStartCall={onStartCall}/>}
            {tab==='activity' && <ActivityTab activity={activity} tweaks={tweaks}/>}
            {tab==='cases' && <CasesTab cases={cases} tweaks={tweaks}/>}
            {tab==='clinical' && <ClinicalTab member={m}/>}
            {tab==='sdoh' && <SDoHTab member={m}/>}
            {tab==='events' && <EventsTab events={events}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- LEFT STICKY PANEL ----------------
function MemberSidePanel({member: m, onStartCall}) {
  return (
    <aside style={{width:320, background:'#fff', borderRight:'1px solid var(--wc-base-200)', padding:'24px 20px', overflowY:'auto', position:'sticky', top:60, alignSelf:'flex-start', maxHeight:'calc(100vh - 60px)'}}>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', paddingBottom:16, borderBottom:'1px solid var(--wc-base-200)'}}>
        <Avatar initials={m.initials} size={72} tone="brand"/>
        <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:20, lineHeight:1.2, margin:'12px 0 2px'}}>{m.name}</h1>
        <div style={{fontSize:12, color:'var(--wc-base-500)', fontFamily:'Inter'}}>{m.pronouns} · {m.age} · DOB {m.dob}</div>
        <div style={{display:'flex', gap:6, marginTop:10, flexWrap:'wrap', justifyContent:'center'}}>
          <RiskBadge tier={m.riskTier} score={m.riskScore}/>
          {m.consentOnFile && <Badge tone="success" size="sm" dot>Consent on file</Badge>}
          {m.askClaireAligned && <Badge tone="info" size="sm">Ask Claire aligned</Badge>}
        </div>
      </div>

      <div style={{padding:'16px 0', display:'flex', gap:8}}>
        <Btn variant="brand" size="md" leading={<Icon.phone size={15} color="#fff"/>} style={{flex:1}} onClick={onStartCall}>Call</Btn>
        <Btn variant="secondary" size="md" leading={<Icon.chat size={15} color="currentColor"/>} style={{flex:1}}>SMS</Btn>
      </div>

      <KeyInfoRow label="Plan" value={m.plan} mono={m.planId}/>
      <KeyInfoRow label="Language" value={m.language}/>
      <KeyInfoRow label="Phone" value={m.phone}/>
      <KeyInfoRow label="Location" value={`${m.city} · ${m.zip}`}/>
      <KeyInfoRow label="Preferred contact" value={m.contactPref}/>
      <KeyInfoRow label="Circle" value={m.circle}/>
      {m.facilitator && <KeyInfoRow label="Facilitator" value={m.facilitator}/>}

      <div style={{marginTop:18, padding:14, background:'var(--wc-base-50)', borderRadius:15}}>
        <div style={{fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--wc-base-500)', marginBottom:8}}>Quick context</div>
        <div style={{fontSize:13, color:'var(--wc-base-700)', marginBottom:4}}><strong>Last contact:</strong> {m.lastContact}</div>
        <div style={{fontSize:13, color:'var(--wc-base-700)', marginBottom:4}}><strong>Active cases:</strong> {m.activeCases}{m.overdueTasks>0 && <span style={{color:'var(--wc-error-700)'}}> · {m.overdueTasks} overdue</span>}</div>
        <div style={{fontSize:13, color:'var(--wc-base-700)'}}><strong>Next event:</strong> {m.nextEvent}</div>
      </div>
    </aside>
  );
}

function KeyInfoRow({label, value, mono}) {
  return (
    <div style={{padding:'10px 0', borderBottom:'1px solid var(--wc-base-100)'}}>
      <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--wc-base-500)', fontFamily:'Inter'}}>{label}</div>
      <div style={{fontSize:14, color:'var(--wc-base-700)', fontWeight:500, marginTop:2, fontFamily:'Inter'}}>{value}</div>
      {mono && <div style={{fontFamily:'Azeret Mono, monospace', fontSize:11, color:'var(--wc-base-500)', marginTop:2}}>{mono}</div>}
    </div>
  );
}

function RiskBadge({tier, score}) {
  const isHigh = /4|High/i.test(tier);
  const tone = isHigh ? 'error' : /3|Elevated/i.test(tier) ? 'warning' : 'info';
  return <Badge tone={tone} size="sm" dot>{tier}</Badge>;
}

// ---------------- TOP STICKY HEADER ----------------
function MemberTopHeader({member: m, onStartCall}) {
  return (
    <header style={{background:'#fff', borderBottom:'1px solid var(--wc-base-200)', padding:'20px 28px', position:'sticky', top:60, zIndex:10}}>
      <div style={{maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', gap:20}}>
        <Avatar initials={m.initials} size={64} tone="brand"/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
            <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:22, margin:0}}>{m.name}</h1>
            <span style={{fontSize:13, color:'var(--wc-base-500)'}}>{m.pronouns} · {m.age} · {m.dob}</span>
            <RiskBadge tier={m.riskTier} score={m.riskScore}/>
            {m.consentOnFile && <Badge tone="success" size="sm" dot>Consent on file</Badge>}
            {m.askClaireAligned && <Badge tone="info" size="sm">Ask Claire aligned</Badge>}
          </div>
          <div style={{display:'flex', gap:20, marginTop:6, fontSize:13, color:'var(--wc-base-600)', fontFamily:'Inter', flexWrap:'wrap'}}>
            <span><strong style={{color:'var(--wc-base-700)'}}>{m.plan}</strong> · <span style={{fontFamily:'Azeret Mono, monospace', fontSize:11}}>{m.planId}</span></span>
            <span>{m.language}</span>
            <span>{m.phone}</span>
            <span>{m.city} · {m.zip}</span>
            <span>Pref: {m.contactPref}</span>
            <span>{m.circle}</span>
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <Btn variant="brand" size="md" leading={<Icon.phone size={15} color="#fff"/>} onClick={onStartCall}>Call</Btn>
          <Btn variant="secondary" size="md" leading={<Icon.chat size={15} color="currentColor"/>}>SMS</Btn>
          <Btn variant="secondary" size="md" leading={<Icon.calendar size={15} color="currentColor"/>}>Schedule</Btn>
          <Btn variant="secondary" size="md" leading={<Icon.plus size={15} color="currentColor"/>}>New case</Btn>
        </div>
      </div>
    </header>
  );
}

// ---------------- OVERVIEW TAB ----------------
function OverviewTab({member: m, activity, cases, events, tweaks, onStartCall}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 360px', gap:20}}>
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        {/* Attention-required strip */}
        {m.id==='complex' && (
          <Card pad={18} style={{borderColor:'var(--wc-error-300)', background:'linear-gradient(180deg, #FFFAF9 0%, #fff 40%)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
              <Icon.alert size={18} color="var(--wc-error-700)" stroke={2.2}/>
              <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:15, color:'var(--wc-error-700)'}}>Needs attention</div>
            </div>
            <ul style={{margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:8}}>
              <AttnRow text="Food-insecurity case SLA 18h — confirm Thu Freestore pickup" action="Call member"/>
              <AttnRow text="CHF weight log 5 days old — request follow-up check-in" action="Schedule"/>
              <AttnRow text="Action plan CHF-2026-04 due for provider sign-off" action="Route"/>
            </ul>
          </Card>
        )}
        {m.id==='prospective' && (
          <Card pad={18} style={{borderColor:'var(--wc-warning-300)', background:'linear-gradient(180deg, #FFFAEE 0%, #fff 40%)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
              <Icon.alert size={18} color="#8a5c00" stroke={2.2}/>
              <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:15, color:'#8a5c00'}}>New member — welcome outreach</div>
            </div>
            <div style={{fontSize:13, color:'var(--wc-base-700)', lineHeight:1.5, marginBottom:12}}>
              Arrived from April eligibility file. SDoH flag (housing instability, high) auto-detected. Assign to a CM, confirm contact preferences, and schedule an introductory call within 48 hours.
            </div>
            <div style={{display:'flex', gap:8}}>
              <Btn size="sm" variant="primary">Assign to me</Btn>
              <Btn size="sm" variant="secondary">Send welcome SMS</Btn>
            </div>
          </Card>
        )}

        {/* Active cases */}
        <SectionCard title="Active cases" action={<Btn size="sm" variant="tertiary" trailing={<Icon.chevR size={14} color="currentColor"/>}>View all</Btn>}>
          {cases.length === 0 ? <Empty>No active cases.</Empty> : (
            <div style={{display:'flex', flexDirection:'column', gap:1, background:'var(--wc-base-200)'}}>
              {cases.map(c => <CaseRow key={c.id} c={c} priorityStyle={tweaks.priorityStyle}/>)}
            </div>
          )}
        </SectionCard>

        {/* Recent activity preview */}
        <SectionCard title="Recent activity" action={<Btn size="sm" variant="tertiary" trailing={<Icon.chevR size={14} color="currentColor"/>}>See all</Btn>}>
          <div style={{padding:'4px 0'}}>
            <Timeline items={activity.slice(0,4)} density={tweaks.density}/>
          </div>
        </SectionCard>
      </div>

      {/* Right column — supporting context */}
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <SectionCard title="Key clinical">
          <div style={{display:'flex', flexWrap:'wrap', gap:6, padding:'4px 0'}}>
            {m.diagnoses.map(d => <Badge key={d} tone="neutral" size="md">{d}</Badge>)}
            {m.diagnoses.length===0 && <Empty>No diagnoses on file.</Empty>}
          </div>
        </SectionCard>

        <SectionCard title="SDoH flags">
          {m.sdoh.length===0 ? <Empty>No SDoH flags.</Empty> : (
            <div style={{display:'flex', flexDirection:'column', gap:10, padding:'4px 0'}}>
              {m.sdoh.map((s, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
                  <span style={{width:8, height:8, borderRadius:'50%', background: s.severity==='high'?'var(--wc-error-500)': s.severity==='med'?'var(--wc-warning-500)':'var(--wc-info-500)'}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600, color:'var(--wc-base-700)'}}>{s.flag}</div>
                    <div style={{fontSize:12, color:'var(--wc-base-500)'}}>since {s.since}</div>
                  </div>
                  <Badge tone={s.severity==='high'?'error':s.severity==='med'?'warning':'info'} size="sm">{s.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Upcoming events">
          {events.length===0 ? <Empty>No upcoming events.</Empty> : (
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {events.slice(0,3).map(e => <EventMiniCard key={e.id} e={e}/>)}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function AttnRow({text, action}) {
  return (
    <li style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'8px 0', borderTop:'1px solid var(--wc-error-100)'}}>
      <div style={{fontSize:13, color:'var(--wc-base-700)'}}>{text}</div>
      <Btn size="sm" variant="secondary">{action}</Btn>
    </li>
  );
}

function SectionCard({title, action, children}) {
  return (
    <Card pad={0}>
      <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--wc-base-200)'}}>
        <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:14}}>{title}</div>
        {action}
      </div>
      <div style={{padding:'12px 18px 16px'}}>{children}</div>
    </Card>
  );
}
function Empty({children}) { return <div style={{fontSize:13, color:'var(--wc-base-500)', padding:'8px 0'}}>{children}</div>; }

function CaseRow({c, priorityStyle='both'}) {
  const tone = c.priority >= 80 ? 'error' : c.priority >= 60 ? 'warning' : 'info';
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 4px', background:'#fff'}}>
      <PriorityChip priority={c.priority} tone={tone} style={priorityStyle}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:14, fontWeight:600, color:'var(--wc-base-700)'}}>{c.title}</div>
        <div style={{fontSize:12, color:'var(--wc-base-500)', display:'flex', gap:10, marginTop:2}}>
          <span style={{fontFamily:'Azeret Mono, monospace'}}>{c.id}</span>
          <span>· {c.type}</span>
          <span>· {c.age} old</span>
          <span>· Owner: {c.owner}</span>
        </div>
      </div>
      <Badge tone={c.sla.includes('left')?'warning':c.sla.includes('Overdue')?'error':'success'} size="sm">{c.sla}</Badge>
      <Badge tone="neutral" size="sm">{c.status}</Badge>
      <Icon.chevR size={16} color="var(--wc-base-500)"/>
    </div>
  );
}

function PriorityChip({priority, tone='info', style='both'}) {
  const toneMap = {error:{bg:'var(--wc-error-100)', fg:'var(--wc-error-700)'}, warning:{bg:'var(--wc-warning-100)', fg:'#8a5c00'}, info:{bg:'var(--wc-info-100)', fg:'var(--wc-info-700)'}};
  const t = toneMap[tone];
  if (style === 'score') {
    return <div style={{minWidth:36, height:36, padding:'0 8px', borderRadius:10, background:t.bg, color:t.fg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Azeret Mono, monospace', fontWeight:600, fontSize:13}}>{priority}</div>;
  }
  if (style === 'badge') {
    return <div style={{width:10, height:36, borderRadius:4, background:t.fg}}/>;
  }
  // both
  return (
    <div style={{display:'flex', alignItems:'center', gap:6}}>
      <div style={{width:6, height:36, borderRadius:3, background:t.fg}}/>
      <div style={{minWidth:28, padding:'3px 6px', borderRadius:8, background:t.bg, color:t.fg, fontFamily:'Azeret Mono, monospace', fontWeight:600, fontSize:12, textAlign:'center'}}>{priority}</div>
    </div>
  );
}

function EventMiniCard({e}) {
  return (
    <div style={{border:'1px solid var(--wc-base-200)', borderRadius:12, padding:12}}>
      <div style={{fontSize:13, fontWeight:600, color:'var(--wc-base-700)'}}>{e.title}</div>
      <div style={{fontSize:12, color:'var(--wc-base-500)', marginTop:4, display:'flex', gap:10, flexWrap:'wrap'}}>
        <span>{e.when}</span><span>· {e.where}</span>
      </div>
      <div style={{display:'flex', gap:6, marginTop:8, alignItems:'center'}}>
        {e.rsvp==='Yes' ? <Badge tone="success" size="sm" dot>RSVP'd</Badge> : <Badge tone="neutral" size="sm">Not RSVP'd</Badge>}
        <Badge tone="gold" size="sm">Predict: {e.predict}</Badge>
      </div>
    </div>
  );
}

// ---------------- ACTIVITY TAB ----------------
function ActivityTab({activity, tweaks}) {
  const [filter, setFilter] = useStateP360('all');
  const filtered = filter==='all' ? activity : activity.filter(a => a.channel===filter);

  const chips = [
    {id:'all', label:'All', count: activity.length},
    {id:'call', label:'Calls', count: activity.filter(a=>a.channel==='call').length},
    {id:'sms', label:'SMS', count: activity.filter(a=>a.channel==='sms').length},
    {id:'email', label:'Email', count: activity.filter(a=>a.channel==='email').length},
    {id:'event', label:'Events', count: activity.filter(a=>a.channel==='event').length},
    {id:'note', label:'Clinical notes', count: activity.filter(a=>a.channel==='note').length},
    {id:'case', label:'Case', count: activity.filter(a=>a.channel==='case').length},
  ];

  if (tweaks.feedMode === 'tabbed') {
    return (
      <div>
        <div style={{marginBottom:14}}>
          <Tabs variant="pill" active={filter} onChange={setFilter} tabs={chips.map(c=>({...c}))}/>
        </div>
        <Card pad={22}><Timeline items={filtered} density={tweaks.density}/></Card>
      </div>
    );
  }
  return (
    <Card pad={22}>
      <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:18}}>
        {chips.map(c => <Chip key={c.id} selected={filter===c.id} onClick={()=>setFilter(c.id)}>{c.label} · {c.count}</Chip>)}
      </div>
      <Timeline items={filtered} density={tweaks.density}/>
    </Card>
  );
}

function Timeline({items, density='comfortable'}) {
  const pad = density==='compact' ? '8px 0' : '14px 0';
  return (
    <div style={{position:'relative'}}>
      <div style={{position:'absolute', left:17, top:20, bottom:20, width:1, background:'var(--wc-base-200)'}}/>
      {items.map((a, i) => <TimelineRow key={a.id||i} a={a} pad={pad}/>)}
      {items.length===0 && <Empty>Nothing yet in this channel.</Empty>}
    </div>
  );
}
function TimelineRow({a, pad}) {
  return (
    <div style={{display:'flex', gap:14, padding:pad, position:'relative', alignItems:'flex-start'}}>
      <ChannelGlyph channel={a.channel} direction={a.direction} size={34}/>
      <div style={{flex:1, minWidth:0, paddingTop:2}}>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <div style={{fontSize:13, fontWeight:600, color:'var(--wc-base-700)'}}>{a.by}</div>
          {a.dur && <Badge tone="neutral" size="sm">{a.dur}</Badge>}
          {a.source && <Badge tone="info" size="sm">{a.source}</Badge>}
          {a.outcome && <Badge tone="success" size="sm" dot>{a.outcome}</Badge>}
          <div style={{flex:1}}/>
          <div style={{fontSize:12, color:'var(--wc-base-500)'}}>{a.when}</div>
        </div>
        {a.summary && <div style={{fontSize:14, color:'var(--wc-base-700)', marginTop:6, lineHeight:1.5}}>{a.summary}</div>}
        {a.text && (
          <div style={{marginTop:8, padding:'10px 14px', background: a.direction==='in'?'var(--wc-base-50)':'var(--wc-tint-100)', borderRadius:12, fontSize:14, color:'var(--wc-base-700)', maxWidth:'85%', marginLeft: a.direction==='out'?'auto':0}}>
            {a.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- CASES / CLINICAL / SDoH / EVENTS ----------------
function CasesTab({cases, tweaks}) {
  return (
    <Card pad={0}>
      <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--wc-base-200)'}}>
        <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:14}}>{cases.length} cases</div>
        <Btn size="sm" variant="primary" leading={<Icon.plus size={14} color="#fff"/>}>New case</Btn>
      </div>
      {cases.length===0 ? <div style={{padding:20}}><Empty>No cases yet.</Empty></div> :
        <div style={{display:'flex', flexDirection:'column', gap:1, background:'var(--wc-base-200)'}}>
          {cases.map(c => <div key={c.id} style={{padding:'14px 18px', background:'#fff'}}><CaseRow c={c} priorityStyle={tweaks.priorityStyle}/></div>)}
        </div>
      }
    </Card>
  );
}
function ClinicalTab({member: m}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <SectionCard title="Active diagnoses">
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {m.diagnoses.map(d => (
            <div key={d} style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--wc-base-100)'}}>
              <div style={{fontSize:14, fontWeight:500, color:'var(--wc-base-700)'}}>{d}</div>
              <Badge tone="neutral" size="sm">Healthie</Badge>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Medications" action={<Btn size="sm" variant="tertiary">See all</Btn>}>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {['Metformin 500mg BID','Lasix 40mg daily','Lisinopril 10mg daily','Sertraline 50mg daily'].map(med => (
            <div key={med} style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--wc-base-100)', fontSize:14, color:'var(--wc-base-700)'}}>
              <span>{med}</span>
              <Badge tone="success" size="sm" dot>Active</Badge>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Vitals (last 30d)">
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          <VitalTile label="Weight" value="184 lb" delta="+2 lb"/>
          <VitalTile label="BP avg" value="138/86" delta="stable"/>
          <VitalTile label="HR avg" value="78 bpm" delta="-3"/>
          <VitalTile label="Glucose avg" value="142 mg/dL" delta="stable"/>
        </div>
      </SectionCard>
      <SectionCard title="Care team">
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {[['Dr. Nisha Patel','PCP'],['Alicia Park','Case manager'],['Maria López','Facilitator'],['Dr. Omar Reyes','Cardiology (referred)']].map(([n,r]) => (
            <div key={n} style={{display:'flex', gap:10, alignItems:'center'}}>
              <Avatar initials={n.split(' ').map(s=>s[0]).slice(0,2).join('')} size={32} tone="neutral"/>
              <div style={{flex:1}}>
                <div style={{fontSize:14, fontWeight:600, color:'var(--wc-base-700)'}}>{n}</div>
                <div style={{fontSize:12, color:'var(--wc-base-500)'}}>{r}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
function VitalTile({label, value, delta}) {
  return (
    <div style={{background:'var(--wc-base-50)', borderRadius:12, padding:12}}>
      <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--wc-base-500)'}}>{label}</div>
      <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:20, color:'var(--wc-base-700)', margin:'4px 0 2px'}}>{value}</div>
      <div style={{fontSize:11, color:'var(--wc-base-500)'}}>{delta}</div>
    </div>
  );
}
function SDoHTab({member: m}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <SectionCard title="Active SDoH flags">
        {m.sdoh.length===0 ? <Empty>No SDoH flags.</Empty> :
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {m.sdoh.map(s => (
              <div key={s.flag} style={{padding:14, border:'1px solid var(--wc-base-200)', borderRadius:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{fontSize:15, fontWeight:600}}>{s.flag}</div>
                  <Badge tone={s.severity==='high'?'error':s.severity==='med'?'warning':'info'} size="sm">{s.severity} severity</Badge>
                </div>
                <div style={{fontSize:12, color:'var(--wc-base-500)', marginTop:6}}>Flagged {s.since} · Resource Finder</div>
                <div style={{display:'flex', gap:6, marginTop:10}}>
                  <Btn size="sm" variant="secondary">Refer to supplier</Btn>
                  <Btn size="sm" variant="tertiary">Mark resolved</Btn>
                </div>
              </div>
            ))}
          </div>
        }
      </SectionCard>
      <SectionCard title="Referrals" action={<Btn size="sm" variant="tertiary">New</Btn>}>
        <Empty>No open referrals. Last referral: Freestore Foodbank — fulfilled Apr 16.</Empty>
      </SectionCard>
    </div>
  );
}
function EventsTab({events}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      {events.map(e => (
        <Card key={e.id} pad={18}>
          <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:16}}>{e.title}</div>
          <div style={{fontSize:13, color:'var(--wc-base-500)', marginTop:6}}>{e.when} · {e.where}</div>
          <div style={{fontSize:13, color:'var(--wc-base-600)', marginTop:2}}>Facilitator: {e.facilitator}</div>
          <div style={{display:'flex', gap:6, marginTop:12, alignItems:'center'}}>
            {e.rsvp==='Yes' ? <Badge tone="success" size="sm" dot>RSVP'd</Badge> : <Badge tone="neutral" size="sm">Not RSVP'd</Badge>}
            <Badge tone="gold" size="sm">Predict: {e.predict}</Badge>
            <Badge tone="neutral" size="sm">{e.attendees}/{e.cap}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

Object.assign(window, {Patient360});
