// Mock data for WC Care & Case Management prototype

const PERSONAS = {
  complex: {
    id: 'complex',
    name: 'Dolores M. Alvarez',
    initials: 'DA',
    pronouns: 'she/her',
    dob: '1948-03-14',
    age: 77,
    planId: 'HUM-MAPD-4473-88',
    plan: 'Humana MAPD · Dual-Eligible',
    language: 'Spanish (preferred) · English',
    phone: '(513) 555-0142',
    zip: '45229',
    city: 'Cincinnati, OH',
    contactPref: 'Phone — weekday mornings',
    riskTier: 'Tier 4 · High',
    riskScore: 87,
    circle: 'Avondale Neighbors',
    facilitator: 'Maria López',
    consentOnFile: true,
    askClaireAligned: false,
    diagnoses: ['Type 2 Diabetes', 'CHF (NYHA II)', 'Hypertension', 'Major Depression'],
    sdoh: [
      {flag: 'Food insecurity', severity: 'high', since: '2026-01-08'},
      {flag: 'Transportation barrier', severity: 'med', since: '2025-11-02'},
      {flag: 'Social isolation', severity: 'med', since: '2025-10-14'},
    ],
    activeCases: 3,
    overdueTasks: 1,
    lastContact: '2 days ago — inbound call',
    nextEvent: 'Walking group · Thu 10:00 AM',
  },
  engaged: {
    id: 'engaged',
    name: 'Robert J. Chen',
    initials: 'RC',
    pronouns: 'he/him',
    dob: '1955-09-22',
    age: 70,
    planId: 'AET-MAPD-0921-14',
    plan: 'Aetna MAPD Plus',
    language: 'English',
    phone: '(513) 555-0199',
    zip: '45208',
    city: 'Cincinnati, OH',
    contactPref: 'SMS — anytime',
    riskTier: 'Tier 2 · Moderate',
    riskScore: 41,
    circle: 'Hyde Park Circle',
    facilitator: 'James Oduya',
    consentOnFile: true,
    askClaireAligned: true,
    diagnoses: ['Hypertension', 'Osteoarthritis (L knee)'],
    sdoh: [],
    activeCases: 1,
    overdueTasks: 0,
    lastContact: 'Yesterday — event RSVP',
    nextEvent: 'Coffee & Conversation · Sat 9:30 AM',
  },
  prospective: {
    id: 'prospective',
    name: 'Janet Whitfield',
    initials: 'JW',
    pronouns: 'she/her',
    dob: '1952-07-04',
    age: 73,
    planId: 'UHC-MAPD-0422-77',
    plan: 'UnitedHealthcare MAPD',
    language: 'English',
    phone: '(513) 555-0118',
    zip: '45206',
    city: 'Cincinnati, OH',
    contactPref: 'Not set',
    riskTier: 'Tier 3 · Elevated',
    riskScore: 62,
    circle: '— not yet assigned —',
    facilitator: null,
    consentOnFile: false,
    askClaireAligned: false,
    diagnoses: ['COPD', 'Anxiety'],
    sdoh: [{flag: 'Housing instability', severity: 'high', since: '2026-04-01'}],
    activeCases: 1,
    overdueTasks: 0,
    lastContact: 'No prior contact',
    nextEvent: '— introductory call pending —',
  },
};

