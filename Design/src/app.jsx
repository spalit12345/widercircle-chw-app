// Main app — router, state, tweaks wiring
const { useState: useStateA, useEffect: useEffectA } = React;

const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "headerLayout": "left",
  "feedMode": "unified",
  "priorityStyle": "both",
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [page, setPage] = useStateA(() => localStorage.getItem('wc_page') || 'member');
  const [persona, setPersona] = useStateA(() => localStorage.getItem('wc_persona') || 'complex');
  const [tweaks, setTweaks] = useStateA(() => {
    try { return {...DEFAULT_TWEAKS, ...JSON.parse(localStorage.getItem('wc_tweaks')||'{}')}; } catch { return DEFAULT_TWEAKS; }
  });
  const [tweaksOpen, setTweaksOpen] = useStateA(false);
  const [screenPop, setScreenPop] = useStateA(false);
  const [callActive, setCallActive] = useStateA(false);
  const [notesOpen, setNotesOpen] = useStateA(false);
  const [intakeOpen, setIntakeOpen] = useStateA(false);
  const [scheduleOpen, setScheduleOpen] = useStateA(false);

  useEffectA(() => { localStorage.setItem('wc_page', page); }, [page]);
  useEffectA(() => { localStorage.setItem('wc_persona', persona); }, [persona]);
  useEffectA(() => { localStorage.setItem('wc_tweaks', JSON.stringify(tweaks)); }, [tweaks]);

  // Edit-mode (Tweaks host integration)
  useEffectA(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', handler);
  }, []);
  useEffectA(() => {
    window.parent.postMessage({type:'__edit_mode_set_keys', edits: tweaks}, '*');
  }, [tweaks]);

  const answerCall = () => { setScreenPop(false); setCallActive(true); setNotesOpen(true); setPersona('complex'); setPage('member'); };
  const endCall = () => { setCallActive(false); setNotesOpen(false); };

  return (
    <div style={{display:'flex', minHeight:'100vh', background:'var(--wc-surface-page)'}}>
      <LeftRail page={page} onPage={setPage} queueCount={QUEUE.length}/>
      <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
        <TopBar onOpenTweaks={()=>setTweaksOpen(o=>!o)} incomingCall={false}/>
        <div style={{background:'#fff', borderBottom:'1px solid var(--wc-base-200)', padding:'10px 24px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <span style={{fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--wc-base-500)', fontFamily:'Inter'}}>Demo persona</span>
          <PersonaSwitcher persona={persona} onChange={setPersona}/>
          <div style={{flex:1}}/>
          <Btn size="sm" variant="secondary" leading={<Icon.phoneIn size={14} color="currentColor"/>} onClick={()=>setScreenPop(true)}>Simulate inbound call</Btn>
          <Btn size="sm" variant="secondary" leading={<Icon.plus size={14} color="currentColor"/>} onClick={()=>setIntakeOpen(true)}>New case</Btn>
          <Btn size="sm" variant="secondary" leading={<Icon.calendar size={14} color="currentColor"/>} onClick={()=>setScheduleOpen(true)}>Schedule</Btn>
        </div>
        {page === 'member' && (
          <Patient360 persona={persona} tweaks={tweaks}
            onStartCall={() => { setCallActive(true); setNotesOpen(true); }}/>
        )}
        {page === 'queue' && <QueuePage onOpenMember={(k)=>{ setPersona(k); setPage('member'); }} tweaks={tweaks}/>}
        {page === 'events' && <EventsPage/>}
        {page === 'billing' && <BillingPage/>}
        {page === 'home' && <QueuePage onOpenMember={(k)=>{ setPersona(k); setPage('member'); }} tweaks={tweaks}/>}
        {['members','messaging','reporting','admin'].includes(page) && <PlaceholderPage name={page}/>}
      </div>
      <TweaksPanel open={tweaksOpen} onClose={()=>setTweaksOpen(false)} tweaks={tweaks} setTweaks={setTweaks}/>
      <ScreenPop open={screenPop} onAnswer={answerCall} onDismiss={()=>setScreenPop(false)}/>
      <ActiveCallDock active={callActive} onEnd={endCall} onOpenNotes={()=>setNotesOpen(o=>!o)} notesOpen={notesOpen}/>
      <CallNotesPanel open={notesOpen && callActive} onClose={()=>setNotesOpen(false)}/>
      <CaseIntakeModal open={intakeOpen} onClose={()=>setIntakeOpen(false)} persona={persona}/>
      <ScheduleModal open={scheduleOpen} onClose={()=>setScheduleOpen(false)} persona={persona}/>
    </div>
  );
}

function PlaceholderPage({name}) {
  return (
    <div style={{padding:'60px 32px', maxWidth:900, margin:'0 auto'}}>
      <h1 style={{fontFamily:'Montserrat', fontWeight:700, fontSize:28, margin:0, textTransform:'capitalize'}}>{name}</h1>
      <div style={{fontSize:14, color:'var(--wc-base-500)', marginTop:6, maxWidth:560, lineHeight:1.6}}>
        Placeholder. In v1 scope we built Patient 360, Queue, Events, Billing, plus the call + intake + scheduling flows. This module is scaffolded for Phase 2.
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
