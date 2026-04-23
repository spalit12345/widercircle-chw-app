// Shared primitives for WC CMS prototype
const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

// ---------- Icons (24px, line, WC style) ----------
const mkIcon = (path, opts={}) => ({size=18, color='currentColor', stroke=1.8, fill='none', ...rest}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {path}
  </svg>
);
const Icon = {
  search:   mkIcon(<><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>),
  bell:     mkIcon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>),
  phone:    mkIcon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>),
  phoneIn:  mkIcon(<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><polyline points="16 2 16 8 22 8"/><line x1="22" y1="2" x2="16" y2="8"/></>),
  chat:     mkIcon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>),
  mail:     mkIcon(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></>),
  calendar: mkIcon(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  users:    mkIcon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  user:     mkIcon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  home:     mkIcon(<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>),
  briefcase:mkIcon(<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>),
  check:    mkIcon(<polyline points="20 6 9 17 4 12"/>),
  x:        mkIcon(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  plus:     mkIcon(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  alert:    mkIcon(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/></>),
  clock:    mkIcon(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>),
  pin:      mkIcon(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>),
  chevR:    mkIcon(<polyline points="9 6 15 12 9 18"/>),
  chevD:    mkIcon(<polyline points="6 9 12 15 18 9"/>),
  filter:   mkIcon(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>),
  more:     mkIcon(<><circle cx="12" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>),
  send:     mkIcon(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>),
  mic:      mkIcon(<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></>),
  micOff:   mkIcon(<><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></>),
  pause:    mkIcon(<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>),
  play:     mkIcon(<polygon points="5 3 19 12 5 21 5 3"/>),
  timer:    mkIcon(<><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="1" x2="14" y2="1"/></>),
  heart:    mkIcon(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>),
  shield:   mkIcon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  link:     mkIcon(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>),
  dollar:   mkIcon(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>),
  sliders:  mkIcon(<><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>),
  activity: mkIcon(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  file:     mkIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>),
  globe:    mkIcon(<><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"/></>),
  lock:     mkIcon(<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
};

// ---------- Button ----------
function Btn({variant='primary', size='md', children, onClick, leading, trailing, disabled, style={}, title, type='button'}) {
  const sizes = {
    sm: {padding:'6px 12px', fontSize:13, gap:6, height:32},
    md: {padding:'9px 16px', fontSize:14, gap:8, height:38},
    lg: {padding:'12px 20px', fontSize:15, gap:8, height:44, fontFamily:'Montserrat', fontWeight:700},
  };
  const variants = {
    primary:   {background:'var(--wc-base-700)', color:'#fff', border:'1px solid var(--wc-base-700)'},
    brand:     {background:'var(--wc-brand-500)', color:'#fff', border:'1px solid var(--wc-brand-500)'},
    secondary: {background:'#fff', color:'var(--wc-base-700)', border:'1px solid var(--wc-base-200)'},
    tertiary:  {background:'transparent', color:'var(--wc-base-700)', border:'1px solid transparent'},
    danger:    {background:'var(--wc-error-700)', color:'#fff', border:'1px solid var(--wc-error-700)'},
    ghost:     {background:'var(--wc-base-50)', color:'var(--wc-base-700)', border:'1px solid var(--wc-base-200)'},
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontFamily:'Inter', fontWeight:600, borderRadius:15, cursor:disabled?'not-allowed':'pointer',
      transition:'background-color .15s, transform .1s, border-color .15s',
      whiteSpace:'nowrap',
      opacity: disabled?0.5:1,
      ...sizes[size], ...variants[variant], ...style,
    }}
    onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
    onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
    onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
    >
      {leading}{children}{trailing}
    </button>
  );
}

// ---------- Badge / StatusPill ----------
function Badge({tone='neutral', children, dot, size='md', style={}}) {
  const tones = {
    neutral: {bg:'var(--wc-base-100)',  fg:'var(--wc-base-700)', dot:'var(--wc-base-500)'},
    brand:   {bg:'var(--wc-tint-100)',  fg:'var(--wc-brand-600)', dot:'var(--wc-brand-500)'},
    gold:    {bg:'#FFF5E0',             fg:'#7A5200', dot:'var(--wc-brand-200)'},
    info:    {bg:'var(--wc-info-100)',  fg:'var(--wc-info-700)', dot:'var(--wc-info-500)'},
    success: {bg:'var(--wc-success-100)', fg:'var(--wc-success-700)', dot:'var(--wc-success-500)'},
    warning: {bg:'var(--wc-warning-100)', fg:'#8a5c00', dot:'var(--wc-warning-500)'},
    error:   {bg:'var(--wc-error-100)', fg:'var(--wc-error-700)', dot:'var(--wc-error-500)'},
    dark:    {bg:'var(--wc-base-700)', fg:'#fff', dot:'var(--wc-brand-200)'},
  };
  const t = tones[tone];
  const sizes = {sm:{fontSize:11, padding:'2px 8px', height:20}, md:{fontSize:12, padding:'3px 10px', height:22}};
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6, background:t.bg, color:t.fg, borderRadius:30, fontWeight:600, fontFamily:'Inter', lineHeight:1, ...sizes[size], ...style}}>
      {dot && <span style={{width:6, height:6, borderRadius:'50%', background:t.dot}}/>}
      {children}
    </span>
  );
}

