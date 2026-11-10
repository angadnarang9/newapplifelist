/* ==========================================================================
   LifeList – Make everyday life easier to manage.
   Vanilla JS single-page app: dashboard, tasks, calendar, shopping,
   reminders, progress, settings, quick add, search, smart planning.
   Storage: localStorage (default) or Supabase (set keys in config.js).
   ========================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------- utils */
const CFG = window.LIFELIST_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const localStr = dt => `${ymd(dt)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
const nowLocal = () => localStr(new Date());
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PRI_W = { high: 3, medium: 2, low: 1 };
const RECUR = [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const fmtDate = (s, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseYmd(s).toLocaleDateString([], o);
function relDate(s) {
  const d = daysBetween(today(), s);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return parseYmd(s).toLocaleDateString([], { weekday: 'long' });
  return fmtDate(s);
}
const relLower = s => { const r = relDate(s); return /^(Today|Tomorrow|Yesterday)$/.test(r) ? r.toLowerCase() : r; };
const fmtDateTime = at => { const [d, t] = at.split('T'); return `${relDate(d)}, ${fmtTime(t)}`; };
function nextDate(s, rec) {
  const d = parseYmd(s);
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (rec === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
  return ymd(d);
}
const nextAt = (at, rec) => { const [d, t] = at.split('T'); return `${nextDate(d, rec)}T${t}`; };
function weekStartOf(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const ws = Store.data?.settings.weekStart ?? 1;
  return addDays(d, -((d.getDay() - ws + 7) % 7));
}
function fmtMoney(n) {
  const cur = Store.data?.settings.currency || 'USD';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n || 0); }
  catch { return '$' + (n || 0).toFixed(2); }
}
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
async function sha256(s) {
  if (window.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return 'djb' + (h >>> 0).toString(16);
}
function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const loadScript = src => new Promise((res, rej) => {
  const s = Object.assign(document.createElement('script'), { src, onload: res, onerror: () => rej(new Error('Could not load ' + src)) });
  document.head.appendChild(s);
});

/* ---------------------------------------------------------------- icons */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.3h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6.2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  sparkle: '<path d="M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z"/><path d="M19 15c.3 1.7 1 2.4 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.1 2.2-.8 2.5-2.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18M6 6l9-3 2 3"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M10 9v12"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const LOGO = `<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#2563eb"/><path d="M11 13.5h4M11 20h4M11 26.5h4" stroke="#bcd0ff" stroke-width="2.6" stroke-linecap="round"/><path d="M19 20.5l3.5 3.5L30 15" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const TYPE_ICON = { task: 'tasks', event: 'calendar', reminder: 'bell', shopping: 'cart' };

/* ---------------------------------------------------------- data model */
const WIDGETS = [
  { id: 'summary', name: 'Daily summary' },
  { id: 'today', name: "Today's tasks" },
  { id: 'priority', name: 'Priority tasks' },
  { id: 'events', name: 'Upcoming events' },
  { id: 'plan', name: 'Smart day plan' },
  { id: 'deadlines', name: 'Approaching deadlines' },
  { id: 'reminders', name: 'Reminders' },
  { id: 'shopping', name: 'Shopping lists' },
];

function defaultData(name) {
  return {
    version: 1,
    profile: { name: name || 'Friend' },
    settings: {
      theme: 'system', notifications: false, weekStart: 1, currency: 'USD',
      dayStart: '08:00', dayEnd: '21:00',
      dashboard: WIDGETS.map(w => ({ id: w.id, on: true })),
    },
    categories: {
      task: ['Personal', 'Work', 'Home', 'Health', 'Finance', 'Errands'],
      shopping: ['Groceries', 'Household', 'Personal', 'Pharmacy', 'Other'],
    },
    tasks: [], events: [], reminders: [],
    lists: [{ id: uid(), name: 'Shopping list', budget: 0, items: [] }],
  };
}
function migrate(data, name) {
  const def = defaultData(name);
  const d = { ...def, ...data };
  d.profile = { ...def.profile, ...(data.profile || {}) };
  d.settings = { ...def.settings, ...(data.settings || {}) };
  d.categories = { ...def.categories, ...(data.categories || {}) };
  const ids = new Set(d.settings.dashboard.map(w => w.id));
  WIDGETS.forEach(w => { if (!ids.has(w.id)) d.settings.dashboard.push({ id: w.id, on: true }); });
  d.settings.dashboard = d.settings.dashboard.filter(w => WIDGETS.some(x => x.id === w.id));
  ['tasks', 'events', 'reminders', 'lists'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  return d;
}
const newTask = (o = {}) => ({
  id: uid(), title: '', notes: '', due: '', time: '', priority: 'medium', autoPriority: false, category: '',
  recur: 'none', duration: 30, completed: false, completedAt: null, createdAt: new Date().toISOString(), ...o,
});

function addSample(d) {
  const t = n => ymd(addDays(new Date(), n));
  const done = ago => ({ completed: true, completedAt: new Date(Date.now() - ago * 864e5 - 3 * 36e5).toISOString() });
  d.tasks.push(
    newTask({ title: 'Pay electricity bill', due: t(-1), priority: 'high', category: 'Finance' }),
    newTask({ title: 'Finish project report', due: t(0), time: '14:00', priority: 'high', category: 'Work', duration: 90, notes: 'Include the Q3 numbers and charts.' }),
    newTask({ title: 'Call the plumber', due: t(0), priority: 'medium', category: 'Home', duration: 15 }),
    newTask({ title: '30-minute workout', due: t(0), priority: 'medium', category: 'Health', recur: 'daily' }),
    newTask({ title: 'Book flights for the holidays', due: t(3), autoPriority: true, priority: 'medium', category: 'Personal', duration: 45 }),
    newTask({ title: 'Renew car insurance', due: t(6), autoPriority: true, priority: 'low', category: 'Finance' }),
    newTask({ title: 'Water the plants', due: t(1), priority: 'low', category: 'Home', recur: 'weekly', duration: 15 }),
    newTask({ title: 'Plan weekend trip', priority: 'low', category: 'Personal' }),
  );
  const hist = ['Laundry', 'Grocery run', 'Team meeting notes', 'Clean kitchen', 'Read 20 pages', 'Budget review', 'Fill in dentist forms',
    'Meal prep', 'Fix bike tire', 'Send invoice', 'Morning run', 'Organize desk', 'Reply to emails', 'Vacuum living room', 'Call grandma',
    'Update resume', 'Yoga session', 'Return library books', 'Pay phone bill', 'Clean out fridge'];
  const cats = ['Home', 'Errands', 'Work', 'Home', 'Personal', 'Finance', 'Health', 'Home', 'Errands', 'Work', 'Health', 'Work', 'Work', 'Home', 'Personal', 'Work', 'Health', 'Errands', 'Finance', 'Home'];
  const agos = [0, 1, 1, 2, 2, 2, 3, 4, 4, 5, 6, 6, 8, 9, 10, 12, 13, 15, 18, 20];
  hist.forEach((title, i) => d.tasks.push(newTask({ title, due: t(-agos[i]), priority: ['low', 'medium', 'high'][i % 3], category: cats[i], ...done(agos[i]) })));
  d.tasks.push(newTask({ title: 'Sort old photos', due: t(-3), priority: 'low', category: 'Personal' }));

  d.events.push(
    { id: uid(), title: 'Team meeting', date: t(0), time: '10:00', endTime: '11:00', location: 'Conference room B', description: 'Weekly sync', important: false },
    { id: uid(), title: 'Yoga class', date: t(1), time: '18:00', endTime: '19:00', location: 'Downtown studio', description: '', important: false },
    { id: uid(), title: 'Dentist appointment', date: t(2), time: '10:30', endTime: '11:15', location: 'Smile Dental, 42 King St', description: 'Bring insurance card', important: false },
    { id: uid(), title: 'Dinner with Sam', date: t(4), time: '19:30', endTime: '', location: 'Luigi’s', description: '', important: false },
    { id: uid(), title: 'Mom’s birthday', date: t(5), time: '', endTime: '', location: '', description: 'Order flowers!', important: true },
  );
  d.reminders.push(
    { id: uid(), title: 'Take vitamins', at: `${t(0)}T09:00`, repeat: 'daily', done: false, notified: false, notes: '' },
    { id: uid(), title: 'Pack gym bag', at: `${t(1)}T07:30`, repeat: 'none', done: false, notified: false, notes: '' },
    { id: uid(), title: 'Order flowers for Mom', at: `${t(3)}T12:00`, repeat: 'none', done: false, notified: false, notes: '' },
  );
  const it = (name, qty, category, price, checked = false) => ({ id: uid(), name, qty, category, price, checked });
  d.lists = [
    { id: uid(), name: 'Weekly groceries', budget: 80, items: [
      it('Milk', 2, 'Groceries', 3.49), it('Eggs', 1, 'Groceries', 4.29), it('Whole wheat bread', 1, 'Groceries', 3.19),
      it('Bananas', 6, 'Groceries', 0.29), it('Chicken breast', 1, 'Groceries', 9.99, true), it('Dish soap', 1, 'Household', 2.99),
      it('Paper towels', 1, 'Household', 6.49), it('Toothpaste', 1, 'Personal', 3.79, true), it('Vitamins', 1, 'Pharmacy', 11.99),
    ] },
    { id: uid(), name: 'Hardware store', budget: 0, items: [it('Light bulbs', 4, 'Household', 2.5), it('AA batteries', 1, 'Household', 7.99)] },
  ];
  return d;
}

/* --------------------------------------------------- backends & store */
const Local = {
  mode: 'local',
  async init() {
    const s = LS.get('lifelist.session');
    if (s && !s.guest && LS.get('lifelist.users', {})[s.email]) return s;
    return null;
  },
  async signUp(name, email, pw) {
    email = email.trim().toLowerCase();
    const users = LS.get('lifelist.users', {});
    if (users[email]) throw new Error('An account with this email already exists. Try signing in.');
    const salt = uid();
    users[email] = { name, salt, hash: await sha256(salt + pw), created: new Date().toISOString() };
    LS.set('lifelist.users', users);
    const s = { email, name }; LS.set('lifelist.session', s); return s;
  },
  async signIn(email, pw) {
    email = email.trim().toLowerCase();
    const u = LS.get('lifelist.users', {})[email];
    if (!u || u.hash !== await sha256(u.salt + pw)) throw new Error('Incorrect email or password.');
    const s = { email, name: u.name }; LS.set('lifelist.session', s); return s;
  },
  async signOut() { LS.del('lifelist.session'); },
  async load(user) { return LS.get('lifelist.data.' + user.email, null); },
  async save(user, data) { LS.set('lifelist.data.' + user.email, data); },
  async updateProfile(user, name) {
    if (user.guest) return;
    const users = LS.get('lifelist.users', {});
    if (users[user.email]) { users[user.email].name = name; LS.set('lifelist.users', users); }
    LS.set('lifelist.session', { ...user, name });
  },
  async deleteAccount(user) {
    LS.del('lifelist.data.' + user.email);
    const users = LS.get('lifelist.users', {}); delete users[user.email]; LS.set('lifelist.users', users);
    LS.del('lifelist.session');
  },
};
const Supa = {
  mode: 'cloud', client: null,
  async init() {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
    this.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    const { data: { session } } = await this.client.auth.getSession();
    return session ? this.toUser(session.user) : null;
  },
  toUser: u => ({ id: u.id, email: u.email, name: u.user_metadata?.name || u.email.split('@')[0] }),
  async signUp(name, email, pw) {
    const { data, error } = await this.client.auth.signUp({ email, password: pw, options: { data: { name } } });
    if (error) throw error;
    if (!data.session) throw new Error('Check your inbox to confirm your email, then sign in.');
    return this.toUser(data.user);
  },
  async signIn(email, pw) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    return this.toUser(data.user);
  },
  async signOut() { await this.client.auth.signOut(); },
  async load(user) {
    const { data, error } = await this.client.from('lifelist_data').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data?.data || null;
  },
  async save(user, data) {
    const { error } = await this.client.from('lifelist_data').upsert({ user_id: user.id, data, updated_at: new Date().toISOString() });
    if (error) toast('Sync failed: ' + error.message, 'error');
  },
  async updateProfile(user, name) { await this.client.auth.updateUser({ data: { name } }); },
  async deleteAccount(user) {
    await this.client.from('lifelist_data').delete().eq('user_id', user.id);
    await this.client.auth.signOut();
  },
};
const MainBackend = CFG.supabaseUrl && CFG.supabaseAnonKey ? Supa : Local;

const Store = {
  user: null, data: null, timer: null,
  get backend() { return this.user?.guest ? Local : MainBackend; },
  save() {
    clearTimeout(this.timer);
    const { user, data } = this;
    this.timer = setTimeout(() => this.backend.save(user, data), 250);
  },
};
const ui = {
  tf: { status: 'open', priority: 'all', category: 'all', due: 'all', sort: 'due' },
  taskTab: 'tasks', cal: { mode: 'month', date: today() }, listId: null, lastRoute: null,
};
function commit() { Store.save(); render(); }
function snapshot() { const s = JSON.stringify(Store.data); return () => { Store.data = JSON.parse(s); commit(); toast('Restored', 'ok'); }; }

/* ---------------------------------------------------- domain helpers */
function suggestPriority(due) {
  if (!due) return 'low';
  const d = daysBetween(today(), due);
  return d <= 1 ? 'high' : d <= 3 ? 'medium' : 'low';
}
const effPriority = t => (t.autoPriority ? suggestPriority(t.due) : t.priority || 'medium');
const isOverdue = t => !t.completed && !!t.due && t.due < today();
const linkedReminder = (type, id) => Store.data.reminders.find(r => r.link && r.link.type === type && r.link.id === id);
function setLinkedReminder(type, id, title, at) {
  const d = Store.data;
  const r = linkedReminder(type, id);
  if (!at) { if (r) d.reminders = d.reminders.filter(x => x !== r); return; }
  if (r) { if (r.at !== at) { r.notified = false; r.done = false; } r.at = at; r.title = title; }
  else d.reminders.push({ id: uid(), title, at, repeat: 'none', done: false, notified: false, notes: '', link: { type, id } });
}
const sortByDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || PRI_W[effPriority(b)] - PRI_W[effPriority(a)];
const sortEvents = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');

