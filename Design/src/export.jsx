// Export harness — renders a single screen at fixed 1440px for plugin capture
const { useState: useStateE, useEffect: useEffectE } = React;

const params = new URLSearchParams(location.search);
const screen = params.get('screen') || 'patient360';
const persona = params.get('persona') || 'complex';
const headerLayout = params.get('layout') || 'left';
const feedMode = params.get('feed') || 'unified';
const priorityStyle = params.get('priority') || 'both';
const density = params.get('density') || 'comfortable';
const showCall = params.get('call') === '1';
const showScreenPop = params.get('pop') === '1';
const showIntake = params.get('intake') === '1';
const showSchedule = params.get('schedule') === '1';
const showNotes = params.get('notes') === '1';
const showChrome = params.get('chrome') !== '0'; // nav + topbar default on

const tweaks = {headerLayout, feedMode, priorityStyle, density};

function ExportApp() {
  return (
    <div style={{display:'flex', minHeight: '100vh', background:'var(--wc-surface-page)', width: 1440}}>
      {showChrome && <LeftRail page={screen==='queue'?'queue':screen==='events'?'events':screen==='billing'?'billing':'members'} onPage={()=>{}} queueCount={QUEUE.length}/>}
      <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
        {showChrome && <TopBar onOpenTweaks={()=>{}} incomingCall={false}/>}
        {screen === 'patient360' && <Patient360 persona={persona} tweaks={tweaks} onStartCall={()=>{}}/>}
        {screen === 'queue' && <QueuePage onOpenMember={()=>{}} tweaks={tweaks}/>}
        {screen === 'events' && <EventsPage/>}
        {screen === 'billing' && <BillingPage/>}
      </div>
      {showScreenPop && <ScreenPop open={true} onAnswer={()=>{}} onDismiss={()=>{}}/>}
      {showCall && <ActiveCallDock active={true} onEnd={()=>{}} onOpenNotes={()=>{}} notesOpen={showNotes}/>}
      {showNotes && <CallNotesPanel open={true} onClose={()=>{}}/>}
      {showIntake && <CaseIntakeModal open={true} onClose={()=>{}} persona={persona}/>}
      {showSchedule && <ScheduleModal open={true} onClose={()=>{}} persona={persona}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ExportApp/>);