// Activity feed — chronological, mixed channels.
// channel: call|sms|email|note|event|case|system  direction: in|out|sys
const ACTIVITY = {
  complex: [
    {id: 1, channel: 'call', direction: 'in', when: '2d ago · Apr 18 · 9:42 AM', dur: '6m 12s', by: 'Inbound → Alicia Park', source: 'Five9',
      summary: 'Called about food pantry referral status. Confirmed Freestore pickup Thu. Complained of mild shortness of breath — advised PCP same-day.',
      outcome: 'Resolved · CPT 99442 logged'},
    {id: 2, channel: 'sms', direction: 'out', when: '3d ago · Apr 17 · 2:18 PM', by: 'Alicia Park → Member',
      text: 'Hi Dolores — your ride for Thu walking group is confirmed. Pickup 9:40 AM. Reply CANCEL anytime.'},
    {id: 3, channel: 'sms', direction: 'in', when: '3d ago · Apr 17 · 2:22 PM', by: 'Member → Case Mgr',
      text: 'Gracias mija. Will be ready.'},
    {id: 4, channel: 'event', direction: 'sys', when: '5d ago · Apr 15', by: 'System',
      summary: 'Attended: Blood Pressure 101 workshop · 45 min · Avondale Neighbors'},
    {id: 5, channel: 'case', direction: 'sys', when: '6d ago · Apr 14 · 11:02 AM', by: 'Resource Finder webhook',
      summary: 'New case auto-created: Food insecurity · SLA 48h · assigned to Alicia Park'},
    {id: 6, channel: 'call', direction: 'out', when: '7d ago · Apr 13 · 10:15 AM', dur: '4m 03s', by: 'Alicia Park → Member', source: 'Five9',
      summary: 'Follow-up on CHF action plan. Weight stable (184 lb). Medication adherence confirmed.',
      outcome: 'CPT 99441 logged'},
    {id: 7, channel: 'email', direction: 'out', when: '9d ago · Apr 11', by: 'Care Team → Member',
      text: 'Monthly wellness newsletter — diabetes-friendly recipes for April.'},
    {id: 8, channel: 'note', direction: 'sys', when: '14d ago · Apr 06', by: 'Dr. Patel (Provider)',
      summary: 'Telehealth check-in. Adjusted Lasix to 40mg daily. Continue home BP log. F/U in 4 weeks.'},
  ],
  engaged: [
    {id: 1, channel: 'sms', direction: 'in', when: '1d ago · Apr 19 · 6:40 PM', by: 'Member → System',
      text: 'YES — looking forward to Saturday coffee!'},
    {id: 2, channel: 'event', direction: 'sys', when: '1d ago · Apr 19', by: 'System',
      summary: 'RSVP confirmed: Coffee & Conversation · Sat Apr 24 · Hyde Park Circle'},
    {id: 3, channel: 'sms', direction: 'out', when: '1d ago · Apr 19 · 6:35 PM', by: 'Events Bot → Member',
      text: 'Saturday 9:30am coffee at Awakenings Café — reply YES to RSVP.'},
    {id: 4, channel: 'call', direction: 'in', when: '12d ago · Apr 08', dur: '2m 47s', by: 'Inbound → Jordan Lee', source: 'Five9',
      summary: 'Called to update phone number. Verified identity.'},
  ],
  prospective: [
    {id: 1, channel: 'case', direction: 'sys', when: 'Today · 10:04 AM', by: 'Claims import',
      summary: 'New member from April eligibility file. Risk Tier 3. Auto-enrolled in outreach queue.'},
    {id: 2, channel: 'system', direction: 'sys', when: 'Today · 10:04 AM', by: 'Resource Finder',
      summary: 'SDoH flag detected: Housing instability (high). Priority score +25.'},
  ],
};

// Cases associated to the member
const CASES = {
  complex: [
    {id: 'CS-8841', title: 'Food insecurity — Freestore pickup', priority: 87, age: '6d', sla: '18h left', status: 'In progress', owner: 'Alicia Park', type: 'SDoH'},
    {id: 'CS-8820', title: 'CHF action plan check-in', priority: 72, age: '12d', sla: 'On track', status: 'In progress', owner: 'Alicia Park', type: 'Clinical'},
    {id: 'CS-8802', title: 'Transportation to Thu walking group', priority: 54, age: '9d', sla: 'On track', status: 'Scheduled', owner: 'Community Lead', type: 'Events'},
  ],
  engaged: [
    {id: 'CS-8910', title: 'Annual wellness outreach', priority: 28, age: '3d', sla: 'On track', status: 'Scheduled', owner: 'Jordan Lee', type: 'Outreach'},
  ],
  prospective: [
    {id: 'CS-8999', title: 'Welcome & intro call', priority: 62, age: '4h', sla: '44h left', status: 'New', owner: '— unassigned —', type: 'Outreach'},
  ],
};