const KEYWORDS = {
  task: {
    Work: /\b(meeting|email|report|project|client|presentation|boss|slides|deck|proposal|invoice client|standup|review)\b/i,
    Home: /\b(clean|laundry|dishes|vacuum|fix|repair|garden|mow|tidy|organi[sz]e|plants?|trash|bins?)\b/i,
    Health: /\b(gym|workout|doctor|dentist|run|jog|meds?|medicine|yoga|walk|therapy|exercise|vitamins?)\b/i,
    Finance: /\b(pay|bill|rent|tax(es)?|bank|budget|insurance|invoice|mortgage|loan|savings?)\b/i,
    Errands: /\b(pick up|drop off|post office|return|mail|parcel|package|dry clean|car wash|pharmacy)\b/i,
  },
  shopping: {
    Groceries: /\b(milk|bread|eggs?|cheese|apples?|bananas?|fruit|veg|vegetables?|chicken|beef|pork|rice|pasta|coffee|tea|juice|butter|yog(h)?urt|meat|fish|cereal|flour|sugar|oil|salt|onions?|avocados?|carrots?|garlic|lemons?|oranges?|grapes|spinach|potato(es)?|tomato(es)?|lettuce|berries|snacks?|water|cream|beans|soup)\b/i,
    Household: /\b(detergent|soap|paper towels?|toilet paper|trash bags?|bin bags|cleaner|sponges?|bulbs?|batteries|foil|wrap|bleach|dish|napkins|candles?)\b/i,
    Personal: /\b(shampoo|conditioner|toothpaste|toothbrush|deodorant|razor|lotion|makeup|floss|sunscreen|body wash)\b/i,
    Pharmacy: /\b(vitamins?|medicine|bandages?|pills|ibuprofen|tylenol|aspirin|prescription|allergy|cough|plasters?)\b/i,
  },
};
function guessCategory(kind, text) {
  const cats = Store.data.categories[kind];
  for (const [cat, re] of Object.entries(KEYWORDS[kind])) if (re.test(text) && cats.includes(cat)) return cat;
  return kind === 'task' ? (cats.includes('Personal') ? 'Personal' : '') : (cats.includes('Other') ? 'Other' : cats[0] || '');
}

/* Natural-language quick add parser */
function parseQuick(text) {
  let s = ' ' + text + ' ';
  const r = { type: 'task', title: '', date: '', time: '', priority: '', qty: null };
  const take = (re, fn) => { s = s.replace(re, (...m) => { fn(m); return ' '; }); };
  const base = new Date();
  take(/\s!(high|h|urgent)\b/i, () => (r.priority = 'high'));
  take(/\s!(medium|med|m)\b/i, () => (r.priority = 'medium'));
  take(/\s!(low|l)\b/i, () => (r.priority = 'low'));
  take(/\s!!+/, () => (r.priority = 'high'));
  take(/\s(urgent|asap)\b/i, () => (r.priority = 'high'));
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, m => { let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12; r.time = `${pad(h)}:${m[2] || '00'}`; });
  take(/\sat\s+(\d{1,2}):(\d{2})\b/i, m => (r.time = `${pad(+m[1])}:${m[2]}`));
  take(/\s(noon|midday)\b/i, () => (r.time = '12:00'));
  take(/\s(today|tonight)\b/i, m => { r.date = today(); if (/tonight/i.test(m[1]) && !r.time) r.time = '19:00'; });
  take(/\s(tomorrow|tmrw|tmr)\b/i, () => (r.date = ymd(addDays(base, 1))));
  take(/\sin\s+(\d+)\s+days?\b/i, m => (r.date = ymd(addDays(base, +m[1]))));
  take(/\snext\s+week\b/i, () => (r.date = ymd(addDays(base, 7))));
  take(/\s(\d{4}-\d{2}-\d{2})\b/, m => (r.date = m[1]));
  take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i, m => {
    const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase().slice(0, 3));
    let d = new Date(base.getFullYear(), mo, +m[2]);
    if (ymd(d) < today()) d = new Date(base.getFullYear() + 1, mo, +m[2]);
    r.date = ymd(d);
  });
  take(/\s(?:on\s+|next\s+|this\s+)?(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i, m => {
    const idx = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[1].toLowerCase().slice(0, 3));
    r.date = ymd(addDays(base, ((idx - base.getDay() + 7) % 7) || 7));
  });
  if (/^\s*remind me(\s+to)?\s/i.test(s)) { r.type = 'reminder'; s = s.replace(/^\s*remind me(\s+to)?\s/i, ' '); }
  else if (/^\s*(buy|get|pick up|grab|need)\s/i.test(s)) { r.type = 'shopping'; s = s.replace(/^\s*(buy|get|pick up|grab|need)\s/i, ' '); }
  else if (/\b(meeting|appointment|appt|dentist|doctor|party|dinner|lunch|breakfast|interview|class|birthday|concert|game|wedding|flight|call with|date night|recital)\b/i.test(s) && (r.date || r.time)) r.type = 'event';
  if (r.type === 'shopping') {
    take(/\sx\s?(\d+)\b/i, m => (r.qty = +m[1]));
    const q = s.match(/^\s*(\d+)\s+/); if (q) { r.qty = +q[1]; s = s.replace(/^\s*\d+\s+/, ' '); }
  }
  s = s.replace(/\s+(on|at|by)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  r.title = cap(s);
  return r;
}

/* Smart scheduling: fit open tasks into free time around events */
function planDay(dateStr = today()) {
  const d = Store.data;
  let start = toMin(d.settings.dayStart || '08:00');
  const end = toMin(d.settings.dayEnd || '21:00');
  if (dateStr === today()) { const n = new Date(); start = Math.max(start, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15); }
  const busy = [
    ...d.events.filter(e => e.date === dateStr && e.time).map(e => ({ s: toMin(e.time), e: e.endTime ? toMin(e.endTime) : toMin(e.time) + 60, title: e.title, kind: 'event', sub: e.location || 'Event' })),
    ...d.tasks.filter(t => !t.completed && t.due === dateStr && t.time).map(t => ({ s: toMin(t.time), e: toMin(t.time) + (t.duration || 30), title: t.title, kind: 'task', pri: effPriority(t), sub: 'Scheduled task', id: t.id })),
  ].sort((a, b) => a.s - b.s);
  const horizon = ymd(addDays(parseYmd(dateStr), 3));
  const pool = d.tasks.filter(t => !t.completed && !(t.due === dateStr && t.time) && (t.due ? t.due <= horizon : effPriority(t) === 'high'))
    .sort((a, b) => (isOverdue(b) - isOverdue(a)) || PRI_W[effPriority(b)] - PRI_W[effPriority(a)] || sortByDue(a, b));
  const blocks = []; const leftover = [];
  let cur = start;
  for (const t of pool) {
    const dur = t.duration || 30;
    let moved = true;
    while (moved) { moved = false; for (const b of busy) if (cur < b.e && cur + dur > b.s) { cur = b.e; moved = true; } }
    if (cur + dur > end) { leftover.push(t); continue; }
    const why = isOverdue(t) ? 'Overdue' : t.due === dateStr ? 'Due today' : t.due ? `Due ${relLower(t.due)}` : 'High priority';
    const blk = { s: cur, e: cur + dur, title: t.title, kind: 'task', pri: effPriority(t), sub: `${why} · ${dur} min`, id: t.id };
    blocks.push(blk); busy.push(blk);
    cur += dur + 5;
  }
  return { slots: [...busy].sort((a, b) => a.s - b.s), leftover };
}
/* Suggest least-busy days for unfinished tasks */
function suggestDays(tasks) {
  const d = Store.data; const load = {};
  for (let i = 0; i < 7; i++) {
    const k = ymd(addDays(new Date(), i));
    load[k] = d.tasks.filter(t => !t.completed && t.due === k).length + d.events.filter(e => e.date === k).length + (i === 0 ? 1 : 0);
  }
  return tasks.map(t => {
    const best = Object.keys(load).sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0];
    load[best]++;
    return { task: t, date: best };
  });
}

/* --------------------------------------------------------- task actions */
function saveTask(v, existing) {
  const pr = v.priority;
  const obj = { title: v.title, notes: v.notes, due: v.due, time: v.time, category: v.category, recur: v.recur, duration: v.duration || 30, autoPriority: pr === 'auto', priority: pr === 'auto' ? suggestPriority(v.due) : pr };
  if (obj.recur !== 'none' && !obj.due) obj.due = today();
  let t;
  if (existing) t = Object.assign(existing, obj);
  else { t = newTask(obj); Store.data.tasks.push(t); }
  setLinkedReminder('task', t.id, t.title, v.remindAt);
  commit(); toast(existing ? 'Task updated' : 'Task added', 'ok');
}
function toggleTask(id) {
  const t = Store.data.tasks.find(x => x.id === id); if (!t) return;
  t.completed = !t.completed;
  t.completedAt = t.completed ? new Date().toISOString() : null;
  const r = linkedReminder('task', t.id); if (r) r.done = t.completed;
  if (t.completed && t.recur && t.recur !== 'none' && !t.spawned) {
    t.spawned = true;
    const n = newTask({ ...t, id: uid(), completed: false, completedAt: null, spawned: false, createdAt: new Date().toISOString(), due: nextDate(t.due || today(), t.recur) });
    Store.data.tasks.push(n);
    toast(`Nice! Next “${t.title}” scheduled for ${relLower(n.due)}`, 'ok');
  } else if (t.completed) {
    const st = todayStats();
    toast(st.total && st.done === st.total ? 'All of today’s tasks are done! 🎉' : 'Task completed', 'ok', { label: 'Undo', fn: () => toggleTask(id) });
  }
  commit();
}
function deleteTask(id) {
  const undo = snapshot();
  Store.data.tasks = Store.data.tasks.filter(t => t.id !== id);
  Store.data.reminders = Store.data.reminders.filter(r => !(r.link?.type === 'task' && r.link.id === id));
  commit(); toast('Task deleted', 'info', { label: 'Undo', fn: undo });
}
function saveEvent(v, existing) {
  const obj = { title: v.title, date: v.date, time: v.time, endTime: v.endTime, location: v.location, description: v.description, important: v.important, remindBefore: v.remindBefore };
  let e;
  if (existing) e = Object.assign(existing, obj);
  else { e = { id: uid(), ...obj }; Store.data.events.push(e); }
  let at = '';
  if (v.remindBefore !== '' && v.remindBefore != null && v.remindBefore !== 'none') {
    const [y, m, dd] = e.date.split('-').map(Number); const [h, mi] = (e.time || '09:00').split(':').map(Number);
    at = localStr(new Date(new Date(y, m - 1, dd, h, mi).getTime() - Number(v.remindBefore) * 6e4));
  }
  setLinkedReminder('event', e.id, e.title, at);
  commit(); toast(existing ? 'Event updated' : 'Event added to calendar', 'ok');
}
function deleteEvent(id) {
  const undo = snapshot();
  Store.data.events = Store.data.events.filter(e => e.id !== id);
  Store.data.reminders = Store.data.reminders.filter(r => !(r.link?.type === 'event' && r.link.id === id));
  commit(); toast('Event deleted', 'info', { label: 'Undo', fn: undo });
}
function saveReminder(v, existing) {
  const obj = { title: v.title, at: v.at, repeat: v.repeat, notes: v.notes };
  if (existing) { if (existing.at !== v.at) { existing.notified = false; existing.done = false; } Object.assign(existing, obj); }
  else Store.data.reminders.push({ id: uid(), done: false, notified: false, ...obj });
  commit(); toast(existing ? 'Reminder updated' : 'Reminder set', 'ok');
}
function doneReminder(id) {
  const r = Store.data.reminders.find(x => x.id === id); if (!r) return;
  if (r.done) { r.done = false; }
  else if (r.repeat && r.repeat !== 'none') {
    const now = nowLocal(); let at = r.at;
    do at = nextAt(at, r.repeat); while (at <= now);
    r.at = at; r.notified = false;
    toast(`Next reminder: ${fmtDateTime(at)}`, 'ok');
  } else { r.done = true; toast('Reminder completed', 'ok'); }
  commit();
}
function deleteReminder(id) {
  const undo = snapshot();
  Store.data.reminders = Store.data.reminders.filter(r => r.id !== id);
  commit(); toast('Reminder deleted', 'info', { label: 'Undo', fn: undo });
}
const curList = () => Store.data.lists.find(l => l.id === ui.listId) || Store.data.lists[0];
function findItem(id) { for (const l of Store.data.lists) { const i = l.items.find(x => x.id === id); if (i) return [l, i]; } return []; }

