// Shell: left rail nav, top bar, tweaks panel, persona switcher
const { useState: useStateS } = React;

function LeftRail({page, onPage, queueCount}) {
  const items = [
    {id:'home',      label:'Home',      Icon: Icon.home},
    {id:'queue',     label:'My queue',  Icon: Icon.briefcase, badge: queueCount},
    {id:'members',   label:'Members',   Icon: Icon.users},
    {id:'events',    label:'Events',    Icon: Icon.calendar},
    {id:'messaging', label:'Messaging', Icon: Icon.chat},
    {id:'billing',   label:'Billing',   Icon: Icon.dollar},
    {id:'reporting', label:'Reporting', Icon: Icon.activity},
    {id:'admin',     label:'Admin',     Icon: Icon.sliders},
  ];
  return (
    <nav style={{width:72, background:'var(--wc-base-700)', color:'#fff', display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 0', gap:4, flexShrink:0, position:'sticky', top:0, height:'100vh'}}>
      <img src="assets/logo-graphic.svg" style={{width:34, height:34, marginBottom:16}}/>
      {items.map(it => {
        const sel = it.id === page;
        return (
          <button key={it.id} onClick={()=>onPage(it.id)} title={it.label} style={{
            position:'relative', width:52, height:52, borderRadius:15, border:0, cursor:'pointer',
            background: sel?'rgba(242,115,33,0.15)':'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
            color: sel?'var(--wc-brand-200)':'rgba(255,255,255,0.6)',
            transition:'background .15s, color .15s',
          }}
          onMouseEnter={e=>{ if(!sel) e.currentTarget.style.background='rgba(255,255,255,0.06)'; }}
          onMouseLeave={e=>{ if(!sel) e.currentTarget.style.background='transparent'; }}
          >
            <it.Icon size={22} color={sel?'var(--wc-brand-200)':'rgba(255,255,255,0.75)'} stroke={sel?2.2:1.8}/>
            {it.badge>0 && (
              <span style={{position:'absolute', top:6, right:6, minWidth:16, height:16, padding:'0 4px', borderRadius:999, background:'var(--wc-brand-500)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter'}}>{it.badge}</span>
            )}
            {sel && <span style={{position:'absolute', left:-12, top:14, bottom:14, width:3, borderRadius:'0 3px 3px 0', background:'var(--wc-brand-500)'}}/>}
          </button>
        );
      })}
      <div style={{flex:1}}/>
      <Avatar initials="AP" size={36} tone="gold"/>
    </nav>
  );
}

function TopBar({onOpenTweaks, incomingCall, onAnswer}) {
  return (
    <div style={{height:60, borderBottom:'1px solid var(--wc-base-200)', background:'#fff', display:'flex', alignItems:'center', padding:'0 24px', gap:16, position:'sticky', top:0, zIndex:20}}>
      <div style={{flex:1, maxWidth:520, position:'relative'}}>
        <Icon.search size={16} color="var(--wc-base-500)" style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)'}}/>
        <input placeholder="Search members, cases, events…  (⌘K)" style={{
          width:'100%', height:38, border:'1px solid var(--wc-base-200)', borderRadius:12, padding:'0 12px 0 36px',
          fontFamily:'Inter', fontSize:14, background:'var(--wc-base-50)', outline:'none', boxSizing:'border-box',
        }}/>
      </div>
      <div style={{flex:1}}/>
      {incomingCall && (
        <button onClick={onAnswer} style={{
          display:'inline-flex', alignItems:'center', gap:8, background:'var(--wc-success-500)', color:'#fff',
          border:0, borderRadius:15, padding:'8px 14px', fontFamily:'Inter', fontWeight:700, fontSize:13, cursor:'pointer',
          boxShadow:'0 0 0 0 rgba(16,185,129,0.7)', animation:'wcPulse 1.6s infinite',
        }}>
          <Icon.phoneIn size={16} color="#fff" stroke={2.4}/>
          Incoming · Dolores Alvarez
        </button>
      )}
      <Btn variant="secondary" size="sm" leading={<Icon.sliders size={15} color="currentColor"/>} onClick={onOpenTweaks}>Tweaks</Btn>
      <Badge tone="neutral" dot size="md" style={{fontWeight:600}}>Case Manager · Wider Circle</Badge>
      <button style={{background:'var(--wc-base-50)', border:'1px solid var(--wc-base-200)', borderRadius:12, width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative'}}>
        <Icon.bell size={18} color="var(--wc-base-700)"/>
        <span style={{position:'absolute', top:8, right:10, width:8, height:8, borderRadius:'50%', background:'var(--wc-brand-500)', border:'2px solid #fff'}}/>
      </button>
    </div>
  );
}

function PersonaSwitcher({persona, onChange}) {
  const opts = [
    {id:'complex',     label:'Complex case',    sub:'Dolores · Tier 4'},
    {id:'engaged',     label:'Engaged member',  sub:'Robert · Tier 2'},
    {id:'prospective', label:'Prospective',     sub:'Janet · new'},
  ];
  return (
    <div style={{display:'inline-flex', gap:4, padding:4, background:'var(--wc-base-50)', border:'1px solid var(--wc-base-200)', borderRadius:12}}>
      {opts.map(o => {
        const sel = o.id === persona;
        return (
          <button key={o.id} onClick={()=>onChange(o.id)} style={{
            background: sel?'#fff':'transparent', color:'var(--wc-base-700)',
            border: sel?'1px solid var(--wc-base-200)':'1px solid transparent',
            boxShadow: sel?'0 1px 2px rgba(0,0,0,0.04)':'none',
            borderRadius:10, padding:'6px 12px', cursor:'pointer', textAlign:'left',
            fontFamily:'Inter', minWidth:140,
          }}>
            <div style={{fontSize:13, fontWeight:700}}>{o.label}</div>
            <div style={{fontSize:11, color:'var(--wc-base-500)', fontWeight:500}}>{o.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function TweaksPanel({open, onClose, tweaks, setTweaks}) {
  if (!open) return null;
  const updT = (k,v) => setTweaks({...tweaks, [k]: v});
  return (
    <div style={{position:'fixed', top:70, right:20, width:320, background:'#fff', border:'1px solid var(--wc-base-200)', borderRadius:20, boxShadow:'var(--wc-shadow-lg)', zIndex:100, overflow:'hidden'}}>
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--wc-base-200)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{fontFamily:'Montserrat', fontWeight:700, fontSize:16}}>Tweaks</div>
        <button onClick={onClose} style={{background:'transparent', border:0, cursor:'pointer', padding:4, display:'flex'}}><Icon.x size={18} color="var(--wc-base-600)"/></button>
      </div>
      <div style={{padding:18, display:'flex', flexDirection:'column', gap:18}}>
        <TweakGroup label="Member header layout">
          <Chip selected={tweaks.headerLayout==='left'} onClick={()=>updT('headerLayout','left')}>Left sticky panel</Chip>
          <Chip selected={tweaks.headerLayout==='top'} onClick={()=>updT('headerLayout','top')}>Top sticky header</Chip>
        </TweakGroup>
        <TweakGroup label="Activity feed">
          <Chip selected={tweaks.feedMode==='unified'} onClick={()=>updT('feedMode','unified')}>Unified timeline</Chip>
          <Chip selected={tweaks.feedMode==='tabbed'} onClick={()=>updT('feedMode','tabbed')}>Tabbed by channel</Chip>
        </TweakGroup>
        <TweakGroup label="Priority surfacing">
          <Chip selected={tweaks.priorityStyle==='badge'} onClick={()=>updT('priorityStyle','badge')}>Color badge</Chip>
          <Chip selected={tweaks.priorityStyle==='score'} onClick={()=>updT('priorityStyle','score')}>Numeric score</Chip>
          <Chip selected={tweaks.priorityStyle==='both'} onClick={()=>updT('priorityStyle','both')}>Both</Chip>
        </TweakGroup>
        <TweakGroup label="Density">
          <Chip selected={tweaks.density==='compact'} onClick={()=>updT('density','compact')}>Compact</Chip>
          <Chip selected={tweaks.density==='comfortable'} onClick={()=>updT('density','comfortable')}>Comfortable</Chip>
        </TweakGroup>
      </div>
      <div style={{padding:'10px 18px 14px', borderTop:'1px solid var(--wc-base-200)', fontSize:12, color:'var(--wc-base-500)'}}>
        Toggles are persistent. Refresh-safe.
      </div>
    </div>
  );
}
function TweakGroup({label, children}) {
  return (
    <div>
      <div style={{fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--wc-base-500)', marginBottom:8, fontFamily:'Inter'}}>{label}</div>
      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>{children}</div>
    </div>
  );
}

Object.assign(window, {LeftRail, TopBar, PersonaSwitcher, TweaksPanel});