// Upcoming events for the member
const EVENTS = {
  complex: [
    {id:'E1', title:'Walking group — Eden Park loop', when:'Thu Apr 22 · 10:00 AM', where:'Eden Park, Cincinnati', facilitator:'Maria López', rsvp:'Yes', predict:'High', attendees: 14, cap: 20},
    {id:'E2', title:'Diabetes-friendly potluck', when:'Sat Apr 24 · 6:00 PM', where:'Avondale Community Center', facilitator:'Maria López', rsvp:'—', predict:'Med', attendees: 8, cap: 18},
    {id:'E3', title:'Virtual townhall: Medicare annual enrollment', when:'Wed Apr 28 · 4:00 PM', where:'Zoom', facilitator:'James Oduya', rsvp:'—', predict:'Low', attendees: 42, cap: 200},
  ],
  engaged: [
    {id:'E1', title:'Coffee & Conversation', when:'Sat Apr 24 · 9:30 AM', where:'Awakenings Café, Hyde Park', facilitator:'James Oduya', rsvp:'Yes', predict:'High', attendees: 11, cap: 15},
    {id:'E2', title:'Community walk', when:'Sun Apr 25 · 8:00 AM', where:'Ault Park', facilitator:'James Oduya', rsvp:'—', predict:'Med', attendees: 7, cap: 20},
  ],
  prospective: [
    {id:'E1', title:'Introductory meeting — meet your neighbors', when:'Next week — scheduling', where:'TBD', facilitator:'Pending assignment', rsvp:'—', predict:'—', attendees: 0, cap: 12},
  ],
};

// Worklist / queue — what the CM sees when they log in
const QUEUE = [
  {id:'CS-8999', member:'Janet Whitfield', memberKey:'prospective', title:'Welcome & intro call', priority:62, sla:'44h left', age:'4h', type:'Outreach', flag:'New'},
  {id:'CS-8841', member:'Dolores M. Alvarez', memberKey:'complex', title:'Food insecurity — Freestore pickup', priority:87, sla:'18h left', age:'6d', type:'SDoH', flag:'High'},
  {id:'CS-9012', member:'Harold Grieves', memberKey:null, title:'Missed PCP follow-up — outreach', priority:71, sla:'Overdue 6h', age:'8d', type:'Clinical', flag:'Overdue'},
  {id:'CS-8820', member:'Dolores M. Alvarez', memberKey:'complex', title:'CHF action plan check-in', priority:72, sla:'On track', age:'12d', type:'Clinical', flag:null},
  {id:'CS-8910', member:'Robert J. Chen', memberKey:'engaged', title:'Annual wellness outreach', priority:28, sla:'On track', age:'3d', type:'Outreach', flag:null},
  {id:'CS-8887', member:'Linnea O\'Brien', memberKey:null, title:'SDoH: housing — Upside referral', priority:81, sla:'12h left', age:'2d', type:'SDoH', flag:'High'},
  {id:'CS-8865', member:'Marcus Tyree', memberKey:null, title:'Medication reconciliation', priority:44, sla:'On track', age:'5d', type:'Clinical', flag:null},
];

// Simulated inbound call (for screen-pop demo)
const INBOUND_CALL = {
  ani: '+1 (513) 555-0142',
  matchedMember: 'complex',  // resolves to Dolores
  ivrPath: 'Spanish → Member → Case Mgr',
  queueWait: '00:14',
  recentContext: 'Food pantry referral · 2 days ago',
};

Object.assign(window, {PERSONAS, ACTIVITY, CASES, EVENTS, QUEUE, INBOUND_CALL});