/* ------------------------------------------------------- modals/forms */
function openModal(html, onMount) {
  const root = $('#modal-root');
  const prev = document.activeElement;
  root.innerHTML = `<div class="overlay" data-close></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  root._prev = prev;
  const m = $('.modal', root);
  $$('[data-close]', root).forEach(b => b.addEventListener('click', closeModal));
  onMount && onMount(m);
  setTimeout(() => { const f = $('input:not([type=checkbox]):not([readonly]), textarea, select', m); f && f.focus(); }, 30);
}
function closeModal() {
  const root = $('#modal-root');
  root.classList.remove('open'); root.innerHTML = '';
  root._prev && root._prev.focus && root._prev.focus();
}
function fieldHtml(f, v) {
  const id = 'f_' + f.name; const val = v ?? f.default ?? '';
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
  let input;
  if (f.type === 'checkbox') return `<label class="check-field"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" rows="3" ${ph}>${esc(val)}</textarea>`;
  else if (f.type === 'select') input = `<select id="${id}" name="${f.name}">${f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else input = `<input id="${id}" type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" ${ph} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''}>`;
  return `<div class="field ${f.half ? 'half' : ''}"><label for="${id}">${esc(f.label)}${f.required ? '' : ''}</label>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
}
function openForm({ title, icon = 'edit', fields, values = {}, submitLabel = 'Save', onSubmit, onDelete }) {
  openModal(`<form class="form" novalidate>
    <div class="modal-head"><h2>${ic(icon)}${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="fields">${fields.map(f => fieldHtml(f, values[f.name])).join('')}</div>
    <div class="modal-foot">${onDelete ? `<button type="button" class="btn danger-ghost" data-del>${ic('trash')} Delete</button>` : ''}<span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${esc(submitLabel)}</button></div>
  </form>`, m => {
    const form = $('form', m);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => {
        const el = form.elements[f.name];
        out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
      });
      const missing = fields.find(f => f.required && !out[f.name]);
      if (missing) { const el = form.elements[missing.name]; el.classList.add('invalid'); el.focus(); return; }
      closeModal(); onSubmit(out);
    });
    form.addEventListener('input', e => e.target.classList.remove('invalid'));
    onDelete && $('[data-del]', m).addEventListener('click', () => { closeModal(); onDelete(); });
  });
}
function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    openModal(`<div class="modal-head"><h2>${ic('alert')}Are you sure?</h2></div><p class="muted">${esc(msg)}</p>
      <div class="modal-foot"><span class="spacer"></span><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>${esc(okLabel)}</button></div>`, m => {
      $('[data-no]', m).onclick = () => { closeModal(); res(false); };
      $('[data-yes]', m).onclick = () => { closeModal(); res(true); };
      $('.overlay').onclick = () => { closeModal(); res(false); };
    });
  });
}

function openTaskForm(t, pre = {}) {
  const d = Store.data; const r = t && linkedReminder('task', t.id);
  openForm({
    title: t ? 'Edit task' : 'New task', icon: 'tasks', submitLabel: t ? 'Save changes' : 'Add task',
    fields: [
      { name: 'title', label: 'Task', required: true, placeholder: 'What needs doing?' },
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add details (optional)' },
      { name: 'due', label: 'Due date', type: 'date', half: true },
      { name: 'time', label: 'Time', type: 'time', half: true },
      { name: 'priority', label: 'Priority', type: 'select', half: true, options: [['auto', '✨ Auto (by deadline)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
      { name: 'category', label: 'Category', type: 'select', half: true, options: [['', 'No category'], ...d.categories.task] },
      { name: 'recur', label: 'Repeat', type: 'select', half: true, options: RECUR },
      { name: 'duration', label: 'Estimated time (min)', type: 'number', half: true, min: 5, step: 5 },
      { name: 'remindAt', label: 'Remind me', type: 'datetime-local', hint: 'Optional – you’ll get a notification at this time' },
    ],
    values: t ? { ...t, priority: t.autoPriority ? 'auto' : t.priority, remindAt: r?.at || '' } : { priority: 'auto', recur: 'none', duration: 30, category: '', ...pre },
    onSubmit: v => saveTask(v, t), onDelete: t ? () => deleteTask(t.id) : null,
  });
}
function openEventForm(e, pre = {}) {
  openForm({
    title: e ? 'Edit event' : 'New event', icon: 'calendar', submitLabel: e ? 'Save changes' : 'Add event',
    fields: [
      { name: 'title', label: 'Event', required: true, placeholder: 'e.g. Doctor’s appointment' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Start time', type: 'time', half: true },
      { name: 'endTime', label: 'End time', type: 'time', half: true },
      { name: 'location', label: 'Location', placeholder: 'Where is it?' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'remindBefore', label: 'Reminder', type: 'select', options: [['none', 'No reminder'], ['0', 'At start time'], ['10', '10 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']] },
      { name: 'important', label: '⭐ Mark as an important date', type: 'checkbox' },
    ],
    values: e ? { remindBefore: 'none', ...e } : { date: ui.cal.date || today(), remindBefore: '30', ...pre },
    onSubmit: v => saveEvent(v, e), onDelete: e ? () => deleteEvent(e.id) : null,
  });
}
function openReminderForm(r, pre = {}) {
  const def = new Date(); def.setMinutes(0); def.setHours(def.getHours() + 1);
  openForm({
    title: r ? 'Edit reminder' : 'New reminder', icon: 'bell', submitLabel: r ? 'Save changes' : 'Set reminder',
    fields: [
      { name: 'title', label: 'Remind me to…', required: true, placeholder: 'e.g. Take out the bins' },
      { name: 'at', label: 'Date & time', type: 'datetime-local', required: true, half: true },
      { name: 'repeat', label: 'Repeat', type: 'select', half: true, options: RECUR },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    values: r || { at: localStr(def), repeat: 'none', ...pre },
    onSubmit: v => saveReminder(v, r), onDelete: r ? () => deleteReminder(r.id) : null,
  });
}
function openItemForm(item, list, pre = {}) {
  const d = Store.data;
  openForm({
    title: item ? 'Edit item' : 'Add item', icon: 'cart', submitLabel: item ? 'Save changes' : 'Add item',
    fields: [
      { name: 'name', label: 'Item', required: true },
      { name: 'qty', label: 'Quantity', type: 'number', half: true, min: 1, step: 1 },
      { name: 'price', label: 'Est. price (each)', type: 'number', half: true, min: 0, step: '0.01' },
      { name: 'category', label: 'Category', type: 'select', half: true, options: d.categories.shopping },
      { name: 'listId', label: 'List', type: 'select', half: true, options: d.lists.map(l => [l.id, l.name]) },
    ],
    values: item ? { ...item, listId: list.id } : { qty: 1, listId: list?.id, category: 'Groceries', ...pre },
    onSubmit: v => {
      const target = d.lists.find(l => l.id === v.listId) || list;
      const obj = { name: v.name, qty: Math.max(1, v.qty || 1), price: v.price, category: v.category };
      if (item) {
        Object.assign(item, obj);
        if (target !== list) { list.items = list.items.filter(i => i !== item); target.items.push(item); }
      } else target.items.push({ id: uid(), checked: false, ...obj });
      commit(); toast(item ? 'Item updated' : `Added to ${target.name}`, 'ok');
    },
    onDelete: item ? () => { const undo = snapshot(); list.items = list.items.filter(i => i !== item); commit(); toast('Item removed', 'info', { label: 'Undo', fn: undo }); } : null,
  });
}
function openListForm(list) {
  openForm({
    title: list ? 'Edit list' : 'New shopping list', icon: 'list', submitLabel: list ? 'Save' : 'Create list',
    fields: [
      { name: 'name', label: 'List name', required: true, placeholder: 'e.g. Weekend groceries' },
      { name: 'budget', label: 'Budget (optional)', type: 'number', min: 0, step: '0.01', hint: 'Track estimated spend against a budget' },
    ],
    values: list || {},
    onSubmit: v => {
      if (list) Object.assign(list, { name: v.name, budget: v.budget || 0 });
      else { const l = { id: uid(), name: v.name, budget: v.budget || 0, items: [] }; Store.data.lists.push(l); ui.listId = l.id; }
      commit();
    },
    onDelete: list && Store.data.lists.length ? async () => {
      if (!(await confirmBox(`Delete “${list.name}” and its ${list.items.length} items?`))) return;
      const undo = snapshot();
      Store.data.lists = Store.data.lists.filter(l => l !== list); ui.listId = null;
      commit(); toast('List deleted', 'info', { label: 'Undo', fn: undo });
    } : null,
  });
}

/* Quick add */
function previewChips(p) {
  const label = { task: 'Tasks', event: 'Calendar', reminder: 'Reminders', shopping: 'Shopping' }[p.type];
  const chips = [`<span class="chip-p chip-main">${ic(TYPE_ICON[p.type])}${label}</span>`];
  if (!p.title) return '<span>Start typing — LifeList will sort it for you.</span>';
  if (p.date) chips.push(`<span class="chip-p">${ic('calendar')}${relDate(p.date)}</span>`);
  if (p.time) chips.push(`<span class="chip-p">${ic('clock')}${fmtTime(p.time)}</span>`);
  if (p.type === 'task') {
    chips.push(`<span class="chip-p">${ic('flag')}${cap(p.priority || suggestPriority(p.date))}${p.priority ? '' : ' (auto)'}</span>`);
    const c = guessCategory('task', p.title); if (c) chips.push(`<span class="chip-p">${ic('tag')}${esc(c)}</span>`);
  }
  if (p.type === 'shopping') {
    chips.push(`<span class="chip-p">${ic('tag')}${esc(guessCategory('shopping', p.title))}</span>`);
    if (p.qty) chips.push(`<span class="chip-p">× ${p.qty}</span>`);
  }
  if (p.type === 'reminder' && !p.time) chips.push('<span class="chip-p">in 1 hour</span>');
  return chips.join('');
}
function openQuickAdd(preType) {
  let manual = preType || null;
  const d = Store.data;
  openModal(`<div class="modal-head"><h2>${ic('zap')}Quick add</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ic('x')}</button></div>
    <form id="qa-form" autocomplete="off">
      <div class="seg qa-types">${['task', 'event', 'reminder', 'shopping'].map(t => `<button type="button" data-type="${t}">${ic(TYPE_ICON[t])}${t === 'shopping' ? 'Item' : cap(t)}</button>`).join('')}</div>
      <input id="qa-text" class="qa-input" placeholder="Try “Dentist Friday 3pm” or “Buy 2 milk”" aria-label="What do you want to add?">
      <div id="qa-preview" class="qa-preview"></div>
      <div id="qa-list" class="field"><label for="qa-list-sel">Add to list</label><select id="qa-list-sel">${d.lists.map(l => `<option value="${l.id}" ${l.id === (ui.listId || d.lists[0]?.id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <p class="hint">Tip: use words like “tomorrow”, “Fri”, “Nov 20”, “3pm”, “!high”, “remind me to…”, or “buy…”.</p>
      <div class="modal-foot"><button type="button" class="btn ghost" id="qa-more">More options</button><span class="spacer"></span><button class="btn primary">${ic('plus')}Add</button></div>
    </form>`, m => {
    const input = $('#qa-text', m);
    const update = () => {
      const p = parseQuick(input.value); p.type = manual || p.type;
      $$('.qa-types button', m).forEach(b => b.classList.toggle('on', b.dataset.type === p.type));
      $('#qa-list', m).hidden = p.type !== 'shopping' || d.lists.length < 2;
      $('#qa-preview', m).innerHTML = previewChips(p);
      return p;
    };
    $$('.qa-types button', m).forEach(b => (b.onclick = () => { manual = b.dataset.type; update(); input.focus(); }));
    input.addEventListener('input', () => { input.classList.remove('invalid'); update(); });
    update();
    $('#qa-form', m).onsubmit = e => {
      e.preventDefault();
      const p = update();
      if (!p.title) { input.classList.add('invalid'); input.focus(); return; }
      closeModal(); quickCreate(p, $('#qa-list-sel', m).value);
    };
    $('#qa-more', m).onclick = () => {
      const p = update(); closeModal();
      if (p.type === 'task') openTaskForm(null, { title: p.title, due: p.date, time: p.time, priority: p.priority || 'auto', category: p.title ? guessCategory('task', p.title) : '' });
      else if (p.type === 'event') openEventForm(null, { title: p.title, date: p.date || today(), time: p.time });
      else if (p.type === 'reminder') openReminderForm(null, p.title ? { title: p.title, ...(p.date || p.time ? { at: `${p.date || today()}T${p.time || '09:00'}` } : {}) } : {});
      else openItemForm(null, curList(), { name: p.title, qty: p.qty || 1, category: p.title ? guessCategory('shopping', p.title) : 'Groceries' });
    };
  });
}
function quickCreate(p, listId) {
  const d = Store.data; let msg, go;
  if (p.type === 'task') {
    d.tasks.push(newTask({ title: p.title, due: p.date, time: p.time, priority: p.priority || suggestPriority(p.date), autoPriority: !p.priority, category: guessCategory('task', p.title) }));
    msg = 'Added to My Tasks'; go = () => { ui.taskTab = 'tasks'; nav('tasks'); };
  } else if (p.type === 'event') {
    const e = { id: uid(), title: p.title, date: p.date || today(), time: p.time, endTime: '', location: '', description: '', important: /birthday|anniversary|wedding/i.test(p.title), remindBefore: p.time ? '30' : 'none' };
    d.events.push(e);
    if (p.time) { const [y, m, dd] = e.date.split('-').map(Number); const [h, mi] = e.time.split(':').map(Number); setLinkedReminder('event', e.id, e.title, localStr(new Date(new Date(y, m - 1, dd, h, mi) - 30 * 6e4))); }
    msg = `Added to Calendar · ${relDate(e.date)}`; go = () => { ui.cal.date = e.date; nav('calendar'); };
  } else if (p.type === 'reminder') {
    let at;
    if (p.date || p.time) at = `${p.date || today()}T${p.time || '09:00'}`;
    else { const n = new Date(Date.now() + 36e5); n.setSeconds(0); at = localStr(n); }
    d.reminders.push({ id: uid(), title: p.title, at, repeat: 'none', done: false, notified: false, notes: '' });
    msg = `Reminder set · ${fmtDateTime(at)}`; go = () => { ui.taskTab = 'reminders'; nav('tasks'); };
  } else {
    let list = d.lists.find(l => l.id === listId) || d.lists[0];
    if (!list) { list = { id: uid(), name: 'Shopping list', budget: 0, items: [] }; d.lists.push(list); }
    list.items.push({ id: uid(), name: p.title, qty: p.qty || 1, category: guessCategory('shopping', p.title), price: null, checked: false });
    msg = `Added to ${list.name}`; go = () => { ui.listId = list.id; nav('shopping'); };
  }
  commit(); toast(msg, 'ok', { label: 'View', fn: go });
}

/* ------------------------------------------------------------- toasts */
function toast(msg, type = 'info', action) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${ic(type === 'ok' ? 'check' : type === 'error' ? 'alert' : type === 'reminder' ? 'bell' : 'sparkle')}<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => { el.remove(); action.fn(); };
  const box = $('#toasts'); box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), type === 'reminder' ? 12000 : 4500);
}

/* ------------------------------------------------------------ rendering */
const card = (title, icon, body, { link, linkLabel = 'View all', cls = '', extra = '' } = {}) =>
  `<section class="card ${cls}"><header class="card-head"><h2>${ic(icon)}${esc(title)}</h2>${extra}${link ? `<a href="#/${link}" class="link">${linkLabel}</a>` : ''}</header>${body}</section>`;
const empty = (msg, icon = 'check') => `<div class="empty">${ic(icon)}${msg}</div>`;
const rb = (action, id) => `role="button" tabindex="0" data-action="${action}" data-id="${id}"`;