// ---------- Avatar ----------
function Avatar({initials, size=40, tone='brand', img}) {
  const tones = {brand:{bg:'var(--wc-brand-500)', fg:'#fff'}, gold:{bg:'var(--wc-brand-200)', fg:'var(--wc-base-700)'}, dark:{bg:'var(--wc-base-700)', fg:'#fff'}, neutral:{bg:'var(--wc-base-100)', fg:'var(--wc-base-700)'}};
  const t = tones[tone];
  return (
    <div style={{width:size, height:size, borderRadius:'50%', background:t.bg, color:t.fg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontFamily:'Montserrat', fontSize:size*0.38, flexShrink:0, overflow:'hidden'}}>
      {img ? <img src={img} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials}
    </div>
  );
}

// ---------- Tabs ----------
function Tabs({tabs, active, onChange, variant='underline'}) {
  return (
    <div style={{display:'flex', gap: variant==='underline'?4:6, borderBottom: variant==='underline'?'1px solid var(--wc-base-200)':'none'}}>
      {tabs.map(t => {
        const sel = t.id === active;
        if (variant === 'pill') return (
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            background: sel?'var(--wc-base-700)':'transparent', color: sel?'#fff':'var(--wc-base-700)',
            border: sel?'1px solid var(--wc-base-700)':'1px solid var(--wc-base-200)', borderRadius:30,
            padding:'6px 14px', fontSize:13, fontWeight:600, fontFamily:'Inter', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6,
          }}>{t.label}{t.count!=null && <Badge tone={sel?'dark':'neutral'} size="sm">{t.count}</Badge>}</button>
        );
        return (
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            background:'transparent', border:0, padding:'12px 14px', cursor:'pointer', fontFamily:'Inter', fontWeight:600, fontSize:14,
            color: sel?'var(--wc-base-700)':'var(--wc-base-500)',
            borderBottom: sel?'2px solid var(--wc-brand-500)':'2px solid transparent',
            marginBottom:-1, display:'inline-flex', alignItems:'center', gap:8,
          }}>{t.label}{t.count!=null && <Badge tone={sel?'brand':'neutral'} size="sm">{t.count}</Badge>}</button>
        );
      })}
    </div>
  );
}

// ---------- Card ----------
function Card({children, pad=20, style={}, onClick, raised}) {
  return (
    <div onClick={onClick} style={{
      background:'#fff', border:'1px solid var(--wc-base-200)', borderRadius:20, padding:pad,
      cursor: onClick?'pointer':'default',
      boxShadow: raised?'var(--wc-shadow-md)':'none',
      ...style,
    }}>{children}</div>
  );
}