function taskRow(t) {
  const p = effPriority(t); const od = isOverdue(t);
  const days = od ? -daysBetween(today(), t.due) : 0;
  return `<div class="item task ${t.completed ? 'done' : ''} ${od ? 'overdue' : ''}">
    <button class="check ${t.completed ? 'on' : ''}" data-action="toggle-task" data-id="${t.id}" aria-label="${t.completed ? 'Mark incomplete' : 'Mark complete'}: ${esc(t.title)}">${ic('check')}</button>
    <div class="item-main" ${rb('edit-task', t.id)}>
      <div class="item-title">${esc(t.title)}</div>
      <div class="meta">
        <span class="pill p-${p}" title="${t.autoPriority ? 'Priority suggested from deadline' : ''}">${p}${t.autoPriority ? ' ✨' : ''}</span>
        ${t.category ? `<span class="tag">${esc(t.category)}</span>` : ''}
        ${t.due ? `<span class="${od ? 'danger' : ''}">${ic('clock')}${relDate(t.due)}${t.time ? ' · ' + fmtTime(t.time) : ''}${od ? ` · ${days}d overdue` : ''}</span>` : ''}
        ${t.recur && t.recur !== 'none' ? `<span>${ic('repeat')}${cap(t.recur)}</span>` : ''}
        ${linkedReminder('task', t.id) && !t.completed ? `<span>${ic('bell')}</span>` : ''}
        ${t.notes ? `<span class="note">${esc(t.notes)}</span>` : ''}
      </div>
    </div>
    <button class="icon-btn sm" data-action="delete-task" data-id="${t.id}" aria-label="Delete task">${ic('trash')}</button>
  </div>`;
}
function eventRow(e) {
  const dt = parseYmd(e.date);
  return `<div class="item event ${e.important ? 'important' : ''}" ${rb('edit-event', e.id)}>
    <div class="date-badge"><span>${dt.toLocaleDateString([], { month: 'short' })}</span><b>${dt.getDate()}</b></div>
    <div class="item-main"><div class="item-title">${e.important ? ic('star', 'star') : ''}${esc(e.title)}</div>
      <div class="meta"><span>${ic('clock')}${relDate(e.date)} · ${e.time ? fmtTime(e.time) + (e.endTime ? '–' + fmtTime(e.endTime) : '') : 'All day'}</span>
      ${e.location ? `<span>${ic('pin')}${esc(e.location)}</span>` : ''}</div></div>
  </div>`;
}
function reminderRow(r) {
  const due = !r.done && r.at <= nowLocal();
  return `<div class="item reminder ${r.done ? 'done' : ''} ${due ? 'overdue' : ''}">
    <button class="check ${r.done ? 'on' : ''}" data-action="done-reminder" data-id="${r.id}" aria-label="Mark reminder done">${ic('check')}</button>
    <div class="item-main" ${rb('edit-reminder', r.id)}>
      <div class="item-title">${esc(r.title)}</div>
      <div class="meta"><span class="${due ? 'danger' : ''}">${ic('bell')}${fmtDateTime(r.at)}${due ? ' · Due now' : ''}</span>
      ${r.repeat && r.repeat !== 'none' ? `<span>${ic('repeat')}${cap(r.repeat)}</span>` : ''}
      ${r.link ? `<span class="tag">${r.link.type === 'task' ? 'Task' : 'Event'}</span>` : ''}</div>
    </div>
    <button class="icon-btn sm" data-action="delete-reminder" data-id="${r.id}" aria-label="Delete reminder">${ic('trash')}</button>
  </div>`;
}
function ring(pct, size = 66) {
  const r = 27, C = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 66 66" role="img" aria-label="${pct}% complete"><circle cx="33" cy="33" r="${r}" fill="none" stroke="var(--surface)" stroke-width="8"/>
    <circle cx="33" cy="33" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * pct) / 100} ${C}" transform="rotate(-90 33 33)"/>
    <text x="33" y="38" text-anchor="middle">${pct}%</text></svg>`;
}
function todayStats() {
  const td = today(); const d = Store.data;
  const due = d.tasks.filter(t => t.due === td);
  const done = due.filter(t => t.completed).length;
  return { total: due.length, done, open: due.length - done, pct: due.length ? Math.round((done / due.length) * 100) : 0, overdue: d.tasks.filter(isOverdue).length };
}
const dueReminders = () => Store.data.reminders.filter(r => !r.done && r.at <= nowLocal());
const firstName = () => (Store.data.profile.name || 'there').split(' ')[0];

/* ---- Home */
const W = {
  summary() {
    const s = todayStats(); const td = today(); const d = Store.data;
    const evToday = d.events.filter(e => e.date === td).length;
    const shopLeft = d.lists.reduce((a, l) => a + l.items.filter(i => !i.checked).length, 0);
    return `<section class="card span-2 stats">
      <div class="stat ring-stat">${ring(s.pct)}<div><div class="stat-label">Today’s progress</div><div class="stat-val">${s.done} of ${s.total} tasks done</div>
        <div class="stat-label">${s.total === 0 ? 'Nothing due today' : s.pct === 100 ? 'Everything done – great work!' : `${s.open} to go`}</div></div></div>
      <a class="stat" href="#/tasks"><div class="stat-val">${s.open}</div><div class="stat-label">Unfinished today</div></a>
      <a class="stat ${s.overdue ? 'is-danger' : 'is-ok'}" href="#/tasks" data-action="filter-overdue"><div class="stat-val">${s.overdue}</div><div class="stat-label">Overdue</div></a>
      <a class="stat" href="#/calendar"><div class="stat-val">${evToday}</div><div class="stat-label">Events today</div></a>
      <a class="stat" href="#/shopping"><div class="stat-val">${shopLeft}</div><div class="stat-label">Items to buy</div></a>
    </section>`;
  },
  today() {
    const td = today();
    const list = Store.data.tasks.filter(t => (t.due === td) || isOverdue(t)).sort((a, b) => a.completed - b.completed || sortByDue(a, b));
    return card("Today’s tasks", 'tasks', list.length ? `<div class="list">${list.map(taskRow).join('')}</div>` : empty('No tasks due today. Enjoy the free time!'), { link: 'tasks', extra: `<button class="btn sm ghost" data-action="new-task" data-due="${td}">${ic('plus')}Add</button>` });
  },
  priority() {
    const list = Store.data.tasks.filter(t => !t.completed && effPriority(t) === 'high').sort(sortByDue).slice(0, 5);
    return card('Needs attention', 'flag', list.length ? `<div class="list">${list.map(taskRow).join('')}</div>` : empty('No high-priority tasks right now.'), { link: 'tasks' });
  },
  events() {
    const td = today(); const end = ymd(addDays(new Date(), 14));
    const list = Store.data.events.filter(e => e.date >= td && e.date <= end).sort(sortEvents).slice(0, 5);
    return card('Upcoming events', 'calendar', list.length ? `<div class="list">${list.map(eventRow).join('')}</div>` : empty('No upcoming events in the next two weeks.', 'calendar'), { link: 'calendar', extra: `<button class="btn sm ghost" data-action="new-event">${ic('plus')}Add</button>` });
  },
  deadlines() {
    const td = today(); const end = ymd(addDays(new Date(), 7));
    const list = Store.data.tasks.filter(t => !t.completed && t.due > td && t.due <= end).sort(sortByDue).slice(0, 6);
    return card('Approaching deadlines', 'clock', list.length ? `<div class="list">${list.map(taskRow).join('')}</div>` : empty('No deadlines in the next 7 days.', 'clock'), { link: 'calendar', linkLabel: 'Calendar' });
  },
  reminders() {
    const lim = localStr(addDays(new Date(), 2));
    const list = Store.data.reminders.filter(r => !r.done && r.at <= lim).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5);
    return card('Reminders', 'bell', list.length ? `<div class="list">${list.map(reminderRow).join('')}</div>` : empty('No reminders in the next 48 hours.', 'bell'), { extra: `<button class="btn sm ghost" data-action="new-reminder">${ic('plus')}Add</button>` });
  },
  plan() {
    const { slots, leftover } = planDay();
    const body = slots.length ? `<div class="timeline">${slots.map(s => `<div class="slot"><time>${fmtTime(fromMin(s.s))}</time>
        <div class="block ${s.kind === 'event' ? 'event' : 'p-' + s.pri}" ${s.id ? rb('edit-task', s.id) : ''}>${esc(s.title)}<small>${s.kind === 'event' ? ic('calendar') + ' ' : ''}${esc(s.sub)} · until ${fmtTime(fromMin(s.e))}</small></div></div>`).join('')}</div>
        ${leftover.length ? `<div class="banner info" style="margin:14px 0 0">${ic('sparkle')}<p>${leftover.length} task${leftover.length > 1 ? 's' : ''} won’t fit today. Move ${leftover.length > 1 ? 'them' : 'it'} to the least busy upcoming days?</p><button class="btn sm primary" data-action="reschedule" data-ids="${leftover.map(t => t.id).join(',')}">Reschedule</button></div>` : ''}`
      : empty('Your day is clear. Add tasks with due dates and LifeList will plan your day.', 'sparkle');
    return card('Smart day plan', 'sparkle', body, { cls: 'ai-card', extra: `<span class="muted" style="font-size:.78rem">Auto-planned around your events</span>` });
  },
  shopping() {
    const lists = Store.data.lists;
    const body = lists.length ? `<div class="list">${lists.map(l => {
      const left = l.items.filter(i => !i.checked).length; const pct = l.items.length ? ((l.items.length - left) / l.items.length) * 100 : 0;
      return `<div class="item" ${rb('open-list', l.id)} style="flex-direction:column;align-items:stretch;gap:8px"><div class="budget-row" style="margin:0"><b>${esc(l.name)}</b><span>${left} of ${l.items.length} left</span></div><div class="progress ${pct === 100 ? 'ok' : ''}"><span style="width:${pct}%"></span></div></div>`;
    }).join('')}</div>` : empty('No shopping lists yet.', 'cart');
    return card('Shopping lists', 'cart', body, { link: 'shopping' });
  },
};
function viewHome() {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const s = todayStats(); const ev = Store.data.events.filter(e => e.date === today()).length;
  const line = s.open || ev
    ? `You have ${s.open ? `<b>${s.open} task${s.open > 1 ? 's' : ''}</b> left` : 'no tasks left'}${ev ? ` and <b>${ev} event${ev > 1 ? 's' : ''}</b>` : ''} today${s.overdue ? ` · <span class="danger">${s.overdue} overdue</span>` : ''}.`
    : s.overdue ? `<span class="danger">${s.overdue} overdue task${s.overdue > 1 ? 's' : ''}</span> waiting for you.` : 'All clear for today. Make everyday life easier to manage.';
  const widgets = Store.data.settings.dashboard.filter(w => w.on && W[w.id]).map(w => W[w.id]()).join('');
  return `<section class="page-head"><div>
      <p class="eyebrow">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <h1>${greet}, ${esc(firstName())}</h1><p class="muted">${line}</p></div>
      <button class="btn primary" data-action="quick-add">${ic('plus')}Quick add</button></section>
    <div class="dash">${widgets || `<section class="card span-2">${empty('All dashboard widgets are hidden. Turn them on in <a href="#/settings">Settings</a>.', 'layout')}</section>`}</div>`;
}

/* ---- Tasks */
function viewTasks() {
  const tab = ui.taskTab; const d = Store.data;
  const openCount = d.tasks.filter(t => !t.completed).length;
  const remCount = d.reminders.filter(r => !r.done).length;
  return `<section class="page-head"><div><h1>My Tasks</h1><p class="muted">${openCount} open task${openCount === 1 ? '' : 's'} · ${remCount} active reminder${remCount === 1 ? '' : 's'}</p></div>
      <div class="head-actions"><button class="btn primary" data-action="${tab === 'tasks' ? 'new-task' : 'new-reminder'}">${ic('plus')}${tab === 'tasks' ? 'New task' : 'New reminder'}</button></div></section>
    <div class="tabs" role="tablist">
      <button role="tab" class="${tab === 'tasks' ? 'on' : ''}" data-action="task-tab" data-v="tasks">${ic('tasks')}Tasks <span class="badge soft">${openCount}</span></button>
      <button role="tab" class="${tab === 'reminders' ? 'on' : ''}" data-action="task-tab" data-v="reminders">${ic('bell')}Reminders ${dueReminders().length ? `<span class="badge">${dueReminders().length}</span>` : ''}</button>
    </div>
    ${tab === 'tasks' ? tasksPanel() : remindersPanel()}`;
}
function tasksPanel() {
  const f = ui.tf; const d = Store.data; const td = today(); const wk = ymd(addDays(new Date(), 7));
  let list = d.tasks.filter(t => {
    if (f.priority !== 'all' && effPriority(t) !== f.priority) return false;
    if (f.category !== 'all' && (t.category || '') !== f.category) return false;
    if (f.due === 'overdue' && !isOverdue(t)) return false;
    if (f.due === 'today' && t.due !== td) return false;
    if (f.due === 'week' && !(t.due && t.due >= td && t.due <= wk)) return false;
    if (f.due === 'none' && t.due) return false;
    return true;
  });
  const sorters = { due: sortByDue, priority: (a, b) => PRI_W[effPriority(b)] - PRI_W[effPriority(a)] || sortByDue(a, b), created: (a, b) => b.createdAt.localeCompare(a.createdAt), title: (a, b) => a.title.localeCompare(b.title) };
  list.sort(sorters[f.sort] || sortByDue);
  const open = list.filter(t => !t.completed);
  const done = list.filter(t => t.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const sel = (key, opts) => `<select data-filter="${key}" aria-label="Filter by ${key}">${opts.map(([v, l]) => `<option value="${v}" ${f[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const overdue = d.tasks.filter(isOverdue);
  let html = `<div class="filters">
    <div class="seg">${[['open', 'To do'], ['done', 'Completed'], ['all', 'All']].map(([v, l]) => `<button class="${f.status === v ? 'on' : ''}" data-action="tf-status" data-v="${v}">${l}</button>`).join('')}</div>
    ${sel('priority', [['all', 'All priorities'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']])}
    ${sel('category', [['all', 'All categories'], ...d.categories.task.map(c => [esc(c), esc(c)]), ['', 'Uncategorised']])}
    ${sel('due', [['all', 'Any due date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Next 7 days'], ['none', 'No due date']])}
    ${sel('sort', [['due', 'Sort: Due date'], ['priority', 'Sort: Priority'], ['created', 'Sort: Newest'], ['title', 'Sort: A–Z']])}
    ${f.priority !== 'all' || f.category !== 'all' || f.due !== 'all' ? `<button class="btn sm ghost" data-action="clear-filters">${ic('x')}Clear</button>` : ''}
  </div>`;
  if (overdue.length && f.status !== 'done') html += `<div class="banner">${ic('alert')}<p><b>${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}.</b> LifeList can spread ${overdue.length > 1 ? 'them' : 'it'} across your least busy days this week.</p><button class="btn sm primary" data-action="reschedule" data-ids="${overdue.map(t => t.id).join(',')}">${ic('sparkle')}Smart reschedule</button></div>`;
  if (f.status !== 'done') {
    if (!open.length) html += `<div class="card">${empty(list.length ? 'All matching tasks are done!' : 'No tasks match. Add one with the + button.')}</div>`;
    else if (f.sort === 'due') {
      const groups = [['Overdue', t => isOverdue(t), 'danger'], ['Today', t => t.due === td], ['Next 7 days', t => t.due > td && t.due <= wk], ['Later', t => t.due > wk], ['No due date', t => !t.due]];
      groups.forEach(([name, fn, cls]) => { const g = open.filter(fn); if (g.length) html += `<h3 class="group-title ${cls || ''}">${name} <span class="badge soft">${g.length}</span></h3><div class="list">${g.map(taskRow).join('')}</div>`; });
    } else html += `<div class="list">${open.map(taskRow).join('')}</div>`;
  }
  if (f.status !== 'open') html += `<h3 class="group-title">${ic('check')}Completed <span class="badge soft">${done.length}</span></h3>${done.length ? `<div class="list">${done.map(taskRow).join('')}</div>` : `<div class="card">${empty('No completed tasks yet.')}</div>`}`;
  return html;
}
function remindersPanel() {
  const d = Store.data; const now = nowLocal();
  const rs = [...d.reminders].sort((a, b) => a.at.localeCompare(b.at));
  const due = rs.filter(r => !r.done && r.at <= now), up = rs.filter(r => !r.done && r.at > now), done = rs.filter(r => r.done).reverse();
  let html = '';
  if ('Notification' in window && (Notification.permission !== 'granted' || !d.settings.notifications))
    html += `<div class="banner info">${ic('bell')}<p>Turn on notifications to get alerted when reminders are due — even when LifeList is in another tab.</p><button class="btn sm primary" data-action="enable-notifs">Enable notifications</button></div>`;
  const sec = (t, a, cls = '') => a.length ? `<h3 class="group-title ${cls}">${t} <span class="badge soft">${a.length}</span></h3><div class="list">${a.map(reminderRow).join('')}</div>` : '';
  html += sec('Due now', due, 'danger') + sec('Upcoming', up) + sec('Completed', done.slice(0, 20));
  if (!rs.length) html += `<div class="card">${empty('No reminders yet. Create one, or add a reminder to any task or event.', 'bell')}</div>`;
  return html;
}

/* ---- Calendar */
function itemsOn(ds) {
  const d = Store.data;
  return { events: d.events.filter(e => e.date === ds).sort(sortEvents), tasks: d.tasks.filter(t => t.due === ds).sort(sortByDue) };
}
function viewCalendar() {
  const c = ui.cal; const sel = parseYmd(c.date);
  let title;
  if (c.mode === 'month') title = sel.toLocaleDateString([], { month: 'long', year: 'numeric' });
  else if (c.mode === 'week') { const s = weekStartOf(sel), e = addDays(s, 6); title = `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`; }
  else title = sel.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const body = c.mode === 'month' ? monthView() : c.mode === 'week' ? weekView() : dayView(c.date);
  return `<section class="page-head"><div><h1>Calendar</h1><p class="muted">Appointments, events, important dates and task deadlines.</p></div>
      <div class="head-actions"><button class="btn ghost" data-action="export-ics">${ic('download')}Export</button><button class="btn primary" data-action="new-event">${ic('plus')}New event</button></div></section>
    <div class="cal-layout">
      <section class="card">
        <div class="cal-toolbar">
          <button class="icon-btn" data-action="cal-nav" data-d="-1" aria-label="Previous">${ic('left')}</button>
          <button class="icon-btn" data-action="cal-nav" data-d="1" aria-label="Next">${ic('right')}</button>
          <button class="btn sm ghost" data-action="cal-today">Today</button>
          <h2>${title}</h2><span class="spacer"></span>
          <div class="seg">${['month', 'week', 'day'].map(m => `<button class="${c.mode === m ? 'on' : ''}" data-action="cal-mode" data-v="${m}">${cap(m)}</button>`).join('')}</div>
        </div>${body}
      </section>
      <aside class="stack">${c.mode !== 'day' ? card(relDate(c.date) === 'Today' ? 'Today' : fmtDate(c.date, { weekday: 'long', month: 'short', day: 'numeric' }), 'calendar', agenda(c.date), { extra: `<button class="btn sm ghost" data-action="new-event" data-date="${c.date}">${ic('plus')}Add</button>` }) : ''}
        ${card('Coming up', 'clock', upcoming())}</aside>
    </div>`;
}
function agenda(ds) {
  const { events, tasks } = itemsOn(ds);
  const rem = Store.data.reminders.filter(r => !r.done && r.at.startsWith(ds));
  if (!events.length && !tasks.length && !rem.length) return empty('Nothing planned for this day.', 'calendar');
  return `<div class="list">${events.map(eventRow).join('')}${tasks.map(taskRow).join('')}${rem.map(reminderRow).join('')}</div>`;
}
function upcoming() {
  const td = today(); const end = ymd(addDays(new Date(), 30)); const d = Store.data;
  const items = [
    ...d.events.filter(e => e.date >= td && e.date <= end).map(e => ({ date: e.date, time: e.time, html: eventRow(e) })),
    ...d.tasks.filter(t => !t.completed && t.due >= td && t.due <= end).map(t => ({ date: t.due, time: t.time || '99', html: taskRow(t) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')).slice(0, 14);
  if (!items.length) return empty('Nothing in the next 30 days.', 'calendar');
  let last = '', html = '';
  items.forEach(i => {
    if (i.date !== last) { const dd = daysBetween(td, i.date); html += `<h3 class="group-title ${dd <= 2 && dd > 0 ? 'warn' : ''}">${relDate(i.date)}${dd > 1 && dd < 7 ? '' : ''}</h3>`; last = i.date; }
    html += i.html;
  });
  return `<div class="list">${html}</div>`;
}
function monthView() {
  const c = ui.cal; const sel = parseYmd(c.date); const td = today();
  const first = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const start = weekStartOf(first);
  const dim = new Date(sel.getFullYear(), sel.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((daysBetween(ymd(start), ymd(first)) + dim) / 7);
  const ws = Store.data.settings.weekStart;
  let html = `<div class="cal-grid">${[...Array(7)].map((_, i) => `<div class="cal-dow">${WEEKDAYS[(i + ws) % 7].slice(0, 3)}</div>`).join('')}`;
  for (let i = 0; i < rows * 7; i++) {
    const day = addDays(start, i); const ds = ymd(day);
    const { events, tasks } = itemsOn(ds);
    const imp = events.some(e => e.important);
    const chips = [...events.map(e => `<span class="chip ev ${e.important ? 'imp' : ''}">${e.time ? fmtTime(e.time).replace(':00', '') + ' ' : ''}${esc(e.title)}</span>`),
      ...tasks.map(t => `<span class="chip tk ${t.completed ? 'done' : isOverdue(t) ? 'od' : ''}">${esc(t.title)}</span>`)];
    const dots = [...events.map(e => `<i class="dot ev ${e.important ? 'imp' : ''}"></i>`), ...tasks.filter(t => !t.completed).map(t => `<i class="dot ${isOverdue(t) ? 'od' : ''}"></i>`)].slice(0, 4).join('');
    const label = `${day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}: ${events.length} events, ${tasks.length} tasks`;
    html += `<button class="cal-cell ${day.getMonth() !== sel.getMonth() ? 'out' : ''} ${ds === td ? 'today' : ''} ${ds === c.date ? 'sel' : ''} ${imp ? 'imp' : ''}" data-action="cal-pick" data-date="${ds}" aria-label="${esc(label)}">
      <span class="num">${day.getDate()}</span><div class="chips">${chips.slice(0, 3).join('')}${chips.length > 3 ? `<span class="more">+${chips.length - 3} more</span>` : ''}</div><div class="dots">${dots}</div></button>`;
  }
  return html + '</div>';
}
function weekView() {
  const s = weekStartOf(parseYmd(ui.cal.date)); const td = today();
  return `<div class="week-grid">${[...Array(7)].map((_, i) => {
    const day = addDays(s, i); const ds = ymd(day); const { events, tasks } = itemsOn(ds);
    const items = [...events.map(e => ({ t: e.time || '', html: `<div class="mini ev ${e.important ? 'imp' : ''}" ${rb('edit-event', e.id)}>${e.important ? ic('star', 'star') : ''}${esc(e.title)}<small>${e.time ? fmtTime(e.time) : 'All day'}${e.location ? ' · ' + esc(e.location) : ''}</small></div>` })),
      ...tasks.map(t => ({ t: t.time || '99', html: `<div class="mini ${t.completed ? 'done' : isOverdue(t) ? 'od' : ''}" ${rb('edit-task', t.id)}>${esc(t.title)}<small>Task${t.time ? ' · ' + fmtTime(t.time) : ''}</small></div>` }))].sort((a, b) => a.t.localeCompare(b.t));
    return `<div class="week-col ${ds === td ? 'today' : ''}"><header role="button" tabindex="0" data-action="cal-day" data-date="${ds}"><span>${WEEKDAYS[day.getDay()].slice(0, 3)}</span><b>${day.getDate()}</b></header>${items.map(x => x.html).join('') || '<small class="muted" style="text-align:center;font-size:.75rem">—</small>'}</div>`;
  }).join('')}</div>`;
}
function dayView(ds) {
  const { events, tasks } = itemsOn(ds);
  const allDay = [...events.filter(e => !e.time).map(eventRow), ...tasks.filter(t => !t.time).map(taskRow)];
  const timed = [...events.filter(e => e.time).map(e => ({ h: +e.time.slice(0, 2), html: eventRow(e) })), ...tasks.filter(t => t.time).map(t => ({ h: +t.time.slice(0, 2), html: taskRow(t) }))];
  const hrs = timed.map(x => x.h); const from = Math.min(7, ...hrs), to = Math.max(21, ...hrs);
  const nowH = ds === today() ? new Date().getHours() : -1;
  let html = `<div class="day-view">${allDay.length ? `<h3 class="group-title">All day</h3><div class="list" style="margin-bottom:12px">${allDay.join('')}</div>` : ''}`;
  for (let h = from; h <= to; h++) html += `<div class="hour ${h === nowH ? 'now' : ''}"><time>${fmtTime(pad(h) + ':00')}</time><div class="list">${timed.filter(x => x.h === h).map(x => x.html).join('')}</div></div>`;
  return html + `<div style="margin-top:12px"><button class="btn ghost sm" data-action="new-event" data-date="${ds}">${ic('plus')}Add event on this day</button> <button class="btn ghost sm" data-action="new-task" data-due="${ds}">${ic('plus')}Add task</button></div></div>`;
}

/* ---- Shopping */
function viewShopping() {
  const d = Store.data; const list = curList();
  const head = `<section class="page-head"><div><h1>Shopping</h1><p class="muted">Organise what you need to buy, by list and by aisle.</p></div>
    <div class="head-actions"><button class="btn ghost" data-action="new-list">${ic('plus')}New list</button></div></section>`;
  if (!list) return head + `<section class="card">${empty('No shopping lists yet. <a href="#" data-action="new-list">Create your first list</a>.', 'cart')}</section>`;
  ui.listId = list.id;
  const left = list.items.filter(i => !i.checked); const bought = list.items.filter(i => i.checked);
  const cost = a => a.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const total = cost(list.items); const remaining = cost(left);
  const cats = [...d.categories.shopping, ...new Set(list.items.map(i => i.category).filter(c => !d.categories.shopping.includes(c)))];
  const itemRow = i => `<div class="item shop ${i.checked ? 'done' : ''}">
      <button class="check ${i.checked ? 'on' : ''}" data-action="toggle-item" data-id="${i.id}" aria-label="${i.checked ? 'Uncheck' : 'Check off'} ${esc(i.name)}">${ic('check')}</button>
      <div class="item-main" ${rb('edit-item', i.id)}><div class="item-title">${esc(i.name)}</div>${i.price ? `<div class="meta"><span>${fmtMoney(i.price)} each</span></div>` : ''}</div>
      <div class="qty-ctl"><button data-action="qty" data-id="${i.id}" data-d="-1" aria-label="Decrease quantity">−</button><span>${i.qty || 1}</span><button data-action="qty" data-id="${i.id}" data-d="1" aria-label="Increase quantity">+</button></div>
      ${i.price ? `<span class="price">${fmtMoney(i.price * (i.qty || 1))}</span>` : ''}
      <button class="icon-btn sm" data-action="delete-item" data-id="${i.id}" aria-label="Remove item">${ic('trash')}</button></div>`;
  let groups = '';
  cats.forEach(c => { const g = left.filter(i => i.category === c); if (g.length) groups += `<h3 class="group-title">${esc(c)} <span class="badge soft">${g.length}</span></h3><div class="list">${g.map(itemRow).join('')}</div>`; });
  const other = left.filter(i => !cats.includes(i.category));
  if (other.length) groups += `<h3 class="group-title">Other</h3><div class="list">${other.map(itemRow).join('')}</div>`;
  const pct = list.items.length ? (bought.length / list.items.length) * 100 : 0;
  const over = list.budget && total > list.budget;
  return head + `<div class="shop-layout">
    <nav class="list-rail" aria-label="Shopping lists">${d.lists.map(l => { const n = l.items.filter(i => !i.checked).length; return `<button class="list-btn ${l.id === list.id ? 'on' : ''}" data-action="open-list" data-id="${l.id}"><span>${esc(l.name)}<small>${n ? `${n} item${n > 1 ? 's' : ''} left` : l.items.length ? 'All done ✓' : 'Empty'}</small></span>${n ? `<span class="badge soft">${n}</span>` : ''}</button>`; }).join('')}</nav>
    <section class="card">
      <header class="card-head"><h2>${ic('cart')}${esc(list.name)}</h2><div class="head-actions"><button class="btn sm ghost" data-action="edit-list" data-id="${list.id}">${ic('edit')}Edit</button></div></header>
      <div class="budget-row"><span><b>${left.length}</b> of ${list.items.length} items remaining</span><span>${bought.length} in cart</span></div>
      <div class="progress ${pct === 100 ? 'ok' : ''}"><span style="width:${pct}%"></span></div>
      ${total || list.budget ? `<div class="budget-row" style="margin-top:12px"><span>${ic('wallet')} Estimated total <b>${fmtMoney(total)}</b>${remaining !== total ? ` · ${fmtMoney(remaining)} still to buy` : ''}</span>${list.budget ? `<span class="${over ? 'danger' : ''}">Budget <b class="${over ? 'danger' : ''}">${fmtMoney(list.budget)}</b>${over ? ` · ${fmtMoney(total - list.budget)} over` : ` · ${fmtMoney(list.budget - total)} left`}</span>` : `<a href="#" data-action="edit-list" data-id="${list.id}">Set a budget</a>`}</div>
        ${list.budget ? `<div class="progress ${over ? 'over' : 'ok'}"><span style="width:${Math.min(100, (total / list.budget) * 100)}%"></span></div>` : ''}` : ''}
      <form class="add-item" data-form="add-item" autocomplete="off">
        <input name="name" placeholder="Add an item, e.g. “2 apples”" aria-label="Item name">
        <input name="qty" type="number" min="1" placeholder="Qty" aria-label="Quantity" inputmode="numeric">
        <select name="category" aria-label="Category"><option value="auto">✨ Auto category</option>${d.categories.shopping.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <input name="price" type="number" min="0" step="0.01" placeholder="Price" aria-label="Estimated price" inputmode="decimal">
        <button class="btn primary">${ic('plus')}Add</button>
      </form>
      ${groups || (list.items.length ? empty('Everything is in the cart! 🎉') : empty('This list is empty. Add your first item above.', 'cart'))}
      ${bought.length ? `<h3 class="group-title">${ic('check')}In cart <span class="badge soft">${bought.length}</span><span class="spacer"></span><button class="btn sm ghost" data-action="uncheck-all">Uncheck all</button><button class="btn sm ghost" data-action="clear-bought">Clear purchased</button></h3><div class="list">${bought.map(itemRow).join('')}</div>` : ''}
    </section></div>`;
}

/* ---- Progress */
function stats() {
  const d = Store.data; const byDay = {};
  d.tasks.forEach(t => { if (t.completed && t.completedAt) { const k = ymd(new Date(t.completedAt)); byDay[k] = (byDay[k] || 0) + 1; } });
  const ws = weekStartOf(new Date());
  const range = (s, n) => [...Array(n)].reduce((a, _, i) => a + (byDay[ymd(addDays(s, i))] || 0), 0);
  const thisWeek = range(ws, 7), lastWeek = range(addDays(ws, -7), 7);
  const wsS = ymd(ws), weS = ymd(addDays(ws, 6));
  const dueWeek = d.tasks.filter(t => t.due && t.due >= wsS && t.due <= weS);
  const doneWeek = dueWeek.filter(t => t.completed).length;
  const wd = [0, 0, 0, 0, 0, 0, 0];
  d.tasks.forEach(t => { if (t.completed && t.completedAt) wd[new Date(t.completedAt).getDay()]++; });
  let streak = 0;
  for (let i = 0; i < 3650; i++) { const k = ymd(addDays(new Date(), -i)); if (byDay[k]) streak++; else if (i > 0) break; }
  const catCounts = {};
  d.tasks.forEach(t => { if (t.completed && t.completedAt && ymd(new Date(t.completedAt)) >= wsS) catCounts[t.category || 'Uncategorised'] = (catCounts[t.category || 'Uncategorised'] || 0) + 1; });
  return { byDay, ws, thisWeek, lastWeek, dueWeek, doneWeek, weekPct: dueWeek.length ? Math.round((doneWeek / dueWeek.length) * 100) : 0, wd, streak, catCounts,
    totalDone: d.tasks.filter(t => t.completed).length, open: d.tasks.filter(t => !t.completed).length, overdue: d.tasks.filter(isOverdue).length };
}
function barChart(data) {
  const max = Math.max(1, ...data.map(x => x.value));
  return `<div class="bars" role="img" aria-label="${esc(data.map(x => `${x.label}: ${x.value}`).join(', '))}">${data.map(x => `<div class="bar-col ${x.hl ? 'hl' : ''}" title="${esc(x.label)}: ${x.value}"><span class="bar-val">${x.value}</span><div class="bar-wrap"><div class="bar" style="height:${(x.value / max) * 100}%"></div></div><span class="bar-lab">${esc(x.label)}</span></div>`).join('')}</div>`;
}
function donut(segs, center) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1; const C = 2 * Math.PI * 40; let off = 0;
  return `<div class="donut-wrap"><svg viewBox="0 0 100 100" class="donut" role="img" aria-label="${esc(segs.map(s => `${s.label}: ${s.value}`).join(', '))}"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface-2)" stroke-width="13"/>
    ${segs.map(s => { const len = (s.value / total) * C; const el = len ? `<circle cx="50" cy="50" r="40" fill="none" stroke="${s.color}" stroke-width="13" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>` : ''; off += len; return el; }).join('')}
    <text x="50" y="49" text-anchor="middle" font-size="17">${center[0]}</text><text x="50" y="63" text-anchor="middle" font-size="8" style="font-weight:600;fill:var(--muted)">${center[1]}</text></svg>
    <div class="legend">${segs.map(s => `<div><i style="background:${s.color}"></i>${s.label}<b>${s.value}</b></div>`).join('')}</div></div>`;
}
function weeklyInsights(s) {
  const d = Store.data; const out = [];
  const delta = s.thisWeek - s.lastWeek;
  out.push(['chart', `This week you’ve completed <b>${s.thisWeek} task${s.thisWeek === 1 ? '' : 's'}</b>${s.lastWeek || s.thisWeek ? ` — ${delta > 0 ? `<b>${delta} more</b> than` : delta < 0 ? `${-delta} fewer than` : 'the same as'} last week` : ''}.`]);
  const best = s.wd.indexOf(Math.max(...s.wd));
  if (Math.max(...s.wd) > 0) out.push(['zap', `Your most productive day is usually <b>${WEEKDAYS[best]}</b>. Try scheduling your hardest tasks then.`]);
  if (s.streak > 1) out.push(['flag', `You’re on a <b>${s.streak}-day streak</b> of getting things done. Keep it going!`]);
  if (s.overdue) {
    const oldest = d.tasks.filter(isOverdue).sort(sortByDue)[0];
    out.push(['alert', `<b>${s.overdue} task${s.overdue > 1 ? 's are' : ' is'} overdue</b>${oldest ? `, starting with “${esc(oldest.title)}”` : ''}. Use Smart reschedule on My Tasks to spread them out.`]);
  }
  const end = ymd(addDays(new Date(), 7)); const td = today();
  const nextEvents = d.events.filter(e => e.date >= td && e.date <= end);
  const nextDue = d.tasks.filter(t => !t.completed && t.due >= td && t.due <= end);
  if (nextEvents.length || nextDue.length) {
    const load = {}; [...nextEvents.map(e => e.date), ...nextDue.map(t => t.due)].forEach(k => (load[k] = (load[k] || 0) + 1));
    const busiest = Object.keys(load).sort((a, b) => load[b] - load[a])[0];
    out.push(['calendar', `Coming up in the next 7 days: <b>${nextEvents.length} event${nextEvents.length === 1 ? '' : 's'}</b> and <b>${nextDue.length} deadline${nextDue.length === 1 ? '' : 's'}</b>. Your busiest day looks like <b>${relDate(busiest)}</b>.`]);
  }
  const topCat = Object.entries(s.catCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCat) out.push(['tag', `Most of your effort this week went into <b>${esc(topCat[0])}</b> (${topCat[1]} task${topCat[1] > 1 ? 's' : ''}).`]);
  const unscheduled = d.tasks.filter(t => !t.completed && !t.due).length;
  if (unscheduled > 2) out.push(['sparkle', `${unscheduled} open tasks have no due date. Giving them a date helps LifeList plan your days.`]);
  return out;
}
function viewProgress() {
  const s = stats(); const td = today();
  const last7 = [...Array(7)].map((_, i) => { const dt = addDays(new Date(), i - 6); const k = ymd(dt); return { label: i === 6 ? 'Today' : dt.toLocaleDateString([], { weekday: 'short' }), value: s.byDay[k] || 0, hl: k === td }; });
  const ws = Store.data.settings.weekStart;
  const wdData = [...Array(7)].map((_, i) => { const idx = (i + ws) % 7; return { label: WEEKDAYS[idx].slice(0, 3), value: s.wd[idx], hl: s.wd[idx] === Math.max(...s.wd) && s.wd[idx] > 0 }; });
  const weeks = [...Array(8)].map((_, i) => { const st = addDays(s.ws, (i - 7) * 7); return { label: i === 7 ? 'This wk' : st.toLocaleDateString([], { month: 'short', day: 'numeric' }), value: [...Array(7)].reduce((a, _, k) => a + (s.byDay[ymd(addDays(st, k))] || 0), 0), hl: i === 7 }; });
  const delta = s.thisWeek - s.lastWeek;
  const cats = Object.entries(s.catCounts).sort((a, b) => b[1] - a[1]); const cmax = Math.max(1, ...cats.map(c => c[1]));
  return `<section class="page-head"><div><h1>Progress</h1><p class="muted">Week of ${s.ws.toLocaleDateString([], { month: 'long', day: 'numeric' })}</p></div></section>
    <div class="stack">
    <section class="card stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat"><div class="stat-val">${s.thisWeek}</div><div class="stat-label">Completed this week</div><span class="delta ${delta >= 0 ? 'is-ok' : 'danger'}" style="color:${delta >= 0 ? 'var(--ok)' : 'var(--danger)'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week</span></div>
      <div class="stat"><div class="stat-val">${s.weekPct}%</div><div class="stat-label">Weekly completion</div><span class="delta muted">${s.doneWeek} of ${s.dueWeek.length} due this week</span></div>
      <div class="stat"><div class="stat-val">${s.streak}</div><div class="stat-label">Day streak</div><span class="delta muted">${s.streak ? 'Keep it up!' : 'Complete a task to start'}</span></div>
      <div class="stat ${s.overdue ? 'is-danger' : 'is-ok'}"><div class="stat-val">${s.overdue}</div><div class="stat-label">Overdue</div><span class="delta muted">${s.open} open in total</span></div>
    </section>
    ${card('Weekly summary', 'sparkle', `<ul class="insights">${weeklyInsights(s).map(([i, t]) => `<li>${ic(i)}<span>${t}</span></li>`).join('')}</ul>`, { cls: 'ai-card' })}
    <div class="grid-2">
      ${card('Daily activity', 'chart', barChart(last7) + '<p class="muted" style="font-size:.8rem;margin-top:8px">Tasks completed per day, last 7 days</p>')}
      ${card('Completed vs unfinished', 'tasks', donut([{ label: 'Completed', value: s.totalDone, color: 'var(--ok)' }, { label: 'Open (on track)', value: s.open - s.overdue, color: 'var(--accent)' }, { label: 'Overdue', value: s.overdue, color: 'var(--danger)' }], [`${s.totalDone + s.open ? Math.round((s.totalDone / (s.totalDone + s.open)) * 100) : 0}%`, 'complete']))}
      ${card('Most productive days', 'zap', barChart(wdData) + '<p class="muted" style="font-size:.8rem;margin-top:8px">All-time completions by weekday</p>')}
      ${card('Progress over time', 'chart', barChart(weeks) + '<p class="muted" style="font-size:.8rem;margin-top:8px">Tasks completed per week, last 8 weeks</p>')}
    </div>
    ${card('This week by category', 'tag', cats.length ? `<div class="hbars">${cats.map(([c, n]) => `<div class="hbar"><span>${esc(c)}</span><div class="track"><span style="width:${(n / cmax) * 100}%"></span></div><b>${n}</b></div>`).join('')}</div>` : empty('Complete tasks this week to see your breakdown.', 'chart'))}
    </div>`;
}

/* ---- Settings */
function viewSettings() {
  const d = Store.data; const s = d.settings; const u = Store.user;
  const cats = kind => `<div class="cat-chips">${d.categories[kind].map(c => `<span class="cat-chip">${esc(c)}<button data-action="del-cat" data-kind="${kind}" data-name="${esc(c)}" aria-label="Remove ${esc(c)}">${ic('x')}</button></span>`).join('')}</div>
    <form class="inline-form" data-form="add-cat" data-kind="${kind}"><input name="name" placeholder="New ${kind === 'task' ? 'task' : 'shopping'} category" aria-label="New category"><button class="btn ghost">${ic('plus')}Add</button></form>`;
  const notifState = !('Notification' in window) ? 'Not supported in this browser' : Notification.permission === 'denied' ? 'Blocked in browser settings' : s.notifications && Notification.permission === 'granted' ? 'On' : 'Off';
  return `<section class="page-head"><div><h1>Settings</h1><p class="muted">Manage your account and personalise LifeList.</p></div></section>
  <div class="settings">
    <div class="stack">
    ${card('Profile', 'user', `<form data-form="profile" class="stack" style="gap:12px">
        <div class="field"><label for="p-name">Display name</label><input id="p-name" name="name" value="${esc(d.profile.name)}"></div>
        <div class="field"><label>Email</label><input value="${esc(u.guest ? 'Guest (not signed in)' : u.email)}" readonly></div>
        <div><button class="btn primary">Save profile</button></div></form>`)}
    ${card('Appearance', 'sun', `<div class="set-row"><div><div class="label">Theme</div><div class="desc">Light, dark, or match your device</div></div>
        <div class="seg">${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'System']].map(([v, i, l]) => `<button class="${s.theme === v ? 'on' : ''}" data-action="set-theme" data-v="${v}">${ic(i)}${l}</button>`).join('')}</div></div>
      <div class="set-row"><div><div class="label">Currency</div><div class="desc">Used for shopping prices and budgets</div></div>
        <select data-setting="currency">${['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'INR', 'JPY', 'ZAR'].map(c => `<option ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>`)}
    ${card('Notifications & planning', 'bell', `<div class="set-row"><div><div class="label">Reminder notifications</div><div class="desc">Status: ${notifState}</div></div>
        <label class="switch"><input type="checkbox" data-action-change="notifs" ${s.notifications && 'Notification' in window && Notification.permission === 'granted' ? 'checked' : ''} aria-label="Reminder notifications"><span></span></label></div>
      <div class="set-row"><div><div class="label">Test a notification</div><div class="desc">Check that alerts reach you</div></div><button class="btn sm ghost" data-action="test-notif">Send test</button></div>
      <div class="set-row"><div><div class="label">My day runs from</div><div class="desc">Used by the Smart day plan</div></div>
        <div class="inline-form"><input type="time" data-setting="dayStart" value="${s.dayStart}" aria-label="Day start"><input type="time" data-setting="dayEnd" value="${s.dayEnd}" aria-label="Day end"></div></div>
      <div class="set-row"><div><div class="label">Week starts on</div></div>
        <select data-setting="weekStart"><option value="1" ${s.weekStart === 1 ? 'selected' : ''}>Monday</option><option value="0" ${s.weekStart === 0 ? 'selected' : ''}>Sunday</option></select></div>`)}
    ${card('Account', u.guest ? 'user' : MainBackend.mode === 'cloud' ? 'cloud' : 'user', `<div class="set-row"><div><div class="label">${u.guest ? 'Guest mode' : esc(u.email)}</div><div class="desc">${u.guest ? 'Your data is stored in this browser only. Create an account to keep it separate and private.' : MainBackend.mode === 'cloud' ? 'Synced securely to the cloud with Supabase.' : 'Stored privately in this browser for your account.'}</div></div></div>
      <div class="btn-row"><button class="btn ghost" data-action="sign-out">${ic('logout')}${u.guest ? 'Exit guest mode' : 'Sign out'}</button>${u.guest ? '' : `<button class="btn danger-ghost" data-action="delete-account">${ic('trash')}Delete account</button>`}</div>`)}
    </div>
    <div class="stack">
    ${card('Categories', 'tag', `<h3>Task categories</h3>${cats('task')}<h3 style="margin-top:18px">Shopping categories</h3>${cats('shopping')}`)}
    ${card('Dashboard layout', 'layout', `<p class="muted" style="font-size:.85rem;margin-bottom:10px">Choose which cards appear on Home, and their order.</p>${s.dashboard.map((w, i) => `<div class="widget-row"><label><input type="checkbox" data-widget="${w.id}" ${w.on ? 'checked' : ''}>${esc(WIDGETS.find(x => x.id === w.id).name)}</label>
        <button class="icon-btn sm" data-action="widget-move" data-id="${w.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up')}</button><button class="icon-btn sm" data-action="widget-move" data-id="${w.id}" data-d="1" ${i === s.dashboard.length - 1 ? 'disabled' : ''} aria-label="Move down">${ic('down')}</button></div>`).join('')}`)}
    ${card('Your data', 'download', `<p class="muted" style="font-size:.85rem;margin-bottom:12px">Export your tasks and calendar, or back up everything.</p>
      <div class="btn-row"><button class="btn ghost" data-action="export-csv">${ic('download')}Tasks (.csv)</button><button class="btn ghost" data-action="export-ics">${ic('calendar')}Calendar (.ics)</button><button class="btn ghost" data-action="export-json">${ic('download')}Full backup (.json)</button><button class="btn ghost" data-action="import-json">${ic('upload')}Restore backup</button></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn ghost" data-action="sample-data">${ic('sparkle')}Add example data</button><button class="btn danger-ghost" data-action="clear-data">${ic('trash')}Erase all data</button></div>`)}
    </div>
  </div>`;
}

/* ---- Shell */
const NAV = [['home', 'home', 'Home'], ['tasks', 'tasks', 'My Tasks'], ['calendar', 'calendar', 'Calendar'], ['shopping', 'cart', 'Shopping'], ['progress', 'chart', 'Progress'], ['settings', 'settings', 'Settings']];
const VIEWS = { home: viewHome, tasks: viewTasks, calendar: viewCalendar, shopping: viewShopping, progress: viewProgress, settings: viewSettings };
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return VIEWS[r] ? r : 'home'; };
const nav = r => { if (route() === r) render(); else location.hash = '#/' + r; };
const initials = n => (n || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();

function renderShell() {
  const u = Store.user;
  $('#app').innerHTML = `<div class="app">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand">${LOGO}<div><div class="brand-name">LifeList</div><div class="brand-tag">Make everyday life easier to manage.</div></div></div>
      <button class="btn primary block side-add" data-action="quick-add">${ic('plus')}Quick add <kbd style="opacity:.7;font-size:.72rem;margin-left:4px">N</kbd></button>
      <nav class="nav">${NAV.map(([r, i, l]) => `<a href="#/${r}" data-route="${r}">${ic(i)}${l}<span class="badge" data-badge="${r}" hidden></span></a>`).join('')}</nav>
      <div class="side-user"><div class="avatar" id="side-avatar">${esc(initials(Store.data.profile.name))}</div><div style="min-width:0"><div class="name" id="side-name">${esc(Store.data.profile.name)}</div><div class="sub">${u.guest ? 'Guest' : MainBackend.mode === 'cloud' ? 'Cloud sync on' : 'Saved on this device'}</div></div>
        <button class="icon-btn sm" data-action="sign-out" aria-label="Sign out" title="Sign out">${ic('logout')}</button></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="brand mobile-brand" href="#/home">${LOGO}<span class="brand-name">LifeList</span></a>
        <div class="search" role="search">${ic('search')}<input id="search" type="search" placeholder="Search tasks, events, reminders, items…" aria-label="Search" autocomplete="off"><kbd>/</kbd><div class="search-panel" id="search-panel" hidden></div></div>
        <div class="top-actions">
          <button class="icon-btn top-search-btn" data-action="open-search" aria-label="Search">${ic('search')}</button>
          <button class="icon-btn" data-action="toggle-theme" aria-label="Toggle dark mode" id="theme-btn"></button>
          <button class="icon-btn rel" data-action="go-reminders" aria-label="Reminders">${ic('bell')}<span class="badge" id="bell-badge" hidden></span></button>
          <a class="avatar" href="#/settings" aria-label="Profile and settings" id="top-avatar" style="width:34px;height:34px;font-size:.8rem">${esc(initials(Store.data.profile.name))}</a>
        </div>
      </header>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="Main navigation">${NAV.map(([r, i, l]) => `<a href="#/${r}" data-route="${r}">${ic(i)}<span>${l.replace('My ', '')}</span><span class="badge" data-badge="${r}" hidden></span></a>`).join('')}</nav>
    <button class="fab" data-action="quick-add" aria-label="Quick add">${ic('plus')}</button>
  </div>`;
  const input = $('#search');
  input.addEventListener('input', renderSearch);
  input.addEventListener('focus', renderSearch);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; renderSearch(); input.blur(); $('.topbar').classList.remove('search-open'); }
    if (e.key === 'ArrowDown') { const f = $('.search-hit'); f && (e.preventDefault(), f.focus()); }
  });
}
function render() {
  if (!Store.data || !$('#view')) return;
  const r = route();
  $('#view').innerHTML = VIEWS[r]();
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  if (ui.lastRoute !== r) { window.scrollTo(0, 0); ui.lastRoute = r; }
  updateChrome();
}
function updateChrome() {
  const due = dueReminders().length; const od = Store.data.tasks.filter(isOverdue).length;
  const bb = $('#bell-badge'); if (bb) { bb.hidden = !due; bb.textContent = due; }
  $$('[data-badge="tasks"]').forEach(b => { b.hidden = !od; b.textContent = od; });
  const dark = document.documentElement.dataset.theme === 'dark';
  const tb = $('#theme-btn'); if (tb) tb.innerHTML = ic(dark ? 'sun' : 'moon');
  const n = Store.data.profile.name;
  $('#side-name') && ($('#side-name').textContent = n);
  ['#side-avatar', '#top-avatar'].forEach(s => $(s) && ($(s).textContent = initials(n)));
  document.title = `${due + od ? `(${due + od}) ` : ''}LifeList`;
}

/* ---- Search */
function renderSearch() {
  const q = $('#search').value.trim().toLowerCase(); const panel = $('#search-panel');
  if (!q) { panel.hidden = true; return; }
  const d = Store.data;
  const hl = s => { const str = String(s || ''); const i = str.toLowerCase().indexOf(q); return i < 0 ? esc(str) : esc(str.slice(0, i)) + '<mark>' + esc(str.slice(i, i + q.length)) + '</mark>' + esc(str.slice(i + q.length)); };
  const m = (...f) => f.some(x => String(x || '').toLowerCase().includes(q));
  const groups = [
    ['Tasks', d.tasks.filter(t => m(t.title, t.notes, t.category)).slice(0, 6).map(t => [`edit-task`, t.id, 'tasks', hl(t.title), `${t.completed ? 'Completed' : t.due ? 'Due ' + relDate(t.due) : 'No due date'}${t.category ? ' · ' + esc(t.category) : ''}`])],
    ['Events', d.events.filter(e => m(e.title, e.location, e.description)).slice(0, 6).map(e => ['edit-event', e.id, 'calendar', hl(e.title), `${relDate(e.date)}${e.time ? ' · ' + fmtTime(e.time) : ''}${e.location ? ' · ' + esc(e.location) : ''}`])],
    ['Reminders', d.reminders.filter(r => m(r.title, r.notes)).slice(0, 5).map(r => ['edit-reminder', r.id, 'bell', hl(r.title), fmtDateTime(r.at) + (r.done ? ' · Done' : '')])],
    ['Shopping', d.lists.flatMap(l => l.items.filter(i => m(i.name, i.category)).map(i => ['edit-item', i.id, 'cart', hl(i.name), `${esc(l.name)} · ${i.checked ? 'In cart' : 'To buy'}`])).slice(0, 6)],
  ].filter(g => g[1].length);
  panel.hidden = false;
  panel.innerHTML = groups.length ? groups.map(([g, hits]) => `<div class="search-group">${g}</div>${hits.map(([a, id, i, t, sub]) => `<button class="search-hit" data-action="${a}" data-id="${id}" data-from-search>${ic(i)}<span><span>${t}</span><br><span class="sub">${sub}</span></span></button>`).join('')}`).join('')
    : `<div class="empty">${ic('search')}No results for “${esc(q)}”</div>`;
}
function closeSearch() { const p = $('#search-panel'); if (p) p.hidden = true; $('.topbar')?.classList.remove('search-open'); }

/* ---- Theme */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(pref) {
  const t = pref === 'system' || !pref ? (mq.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').content = t === 'dark' ? '#0a111e' : '#0f1b33';
  LS.set('lifelist.theme', pref || 'system');
}
mq.addEventListener?.('change', () => { const p = Store.data?.settings.theme || LS.get('lifelist.theme', 'system'); if (p === 'system') { applyTheme(p); Store.data && updateChrome(); } });

/* ---- Notifications & reminder engine */
let reminderTimer = null;
async function enableNotifications() {
  if (!('Notification' in window)) { toast('Notifications are not supported in this browser. In-app alerts will still appear.', 'error'); return false; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { toast('Notifications are blocked. You can allow them in your browser’s site settings.', 'error'); Store.data.settings.notifications = false; commit(); return false; }
  Store.data.settings.notifications = true; commit(); toast('Notifications enabled', 'ok'); return true;
}
function notify(title, body, tag) {
  if (Store.data.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag, icon: $('link[rel=icon]').href }); } catch {}
  }
}
function checkReminders() {
  if (!Store.data) return;
  const now = nowLocal(); let changed = false;
  for (const r of Store.data.reminders) {
    if (r.done || r.notified || r.at > now) continue;
    r.notified = true; changed = true;
    if (Date.now() - new Date(r.at).getTime() < 12 * 36e5) {
      toast(`Reminder: ${r.title}`, 'reminder', { label: 'Done', fn: () => doneReminder(r.id) });
      notify('LifeList reminder', r.title, r.id);
    }
  }
  if (changed) { Store.save(); if (!$('#view')?.contains(document.activeElement) || document.activeElement === $('#view')) render(); else updateChrome(); }
}
function dailyDigest() {
  const key = 'lifelist.digest.' + (Store.user.email || 'guest');
  if (LS.get(key) === today()) return;
  LS.set(key, today());
  const s = todayStats(); const ev = Store.data.events.filter(e => e.date === today()).length;
  if (s.open || s.overdue || ev) {
    const msg = [s.open && `${s.open} task${s.open > 1 ? 's' : ''} due today`, ev && `${ev} event${ev > 1 ? 's' : ''}`, s.overdue && `${s.overdue} overdue`].filter(Boolean).join(' · ');
    setTimeout(() => { toast(msg, 'info'); notify('Your day in LifeList', msg, 'digest'); }, 800);
  }
}

/* ---- Export / import */
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Title', 'Notes', 'Due date', 'Time', 'Priority', 'Category', 'Repeat', 'Status', 'Completed at'].map(q).join(',')];
  Store.data.tasks.forEach(t => rows.push([t.title, t.notes, t.due, t.time, effPriority(t), t.category, t.recur, t.completed ? 'Completed' : isOverdue(t) ? 'Overdue' : 'Open', t.completedAt || ''].map(q).join(',')));
  download(`lifelist-tasks-${today()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv');
  toast('Tasks exported', 'ok');
}
function exportICS() {
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dt = (date, time) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LifeList//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:LifeList'];
  const add = (id, title, date, time, endTime, desc, loc) => {
    L.push('BEGIN:VEVENT', `UID:${id}@lifelist`, `DTSTAMP:${stamp}`, `SUMMARY:${e(title)}`);
    if (time) {
      let end = endTime;
      if (!end) { const m = toMin(time) + 60; end = m >= 1440 ? '23:59' : fromMin(m); }
      L.push(`DTSTART:${dt(date, time)}`, `DTEND:${dt(date, end)}`);
    } else L.push(`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDate(date, 'daily').replace(/-/g, '')}`);
    if (desc) L.push(`DESCRIPTION:${e(desc)}`);
    if (loc) L.push(`LOCATION:${e(loc)}`);
    L.push('END:VEVENT');
  };
  Store.data.events.forEach(ev => add(ev.id, ev.title, ev.date, ev.time, ev.endTime, ev.description, ev.location));
  Store.data.tasks.filter(t => t.due && !t.completed).forEach(t => add(t.id, `✓ ${t.title}`, t.due, t.time, '', t.notes, ''));
  L.push('END:VCALENDAR');
  download(`lifelist-calendar-${today()}.ics`, L.join('\r\n'), 'text/calendar');
  toast('Calendar exported – import it into Google, Apple or Outlook Calendar', 'ok');
}
function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const json = JSON.parse(reader.result);
      if (!json || !Array.isArray(json.tasks)) throw new Error('bad');
      if (!(await confirmBox('Restoring this backup will replace everything currently in LifeList.', 'Restore'))) return;
      Store.data = migrate(json, Store.data.profile.name); applyTheme(Store.data.settings.theme);
      commit(); toast('Backup restored', 'ok');
    } catch { toast('That file is not a valid LifeList backup.', 'error'); }
    $('#import-file').value = '';
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------- events */
document.addEventListener('click', async e => {
  if (!e.target.closest('.search')) closeSearch();
  const el = e.target.closest('[data-action]');
  if (!el || !Store.data) return;
  const a = el.dataset.action, id = el.dataset.id, d = Store.data;
  if (el.tagName === 'A' && a !== 'filter-overdue') e.preventDefault();
  if (el.hasAttribute('data-from-search')) { closeSearch(); $('#search').value = ''; }
  switch (a) {
    case 'quick-add': openQuickAdd(); break;
    case 'new-task': openTaskForm(null, el.dataset.due ? { due: el.dataset.due } : {}); break;
    case 'edit-task': { const t = d.tasks.find(x => x.id === id); t && openTaskForm(t); break; }
    case 'toggle-task': toggleTask(id); break;
    case 'delete-task': deleteTask(id); break;
    case 'new-event': openEventForm(null, el.dataset.date ? { date: el.dataset.date } : {}); break;
    case 'edit-event': { const x = d.events.find(v => v.id === id); x && openEventForm(x); break; }
    case 'new-reminder': openReminderForm(null); break;
    case 'edit-reminder': { const r = d.reminders.find(x => x.id === id); r && openReminderForm(r); break; }
    case 'done-reminder': doneReminder(id); break;
    case 'delete-reminder': deleteReminder(id); break;
    case 'go-reminders': ui.taskTab = 'reminders'; nav('tasks'); break;
    case 'task-tab': ui.taskTab = el.dataset.v; render(); break;
    case 'tf-status': ui.tf.status = el.dataset.v; render(); break;
    case 'clear-filters': Object.assign(ui.tf, { priority: 'all', category: 'all', due: 'all' }); render(); break;
    case 'filter-overdue': ui.taskTab = 'tasks'; Object.assign(ui.tf, { status: 'open', due: 'overdue' }); break;
    case 'reschedule': {
      const ids = (el.dataset.ids || '').split(',');
      const plan = suggestDays(d.tasks.filter(t => ids.includes(t.id)));
      const undo = snapshot();
      plan.forEach(({ task, date }) => { task.due = date; task.time = ''; });
      commit(); toast(`Rescheduled ${plan.length} task${plan.length > 1 ? 's' : ''} across your lighter days`, 'ok', { label: 'Undo', fn: undo });
      break;
    }
    case 'cal-mode': ui.cal.mode = el.dataset.v; render(); break;
    case 'cal-today': ui.cal.date = today(); render(); break;
    case 'cal-pick': ui.cal.date = el.dataset.date; if (window.innerWidth <= 640 || e.detail === 2) ui.cal.mode = 'day'; render(); break;
    case 'cal-day': ui.cal.date = el.dataset.date; ui.cal.mode = 'day'; render(); break;
    case 'cal-nav': {
      const dt = parseYmd(ui.cal.date); const n = +el.dataset.d;
      if (ui.cal.mode === 'month') { dt.setDate(1); dt.setMonth(dt.getMonth() + n); }
      else dt.setDate(dt.getDate() + (ui.cal.mode === 'week' ? 7 : 1) * n);
      ui.cal.date = ymd(dt); render(); break;
    }
    case 'new-list': openListForm(null); break;
    case 'edit-list': openListForm(d.lists.find(l => l.id === id)); break;
    case 'open-list': ui.listId = id; nav('shopping'); break;
    case 'toggle-item': { const [, i] = findItem(id); if (i) { i.checked = !i.checked; commit(); } break; }
    case 'edit-item': { const [l, i] = findItem(id); if (i) { ui.listId = l.id; if (el.hasAttribute('data-from-search')) nav('shopping'); openItemForm(i, l); } break; }
    case 'delete-item': { const [l, i] = findItem(id); if (i) { const undo = snapshot(); l.items = l.items.filter(x => x !== i); commit(); toast(`Removed ${i.name}`, 'info', { label: 'Undo', fn: undo }); } break; }
    case 'qty': { const [, i] = findItem(id); if (i) { i.qty = Math.max(1, (i.qty || 1) + +el.dataset.d); commit(); } break; }
    case 'clear-bought': { const l = curList(); const undo = snapshot(); const n = l.items.filter(i => i.checked).length; l.items = l.items.filter(i => !i.checked); commit(); toast(`Cleared ${n} purchased item${n > 1 ? 's' : ''}`, 'info', { label: 'Undo', fn: undo }); break; }
    case 'uncheck-all': curList().items.forEach(i => (i.checked = false)); commit(); break;
    case 'set-theme': d.settings.theme = el.dataset.v; applyTheme(el.dataset.v); commit(); break;
    case 'toggle-theme': { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; d.settings.theme = next; applyTheme(next); commit(); break; }
    case 'enable-notifs': enableNotifications(); break;
    case 'test-notif':
      toast('This is how reminders will look 👋', 'reminder');
      if (d.settings.notifications && 'Notification' in window && Notification.permission === 'granted') notify('LifeList', 'Notifications are working!', 'test');
      else toast('Browser notifications are off – only in-app alerts will show.', 'info');
      break;
    case 'del-cat': {
      const kind = el.dataset.kind, name = el.dataset.name;
      d.categories[kind] = d.categories[kind].filter(c => c !== name); commit(); break;
    }
    case 'widget-move': {
      const arr = d.settings.dashboard; const i = arr.findIndex(w => w.id === id); const j = i + +el.dataset.d;
      if (j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; commit(); }
      break;
    }
    case 'export-csv': exportCSV(); break;
    case 'export-ics': exportICS(); break;
    case 'export-json': download(`lifelist-backup-${today()}.json`, JSON.stringify(d, null, 2), 'application/json'); toast('Backup downloaded', 'ok'); break;
    case 'import-json': $('#import-file').click(); break;
    case 'sample-data': addSample(d); commit(); toast('Example data added', 'ok'); break;
    case 'clear-data':
      if (await confirmBox('This permanently erases all tasks, events, reminders and shopping lists for this account.', 'Erase everything')) {
        const keep = { profile: d.profile, settings: d.settings, categories: d.categories };
        Store.data = { ...defaultData(d.profile.name), ...keep }; commit(); toast('All data erased', 'info');
      }
      break;
    case 'open-search': $('.topbar').classList.add('search-open'); $('#search').focus(); break;
    case 'sign-out': signOut(); break;
    case 'delete-account':
      if (await confirmBox('Your account and all its data will be permanently deleted. This cannot be undone.', 'Delete account')) {
        await Store.backend.deleteAccount(Store.user); endSession(); toast('Account deleted', 'info');
      }
      break;
  }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f || !Store.data) return;
  e.preventDefault();
  const d = Store.data; const type = f.dataset.form;
  if (type === 'add-item') {
    let name = f.elements.name.value.trim(); if (!name) { f.elements.name.focus(); return; }
    let qty = Number(f.elements.qty.value) || 0;
    const m = name.match(/^(\d+)\s*x?\s+(.+)$/i); if (m && !qty) { qty = +m[1]; name = m[2]; }
    const cat = f.elements.category.value === 'auto' ? guessCategory('shopping', name) : f.elements.category.value;
    curList().items.push({ id: uid(), name: cap(name), qty: qty || 1, category: cat, price: f.elements.price.value ? Number(f.elements.price.value) : null, checked: false });
    commit();
    setTimeout(() => $('[data-form="add-item"] input[name="name"]')?.focus(), 0);
  } else if (type === 'add-cat') {
    const name = f.elements.name.value.trim(); const kind = f.dataset.kind;
    if (!name) return;
    if (d.categories[kind].some(c => c.toLowerCase() === name.toLowerCase())) { toast('That category already exists', 'error'); return; }
    d.categories[kind].push(cap(name)); commit();
  } else if (type === 'profile') {
    const name = f.elements.name.value.trim() || 'Friend';
    d.profile.name = name; Store.user.name = name; Store.backend.updateProfile(Store.user, name); commit(); toast('Profile saved', 'ok');
  }
});
document.addEventListener('change', e => {
  const el = e.target; if (!Store.data) return;
  if (el.dataset.filter) { ui.tf[el.dataset.filter] = el.value; render(); }
  else if (el.dataset.setting) { const k = el.dataset.setting; Store.data.settings[k] = k === 'weekStart' ? Number(el.value) : el.value; commit(); }
  else if (el.dataset.widget) { const w = Store.data.settings.dashboard.find(x => x.id === el.dataset.widget); if (w) { w.on = el.checked; commit(); } }
  else if (el.dataset.actionChange === 'notifs') { if (el.checked) enableNotifications(); else { Store.data.settings.notifications = false; commit(); } }
  else if (el.id === 'import-file') importJSON(el.files[0]);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root').classList.contains('open')) { closeModal(); return; }
  const tag = (e.target.tagName || '').toLowerCase(); const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute?.('role') === 'button') { e.preventDefault(); e.target.click(); return; }
  if (typing || !Store.data || $('#modal-root').classList.contains('open') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'q') { e.preventDefault(); openQuickAdd(); }
  else if (e.key === '/') { e.preventDefault(); $('.topbar').classList.add('search-open'); $('#search').focus(); }
});
window.addEventListener('hashchange', () => { closeModal(); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Store.data) { checkReminders(); render(); } });

/* ------------------------------------------------------- auth & boot */
function renderAuth(err = '') {
  const cloud = MainBackend.mode === 'cloud';
  $('#app').innerHTML = `<div class="auth">
    <div class="auth-main"><div class="auth-card">
      <div class="brand">${LOGO}<div><div class="brand-name">LifeList</div><div class="brand-tag">Make everyday life easier to manage.</div></div></div>
      <div><h1 style="font-size:1.5rem" id="auth-title">Welcome back</h1><p class="muted" id="auth-sub">Sign in to see your day.</p></div>
      <div class="seg" role="tablist"><button type="button" class="on" data-tab="in">Sign in</button><button type="button" data-tab="up">Create account</button></div>
      <form id="auth-form" novalidate>
        <div class="field" data-only="up" hidden><label for="a-name">Your name</label><input id="a-name" name="name" autocomplete="name" placeholder="e.g. Alex"></div>
        <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <div class="field"><label for="a-pw">Password</label><input id="a-pw" name="password" type="password" autocomplete="current-password" placeholder="At least 6 characters"></div>
        <label class="check-field" data-only="up" hidden><input type="checkbox" name="seed" checked> Start with example tasks and events</label>
        <p class="form-error" id="auth-error">${esc(err)}</p>
        <button class="btn primary block" id="auth-submit">Sign in</button>
      </form>
      <div class="divider">or</div>
      <button class="btn ghost block" id="guest-btn">${ic('zap')}Try it without an account</button>
      <p class="fine">${cloud ? 'Your account and data are stored securely with Supabase and synced across your devices.' : 'Accounts are stored privately in this browser. Add Supabase keys in config.js to sync across devices.'}</p>
    </div></div>
    <div class="auth-side">
      <h2>Everything you need to do, <em>in one calm place.</em></h2>
      ${[['tasks', 'Tasks & priorities', 'Due dates, categories, recurring tasks and auto-priorities.'], ['calendar', 'Calendar & events', 'Month, week and day views with your deadlines built in.'], ['cart', 'Shopping lists', 'Multiple lists, aisles, quantities and a budget.'], ['bell', 'Reminders', 'Repeating reminders and notifications so nothing slips.'], ['sparkle', 'Smart planning', 'An auto-generated day plan and weekly insights.']]
        .map(([i, t, p]) => `<div class="feat">${ic(i)}<div><b>${t}</b><p>${p}</p></div></div>`).join('')}
    </div></div>`;
  let mode = 'in';
  const form = $('#auth-form');
  const setMode = m => {
    mode = m;
    $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === m));
    $$('[data-only="up"]').forEach(x => (x.hidden = m !== 'up'));
    $('#auth-submit').textContent = m === 'up' ? 'Create account' : 'Sign in';
    $('#auth-title').textContent = m === 'up' ? 'Create your account' : 'Welcome back';
    $('#auth-sub').textContent = m === 'up' ? 'It takes less than a minute.' : 'Sign in to see your day.';
    form.elements.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
    $('#auth-error').textContent = '';
  };
  $$('[data-tab]').forEach(b => (b.onclick = () => setMode(b.dataset.tab)));
  form.onsubmit = async e => {
    e.preventDefault();
    const name = form.elements.name.value.trim(), email = form.elements.email.value.trim(), pw = form.elements.password.value;
    const err = $('#auth-error');
    if (mode === 'up' && !name) { err.textContent = 'Please enter your name.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
    if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
    const btn = $('#auth-submit'); btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const user = mode === 'up' ? await MainBackend.signUp(name, email, pw) : await MainBackend.signIn(email, pw);
      await startSession(user, mode === 'up' && form.elements.seed.checked);
    } catch (ex) { err.textContent = ex.message || 'Something went wrong.'; btn.disabled = false; btn.textContent = mode === 'up' ? 'Create account' : 'Sign in'; }
  };
  $('#guest-btn').onclick = () => { const g = { email: 'guest', name: 'Guest', guest: true }; LS.set('lifelist.session', g); startSession(g, true); };
}
async function startSession(user, seed = false) {
  Store.user = user;
  let data = null;
  try { data = await Store.backend.load(user); } catch (e) { toast('Could not load your data: ' + e.message, 'error'); }
  if (!data) { data = defaultData(user.guest ? 'Friend' : user.name); if (seed) addSample(data); }
  Store.data = migrate(data, user.name);
  applyTheme(Store.data.settings.theme);
  Store.save();
  renderShell(); render();
  clearInterval(reminderTimer); reminderTimer = setInterval(checkReminders, 15000);
  setTimeout(checkReminders, 1500);
  dailyDigest();
  if (!location.hash) history.replaceState(null, '', '#/home');
}
function endSession() {
  clearInterval(reminderTimer); clearTimeout(Store.timer);
  Store.user = null; Store.data = null; ui.listId = null;
  closeModal(); applyTheme(LS.get('lifelist.theme', 'system')); renderAuth();
}
async function signOut() {
  clearTimeout(Store.timer);
  if (Store.user && Store.data) await Store.backend.save(Store.user, Store.data);
  if (Store.user?.guest) LS.del('lifelist.session'); else await MainBackend.signOut();
  endSession();
}
async function boot() {
  applyTheme(LS.get('lifelist.theme', 'system'));
  $('#app').innerHTML = `<div class="loading">Loading LifeList…</div>`;
  try {
    const s = LS.get('lifelist.session');
    const signedIn = await MainBackend.init();
    const user = s?.guest ? s : signedIn;
    if (user) await startSession(user); else renderAuth();
  } catch (e) { console.error(e); renderAuth(e.message); }
}
boot();
})();