// ---------- Field ----------
function Field({label, children, hint, required}) {
  return (
    <label style={{display:'block'}}>
      <div style={{fontSize:12, fontWeight:600, fontFamily:'Inter', color:'var(--wc-base-700)', marginBottom:6, display:'flex', justifyContent:'space-between'}}>
        <span>{label}{required && <span style={{color:'var(--wc-error-700)'}}> *</span>}</span>
        {hint && <span style={{color:'var(--wc-base-500)', fontWeight:400}}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}
function Input({value, onChange, placeholder, type='text', ...rest}) {
  return <input type={type} value={value||''} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder}
    style={{width:'100%', border:'1px solid var(--wc-base-200)', borderRadius:12, padding:'10px 12px', fontFamily:'Inter', fontSize:14, background:'#fff', outline:'none', boxSizing:'border-box'}} {...rest}/>;
}
function Select({value, onChange, options=[], ...rest}) {
  return <select value={value} onChange={e=>onChange&&onChange(e.target.value)}
    style={{width:'100%', border:'1px solid var(--wc-base-200)', borderRadius:12, padding:'10px 12px', fontFamily:'Inter', fontSize:14, background:'#fff', outline:'none', boxSizing:'border-box'}} {...rest}>
    {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
  </select>;
}
function Textarea({value, onChange, placeholder, rows=4, ...rest}) {
  return <textarea value={value||''} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{width:'100%', border:'1px solid var(--wc-base-200)', borderRadius:12, padding:'10px 12px', fontFamily:'Inter', fontSize:14, background:'#fff', outline:'none', boxSizing:'border-box', resize:'vertical', lineHeight:1.5}} {...rest}/>;
}

// ---------- Channel icon (for activity feed) ----------
function ChannelGlyph({channel, direction, size=34}) {
  const map = {
    call:{Icon: direction==='in' ? Icon.phoneIn : Icon.phone, bg:'var(--wc-info-100)', fg:'var(--wc-info-700)'},
    sms: {Icon: Icon.chat, bg:'var(--wc-tint-100)', fg:'var(--wc-brand-600)'},
    email:{Icon: Icon.mail, bg:'#F1F1EE', fg:'var(--wc-base-700)'},
    note:{Icon: Icon.file, bg:'var(--wc-success-100)', fg:'var(--wc-success-700)'},
    event:{Icon: Icon.calendar, bg:'#FFF5E0', fg:'#7A5200'},
    case:{Icon: Icon.briefcase, bg:'var(--wc-info-100)', fg:'var(--wc-info-700)'},
    system:{Icon: Icon.globe, bg:'#F1F1EE', fg:'var(--wc-base-600)'},
  };
  const m = map[channel] || map.system;
  return (
    <div style={{width:size, height:size, borderRadius:'50%', background:m.bg, color:m.fg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
      <m.Icon size={size*0.5} color={m.fg} stroke={2}/>
    </div>
  );
}

// ---------- Toggle ----------
function Toggle({on, onChange, label}) {
  return (
    <label style={{display:'inline-flex', alignItems:'center', gap:10, cursor:'pointer', fontFamily:'Inter', fontSize:13, fontWeight:500, color:'var(--wc-base-700)'}}>
      <span onClick={()=>onChange&&onChange(!on)} style={{width:34, height:20, borderRadius:999, background: on?'var(--wc-base-700)':'var(--wc-base-300)', position:'relative', transition:'background .15s', flexShrink:0}}>
        <span style={{position:'absolute', top:2, left: on?16:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .15s'}}/>
      </span>
      {label}
    </label>
  );
}

// ---------- Chip ----------
function Chip({children, selected, onClick, tone='neutral'}) {
  const sel = selected;
  return (
    <button onClick={onClick} style={{
      padding:'6px 12px', borderRadius:30, fontFamily:'Inter', fontSize:12, fontWeight:600, cursor:'pointer',
      background: sel?'var(--wc-base-700)':'#fff', color: sel?'#fff':'var(--wc-base-700)',
      border: sel?'1px solid var(--wc-base-700)':'1px solid var(--wc-base-200)',
      display:'inline-flex', alignItems:'center', gap:6,
    }}>{children}</button>
  );
}

Object.assign(window, {Icon, Btn, Badge, Avatar, Tabs, Card, Field, Input, Select, Textarea, ChannelGlyph, Toggle, Chip});
