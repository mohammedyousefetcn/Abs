'use strict';
const ROLE = { admin: 'مدير النظام', head: 'رئيس القسم', rapporteur: 'مقرر القسم', teacher: 'تدريسي / مسؤول مختبر / فني' };
const TYPE = { theory: 'نظري', lab: 'عملي' };
const KIND = { teacher: 'تدريسي', lab: 'مسؤول مختبر', tech: 'فني' };
const SKIND = { teacher: 'تدريسي', lab: 'مسؤول مختبر', tech: 'فني', head: 'رئيس قسم', rapporteur: 'مقرر قسم', admin: 'مدير النظام' };
const STAGE = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
const STATUS = { present: 'حاضر', absent: 'غائب', excused: 'مجاز', pfirst: 'حضر الساعة الأولى فقط', plast: 'حضر الساعة الأخيرة فقط' };
const APP_BUILD = '1.3';
const BSHORT = { present: 'حاضر', absent: 'غائب', excused: 'مجاز', pfirst: 'أول ساعة', plast: 'آخر ساعة' };
const BADGE = { absent: 'bad', excused: 'exc', pfirst: 'part', plast: 'part' };
const isPartial = st => st === 'pfirst' || st === 'plast';
const CFG = window.APP_CONFIG || {};
const ACTIONS = [['manageStudents', 'إدارة الطلبة (إضافة / تعديل / حذف)'], ['manageTeachers', 'إدارة التدريسيين ومسؤولي المختبرات'], ['manageSubjects', 'إدارة المواد وتخصيصها'],
  ['recordAttendance', 'تسجيل الغياب'], ['editAttendance', 'تعديل حضور محاضرة مسجّلة سابقاً'], ['deleteAttendance', 'حذف محاضرة مسجّلة'], ['viewAudit', 'عرض سجل التعديلات'], ['manageLeaves', 'إدخال الإجازات (لطالب أو مرحلة أو قسم لفترة من تاريخ إلى تاريخ)'], ['manageBranches', 'إدارة فروع القسم (إضافة / تعديل / حذف)'], ['viewReports', 'عرض التقارير ولوحة المتابعة'], ['exportData', 'تصدير البيانات'], ['importData', 'استيراد البيانات']];
const ALL_ON = Object.fromEntries(ACTIONS.map(a => [a[0], true]));
const DEFAULT_PERMS = {
  head: ALL_ON,
  rapporteur: Object.assign({}, ALL_ON, { viewAudit: false }),
  teacher: { recordAttendance: true, editAttendance: true, viewReports: true, exportData: true }
};
const PERM_ROLES = ['head', 'rapporteur', 'teacher'];
function can(a) {
  const u = me(); if (!u) return false; if (u.role === 'admin') return true;
  const p = (settings().perms || {})[u.role];
  if (p && Object.prototype.hasOwnProperty.call(p, a)) return !!p[a];
  return !!(DEFAULT_PERMS[u.role] || {})[a];
}
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ar');
const me = () => state.user;
const isAdmin = () => me().role === 'admin';
const canUsers = () => me().role === 'admin';
const normName = s => String(s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
const dupDept = o => live('departments').some(d => d.id !== o.id && String(d.parentId || '') === String(o.parentId || '') && normName(d.name) === normName(o.name));
const deptName = id => (get('departments', id) || {}).name || '—';
const teacherName = id => (get('teachers', id) || {}).name || '—';
const subjectName = id => (get('subjects', id) || {}).name || '—';
const planOf = (s, t) => Number(t === 'lab' ? (s.labCount == null ? 0 : s.labCount) : (s.theoryCount == null ? 15 : s.theoryCount)) || 0;
const myTIds = () => { const u = me(); const a = (u.teacherIds || []).slice(); if (u.teacherId && !a.includes(u.teacherId)) a.push(u.teacherId); return a; };
const isMineStaff = ids => ids.some(x => x && myTIds().includes(x));
const myDepts = () => { const u = me(); if (u.role === 'admin') return live('departments').map(d => d.id); const a = new Set([u.deptId]); live('departments').forEach(d => { if (d.parentId === u.deptId) a.add(d.id); }); return [...a].filter(Boolean); };
const staffOf = (s, t) => t === 'lab' ? [s.labId, s.labAltId] : [s.teacherId, s.teacherAltId];
function typesFor(s) {
  const u = me();
  return ['theory', 'lab'].filter(t => planOf(s, t) > 0 && (u.role !== 'teacher' || isMineStaff(staffOf(s, t))));
}
const settings = () => Object.assign({ warnPct: 10, banPct: 20, partialWeight: 0.5 }, get('settings', 'main') || {});
const optStages = () => Object.entries(STAGE).map(([v, l]) => [v, l]);

let route = 'home';
let modalOpen = false;

function toast(msg, err) {
  const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), Math.min(15000, 3500 + String(msg).length * 60));
}

/* ---------- النوافذ ---------- */
function showModal(title, html, wide) {
  modalOpen = true; document.body.classList.add('mopen');
  $('#modalRoot').innerHTML = `<div class="ov"><div class="modal ${wide ? 'wide' : ''}"><h3>${esc(title)}</h3>${html}</div></div>`;
  $('#modalRoot').onclick = e => { if (e.target.matches('[data-close]') || e.target.classList.contains('ov')) closeModal(); };
}
function closeModal() { modalOpen = false; document.body.classList.remove('mopen'); $('#modalRoot').innerHTML = ''; }

function fieldHtml(f, v) {
  const req = f.required ? ' required' : '';
  const val = v == null ? (f.def == null ? '' : f.def) : v;
  if (f.type === 'select')
    return `<label class="f">${f.label}<select name="${f.key}"${req}>${f.blank !== false ? '<option value="">—</option>' : ''}${f.options.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  if (f.type === 'multi') { const sel = Array.isArray(v) ? v : []; return `<label class="f">${f.label}<select name="${f.key}" multiple size="6">${f.options.map(o => `<option value="${esc(o[0])}"${sel.includes(o[0]) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`; }
  if (f.type === 'checks') { const sel = Array.isArray(v) ? v : []; if (!f.options.length) return `<div class="f"><span>${f.label}</span><div class="checks"><b style="color:#dc2626">لا توجد أقسام بعد. أضِف قسماً من صفحة «الأقسام» أولاً.</b></div></div>`; return `<div class="f"><span>${f.label}</span><div class="checks">${f.options.map(o => `<label class="chk"><input type="checkbox" data-ck="${f.key}" value="${esc(o[0])}"${sel.includes(o[0]) ? ' checked' : ''}> ${esc(o[1])}</label>`).join('')}</div></div>`; }
  if (f.type === 'checkbox')
    return `<label class="f chk"><input type="checkbox" name="${f.key}"${val ? ' checked' : ''}> ${f.label}</label>`;
  if (f.type === 'textarea')
    return `<label class="f">${f.label}<textarea name="${f.key}" rows="3">${esc(val)}</textarea></label>`;
  return `<label class="f">${f.label}<input name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.type === 'password' ? ' autocomplete="new-password" minlength="6"' : ''}${f.type === 'number' ? ' min="0"' : ''}></label>`;
}
function openForm({ title, fields, values, onSave, onOpen }) {
  showModal(title, `<form id="mform">${fields.map(f => fieldHtml(f, (values || {})[f.key])).join('')}
   <div class="row end"><button type="button" class="btn ghost" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  if (onOpen) onOpen();
  $('#mform').onsubmit = async e => {
    e.preventDefault();
    const v = {};
    fields.forEach(f => {
      if (f.type === 'checks') { v[f.key] = [...document.querySelectorAll('#mform [data-ck="' + f.key + '"]:checked')].map(c => c.value); return; }
      const el = $('#mform [name="' + f.key + '"]');
      v[f.key] = f.type === 'multi' ? [...el.selectedOptions].map(o => o.value) : f.type === 'checkbox' ? el.checked : (f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim());
    });
    try { if ((await onSave(v)) !== false) closeModal(); } catch (err) { toast(err.message, true); }
  };
}

/* ---------- الهيكل العام ---------- */
function navItems() {
  const n = [['home', 'الرئيسية']];
  if (can('recordAttendance')) n.push(['attend', 'تسجيل الغياب']);
  if (can('viewReports')) n.push(['reports', 'التقارير ولوحة المتابعة']);
  if (can('manageStudents')) n.push(['students', 'الطلبة']);
  if (can('manageTeachers') || isAdmin()) n.push(['staff', 'الكادر والحسابات']);
  if (can('manageSubjects')) n.push(['subjects', 'المواد الدراسية']);
  if (can('manageLeaves')) n.push(['leaves', 'الإجازات']);
  if (!isAdmin() && can('manageBranches') && !(get('departments', me().deptId) || {}).parentId) n.push(['branches', 'فروع القسم']);
  if (can('viewAudit')) n.push(['audit', 'سجل التعديلات']);
  if (isAdmin()) n.push(['departments', 'الأقسام'], ['permissions', 'تحديد الصلاحيات']);
  n.push(['settings', 'الإعدادات والحساب']);
  return n;
}
const waLink = () => CFG.AUTHOR_PHONE ? `<a href="https://wa.me/${'964' + String(CFG.AUTHOR_PHONE).replace(/^0/, '')}" target="_blank" rel="noopener" dir="ltr">${esc(CFG.AUTHOR_PHONE)} (واتساب)</a>` : '';
const footer = () => `<div class="foot">${esc(brand().university || '')} — ${esc(brand().college || '')}<br>تصميم وتطوير: ${esc(CFG.AUTHOR || '')} · <span dir="ltr">${esc(CFG.AUTHOR_EMAIL || '')}</span> · ${waLink()} · الإصدار ${esc(APP_BUILD)}${CFG.VERSION !== APP_BUILD ? ' ⚠' : ''}</div>`;
const logoImg = () => `<img src="${esc(brand().logo || 'logo.png')}" class="logo" alt="" onerror="this.remove()">`;
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
   <aside class="side" id="side"><div class="brand">${logoImg()}<div class="brand-u">${esc(brand().university || '')}</div><div class="brand-c">${esc(brand().college || '')}</div><small>${esc(me().name)} — ${ROLE[me().role]}</small></div>
    ${navItems().map(([k, l]) => `<a data-nav="${k}">${l}</a>`).join('')}</aside>
   <div class="content"><header class="top"><button id="menuBtn">☰</button><h1 id="title"></h1><div class="sync" id="syncBadge" title="مزامنة الآن"></div></header>
   <main id="main"></main>${footer()}</div></div>`;
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  $('#side').onclick = e => { const a = e.target.closest('[data-nav]'); if (a) { go(a.dataset.nav); $('#side').classList.remove('open'); } };
  $('#syncBadge').onclick = () => syncNow(true);
  paintSync();
}
function paintSync() {
  const b = $('#syncBadge'); if (!b) return;
  const m = { ok: ['ok', 'تمت المزامنة'], pending: ['pend', state.pending + ' بانتظار الرفع'], syncing: ['spin', 'جارٍ المزامنة…'], offline: ['', 'بدون اتصال' + (state.pending ? ' · ' + state.pending + ' معلّق' : '')], error: ['err', 'خطأ مزامنة' + (state.pending ? ' · ' + state.pending + ' معلّق' : '')], idle: ['', state.pending ? state.pending + ' معلّق' : 'جاهز'] }[state.status] || ['', ''];
  b.innerHTML = `<span class="dot ${m[0]}"></span>${esc(m[1])}`;
  b.title = state.error || 'اضغط للمزامنة الآن';
}
function go(r) { route = r; location.hash = r; render(); }
function render() {
  applyBrand();
  if (!state.user) return renderLogin();
  if (!$('#main')) renderShell();
  const titles = Object.fromEntries(navItems());
  if (!titles[route]) route = 'home';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === route));
  $('#title').textContent = titles[route] || '';
  const fn = SCREENS[route] || SCREENS.home;
  fn($('#main'));
  window.scrollTo(0, 0);
}

/* ---------- الدخول ---------- */
function renderLogin(msg) {
  applyBrand();
  $('#app').innerHTML = `<div class="login"><div class="card" style="text-align:center">${logoImg().replace('class="logo"', 'class="logo" style="margin:0 auto 8px;width:80px;height:80px"')}<h2 style="margin-bottom:2px">${esc(brand().university || '')}</h2><div class="brand-c" style="color:var(--pd);font-weight:700">${esc(brand().college || '')}</div>
  <p class="muted">نظام متابعة غيابات الطلبة</p><div style="text-align:right">
  ${msg ? `<p style="color:var(--bad)">${esc(msg)}</p>` : ''}
  <form id="lf"><label class="f">اسم المستخدم<input name="u" autocomplete="username" required></label>
  <label class="f">كلمة المرور<input name="p" type="password" autocomplete="current-password" required></label>
  ${CFG.API_URL ? `<input type="hidden" name="url" value="${esc(state.apiUrl)}">` : `<label class="f">رابط الخدمة (Apps Script)<input name="url" value="${esc(state.apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec" dir="ltr"></label>`}
  <button class="btn" style="width:100%">دخول</button></form>
  <p class="muted" id="lmsg"></p></div>${footer()}</div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target; const url = f.url.value.trim();
    if (!url) { $('#lmsg').textContent = 'أدخل رابط الخدمة'; return; }
    if (!navigator.onLine) { $('#lmsg').textContent = 'يلزم اتصال بالإنترنت لتسجيل الدخول أول مرة'; return; }
    state.apiUrl = url; await metaSet('apiUrl', url);
    $('#lmsg').textContent = 'جارٍ الدخول…';
    try { await login(f.u.value, f.p.value); route = 'home'; location.hash = 'home'; render(); }
    catch (err) { $('#lmsg').textContent = err.message; }
  };
}

/* ---------- الرئيسية ---------- */
const mySubjects = () => {
  const u = me();
  return live('subjects').filter(s => (u.role === 'admin' || (u.role === 'teacher' ? true : myDepts().includes(s.deptId))) && typesFor(s).length).sort(byName);
};
const attPairs = () => { const o = []; mySubjects().forEach(s => typesFor(s).forEach(t => o.push([s, t]))); return o; };
const sessKey = (sid, type, no, sec) => [sid, type, no, sec || ''].join('|');
const recordedCount = (sid, type) => live('sessions').filter(x => x.subjectId === sid && (x.type || 'theory') === type).length;
function studentsOf(subj, section) {
  return live('students').filter(s => s.deptId === subj.deptId && String(s.stage) === String(subj.stage) &&
    (section ? s.section === section : (!subj.section || s.section === subj.section))).sort(byName);
}
function homeScreen(el) {
  const t = today();
  const ss = live('sessions').filter(s => s.date === t);
  const ab = live('absences').filter(a => a.date === t && a.status === 'absent').length;
  const pairs = attPairs();
  const isStaff = me().role === 'teacher';
  const cards = pairs.map(([s, ty]) => {
    const alt = isStaff && isMineStaff([staffOf(s, ty)[1]]) && !isMineStaff([staffOf(s, ty)[0]]);
    return `<div class="mycard" data-att="${s.id}|${ty}"><div class="mc-name">${esc(s.name)}</div>
     <div class="mc-sub"><span class="badge ${ty === 'lab' ? 'exc' : 'ok'}">${TYPE[ty]}</span>${alt ? ' <span class="badge warn">بديل</span>' : ''} المرحلة ${STAGE[s.stage] || ''}${s.section ? ' — شعبة ' + esc(s.section) : ''}</div>
     <div class="mc-sub">سُجّلت ${recordedCount(s.id, ty)} من ${planOf(s, ty)} محاضرة</div><button class="btn">تسجيل الغياب</button></div>`;
  }).join('');
  el.innerHTML = `${isStaff ? `<h2 style="font-size:1.4rem">موادي</h2>${cards ? `<div class="grid mygrid">${cards}</div>` : '<div class="card empty">لم تُخصَّص لك مواد بعد. تواصل مع مدير النظام.</div>'}` : `<div class="grid kpis">
   <div class="kpi click" data-k="hSess"><b>${ss.length}</b><span>محاضرات مسجلة اليوم</span></div>
   <div class="kpi click" data-k="hAbs"><b>${ab}</b><span>غيابات اليوم</span></div>
   <div class="kpi click" data-k="hStu"><b>${live('students').length}</b><span>الطلبة</span></div>
   <div class="kpi click" data-k="hSub"><b>${mySubjects().length}</b><span>المواد</span></div></div>
   <div class="card" style="margin-top:14px"><h2>إجراءات سريعة</h2><div class="row">
   ${can('recordAttendance') ? '<button class="btn" data-go="attend">تسجيل غياب محاضرة</button>' : ''}${can('viewReports') ? '<button class="btn ghost" data-go="reports">التقارير</button>' : ''}</div>
   ${!mySubjects().length ? '<p class="muted">لا توجد مواد بعد. أضِف المواد من قسم «المواد الدراسية».</p>' : ''}</div>`}
   ${state.pending ? `<p class="muted">يوجد ${state.pending} تعديل بانتظار الرفع إلى الخادم عند توفر الإنترنت.</p>` : ''}`;
  el.onclick = e => {
    const k = e.target.closest('[data-k^=h]'); if (k) return kpiClick(k.dataset.k);
    const b = e.target.closest('[data-go]'); if (b) return go(b.dataset.go);
    const c = e.target.closest('[data-att]'); if (c) { const [id, ty] = c.dataset.att.split('|'); attInit(id, ty); go('attend'); }
  };
}

/* ---------- تسجيل الغياب ---------- */
let att = null;
function attInit(subjId, type) {
  const s = get('subjects', subjId);
  att = { subjectId: subjId, type, date: today(), no: 1, section: s ? s.section || '' : '', states: {}, existing: false, q: '' };
  if (s) {
    const rec = new Set(live('sessions').filter(x => x.subjectId === subjId && (x.type || 'theory') === type && (x.section || '') === att.section).map(x => x.lectureNo));
    let n = 1; while (rec.has(n) && n < planOf(s, type)) n++;
    att.no = n; attLoad();
  }
}
const leaveFor = (st, date) => live('leaves').find(l => l.studentId === st.id && l.from <= date && date <= l.to);
function leavePrefill(s) { studentsOf(s, att.section).forEach(x => { if (leaveFor(x, att.date)) att.states[x.id] = 'excused'; }); }
function attLoad() {
  const s = get('subjects', att.subjectId); if (!s) return;
  const id = sessKey(s.id, att.type, att.no, att.section);
  const ex = get('sessions', id);
  att.states = {}; att.existing = !!ex; att.card = null;
  if (ex) { att.date = ex.date; live('absences').forEach(a => { if (a.sessionId === id) att.states[a.studentId] = a.status; }); }
  else leavePrefill(s);
}

/* ---------- قراءة بطاقات الطلبة (USB / NFC) ---------- */
function cardKeys(raw) {
  const c = String(raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const out = new Set(); if (!c) return out;
  const nz = x => x.replace(/^0+(?=.)/, '');
  out.add(nz(c));
  const addHex = h => {
    if (h.length % 2) h = '0' + h;
    const rev = h.match(/../g).reverse().join('');
    [h, rev].forEach(x => { out.add(nz(x)); try { out.add(BigInt('0x' + x).toString()); } catch (e) {} });
  };
  if (/^[0-9A-F]+$/.test(c)) addHex(c);
  if (/^[0-9]+$/.test(c)) { try { addHex(BigInt(c).toString(16).toUpperCase()); } catch (e) {} }
  return out;
}
const cardMatch = (a, b) => { const A = cardKeys(a); if (!A.size) return false; for (const k of cardKeys(b)) if (A.has(k)) return true; return false; };
function beep(ok) {
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    beep.ctx = beep.ctx || new A(); const c = beep.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = ok ? 1000 : 220; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.08;
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? 0.09 : 0.3));
  } catch (e) {}
}
function cardStart(s, list) {
  const dirty = Object.keys(att.states).length && !list.every(x => att.states[x.id] === (leaveFor(x, att.date) ? 'excused' : 'absent'));
  if (dirty && !confirm('سيُعاد ضبط الحضور: الجميع «غائب» حتى تُمرَّر بطاقته. متابعة؟')) return false;
  att.states = {}; list.forEach(x => { att.states[x.id] = leaveFor(x, att.date) ? 'excused' : 'absent'; });
  att.card = { on: true, scanned: new Set(), last: null, unk: null, nfc: false };
  return true;
}
function cardScan(raw, list, rerender) {
  const c = att.card; raw = String(raw || '').trim(); if (!raw) return;
  const st = live('students').find(x => x.cardNo && cardMatch(x.cardNo, raw));
  if (!st || !list.some(x => x.id === st.id)) {
    beep(false);
    if (st) { c.last = { bad: true, msg: '⚠ ' + st.name + ' — ليس من طلبة هذه المحاضرة' }; c.unk = null; }
    else { c.last = { bad: true, msg: '⚠ بطاقة غير مسجّلة: ' + raw }; c.unk = { raw, q: '' }; }
  } else if (c.scanned.has(st.id)) {
    beep(false); c.last = { bad: true, msg: '↺ ' + st.name + ' — مسجّل مسبقاً' }; c.unk = null;
  } else {
    beep(true); c.scanned.add(st.id);
    delete att.states[st.id];
    c.last = { msg: '✔ ' + st.name }; c.unk = null;
  }
  rerender();
}
async function nfcStart(list, rerender) {
  const c = att.card;
  if (!('NDEFReader' in window)) { toast('هذا المتصفح لا يدعم قراءة NFC. استخدم Chrome على أندرويد (وليس iPhone) أو قارئ USB.'); return; }
  try {
    const r = new NDEFReader(); await r.scan(); c.nfc = true; c.nfcReader = r;
    r.onreading = ev => {
      let raw = ev.serialNumber || '';
      cardScan(raw, list, rerender);
    };
    r.onreadingerror = () => { beep(false); c.last = { bad: true, msg: '⚠ تعذّرت قراءة البطاقة (قد لا تكون من نوع يدعمه المتصفح)' }; rerender(); };
    rerender(); toast('NFC جاهز — قرّب البطاقة من ظهر الهاتف');
  } catch (e) { toast('تعذّر تشغيل NFC: ' + (e && e.message || e) + ' — فعّل NFC من إعدادات الهاتف وأعطِ الإذن.'); }
}
function cardPanel(list) {
  const c = att.card; if (!c) return '';
  const u = c.unk;
  const res = u && u.q ? list.filter(x => !x.cardNo && x.name.includes(u.q)).slice(0, 6) : [];
  return `<div class="card cardbox"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>📇 وضع البطاقات</b><span class="grow"></span><span class="badge ok">حاضر ${c.scanned.size} من ${list.length}</span><button class="btn ghost sm" id="cNfc">${c.nfc ? 'NFC يعمل ✓' : '📱 تشغيل NFC'}</button><button class="btn danger sm" id="cOff">إنهاء الوضع</button></div>
   <input id="cIn" class="cin" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="مرّر البطاقة على القارئ…" aria-label="قارئ البطاقات">
   <div class="clast${c.last && c.last.bad ? ' bad' : ''}" id="cLast">${c.last ? esc(c.last.msg) : 'الجميع «غائب» حتى تُمرَّر بطاقته. ثم اضغط «حفظ المحاضرة».'}</div>
   ${u ? `<div class="cunk"><div class="muted">ربط هذه البطاقة بطالب (لم تُربط بطاقته بعد):</div><input type="search" id="cUq" placeholder="اسم الطالب…" value="${esc(u.q)}">${res.map(x => `<button class="btn ghost sm" data-link="${x.id}">${esc(x.name)}</button>`).join(' ')}${u.q && !res.length ? '<div class="muted">لا نتائج (يظهر هنا من ليس لديه بطاقة فقط)</div>' : ''}</div>` : ''}</div>`;
}
function cardBind(s, list, rerender) {
  const c = att.card; if (!c) return;
  const inp = $('#cIn'); if (!inp) return;
  let buf = '', tm = null;
  const flush = () => { clearTimeout(tm); const v = inp.value; inp.value = ''; if (v.trim()) cardScan(v, list, rerender); };
  inp.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); flush(); } };
  inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { if (inp.value.length >= 6) flush(); }, 350); };
  const refocus = () => { const a = document.activeElement; if (!a || a === document.body) inp.focus(); };
  inp.onblur = () => setTimeout(refocus, 60);
  $('#cOff').onclick = () => { if (c.nfcReader) c.nfcReader.onreading = null; att.card = null; rerender(); };
  $('#cNfc').onclick = () => nfcStart(list, rerender);
  if ($('#cUq')) $('#cUq').oninput = e => { c.unk.q = e.target.value; const p = e.target.selectionStart; rerender(); const n = $('#cUq'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
  document.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
    const st = get('students', b.dataset.link); if (!st || !c.unk) return;
    await saveRecs('students', [Object.assign({}, st, { cardNo: c.unk.raw })]);
    const raw = c.unk.raw; c.unk = null; cardScan(raw, list, rerender);
  });
  if (!c.unk) inp.focus();
}
function attendScreen(el) {
  const pairs = attPairs();
  if (!pairs.length) { el.innerHTML = '<div class="card empty">لا توجد مواد مخصّصة لك لتسجيل الغياب.</div>'; return; }
  let s = att && get('subjects', att.subjectId);
  if (!s || !typesFor(s).includes(att.type)) { attInit(pairs[0][0].id, pairs[0][1]); s = get('subjects', att.subjectId); }
  const N = planOf(s, att.type);
  const sections = [...new Set(live('students').filter(x => x.deptId === s.deptId && String(x.stage) === String(s.stage)).map(x => x.section).filter(Boolean))].sort();
  const list = studentsOf(s, att.section);
  const q = att.q.trim();
  const cnt = { absent: 0, excused: 0, pfirst: 0, plast: 0 };
  list.forEach(x => { const st = att.states[x.id]; if (cnt[st] != null) cnt[st]++; });
  const locked = att.existing && !can('editAttendance');
  const recd = new Map();
  live('sessions').filter(x => x.subjectId === s.id && (x.type || 'theory') === att.type && (x.section || '') === att.section).forEach(x => recd.set(x.lectureNo, x));
  const nums = []; for (let i = 1; i <= Math.max(N, att.no); i++) nums.push(i);
  el.innerHTML = `<div class="card"><div class="subjhead">${esc(s.name)}</div>
   <div class="subjsub"><span class="badge ${att.type === 'lab' ? 'exc' : 'ok'}">${TYPE[att.type]}</span> المرحلة ${STAGE[s.stage] || ''}${s.section ? ' — شعبة ' + esc(s.section) : ''} · سُجّلت ${recd.size} من ${N}</div>
   <div class="filters" style="margin:10px 0 0">
    <select id="aSub">${pairs.map(([x, ty]) => `<option value="${x.id}|${ty}"${x.id === s.id && ty === att.type ? ' selected' : ''}>${esc(x.name)} — ${TYPE[ty]} — ${STAGE[x.stage] || ''}${x.section ? ' / ' + esc(x.section) : ''}</option>`).join('')}</select>
    <select id="aNo">${nums.map(i => `<option value="${i}"${i === att.no ? ' selected' : ''}>محاضرة ${i}${recd.has(i) ? ' ✓' : ''}</option>`).join('')}</select>
    <input type="date" id="aDate" value="${att.date}">
    ${!s.section && sections.length > 1 ? `<select id="aSec"><option value="">كل الشعب</option>${sections.map(x => `<option${x === att.section ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
   </div>
   <p class="muted" style="margin:8px 0 0">${att.existing ? (locked ? '🔒 هذه المحاضرة مسجّلة ولا تملك صلاحية تعديلها.' : '⚠ هذه المحاضرة مسجّلة سابقاً — يمكنك تعديلها.') : 'اضغط على النقطة أمام اسم الطالب لتحديد حالته (الأصل: حاضر، ومن لديه إجازة مسجّلة يُوضع «مجاز» تلقائياً ويمكنك تغييره). «أول ساعة» = حضر الساعة الأولى فقط، «آخر ساعة» = حضر الساعة الأخيرة فقط.'}</p></div>
  ${att.card ? cardPanel(list) : (!locked && list.length ? '<div class="card" style="padding:8px 12px"><button class="btn ghost sm" id="cOn">📇 تسجيل الحضور بالبطاقات (قارئ USB أو NFC)</button></div>' : '')}
  ${recd.size ? `<div class="card"><h3 style="margin:0 0 8px">المحاضرات المسجّلة</h3><div class="chips">${[...recd.entries()].sort((x, y) => x[0] - y[0]).map(([n, x]) => `<button class="chip${n === att.no ? ' on' : ''}" data-lec="${n}">${n === att.no ? '' : (can('editAttendance') ? '✏ ' : '👁 ')}محاضرة ${n} · ${esc(x.date || '')}</button>`).join('')}</div><p class="muted" style="margin:6px 0 0">${can('editAttendance') ? 'اضغط على محاضرة لفتحها وتعديل حضورها' + (can('deleteAttendance') ? ' أو حذفها.' : ' (الحذف غير مسموح لك).') : 'اضغط لعرض الحضور فقط — لا تملك صلاحية التعديل.'}</p></div>` : ''}
  <div class="card" style="padding:0">
   <div class="filters" style="padding:10px;margin:0"><input type="search" id="aQ" placeholder="بحث عن طالب…" value="${esc(att.q)}"><button class="btn ghost sm" id="aAll">الكل حاضر</button></div>
   ${list.length ? `<div class="bhead"><span class="n"></span><span class="nm"></span>${Object.keys(STATUS).map(k => `<span class="bc">${BSHORT[k]}</span>`).join('')}</div>` : ''}
   <div id="aList">${list.length ? list.filter(x => !q || x.name.includes(q)).map((x, i) => { const cur = att.states[x.id] || 'present'; return `<div class="stu ${att.states[x.id] || ''}" data-id="${x.id}"><span class="n">${i + 1}</span><span class="nm">${esc(x.name)}${x.section ? ' <span class="muted">(' + esc(x.section) + ')</span>' : ''}${leaveFor(x, att.date) ? ' <span class="badge exc">إجازة</span>' : ''}</span>${Object.keys(STATUS).map(k => `<span class="bc"><span class="bub b-${k}${k === cur ? ' on' : ''}" data-s="${k}" role="radio" aria-checked="${k === cur}" aria-label="${STATUS[k]}"></span></span>`).join('')}</div>`; }).join('') : '<div class="empty">لا يوجد طلبة مطابقون لهذه المادة/المرحلة/الشعبة.</div>'}</div>
   <div class="sticky-save"><span>غائب <b>${cnt.absent}</b> · مجاز <b>${cnt.excused}</b> · أول ساعة <b>${cnt.pfirst}</b> · آخر ساعة <b>${cnt.plast}</b> · من ${list.length}</span><span class="grow"></span>
    ${can('exportData') ? '<button class="btn ghost sm" id="aExp">تصدير الكشف</button>' : ''}${att.existing && can('deleteAttendance') ? '<button class="btn danger sm" id="aDel">حذف المحاضرة</button>' : ''}${locked ? '' : `<button class="btn" id="aSave">${att.existing ? 'حفظ التعديل' : 'حفظ المحاضرة'}</button>`}</div></div>`;
  const rerender = () => attendScreen(el);
  if ($('#cOn')) $('#cOn').onclick = () => { if (cardStart(s, list)) rerender(); };
  if (att.card) cardBind(s, list, rerender);
  $('#aSub').onchange = e => { const [id, ty] = e.target.value.split('|'); attInit(id, ty); rerender(); };
  $('#aNo').onchange = e => { att.no = Number(e.target.value) || 1; att.date = today(); attLoad(); rerender(); };
  el.querySelectorAll('[data-lec]').forEach(c => c.onclick = () => { att.no = Number(c.dataset.lec); att.date = today(); attLoad(); rerender(); window.scrollTo(0, 0); });
  $('#aDate').onchange = e => { att.date = e.target.value || today(); att.card = null; if (!att.existing) { att.states = {}; leavePrefill(s); rerender(); } };
  if ($('#aSec')) $('#aSec').onchange = e => { att.section = e.target.value; att.date = today(); attLoad(); rerender(); };
  $('#aQ').oninput = e => { att.q = e.target.value; const p = e.target.selectionStart; rerender(); const n = $('#aQ'); n.focus(); n.setSelectionRange(p, p); };
  $('#aAll').onclick = () => { att.states = {}; rerender(); };
  $('#aList').onclick = e => {
    if (locked) return;
    const bub = e.target.closest('[data-s]'); if (!bub) return;
    const id = bub.closest('.stu').dataset.id, k = bub.dataset.s;
    if (k === 'present') delete att.states[id]; else att.states[id] = k;
    const sc = window.scrollY; rerender(); window.scrollTo(0, sc);
  };
  if ($('#aSave')) $('#aSave').onclick = () => attSave(s, list);
  if ($('#aExp')) $('#aExp').onclick = () => downloadCsv('كشف-' + s.name + '-' + TYPE[att.type] + '-محاضرة' + att.no + '.csv',
    [['ت', 'الطالب', 'الشعبة', 'الحالة']].concat(list.map((x, i) => [i + 1, x.name, x.section || '', STATUS[att.states[x.id] || 'present']])));
  if ($('#aDel')) $('#aDel').onclick = () => attDelete(s);
}
async function attSave(s, list) {
  const id = sessKey(s.id, att.type, att.no, att.section);
  const old = get('sessions', id);
  const absRecs = [];
  const inList = new Set(list.map(x => x.id));
  const prev = {}; live('absences').forEach(a => { if (a.sessionId === id) prev[a.studentId] = a; });
  let n = 0;
  list.forEach(x => {
    const st = att.states[x.id];
    if (st) { if (st === 'absent') n++; absRecs.push({ id: id + '|' + x.id, sessionId: id, subjectId: s.id, type: att.type, lectureNo: att.no, studentId: x.id, deptId: s.deptId, date: att.date, status: st }); }
    else if (prev[x.id]) absRecs.push(Object.assign({}, prev[x.id], { deleted: true }));
  });
  Object.keys(prev).forEach(k => { if (!inList.has(k) && prev[k].status === 'absent') n++; });
  const sess = Object.assign({}, old || {}, { id, subjectId: s.id, type: att.type, deptId: s.deptId, date: att.date, lectureNo: att.no, section: att.section, stage: s.stage, byUserId: me().id, byName: me().name, absentCount: n, studentCount: list.length, deleted: false });
  await saveRecs('sessions', [sess]);
  if (absRecs.length) await saveRecs('absences', absRecs);
  toast('تم حفظ المحاضرة ' + att.no + (navigator.onLine ? '' : ' (ستُرفع عند توفر الإنترنت)'));
  attInit(s.id, att.type); attendScreen($('#main'));
}
async function attDelete(s) {
  if (!confirm('حذف هذه المحاضرة وكل غياباتها؟')) return;
  const id = sessKey(s.id, att.type, att.no, att.section);
  const abs = live('absences').filter(a => a.sessionId === id).map(a => Object.assign({}, a, { deleted: true }));
  if (abs.length) await saveRecs('absences', abs);
  await saveRecs('sessions', [Object.assign({}, get('sessions', id), { deleted: true })]);
  toast('تم الحذف'); attInit(s.id, att.type); attendScreen($('#main'));
}

/* ---------- التقارير ---------- */
let rf = { type: '', dept: '', stage: '', subject: '', section: '', from: '', to: '', level: '', q: '', limit: 100 };
function calc(f) {
  const u = me();
  const dept = f.dept && (u.role === 'admin' || myDepts().includes(f.dept)) ? f.dept : '';
  const subs = live('subjects').filter(s => (dept ? s.deptId === dept : (u.role === 'admin' || u.role === 'teacher' || myDepts().includes(s.deptId))) && (!f.stage || String(s.stage) === f.stage) && (!f.subject || s.id === f.subject) && (u.role !== 'teacher' || isMineStaff([s.teacherId, s.teacherAltId, s.labId, s.labAltId])));
  const subIds = new Set(subs.map(s => s.id));
  const inRange = d => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const types = f.type ? [f.type] : ['theory', 'lab'];
  const sessions = live('sessions').filter(x => subIds.has(x.subjectId) && inRange(x.date) && types.includes(x.type || 'theory'));
  const abs = live('absences').filter(x => subIds.has(x.subjectId) && inRange(x.date) && types.includes(x.type || 'theory'));
  const sessBy = {}; sessions.forEach(x => (sessBy[x.subjectId] = sessBy[x.subjectId] || []).push(x));
  const absBy = {}; abs.forEach(a => { const k = a.studentId + '|' + a.subjectId; (absBy[k] = absBy[k] || []).push(a); });
  const students = live('students').filter(s => (!dept || s.deptId === dept) && (!f.stage || String(s.stage) === f.stage) && (!f.section || s.section === f.section));
  const per = new Map(), bySub = new Map();
  students.forEach(st => {
    const row = { st, total: 0, absent: 0, partial: 0, pfirst: 0, plast: 0, excused: 0 };
    subs.forEach(sb => {
      if (sb.deptId !== st.deptId || String(sb.stage) !== String(st.stage) || (sb.section && sb.section !== st.section)) return;
      const planned = types.reduce((n, t) => n + planOf(sb, t), 0);
      const tot = planned || (sessBy[sb.id] || []).filter(x => !x.section || x.section === st.section).length;
      const list = absBy[st.id + '|' + sb.id] || [];
      const a = list.filter(x => x.status === 'absent').length;
      const pa = list.filter(x => isPartial(x.status)).length;
      row.total += tot; row.absent += a; row.partial += pa;
      row.excused += list.filter(x => x.status === 'excused').length;
      row.pfirst += list.filter(x => x.status === 'pfirst').length; row.plast += list.filter(x => x.status === 'plast').length;
      const b = bySub.get(sb.id) || { sb, total: 0, absent: 0 }; b.total += tot; b.absent += a + pa * settings().partialWeight; bySub.set(sb.id, b);
    });
    row.weighted = row.absent + row.partial * settings().partialWeight;
    row.pct = row.total ? row.weighted / row.total * 100 : 0;
    const S = settings();
    row.level = !row.total ? '' : row.pct >= S.banPct ? 'ban' : row.pct >= S.warnPct ? 'warn' : 'ok';
    per.set(st.id, row);
  });
  return { rows: [...per.values()], bySub: [...bySub.values()], sessions, abs, subs };
}
const LEVEL = { ban: ['bad', 'حرمان'], warn: ['warn', 'إنذار'], ok: ['ok', 'سليم'] };
function reportsScreen(el) {
  const u = me();
  const dept = rf.dept && (u.role === 'admin' || myDepts().includes(rf.dept)) ? rf.dept : '';
  const subsAll = mySubjects().filter(s => (!dept || s.deptId === dept) && (!rf.stage || String(s.stage) === rf.stage));
  const sections = [...new Set(live('students').filter(x => (!dept || x.deptId === dept) && (!rf.stage || String(x.stage) === rf.stage)).map(x => x.section).filter(Boolean))].sort();
  const C = calc(rf);
  let rows = C.rows.filter(r => r.total > 0 || rf.level === '');
  if (rf.level) rows = rows.filter(r => rf.level === 'any' ? (r.level === 'warn' || r.level === 'ban') : r.level === rf.level);
  if (rf.q) rows = rows.filter(r => r.st.name.includes(rf.q));
  rows.sort((a, b) => b.pct - a.pct || b.absent - a.absent);
  const totAbs = C.rows.reduce((s, r) => s + r.weighted, 0), totPos = C.rows.reduce((s, r) => s + r.total, 0);
  const warnCnt = C.rows.filter(r => r.level === 'warn' || r.level === 'ban').length;
  el.innerHTML = `<div class="filters">
   ${u.role === 'admin' ? `<select id="fDept"><option value="">كل الأقسام</option>${live('departments').map(d => `<option value="${d.id}"${d.id === rf.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}
   <select id="fType"><option value="">نظري وعملي</option><option value="theory"${rf.type === 'theory' ? ' selected' : ''}>نظري فقط</option><option value="lab"${rf.type === 'lab' ? ' selected' : ''}>عملي فقط</option></select>
   <select id="fStage"><option value="">كل المراحل</option>${optStages().map(o => `<option value="${o[0]}"${o[0] === rf.stage ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>
   <select id="fSub"><option value="">كل المواد</option>${subsAll.map(s => `<option value="${s.id}"${s.id === rf.subject ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
   <select id="fSec"><option value="">كل الشعب</option>${sections.map(s => `<option${s === rf.section ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
   <input type="date" id="fFrom" value="${rf.from}" title="من تاريخ"><input type="date" id="fTo" value="${rf.to}" title="إلى تاريخ">
   <select id="fLevel"><option value="">كل الحالات</option><option value="any"${rf.level === 'any' ? ' selected' : ''}>إنذار وحرمان</option><option value="warn"${rf.level === 'warn' ? ' selected' : ''}>إنذار</option><option value="ban"${rf.level === 'ban' ? ' selected' : ''}>حرمان</option></select>
   <input type="search" id="fQ" placeholder="بحث باسم الطالب" value="${esc(rf.q)}"></div>
  <div class="grid kpis"><div class="kpi click" data-k="rSess"><b>${C.sessions.length}</b><span>محاضرات مسجلة</span></div>
   <div class="kpi click" data-k="rAbs"><b>${+totAbs.toFixed(1)}</b><span>إجمالي الغيابات (حضور ساعة واحدة بوزنه)</span></div>
   <div class="kpi click" data-k="rPct"><b>${totPos ? (totAbs / totPos * 100).toFixed(1) : 0}%</b><span>نسبة الغياب العامة</span></div>
   <div class="kpi click" data-k="rWarn"><b>${warnCnt}</b><span>طلبة (إنذار/حرمان)</span></div></div>
  ${C.bySub.length ? `<div class="card" style="margin-top:14px"><h2>نسبة الغياب حسب المادة</h2>${C.bySub.sort((a, b) => b.absent / (b.total || 1) - a.absent / (a.total || 1)).map(b => { const p = b.total ? b.absent / b.total * 100 : 0; const S = settings(); return `<div class="bar click" data-sub="${b.sb.id}" title="عرض طلبة هذه المادة"><span class="lb">${esc(b.sb.name)}</span><div class="tr"><div class="fi ${p >= S.banPct ? 'b' : p >= S.warnPct ? 'w' : ''}" style="width:${Math.min(100, p * 2)}%"></div></div><b>${p.toFixed(1)}%</b></div>`; }).join('')}<p class="muted">الإنذار عند ${settings().warnPct}% والحرمان عند ${settings().banPct}% (يغيّرها مدير النظام من الإعدادات).</p></div>` : ''}
  <div class="card" style="padding:0"><div class="row" style="padding:10px"><h2 class="grow" style="margin:0">الطلبة (${rows.length})</h2>${'<button class="btn sm" id="fPdf">تقرير رسومي (PDF)</button>'}${can('exportData') ? '<button class="btn ghost sm" id="fCsv">تصدير الملخص</button><button class="btn ghost sm" id="fDet">تصدير تفصيلي</button>' : ''}</div>
   <div class="tblwrap"><table><thead><tr><th>الطالب</th><th>المرحلة</th><th>الشعبة</th><th>المقررة</th><th>غياب</th><th>أول ساعة فقط</th><th>آخر ساعة فقط</th><th>مجاز</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>
   ${rows.slice(0, rf.limit).map(r => `<tr data-st="${r.st.id}" style="cursor:pointer"><td>${esc(r.st.name)}</td><td>${STAGE[r.st.stage] || ''}</td><td>${esc(r.st.section || '')}</td><td>${r.total}</td><td>${r.absent}</td><td>${r.pfirst}</td><td>${r.plast}</td><td>${r.excused}</td><td>${r.total ? r.pct.toFixed(1) + '%' : '—'}</td><td>${r.level ? `<span class="badge ${LEVEL[r.level][0]}">${LEVEL[r.level][1]}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">لا توجد بيانات</td></tr>'}</tbody></table></div>
   ${rows.length > rf.limit ? '<div class="row end" style="padding:10px"><button class="btn ghost" id="fMore">عرض المزيد</button></div>' : ''}</div>`;
  const bind = (id, key, ev) => { const n = $('#' + id); if (n) n[ev || 'onchange'] = e => { rf[key] = e.target.value; if (key === 'dept' || key === 'stage') rf.subject = ''; rf.limit = 100; reportsScreen(el); }; };
  bind('fDept', 'dept'); bind('fType', 'type'); bind('fStage', 'stage'); bind('fSub', 'subject'); bind('fSec', 'section'); bind('fFrom', 'from'); bind('fTo', 'to'); bind('fLevel', 'level');
  $('#fQ').oninput = e => { rf.q = e.target.value; const p = e.target.selectionStart; reportsScreen(el); const n = $('#fQ'); n.focus(); n.setSelectionRange(p, p); };
  if ($('#fMore')) $('#fMore').onclick = () => { rf.limit += 200; reportsScreen(el); };
  if ($('#fDet')) $('#fDet').onclick = () => downloadCsv('غيابات-تفصيلي-' + today() + '.csv', [['التاريخ', 'المادة', 'النوع', 'المحاضرة', 'الطالب', 'المرحلة', 'الشعبة', 'الحالة']].concat(C.abs.slice().sort((a, b) => a.date.localeCompare(b.date)).map(a => { const t = get('students', a.studentId) || {}; return [a.date, subjectName(a.subjectId), TYPE[a.type || 'theory'], a.lectureNo || '', t.name || '', STAGE[t.stage] || '', t.section || '', STATUS[a.status] || a.status]; })));
  if ($('#fCsv')) $('#fCsv').onclick = () => downloadCsv('تقرير-الغيابات-' + today() + '.csv',
    [['الطالب', 'المرحلة', 'الشعبة', 'المحاضرات المقررة', 'غياب', 'حضر الساعة الأولى فقط', 'حضر الساعة الأخيرة فقط', 'مجاز', 'النسبة %', 'الحالة']].concat(rows.map(r => [r.st.name, STAGE[r.st.stage] || '', r.st.section || '', r.total, r.absent, r.pfirst, r.plast, r.excused, r.total ? r.pct.toFixed(1) : '', r.level ? LEVEL[r.level][1] : ''])));
  el.querySelectorAll('tr[data-st]').forEach(tr => tr.onclick = () => studentDetail(tr.dataset.st));
  el.querySelectorAll('[data-k]').forEach(k => k.onclick = () => kpiClick(k.dataset.k, C, rows, el));
  el.querySelectorAll('[data-sub]').forEach(k => k.onclick = () => { rf.subject = k.dataset.sub; rf.level = ''; reportsScreen(el); });
  if ($('#fPdf')) $('#fPdf').onclick = () => printReport(C, rows);
}

/* ---------- الأرقام القابلة للنقر ---------- */
function listModal(title, head, body) {
  showModal(title, `<div class="tblwrap"><table><thead><tr>${head.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${body.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') || '<tr><td colspan="' + head.length + '" class="empty">لا توجد بيانات</td></tr>'}</tbody></table></div><div class="row end"><button class="btn ghost" data-close>إغلاق</button></div>`, true);
}
const sessRow = x => [x.date, esc(subjectName(x.subjectId)), TYPE[x.type || 'theory'], x.lectureNo || '', esc(x.section || '')];
const absRow = a => { const t = get('students', a.studentId) || {}; return [a.date, esc(t.name || ''), esc(subjectName(a.subjectId)), `<span class="badge ${BADGE[a.status]}">${STATUS[a.status] || a.status}</span>`]; };
function kpiClick(k, C, rows, el) {
  const t = today();
  const mine = new Set(mySubjects().map(s => s.id));
  if (k === 'hSess') return listModal('محاضرات اليوم', ['التاريخ', 'المادة', 'النوع', 'المحاضرة', 'الشعبة'], live('sessions').filter(x => x.date === t && mine.has(x.subjectId)).map(sessRow));
  if (k === 'hAbs') return listModal('غيابات اليوم', ['التاريخ', 'الطالب', 'المادة', 'الحالة'], live('absences').filter(a => a.date === t && a.status === 'absent' && mine.has(a.subjectId)).map(absRow));
  if (k === 'hStu') return go('students');
  if (k === 'hSub') return go('subjects');
  if (k === 'rSess') return listModal('المحاضرات المسجلة', ['التاريخ', 'المادة', 'النوع', 'المحاضرة', 'الشعبة'], C.sessions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300).map(sessRow));
  if (k === 'rAbs') return listModal('سجل الغيابات (الأحدث أولاً)', ['التاريخ', 'الطالب', 'المادة', 'الحالة'], C.abs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300).map(absRow));
  if (k === 'rPct') { const n = $('.tblwrap table'); if (n) n.scrollIntoView({ behavior: 'smooth' }); return; }
  if (k === 'rWarn') { rf.level = 'any'; rf.limit = 100; return reportsScreen(el); }
}

/* ---------- التقرير الرسومي (PDF عبر الطباعة) ---------- */
function printHtml(title, body) {
  const old = document.getElementById('printFrame'); if (old) old.remove();
  const f = document.createElement('iframe'); f.id = 'printFrame'; f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(f);
  const d = f.contentWindow.document;
  d.open(); d.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hd{display:flex;align-items:center;gap:12px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;margin-bottom:10px}.hd img{height:56px}.hd h1{font-size:16px;margin:0}.hd p{margin:2px 0;color:#475569}
  h2{font-size:14px;margin:14px 0 6px;color:#1e3a8a}.kp{display:flex;gap:8px;margin:8px 0}.kp div{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px;text-align:center}.kp b{display:block;font-size:20px}
  table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:right}th{background:#e2e8f0}tr{break-inside:avoid}
  .ch{break-inside:avoid}.row2{display:flex;gap:12px}.row2>div{flex:1}.ft{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:6px;color:#64748b;font-size:10px;text-align:center}
  .lg{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;margin-top:4px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-left:4px}
  </style></head><body>${body}</body></html>`); d.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('تعذّرت الطباعة', true); } };
  setTimeout(go, 400);
}
const SVGF = 'font-family="Tahoma,Arial,sans-serif"';
function svgBars(items, o) { // أعمدة أفقية: items=[{label,value(%),text}]
  const S = settings(), W = 520, rowH = 24, left = 150, max = Math.max(30, S.banPct * 1.5, ...items.map(i => i.value)), h = items.length * rowH + 22;
  const x = v => left + (W - left - 40) * v / max;
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" style="direction:ltr;max-width:620px;display:block;margin:auto" ${SVGF}>${items.map((i, k) => { const y = 14 + k * rowH, col = i.value >= S.banPct ? '#dc2626' : i.value >= S.warnPct ? '#d97706' : '#2563eb';
    return `<text x="${left - 6}" y="${y + 12}" text-anchor="end" font-size="10.5" fill="#0f172a">${esc(i.label.length > 24 ? i.label.slice(0, 23) + '…' : i.label)}</text><rect x="${left}" y="${y}" width="${Math.max(1, x(i.value) - left)}" height="15" rx="3" fill="${col}"/><text x="${x(i.value) + 4}" y="${y + 12}" font-size="10.5" fill="#0f172a">${i.value.toFixed(1)}%</text>`; }).join('')}
   <line x1="${x(S.warnPct)}" x2="${x(S.warnPct)}" y1="6" y2="${h - 8}" stroke="#d97706" stroke-dasharray="4 3"/><text x="${x(S.warnPct)}" y="${h - 1}" font-size="9" text-anchor="middle" fill="#92400e" style="unicode-bidi:plaintext">إنذار ${S.warnPct}%</text>
   <line x1="${x(S.banPct)}" x2="${x(S.banPct)}" y1="6" y2="${h - 8}" stroke="#dc2626" stroke-dasharray="4 3"/><text x="${x(S.banPct)}" y="${h - 1}" font-size="9" text-anchor="middle" fill="#991b1b" style="unicode-bidi:plaintext">حرمان ${S.banPct}%</text></svg>`;
}
function svgCols(items, color) { // أعمدة رأسية: items=[{label,value}]
  const W = 520, H = 170, pl = 28, pb = 28, max = Math.max(1, ...items.map(i => i.value)), bw = Math.min(48, (W - pl) / Math.max(1, items.length) - 10);
  const step = (W - pl) / Math.max(1, items.length);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="direction:ltr;max-width:620px;display:block;margin:auto" ${SVGF}><line x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="#94a3b8"/>${items.map((i, k) => { const bh = (H - pb - 20) * i.value / max, x = pl + step * k + (step - bw) / 2;
    return `<rect x="${x}" y="${H - pb - bh}" width="${bw}" height="${bh}" rx="3" fill="${color}"/><text x="${x + bw / 2}" y="${H - pb - bh - 4}" font-size="10.5" text-anchor="middle">${+i.value.toFixed(1)}</text><text x="${x + bw / 2}" y="${H - 10}" font-size="10" text-anchor="middle">${esc(i.label)}</text>`; }).join('')}</svg>`;
}
function svgDonut(items) {
  const tot = items.reduce((n, i) => n + i.value, 0); if (!tot) return '<p>لا توجد غيابات مسجلة</p>';
  const R = 60, r = 36, cx = 80, cy = 75; let a0 = -Math.PI / 2, paths = '';
  items.filter(i => i.value).forEach(i => { const a1 = a0 + i.value / tot * Math.PI * 2 - (items.filter(z => z.value).length > 1 ? 0.02 : 0), big = a1 - a0 > Math.PI ? 1 : 0, P = (R_, a) => [cx + R_ * Math.cos(a), cy + R_ * Math.sin(a)];
    const [x1, y1] = P(R, a0), [x2, y2] = P(R, a1), [x3, y3] = P(r, a1), [x4, y4] = P(r, a0);
    paths += i.value === tot ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${i.color}" stroke-width="${R - r}"/>` : `<path d="M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${big} 0 ${x4} ${y4}Z" fill="${i.color}"/>`; a0 += i.value / tot * Math.PI * 2; });
  return `<svg viewBox="0 0 420 150" width="100%" style="direction:ltr;max-width:620px;display:block;margin:auto" ${SVGF}>${paths}<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="16" font-weight="bold">${tot}</text>
   ${items.map((i, k) => `<rect x="170" y="${20 + k * 24}" width="11" height="11" rx="2" fill="${i.color}"/><text x="186" y="${30 + k * 24}" font-size="11" style="unicode-bidi:plaintext">${esc(i.label)}: ${i.value} (${(i.value / tot * 100).toFixed(0)}%)</text>`).join('')}</svg>`;
}
function printReport(C, rows) {
  const S = settings(), u = me();
  const subs = C.bySub.map(b => ({ label: b.sb.name, value: b.total ? b.absent / b.total * 100 : 0 })).sort((a, b) => b.value - a.value);
  const stg = {}; C.rows.forEach(r => { const g = stg[r.st.stage] = stg[r.st.stage] || { w: 0, t: 0 }; g.w += r.weighted; g.t += r.total; });
  const stages = Object.keys(stg).sort().map(k => ({ label: 'المرحلة ' + (STAGE[k] || k), value: stg[k].t ? stg[k].w / stg[k].t * 100 : 0 }));
  const cnt = st => C.abs.filter(a => a.status === st).length;
  const donut = [{ label: STATUS.absent, value: cnt('absent'), color: '#2563eb' }, { label: STATUS.excused, value: cnt('excused'), color: '#0f766e' }, { label: STATUS.pfirst, value: cnt('pfirst'), color: '#7c3aed' }, { label: STATUS.plast, value: cnt('plast'), color: '#c026d3' }];
  const mon = {}; C.abs.filter(a => a.status === 'absent').forEach(a => { const m = a.date.slice(0, 7); mon[m] = (mon[m] || 0) + 1; });
  const months = Object.keys(mon).sort().map(m => ({ label: m, value: mon[m] }));
  const totAbs = C.rows.reduce((n, r) => n + r.weighted, 0), totPos = C.rows.reduce((n, r) => n + r.total, 0);
  const bad = C.rows.filter(r => r.level === 'warn' || r.level === 'ban').sort((a, b) => b.pct - a.pct);
  const filt = [rf.dept && deptName(rf.dept), rf.stage && 'المرحلة ' + STAGE[rf.stage], rf.subject && subjectName(rf.subject), rf.section && 'شعبة ' + rf.section, rf.type && TYPE[rf.type], rf.from && 'من ' + rf.from, rf.to && 'إلى ' + rf.to].filter(Boolean).join(' · ') || 'كل البيانات';
  const dept = rf.dept ? deptName(rf.dept) : (u.role === 'admin' ? '' : deptName(u.deptId));
  printHtml('تقرير الغياب', `<div class="hd"><img src="${esc(brand().logo || new URL('logo.png', location.href).href)}" onerror="this.remove()"><div><h1>${esc(brand().university || '')} — ${esc(brand().college || '')}</h1><p>تقرير الغياب الرسومي ${dept ? '— ' + esc(dept) : ''}</p><p>${esc(filt)} · تاريخ الإصدار ${today()}</p></div></div>
  <div class="kp"><div><b>${C.sessions.length}</b>محاضرات مسجلة</div><div><b>${+totAbs.toFixed(1)}</b>إجمالي الغيابات (موزون)</div><div><b>${totPos ? (totAbs / totPos * 100).toFixed(1) : 0}%</b>نسبة الغياب العامة</div><div><b>${bad.length}</b>إنذار/حرمان</div></div>
  <div class="ch"><h2>نسبة الغياب حسب المادة</h2>${subs.length ? svgBars(subs) : '<p>لا بيانات</p>'}</div>
  <div class="row2"><div class="ch"><h2>نسبة الغياب حسب المرحلة (%)</h2>${stages.length ? svgCols(stages, '#2563eb') : '<p>لا بيانات</p>'}</div><div class="ch"><h2>توزيع الحالات المسجلة</h2>${svgDonut(donut)}</div></div>
  <div class="ch"><h2>عدد الغيابات شهرياً</h2>${months.length ? svgCols(months, '#2563eb') : '<p>لا بيانات</p>'}</div>
  <h2>الطلبة المنذَرون والمحرومون (${bad.length})</h2><table><thead><tr><th>#</th><th>الطالب</th><th>المرحلة</th><th>الشعبة</th><th>المقررة</th><th>غياب</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>${bad.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.st.name)}</td><td>${STAGE[r.st.stage] || ''}</td><td>${esc(r.st.section || '')}</td><td>${r.total}</td><td>${+r.weighted.toFixed(1)}</td><td>${r.pct.toFixed(1)}%</td><td style="color:${r.level === 'ban' ? '#dc2626' : '#b45309'};font-weight:bold">${LEVEL[r.level][1]}</td></tr>`).join('') || '<tr><td colspan="8">لا يوجد</td></tr>'}</tbody></table>
  <p class="muted">الإنذار عند ${S.warnPct}% والحرمان عند ${S.banPct}% — حضور ساعة واحدة يُحتسب بوزن ${S.partialWeight}.</p>
  <div class="ft">${esc(CFG.AUTHOR || '')} · ${esc(CFG.AUTHOR_PHONE || '')}</div>`);
}
function studentDetail(id) {
  const st = get('students', id);
  const list = live('absences').filter(a => a.studentId === id && (!rf.subject || a.subjectId === rf.subject)).sort((a, b) => b.date.localeCompare(a.date));
  showModal('غيابات: ' + st.name, `<div class="tblwrap"><table><thead><tr><th>التاريخ</th><th>المادة</th><th>الحالة</th></tr></thead><tbody>${list.map(a => `<tr><td>${a.date}</td><td>${esc(subjectName(a.subjectId))}</td><td><span class="badge ${BADGE[a.status]}">${STATUS[a.status]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا توجد غيابات</td></tr>'}</tbody></table></div><div class="row end"><button class="btn ghost" data-close>إغلاق</button></div>`);
}
function downloadCsv(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- شاشات الإدارة العامة ---------- */
const deptOpts = () => live('departments').filter(d => isAdmin() || myDepts().includes(d.id)).sort(byName).map(d => [d.id, d.name]);
const personOpts = (kind, deptId) => live('teachers').filter(t => (!deptId || t.deptId === deptId) && (!kind || (kind === 'lab' ? ['lab', 'tech'].includes(t.kind) : (t.kind || 'teacher') === kind))).sort(byName).map(t => [t.id, deptId ? t.name : t.name + ' — ' + deptName(t.deptId)]);
const personOptsAll = deptId => live('teachers').filter(t => !deptId || t.deptId === deptId).sort(byName).map(t => [t.id, t.name + ' (' + KIND[t.kind || 'teacher'] + ') — ' + deptName(t.deptId)]);
const multiDept = () => isAdmin() || myDepts().length > 1;
const deptField = () => multiDept() ? [{ key: 'deptId', label: 'القسم / الفرع', type: 'select', options: deptOpts(), required: true, blank: false, def: isAdmin() ? '' : me().deptId }] : [];
const myDeptFilter = r => isAdmin() || myDepts().includes(r.deptId);

const STAFF_IMP = { title: 'الكادر', impHelp: 'الأعمدة بالترتيب: <b>الاسم، النوع (تدريسي / مسؤول مختبر / فني / رئيس قسم / مقرر قسم)، الهاتف، الأقسام (يفصل بينها فاصلة عربية «،»)، اسم المستخدم، كلمة المرور</b> (الحسابات يضيفها مدير النظام فقط).', needDept: false };
const MANAGE = {
  students: {
    title: 'طالب', table: 'students', stageFilter: true,
    cols: [['الاسم', r => esc(r.name)], ['الرقم الجامعي', r => esc(r.studentNo || '')], ['البطاقة', r => r.cardNo ? '📇' : ''], ['المرحلة', r => STAGE[r.stage] || ''], ['الشعبة', r => esc(r.section || '')], ['القسم', r => esc(deptName(r.deptId))]],
    fields: () => [{ key: 'name', label: 'اسم الطالب', required: true }, { key: 'studentNo', label: 'الرقم الجامعي (اختياري)' }, { key: 'cardNo', label: 'رقم البطاقة (اختياري — اضغط داخل الحقل ومرّر البطاقة على القارئ)' }, { key: 'stage', label: 'المرحلة', type: 'select', options: optStages(), required: true, blank: false }, { key: 'section', label: 'الشعبة (A, B …)' }, ...deptField()],
    clean: v => { v.stage = Number(v.stage); return v; }, perm: 'manageStudents',
    expHead: ['الاسم', 'المرحلة', 'الشعبة', 'الرقم الجامعي', 'رقم البطاقة'], expRow: r => [r.name, STAGE[r.stage] || '', r.section || '', r.studentNo || '', r.cardNo || ''],
    impHelp: 'الأعمدة بالترتيب: <b>الاسم، المرحلة (1-4 أو الأولى…)، الشعبة، الرقم الجامعي، رقم البطاقة (اختياري)</b>.', needDept: true
  },
  teachers: {
    title: 'تدريسي / مسؤول مختبر', table: 'teachers',
    cols: [['الاسم', r => esc(r.name)], ['النوع', r => KIND[r.kind || 'teacher']], ['الهاتف', r => esc(r.phone || '')], ['القسم', r => esc(deptName(r.deptId))]],
    fields: () => [{ key: 'name', label: 'الاسم', required: true }, { key: 'kind', label: 'النوع', type: 'select', blank: false, required: true, def: 'teacher', options: Object.entries(KIND) }, { key: 'phone', label: 'الهاتف' }, ...deptField()],
    perm: 'manageTeachers', expHead: ['الاسم', 'النوع', 'الهاتف'], expRow: r => [r.name, KIND[r.kind || 'teacher'], r.phone || ''],
    impHelp: 'الأعمدة بالترتيب: <b>الاسم، النوع (تدريسي / مسؤول مختبر)، الهاتف</b>.', needDept: true
  },
  subjects: {
    title: 'مادة', table: 'subjects', stageFilter: true,
    cols: [['المادة', r => esc(r.name)], ['المرحلة', r => STAGE[r.stage] || ''], ['الشعبة', r => esc(r.section || 'الكل')], ['نظري', r => planOf(r, 'theory')], ['عملي', r => planOf(r, 'lab')],
      ['التدريسي (والبديل)', r => esc(teacherName(r.teacherId)) + (r.teacherAltId ? ' <span class="muted">/ بديل: ' + esc(teacherName(r.teacherAltId)) + '</span>' : '')],
      ['مسؤول المختبر (والبديل)', r => r.labId ? esc(teacherName(r.labId)) + (r.labAltId ? ' <span class="muted">/ بديل: ' + esc(teacherName(r.labAltId)) + '</span>' : '') : ''], ['القسم', r => esc(deptName(r.deptId))]],
    fields: rec => { const d = rec && rec.deptId || (multiDept() ? '' : me().deptId); return [
      { key: 'name', label: 'اسم المادة', required: true }, { key: 'stage', label: 'المرحلة', type: 'select', options: optStages(), required: true, blank: false }, { key: 'section', label: 'الشعبة (اتركها فارغة لكل الشعب)' },
      { key: 'semester', label: 'الفصل', type: 'select', options: [['الأول', 'الأول'], ['الثاني', 'الثاني']] },
      { key: 'theoryCount', label: 'عدد المحاضرات النظرية', type: 'number', def: 15, required: true },
      { key: 'labCount', label: 'عدد المحاضرات العملية (المختبر) — 0 إن لم يوجد', type: 'number', def: 0, required: true },
      { key: 'teacherId', label: 'تدريسي المحاضرات النظرية', type: 'select', options: personOpts('teacher', d) },
      { key: 'teacherAltId', label: 'التدريسي البديل (اختياري)', type: 'select', options: personOpts('teacher', d) },
      { key: 'labId', label: 'مسؤول المختبر', type: 'select', options: personOpts('lab', d) },
      { key: 'labAltId', label: 'مسؤول المختبر البديل (اختياري)', type: 'select', options: personOpts('lab', d) }, ...deptField()]; },
    perm: 'manageSubjects', needDept: true,
    expHead: ['المادة', 'المرحلة', 'الشعبة', 'نظري', 'عملي', 'تدريسي', 'بديل التدريسي', 'مسؤول المختبر', 'بديل مسؤول المختبر'],
    expRow: r => [r.name, STAGE[r.stage] || '', r.section || '', planOf(r, 'theory'), planOf(r, 'lab'), r.teacherId ? teacherName(r.teacherId) : '', r.teacherAltId ? teacherName(r.teacherAltId) : '', r.labId ? teacherName(r.labId) : '', r.labAltId ? teacherName(r.labAltId) : ''],
    impHelp: 'الأعمدة بالترتيب: <b>المادة، المرحلة، الشعبة، عدد النظري، عدد العملي، التدريسي، بديله، مسؤول المختبر، بديله</b> (الأسماء كما هي مسجّلة في صفحة التدريسيين).',
    clean: v => { v.stage = Number(v.stage); v.theoryCount = Number(v.theoryCount) || 0; v.labCount = Number(v.labCount) || 0; return v; },
    validate: o => {
      if (o.theoryCount + o.labCount <= 0) throw new Error('أدخل عدد المحاضرات النظرية أو العملية');
      ['teacherId', 'teacherAltId', 'labId', 'labAltId'].forEach(k => { const t = o[k] && get('teachers', o[k]); if (t && t.deptId !== o.deptId) throw new Error('الشخص المختار ليس من نفس قسم المادة'); });
      if (o.teacherId && o.teacherId === o.teacherAltId) throw new Error('البديل يجب أن يختلف عن الأساسي');
      if (o.labId && o.labId === o.labAltId) throw new Error('البديل يجب أن يختلف عن الأساسي');
    }
  },
  leaves: {
    title: 'إجازة', table: 'leaves',
    cols: [['الطالب', r => esc(r.name || '')], ['المرحلة', r => STAGE[r.stage] || ''], ['من', r => esc(r.from)], ['إلى', r => esc(r.to)], ['السبب', r => esc(r.reason || '')], ['القسم', r => esc(deptName(r.deptId))]],
    fields: () => [], perm: 'manageLeaves',
    expHead: ['الطالب', 'المرحلة', 'الشعبة', 'من', 'إلى', 'السبب'], expRow: r => [r.name, STAGE[r.stage] || '', r.section || '', r.from, r.to, r.reason || ''], impHelp: ''
  },
  branches: {
    title: 'فرع', table: 'departments', noDept: true, rowFilter: r => r.parentId === me().deptId,
    cols: [['الفرع', r => esc(r.name)], ['يتبع', r => esc(deptName(r.parentId) !== '—' ? deptName(r.parentId) : deptName(me().deptId))]], fields: () => [{ key: 'name', label: 'اسم الفرع', required: true }], validate: o => { if (dupDept(o)) throw new Error('يوجد فرع بنفس الاسم'); },
    clean: v => { v.parentId = me().deptId; return v; }, perm: 'manageBranches', expHead: ['الفرع'], expRow: r => [r.name], impHelp: ''
  },
  departments: {
    title: 'قسم', table: 'departments', noDept: true,
    cols: [['القسم', r => esc(r.name)], ['يتبع (إن كان فرعاً)', r => r.parentId ? esc(deptName(r.parentId)) : '']],
    fields: rec => [{ key: 'name', label: 'اسم القسم أو الفرع', required: true }, { key: 'parentId', label: 'يتبع القسم (اتركه فارغاً لقسم رئيسي، أو اختر القسم لجعله فرعاً له)', type: 'select', options: live('departments').filter(d => !d.parentId && (!rec || d.id !== rec.id)).sort(byName).map(d => [d.id, d.name]) }],
    validate: o => { if (dupDept(o)) throw new Error('يوجد قسم/فرع بنفس الاسم'); },
    perm: 'admin', expHead: ['القسم', 'يتبع'], expRow: r => [r.name, r.parentId ? deptName(r.parentId) : ''], impHelp: 'عمود واحد: <b>اسم القسم</b>.'
  },
  users: {
    title: 'مستخدم', table: 'users',
    cols: [['الاسم', r => esc(r.name)], ['اسم المستخدم', r => esc(r.username)], ['الدور', r => ROLE[r.role] || ''], ['التدريسي المرتبط', r => esc((r.teacherIds && r.teacherIds.length ? r.teacherIds : (r.teacherId ? [r.teacherId] : [])).map(id => teacherName(id) + ' (' + deptName((get('teachers', id) || {}).deptId) + ')').join('، '))], ['القسم', r => esc(deptName(r.deptId))], ['الحالة', r => r.active === false ? '<span class="badge bad">معطّل</span>' : '<span class="badge ok">فعّال</span>']],
    fields: (rec) => [{ key: 'name', label: 'الاسم', required: true }, { key: 'username', label: 'اسم المستخدم (إنجليزي بلا مسافات)', required: true },
      { key: 'password', label: rec ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور التي تُسلَّم للمستخدم (6 رموز فأكثر)', type: 'password', required: !rec },
      { key: 'role', label: 'الدور', type: 'select', required: true, blank: false, options: ['teacher', 'rapporteur', 'head', 'admin'].map(r => [r, ROLE[r]]) },
      { key: 'teacherIds', label: 'ربط بسجلات التدريسي / مسؤول المختبر (للدور الأخير فقط). لتدريسي في أكثر من قسم اختر سجله في كل قسم (Ctrl للاختيار المتعدد)', type: 'multi', options: personOptsAll('') },
      { key: 'active', label: 'الحساب فعّال', type: 'checkbox', def: true }, ...deptField()],
    clean: v => { v.username = v.username.toLowerCase(); if (!v.password) delete v.password; v.teacherIds = v.role === 'teacher' ? (v.teacherIds || []) : []; v.teacherId = v.teacherIds[0] || ''; if (v.role === 'teacher' && v.teacherId) { const t0 = get('teachers', v.teacherId); if (t0) v.deptId = t0.deptId; } if (v.role === 'admin') v.deptId = ''; return v; },
    lockSelf: true, perm: 'admin', needDept: true,
    expHead: ['الاسم', 'اسم المستخدم', 'كلمة المرور', 'الدور', 'التدريسي المرتبط'], expRow: r => [r.name, r.username, '', ROLE[r.role] || r.role, r.teacherId ? teacherName(r.teacherId) : ''],
    impHelp: 'الأعمدة بالترتيب: <b>الاسم، اسم المستخدم، كلمة المرور (6 رموز فأكثر)، الدور (تدريسي / مسؤول مختبر → «تدريسي / مسؤول مختبر»، رئيس القسم، مقرر القسم، مدير النظام)، اسم التدريسي أو مسؤول المختبر المرتبط</b>.'
  }
};
const mview = {};
function manageScreen(kind) {
  return el => {
    const C = MANAGE[kind]; const V = mview[kind] = mview[kind] || { q: '', stage: '', dept: '', limit: 100 };
    let rows = live(C.table).filter(r => C.rowFilter ? C.rowFilter(r) : (C.noDept ? true : (myDeptFilter(r) || (kind === 'users' && r.id === me().id))));
    if (multiDept() && V.dept && !C.noDept) rows = rows.filter(r => r.deptId === V.dept);
    if (V.stage) rows = rows.filter(r => String(r.stage) === V.stage);
    if (V.q) rows = rows.filter(r => (r.name + ' ' + (r.studentNo || '') + ' ' + (r.username || '')).includes(V.q));
    if (kind === 'leaves') rows.sort((a, b) => b.from.localeCompare(a.from)); else rows.sort(byName);
    el.innerHTML = `<div class="filters"><input type="search" id="mq" placeholder="بحث…" value="${esc(V.q)}">
      ${C.stageFilter ? `<select id="ms"><option value="">كل المراحل</option>${optStages().map(o => `<option value="${o[0]}"${o[0] === V.stage ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>` : ''}
      ${multiDept() && !C.noDept ? `<select id="md"><option value="">كل الأقسام</option>${deptOpts().map(o => `<option value="${o[0]}"${o[0] === V.dept ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : ''}
      <button class="btn" id="madd">+ إضافة ${C.title}</button>${can('importData') && C.impHelp ? '<button class="btn ghost" id="mimp">استيراد CSV</button>' : ''}${can('exportData') ? '<button class="btn ghost" id="mexp">تصدير CSV</button>' : ''}</div>
     <div class="card" style="padding:0"><div class="muted" style="padding:8px 12px">العدد: ${rows.length}</div><div class="tblwrap"><table><thead><tr>${C.cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>
     ${rows.slice(0, V.limit).map(r => `<tr>${C.cols.map(c => `<td>${c[1](r)}</td>`).join('')}<td><button class="btn ghost sm" data-e="${r.id}">تعديل</button> ${C.lockSelf && r.id === me().id ? '' : `<button class="btn danger sm" data-d="${r.id}">حذف</button>`}</td></tr>`).join('') || `<tr><td colspan="${C.cols.length + 1}" class="empty">لا توجد سجلات</td></tr>`}</tbody></table></div>
     ${rows.length > V.limit ? '<div class="row end" style="padding:10px"><button class="btn ghost" id="mmore">عرض المزيد</button></div>' : ''}</div>`;
    $('#mq').oninput = e => { V.q = e.target.value; const p = e.target.selectionStart; manageScreen(kind)(el); const n = $('#mq'); n.focus(); n.setSelectionRange(p, p); };
    if ($('#ms')) $('#ms').onchange = e => { V.stage = e.target.value; manageScreen(kind)(el); };
    if ($('#md')) $('#md').onchange = e => { V.dept = e.target.value; manageScreen(kind)(el); };
    if ($('#mmore')) $('#mmore').onclick = () => { V.limit += 200; manageScreen(kind)(el); };
    $('#madd').onclick = () => editRec(kind, null, el);
    if ($('#mimp')) $('#mimp').onclick = () => importModal(kind, () => manageScreen(kind)(el));
    if ($('#mexp')) $('#mexp').onclick = () => downloadCsv(C.title + '-' + today() + '.csv', [C.expHead].concat(rows.map(C.expRow)));
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editRec(kind, get(C.table, b.dataset.e), el));
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
      if (!confirm('تأكيد الحذف؟ (تبقى الغيابات المسجلة سابقاً في السجل)')) return;
      const old = get(C.table, b.dataset.d); await removeRec(C.table, old); if (kind === 'leaves') await applyLeaveLocal(Object.assign({}, old, { deleted: true })); manageScreen(kind)(el);
    });
  };
}

/* ---------- الإجازات: بحث باسم الطالب + تحويل الغياب إلى مجاز ---------- */
async function applyLeaveLocal(lv) {
  const out = [];
  live('absences').forEach(a => {
    const inside = !lv.deleted && a.studentId === lv.studentId && a.date >= lv.from && a.date <= lv.to;
    if (a.byLeave === lv.id && !inside) { const b = Object.assign({}, a, { status: a.prevStatus || 'absent' }); delete b.byLeave; delete b.prevStatus; out.push(b); }
    else if (!a.byLeave && inside && a.status === 'absent') out.push(Object.assign({}, a, { prevStatus: 'absent', status: 'excused', byLeave: lv.id }));
  });
  if (out.length) await saveRecs('absences', out);
  return out.length;
}
function leaveForm(rec, el) {
  let sel = rec ? get('students', rec.studentId) : null;
  const pool = () => live('students').filter(myDeptFilter);
  const card = () => sel ? `<div class="chosen"><b>${esc(sel.name)}</b> — المرحلة ${STAGE[sel.stage] || ''}${sel.section ? ' — شعبة ' + esc(sel.section) : ''}${sel.studentNo ? ' — رقم ' + esc(sel.studentNo) : ''} — ${esc(deptName(sel.deptId))}</div>` : '<div class="muted">ابحث عن الطالب واختره (تُملأ بياناته تلقائياً)</div>';
  showModal(rec ? 'تعديل إجازة' : 'إضافة إجازة', `<form id="mform"><label class="f">بحث باسم الطالب أو رقمه<input id="lvQ" autocomplete="off" placeholder="اكتب جزءاً من الاسم"></label>
   <div id="lvRes" class="lvres"></div><div id="lvSel">${card()}</div>
   <label class="f">من تاريخ<input type="date" name="from" required value="${rec ? rec.from : today()}"></label>
   <label class="f">إلى تاريخ<input type="date" name="to" required value="${rec ? rec.to : today()}"></label>
   <label class="f">السبب (اختياري، لا يظهر للتدريسي)<input name="reason" value="${esc(rec ? rec.reason || '' : '')}"></label>
   <p class="muted">عند الحفظ يتحول غياب الطالب ضمن هذه الفترة إلى «مجاز» تلقائياً، حتى لو سُجّل الغياب قبل الإجازة.</p>
   <div class="row end"><button type="button" class="btn ghost" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const paint = () => {
    const q = $('#lvQ').value.trim(); const box = $('#lvRes');
    if (!q) { box.innerHTML = ''; return; }
    const m = pool().filter(x => (x.name + ' ' + (x.studentNo || '')).includes(q)).sort(byName).slice(0, 8);
    box.innerHTML = m.map(x => `<div class="lvopt" data-s="${x.id}">${esc(x.name)} <span class="muted">${STAGE[x.stage] || ''}${x.section ? ' / ' + esc(x.section) : ''} — ${esc(deptName(x.deptId))}</span></div>`).join('') || '<div class="muted">لا نتائج</div>';
  };
  $('#lvQ').oninput = paint;
  $('#lvRes').onclick = e => { const o = e.target.closest('[data-s]'); if (!o) return; sel = get('students', o.dataset.s); $('#lvSel').innerHTML = card(); $('#lvRes').innerHTML = ''; $('#lvQ').value = ''; };
  $('#mform').onsubmit = async e => {
    e.preventDefault();
    try {
      if (!sel) throw new Error('اختر الطالب أولاً');
      const f = e.target; const from = f.from.value, to = f.to.value;
      if (!from || !to) throw new Error('حدد التاريخين'); if (to < from) throw new Error('تاريخ النهاية قبل البداية');
      const out = Object.assign(rec ? Object.assign({}, rec) : { id: uid('l'), deleted: false }, { scope: 'student', studentId: sel.id, name: sel.name, stage: sel.stage, section: sel.section || '', deptId: sel.deptId, from, to, reason: f.reason.value.trim() });
      await saveRec('leaves', out);
      const n = await applyLeaveLocal(out);
      closeModal(); toast('تم الحفظ' + (n ? ' — تحويل ' + n + ' غياب إلى مجاز' : '')); manageScreen('leaves')(el);
    } catch (err) { toast(err.message, true); }
  };
}
function editRec(kind, rec, el) {
  if (kind === 'leaves') return leaveForm(rec, el);
  const C = MANAGE[kind];
  openForm({
    title: (rec ? 'تعديل ' : 'إضافة ') + C.title, fields: C.fields(rec), values: rec ? Object.assign({}, rec, kind === 'leaves' ? { who: rec.scope === 'student' ? rec.name : '' } : (kind === 'users' ? { teacherIds: rec.teacherIds && rec.teacherIds.length ? rec.teacherIds : (rec.teacherId ? [rec.teacherId] : []) } : {})) : { active: true },
    onSave: async v => {
      if (C.clean) v = C.clean(v);
      const base = rec ? Object.assign({}, rec) : { id: uid(kind[0]), deleted: false };
      const out = Object.assign(base, v);
      if (!C.noDept && !isAdmin() && !myDepts().includes(out.deptId)) out.deptId = me().deptId;
      if (!C.noDept && !out.deptId) throw new Error('اختر القسم');
      if (kind === 'users' && out.role === 'teacher' && !(out.teacherIds || []).length) throw new Error('اربط المستخدم بسجل التدريسي / مسؤول المختبر');
      if (C.prepare) C.prepare(out, rec);
      if (C.validate) C.validate(out);
      await saveRec(C.table, out); toast('تم الحفظ'); manageScreen(kind)(el);
    }
  });
}

/* ---------- الاستيراد (CSV) ---------- */
function parseStage(s) {
  s = String(s || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  if (/^[1-4]$/.test(s)) return Number(s);
  if (/اول|أول|first/i.test(s)) return 1; if (/ثان|second/i.test(s)) return 2; if (/ثالث|third/i.test(s)) return 3; if (/راب|fourth/i.test(s)) return 4;
  return 0;
}
function parseCsv(text) {
  const first = text.split('\n')[0];
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/* ---------- قراءة ملفات Excel (.xlsx) مباشرة وتحويلها إلى CSV ---------- */
async function xlsxToCsv(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), td = new TextDecoder();
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ملف Excel غير صالح');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const ent = {};
  for (let i = 0; i < n; i++) {
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    ent[td.decode(buf.subarray(p + 46, p + 46 + nl))] = { m: dv.getUint16(p + 10, true), cs: dv.getUint32(p + 20, true), lh: dv.getUint32(p + 42, true) };
    p += 46 + nl + el + cl;
  }
  const read = async name => {
    const z = ent[name]; if (!z) return null;
    const st = z.lh + 30 + dv.getUint16(z.lh + 26, true) + dv.getUint16(z.lh + 28, true), raw = buf.subarray(st, st + z.cs);
    if (z.m === 0) return td.decode(raw);
    if (typeof DecompressionStream === 'undefined') throw new Error('المتصفح لا يدعم قراءة Excel، احفظ الملف كـ CSV');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(raw); w.close();
    return td.decode(await new Response(ds.readable).arrayBuffer());
  };
  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  const wb = xml(await read('xl/workbook.xml')), rels = xml(await read('xl/_rels/workbook.xml.rels'));
  const sh = wb.getElementsByTagName('sheet')[0]; if (!sh) throw new Error('الملف لا يحوي أوراقاً');
  const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let target = ''; Array.from(rels.getElementsByTagName('Relationship')).forEach(r => { if (r.getAttribute('Id') === rid) target = r.getAttribute('Target'); });
  target = target.replace(/^\//, ''); const path = target.startsWith('xl/') ? target : 'xl/' + target;
  const ss = []; const sst = await read('xl/sharedStrings.xml');
  if (sst) Array.from(xml(sst).getElementsByTagName('si')).forEach(si => ss.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')));
  const sheet = xml(await read(path)), rows = [];
  Array.from(sheet.getElementsByTagName('row')).forEach(r => {
    const out = [];
    Array.from(r.getElementsByTagName('c')).forEach(c => {
      const ref = c.getAttribute('r') || '', col = ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
      let val = '';
      if (t === 's' && v) val = ss[Number(v.textContent)] || ''; else if (t === 'inlineStr' && is) val = Array.from(is.getElementsByTagName('t')).map(x => x.textContent).join(''); else if (v) val = v.textContent;
      out[col >= 0 ? col : out.length] = val;
    });
    rows.push(Array.from(out, x => x == null ? '' : x));
  });
  const q = v => /[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
  return rows.filter(r => r.some(x => String(x).trim() !== '')).map(r => r.map(q).join(',')).join('\n');
}
function readFileText(f) {
  if (/\.xlsx$/i.test(f.name)) return xlsxToCsv(f);
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      if (String(r.result).includes('�')) { const r2 = new FileReader(); r2.onload = () => res(r2.result); r2.readAsText(f, 'windows-1256'); } else res(r.result);
    };
    r.readAsText(f, 'utf-8');
  });
}
const parseKind = s => /مختبر|lab/i.test(String(s)) ? 'lab' : 'teacher';
const parseRole = s => { s = String(s || '').trim(); if (['admin', 'head', 'rapporteur', 'teacher'].includes(s)) return s; if (/مدير/.test(s)) return 'admin'; if (/رئيس/.test(s)) return 'head'; if (/مقرر/.test(s)) return 'rapporteur'; return 'teacher'; };
const personId = (name, deptId) => { const n = String(name || '').trim(); if (!n) return ''; const t = live('teachers').find(x => (!deptId || x.deptId === deptId) && x.name === n); return t ? t.id : ''; };

const IMPORTERS = {
  students: async (rows, deptId) => {
    if (rows.length && !parseStage(rows[0][1])) rows = rows.slice(1);
    const exist = new Set(live('students').filter(s => s.deptId === deptId).map(s => (s.studentNo || s.name) + '|' + s.stage));
    const recs = []; let skipped = 0;
    rows.forEach(r => {
      const name = (r[0] || '').trim(), stage = parseStage(r[1]);
      if (!name || !stage) { skipped++; return; }
      const no = (r[3] || '').trim(); const key = (no || name) + '|' + stage;
      const card = (r[4] || '').trim();
      if (exist.has(key)) {
        const old = live('students').find(s => s.deptId === deptId && (s.studentNo || s.name) + '|' + s.stage === key);
        if (card && old && !old.cardNo) { recs.push(Object.assign({}, old, { cardNo: card })); return; }
        skipped++; return;
      } exist.add(key);
      recs.push({ id: uid('s'), name, stage, section: (r[2] || '').trim(), studentNo: no, cardNo: card, deptId, deleted: false });
    });
    if (recs.length) await saveRecs('students', recs);
    return { count: recs.length, skipped };
  },
  staff: async (rows, deptId) => {
    if (rows.length && /الاسم|name/i.test(rows[0][0])) rows = rows.slice(1);
    const kindOf = t => { t = String(t || ''); if (/مدير/.test(t)) return 'admin'; if (/رئيس/.test(t)) return 'head'; if (/مقرر/.test(t)) return 'rapporteur'; if (/فني/.test(t)) return 'tech'; if (/مختبر|lab/i.test(t)) return 'lab'; return 'teacher'; };
    let count = 0, skipped = 0; const why = [];
    for (const r of rows) {
      const name = (r[0] || '').trim(); if (!name) { skipped++; continue; }
      const names = String(r[3] || '').split(/[،,;؛]/).map(x => x.trim()).filter(Boolean);
      const dl = deptOpts(); const depts = names.map(n => (dl.find(o => normName(o[1]) === normName(n)) || [])[0]).filter(Boolean);
      const unk = names.filter(n => !dl.some(o => normName(o[1]) === normName(n))); if (unk.length) { skipped++; why.push(name + ': القسم غير موجود (' + unk.join('، ') + ')'); continue; }
      const dd = depts.length ? depts : (deptId ? [deptId] : []);
      const kind = kindOf(r[1]);
      if (live('teachers').some(t => t.name === name && dd.some(d => d === t.deptId))) { skipped++; why.push(name + ': موجود مسبقاً في القسم'); continue; }
      try { await saveStaff({ name, kind, phone: String(r[2] || '').trim().replace(/^(7\d{9})$/, '0$1'), depts: dd, teaches: false, username: isAdmin() ? r[4] : '', password: isAdmin() ? r[5] : '', active: true }, null); count++; } catch (e) { skipped++; why.push(name + ': ' + e.message); }
    }
    return { count, skipped, why };
  },
  teachers: async (rows, deptId) => {
    if (rows.length && /الاسم|name/i.test(rows[0][0])) rows = rows.slice(1);
    const exist = new Set(live('teachers').filter(t => t.deptId === deptId).map(t => t.name));
    const recs = []; let skipped = 0;
    rows.forEach(r => {
      const name = (r[0] || '').trim(); if (!name || exist.has(name)) { skipped++; return; } exist.add(name);
      recs.push({ id: uid('t'), name, kind: parseKind(r[1]), phone: (r[2] || '').trim(), deptId, deleted: false });
    });
    if (recs.length) await saveRecs('teachers', recs);
    return { count: recs.length, skipped };
  },
  subjects: async (rows, deptId) => {
    if (rows.length && !parseStage(rows[0][1])) rows = rows.slice(1);
    const exist = new Set(live('subjects').filter(x => x.deptId === deptId).map(x => x.name + '|' + x.stage + '|' + (x.section || '')));
    const recs = []; let skipped = 0;
    rows.forEach(r => {
      const name = (r[0] || '').trim(), stage = parseStage(r[1]); const sec = (r[2] || '').trim();
      if (!name || !stage || exist.has(name + '|' + stage + '|' + sec)) { skipped++; return; } exist.add(name + '|' + stage + '|' + sec);
      const th = String(r[3] || '').trim() === '' ? 15 : Number(r[3]) || 0, lab = Number(r[4]) || 0;
      if (th + lab <= 0) { skipped++; return; }
      recs.push({ id: uid('m'), name, stage, section: sec, theoryCount: th, labCount: lab, teacherId: personId(r[5], deptId), teacherAltId: personId(r[6], deptId), labId: personId(r[7], deptId), labAltId: personId(r[8], deptId), deptId, deleted: false });
    });
    if (recs.length) await saveRecs('subjects', recs);
    return { count: recs.length, skipped };
  },
  departments: async rows => {
    if (rows.length && /القسم|name/i.test(rows[0][0])) rows = rows.slice(1);
    const exist = new Set(live('departments').filter(d => !d.parentId).map(d => normName(d.name))); const recs = []; let skipped = 0;
    rows.forEach(r => { const n = (r[0] || '').trim(); if (!n || exist.has(normName(n))) { skipped++; return; } exist.add(normName(n)); recs.push({ id: uid('d'), name: n, deleted: false }); });
    if (recs.length) await saveRecs('departments', recs);
    return { count: recs.length, skipped };
  },
  users: async (rows, deptId) => {
    if (rows.length && /اسم المستخدم|username/i.test(rows[1] ? rows[0][1] : rows[0][1] || '')) rows = rows.slice(1);
    const exist = new Set(live('users').map(u => u.username)); const recs = []; let skipped = 0;
    rows.forEach(r => {
      const name = (r[0] || '').trim(), username = (r[1] || '').trim().toLowerCase(), pw = (r[2] || '').trim(), role = parseRole(r[3]);
      if (!name || !username || pw.length < 6 || exist.has(username)) { skipped++; return; }
      let tid = '', dep = deptId;
      if (role === 'teacher') { const t = live('teachers').find(x => x.name === (r[4] || '').trim()); if (!t) { skipped++; return; } tid = t.id; dep = t.deptId; }
      if (role === 'admin') dep = '';
      exist.add(username);
      recs.push({ id: uid('u'), name, username, password: pw, role, teacherId: tid, deptId: dep, active: true, deleted: false });
    });
    if (recs.length) await saveRecs('users', recs);
    return { count: recs.length, skipped };
  }
};
function importModal(kind, after) {
  const C = kind === 'staff' ? STAFF_IMP : MANAGE[kind];
  showModal('استيراد ' + C.title + ' من ملف CSV', `<p class="muted">${C.impHelp} السطر الأول يمكن أن يكون عناوين. يمكن رفع ملف Excel (xlsx) أو CSV مباشرة.</p>
   ${C.needDept && multiDept() ? `<label class="f">القسم / الفرع<select id="idept">${deptOpts().map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></label>` : ''}
   <input type="file" id="ifile" accept=".csv,.txt,.xlsx"><label class="f">أو الصق البيانات هنا<textarea id="itxt" rows="6" dir="auto"></textarea></label>
   <div class="row end"><button class="btn ghost" data-close>إلغاء</button><button class="btn" id="igo">استيراد</button></div>`);
  $('#ifile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { $('#itxt').value = await readFileText(f); } catch (err) { toast(err.message, true); } };
  $('#igo').onclick = async () => {
    const deptId = multiDept() ? ($('#idept') ? $('#idept').value : '') : me().deptId;
    if (C.needDept && !deptId) return toast('اختر القسم', true);
    const rows = parseCsv($('#itxt').value.replace(/^﻿/, ''));
    if (!rows.length) return toast('لا توجد بيانات للاستيراد', true);
    try {
      const r = await IMPORTERS[kind](rows, deptId);
      const wh = r.why && r.why.length ? ' — ' + r.why.slice(0, 3).join(' | ') + (r.why.length > 3 ? ' …' : '') : '';
      if (!r.count) return toast('لا توجد سجلات صالحة (تخطي ' + r.skipped + ')' + wh, true);
      closeModal(); toast('تم استيراد ' + r.count + (r.skipped ? ' (تخطي ' + r.skipped + ')' + wh : '')); after && after();
    } catch (e) { toast(e.message, true); }
  };
}


/* ---------- هوية التطبيق (الاسم/الشعار/الثيم) ---------- */
const THEMES = [['#0f766e', 'أخضر مزرق'], ['#1d4ed8', 'أزرق'], ['#7c3aed', 'بنفسجي'], ['#b45309', 'برتقالي'], ['#be123c', 'أحمر'], ['#334155', 'رمادي']];
function brand() {
  let c = null; try { c = JSON.parse(localStorage.getItem('abs-brand') || 'null'); } catch (e) {}
  const b = get('settings', 'brand') || c || {};
  return { appName: b.appName || 'تسجيل حضور الطلبة', university: b.university != null && b.university !== '' ? b.university : (CFG.UNIVERSITY || ''), college: b.college != null && b.college !== '' ? b.college : (CFG.COLLEGE || ''), logo: b.logo || '', color: b.color || '#0f766e' };
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join(''); }
function applyBrand() {
  const b = brand(), r = document.documentElement.style;
  r.setProperty('--p', b.color); r.setProperty('--pd', shade(b.color, .78));
  document.title = b.appName;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = b.color;
  const own = get('settings', 'brand'); if (own) { try { localStorage.setItem('abs-brand', JSON.stringify(own)); } catch (e) {} }
}
/** تصغير الشعار المرفوع إلى حجم صغير يناسب التخزين (أقل من ~40 ألف حرف) */
function shrinkLogo(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const px of [192, 144, 112, 80]) {
        const k = Math.min(1, px / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/png'); if (d.length < 40000) return res(d);
        const j = c.toDataURL('image/jpeg', .85); if (j.length < 40000) return res(j);
      }
      rej(new Error('الصورة معقّدة جداً، اختر شعاراً أبسط'));
    };
    img.onerror = () => rej(new Error('تعذّر قراءة الصورة'));
    img.src = url;
  });
}
function brandCard() {
  const b = brand();
  return `<div class="card"><h2>هوية التطبيق (الشعار والثيم)</h2><p class="muted">يمكن استخدام التطبيق لكلية أو جامعة أخرى. التغيير يظهر لكل المستخدمين بعد مزامنتهم.</p>
   <form id="brForm"><label class="f">اسم التطبيق<input name="appName" value="${esc(b.appName)}"></label>
   <label class="f">اسم الجامعة<input name="university" value="${esc(b.university)}"></label><label class="f">اسم الكلية<input name="college" value="${esc(b.college)}"></label>
   <div class="f"><span>الشعار</span><div class="row"><img id="brLogo" src="${esc(b.logo || 'logo.png')}" class="logo" style="width:64px;height:64px;margin:0" alt=""><input type="file" id="brFile" accept="image/*"><button type="button" class="btn ghost sm" id="brNoLogo">شعار افتراضي</button></div></div>
   <div class="f"><span>لون الثيم</span><div class="row">${THEMES.map(t => `<button type="button" class="swatch${t[0] === b.color ? ' on' : ''}" data-c="${t[0]}" style="background:${t[0]}" title="${t[1]}"></button>`).join('')}<input type="color" id="brColor" value="${esc(b.color)}" title="لون مخصص"></div></div>
   <div class="row"><button class="btn">حفظ الهوية</button><button type="button" class="btn ghost" id="brReset">استرجاع الافتراضي</button></div></form>
   <p class="muted">ملاحظة: أيقونة التطبيق المثبّتة على الشاشة الرئيسية لا تتغير إلا بتغيير ملفات الأيقونات في مجلد app على GitHub.</p></div>`;
}
function bindBrand() {
  let logo = brand().logo, color = brand().color;
  const setC = c => { color = c; $('#brColor').value = c; document.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x.dataset.c === c)); };
  document.querySelectorAll('.swatch').forEach(x => x.onclick = () => setC(x.dataset.c));
  $('#brColor').oninput = e => setC(e.target.value);
  $('#brFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { logo = await shrinkLogo(f); $('#brLogo').src = logo; } catch (err) { toast(err.message, true); } };
  $('#brNoLogo').onclick = () => { logo = ''; $('#brLogo').src = 'logo.png'; };
  $('#brForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    await saveRec('settings', Object.assign({ id: 'brand', deleted: false }, get('settings', 'brand'), { appName: f.appName.value.trim(), university: f.university.value.trim(), college: f.college.value.trim(), logo, color }));
    applyBrand(); toast('تم حفظ الهوية'); render();
  };
  $('#brReset').onclick = async () => { if (!confirm('استرجاع الاسم والشعار والثيم الافتراضية؟')) return; await saveRec('settings', { id: 'brand', deleted: false }); try { localStorage.removeItem('abs-brand'); } catch (e) {} applyBrand(); toast('تم الاسترجاع'); render(); };
}
/** تصفير البرنامج كاملاً (مدير النظام) مع إعادة إدخال كلمة المرور */
function resetAllModal() {
  openForm({ title: 'تصفير البرنامج كاملاً', fields: [{ key: 'pw', label: 'أعد إدخال كلمة مرور مدير النظام للتأكيد', type: 'password', required: true }],
    onOpen: () => { const f = $('#mform'); f.insertAdjacentHTML('afterbegin', '<p style="color:#b91c1c;font-weight:bold">تحذير: سيُحذف كل شيء نهائياً (الأقسام، الكادر، الطلبة، المواد، المحاضرات، الغيابات، الإجازات، السجل وحسابات المستخدمين) على الخادم وكل الأجهزة. تبقى حسابات مدير النظام وهوية التطبيق. لا يمكن التراجع. صدّر نسخة احتياطية أولاً.</p>'); },
    onSave: async v => {
      if (!confirm('تأكيد أخير: حذف كل البيانات نهائياً؟')) return false;
      if (!navigator.onLine) throw new Error('يلزم اتصال بالإنترنت');
      const r = await api('resetAll', { password: v.pw }); if (!r.ok) throw new Error(r.error || 'فشل التصفير');
      await wipeLocal(); state.epoch = r.epoch; await metaSet('epoch', r.epoch);
      toast('تم تصفير البرنامج'); await syncNow(true); go('home');
    } });
}

/* ---------- الإعدادات ---------- */
function settingsScreen(el) {
  const S = settings();
  el.innerHTML = `<div class="card"><h2>الحساب</h2><p>${esc(me().name)} — ${ROLE[me().role]} — <span dir="ltr">${esc(me().username)}</span></p>
   <div class="row"><button class="btn ghost" id="sPw">تغيير كلمة المرور</button><button class="btn ghost" id="sRe">إعادة تسجيل الدخول (تبقى بياناتك)</button><button class="btn danger" id="sOut">تسجيل الخروج</button></div>
   <p class="muted">كلمات مرور التدريسيين ومسؤولي المختبرات يحددها ويغيّرها مدير النظام من صفحة «المستخدمون وكلمات المرور».</p></div>
  <div class="card"><h2>المزامنة</h2><p class="muted">الحالة: ${esc(paintText())}${state.lastSync ? ' — آخر مزامنة ' + new Date(state.lastSync).toLocaleTimeString('ar-IQ') : ''}</p>
   <div class="row"><button class="btn" id="sNow">مزامنة الآن</button><button class="btn ghost" id="sFull">إعادة تنزيل كل البيانات</button></div></div>
  ${can('exportData') || isAdmin() ? `<div class="card"><h2>نسخة احتياطية</h2><div class="row">${can('exportData') ? '<button class="btn ghost" id="bkExp">تصدير نسخة احتياطية (JSON)</button>' : ''}${isAdmin() ? '<button class="btn ghost" id="bkImp">استعادة من نسخة احتياطية</button><input type="file" id="bkFile" accept=".json" style="display:none">' : ''}</div>
   <p class="muted">النسخة تشمل كل ما تراه من أقسام وتدريسيين وطلبة ومواد ومحاضرات وغيابات (بدون كلمات المرور).</p></div>` : ''}
  ${isAdmin() ? `<div class="card"><h2>حدود الإنذار والحرمان</h2><form id="sForm"><div class="row"><label class="f grow">نسبة الإنذار %<input name="warnPct" type="number" min="1" max="100" value="${S.warnPct}"></label><label class="f grow">نسبة الحرمان %<input name="banPct" type="number" min="1" max="100" value="${S.banPct}"></label><label class="f grow">وزن «حضر الساعة الأولى/الأخيرة فقط» (0.5 = نصف غياب)<input name="pw" type="number" min="0" max="1" step="0.1" value="${S.partialWeight}"></label></div>
   <button class="btn">حفظ</button></form><p class="muted">القيم الافتراضية للتجربة؛ عدّلها حسب تعليمات الكلية.</p></div>` : ''}
  ${isAdmin() ? brandCard() : ''}
  ${isAdmin() ? '<div class="card"><h2>تصفير البرنامج</h2><p class="muted">يحذف كل البيانات ويعيد البرنامج فارغاً. يطلب كلمة مرور مدير النظام مرة أخرى.</p><button class="btn d" id="sReset" style="background:#dc2626">تصفير البرنامج كاملاً</button></div>' : ''}
  <div class="card"><h2>حول التطبيق</h2><p>${esc(brand().university || '')} — ${esc(brand().college || '')}<br>نظام متابعة غيابات الطلبة (يعمل بدون إنترنت)<br>تصميم وتطوير: <b>${esc(CFG.AUTHOR || '')}</b><br><span dir="ltr">${esc(CFG.AUTHOR_EMAIL || '')}</span><br>${waLink()}<br>الإصدار ${esc(APP_BUILD)}</p>${CFG.VERSION !== APP_BUILD ? '<p style="color:#dc2626;font-weight:bold">⚠ ملف config.js قديم أو ناقص (رقمه ' + esc(CFG.VERSION || '؟') + '). أعد رفع كل ملفات مجلد app إلى GitHub.</p>' : ''}</div>`;
  if (isAdmin()) { bindBrand(); $('#sReset').onclick = resetAllModal; }
  $('#sNow').onclick = () => syncNow(true);
  $('#sFull').onclick = async () => { state.since = 0; await metaSet('since', 0); await syncNow(true); toast('تمت إعادة التنزيل'); };
  $('#sRe').onclick = () => { $('#app').innerHTML = ''; renderLogin(); };
  $('#sOut').onclick = async () => {
    if (state.pending && !confirm('يوجد ' + state.pending + ' تعديل لم يُرفع بعد وسيُفقد عند الخروج. متابعة؟')) return;
    await logout();
  };
  $('#sPw').onclick = () => openForm({ title: 'تغيير كلمة المرور', fields: [{ key: 'o', label: 'كلمة المرور الحالية', type: 'password', required: true }, { key: 'n', label: 'كلمة المرور الجديدة', type: 'password', required: true }],
    onSave: async v => { const r = await api('changePassword', { oldPassword: v.o, newPassword: v.n }); if (!r.ok) throw new Error(r.error); toast('تم تغيير كلمة المرور'); } });
  if ($('#bkExp')) $('#bkExp').onclick = () => {
    const data = { app: 'absence', v: 1, date: new Date().toISOString(), tables: {} };
    TABLES.filter(t => t !== 'users').forEach(t => data.tables[t] = live(t));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'نسخة-احتياطية-' + today() + '.json'; a.click();
  };
  if ($('#bkImp')) { $('#bkImp').onclick = () => $('#bkFile').click(); $('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text()); if (d.app !== 'absence') throw new Error('ملف غير صالح');
      if (!confirm('سيتم دمج بيانات النسخة مع البيانات الحالية. متابعة؟')) return;
      let n = 0;
      for (const t of TABLES.filter(t => t !== 'users')) { const recs = (d.tables[t] || []); for (let i = 0; i < recs.length; i += 500) { await saveRecs(t, recs.slice(i, i + 500)); } n += recs.length; }
      toast('تمت الاستعادة: ' + n + ' سجل');
    } catch (err) { toast(err.message, true); }
  }; }
  if ($('#sForm')) $('#sForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const w = Number(f.warnPct.value), b = Number(f.banPct.value), pw = Number(f.pw.value);
    if (!(w > 0 && b >= w)) return toast('الحرمان يجب أن يساوي الإنذار أو يزيد عنه', true);
    await saveRec('settings', Object.assign({ id: 'main', deleted: false }, get('settings', 'main'), { warnPct: w, banPct: b, partialWeight: pw >= 0 && pw <= 1 ? pw : 0.5 })); toast('تم الحفظ');
  };
}
const paintText = () => ({ ok: 'متزامن', pending: state.pending + ' بانتظار الرفع', syncing: 'جارٍ المزامنة', offline: 'بدون اتصال', error: state.error || 'خطأ', idle: 'جاهز' }[state.status] || '');

/* ---------- صفحة تحديد الصلاحيات ---------- */
function permsScreen(el) {
  const eff = (role, a) => { const p = (settings().perms || {})[role]; return p && Object.prototype.hasOwnProperty.call(p, a) ? !!p[a] : !!DEFAULT_PERMS[role][a]; };
  el.innerHTML = `<div class="card"><h2>تحديد صلاحيات الأدوار</h2>
   <p class="muted">حدّد ما يستطيع كل دور فعله. مدير النظام يملك كل الصلاحيات دائماً، وإدارة المستخدمين وكلمات المرور والأقسام وهذه الصفحة له وحده. الأدوار: رئيس القسم، مقرر القسم، التدريسي / مسؤول المختبر. حدود الصلاحيات تُفرض في الخادم على التعديل (إدارة وتسجيل وتعديل)، أما العرض والتصدير فيُطبَّقان في واجهة التطبيق.</p>
   <div class="tblwrap"><table class="ptable"><thead><tr><th>الصلاحية</th>${PERM_ROLES.map(r => `<th>${ROLE[r]}</th>`).join('')}</tr></thead><tbody>
   ${ACTIONS.map(([a, l]) => `<tr><td>${l}</td>${PERM_ROLES.map(r => `<td><input type="checkbox" data-r="${r}" data-a="${a}"${eff(r, a) ? ' checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
   <div class="row end"><button class="btn ghost" id="pDef">استرجاع الافتراضي</button><button class="btn" id="pSave">حفظ الصلاحيات</button></div></div>`;
  $('#pSave').onclick = async () => {
    const perms = {}; PERM_ROLES.forEach(r => perms[r] = {});
    el.querySelectorAll('input[data-r]').forEach(i => { perms[i.dataset.r][i.dataset.a] = i.checked; });
    await saveRec('settings', Object.assign({ id: 'main', deleted: false }, get('settings', 'main'), { perms })); toast('تم حفظ الصلاحيات');
  };
  $('#pDef').onclick = async () => {
    if (!confirm('استرجاع الصلاحيات الافتراضية؟')) return;
    await saveRec('settings', Object.assign({ id: 'main', deleted: false }, get('settings', 'main'), { perms: {} })); toast('تم الاسترجاع'); permsScreen(el);
  };
}

/* ---------- سجل التعديلات ---------- */
const AUDIT_ACT = { record: 'تسجيل محاضرة', edit: 'تعديل حضور', delete: 'حذف محاضرة', 'user-add': 'إضافة مستخدم', 'user-edit': 'تعديل مستخدم', 'user-delete': 'حذف مستخدم', settings: 'تعديل الإعدادات/الصلاحيات', 'leave-add': 'إضافة إجازة', 'leave-edit': 'تعديل إجازة', 'leave-delete': 'حذف إجازة' };
let af = { act: '', q: '', limit: 100 };
function auditScreen(el) {
  const all = live('audit').sort((a, b) => b.at - a.at);
  const rows = all.filter(r => (!af.act || r.action === af.act) && (!af.q || [r.userName, r.subjectName, r.detail].join(' ').includes(af.q)));
  const fmt = t => new Date(t).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });
  const what = r => r.sessionId ? `${esc(r.subjectName || '')} — ${TYPE[r.type || 'theory']} — محاضرة ${r.lectureNo || ''}${r.date ? ' (' + esc(r.date) + ')' : ''}` : '';
  el.innerHTML = `<div class="card"><h2>سجل التعديلات</h2><p class="muted">يُسجَّل تلقائياً في الخادم من فعل ماذا ومتى، ولا يمكن تعديله من التطبيق. يظهر هنا بعد المزامنة.</p>
   <div class="filters"><select id="afA"><option value="">كل العمليات</option>${Object.entries(AUDIT_ACT).map(([k, l]) => `<option value="${k}"${k === af.act ? ' selected' : ''}>${l}</option>`).join('')}</select>
   <input type="search" id="afQ" placeholder="بحث بالاسم أو المادة أو الطالب…" value="${esc(af.q)}">${can('exportData') ? '<button class="btn ghost" id="afX">تصدير CSV</button>' : ''}</div></div>
  <div class="card" style="padding:0">${rows.length ? rows.slice(0, af.limit).map(r => `<div class="logrow"><div class="lg-h"><b>${esc(AUDIT_ACT[r.action] || r.action)}</b> · ${esc(r.userName || '')} <span class="muted">(${ROLE[r.role] || ''})</span><span class="grow"></span><span class="muted">${fmt(r.at)}</span></div>${what(r) ? `<div>${what(r)}</div>` : ''}${r.detail ? `<div class="muted" style="white-space:pre-line">${esc(r.detail)}</div>` : ''}</div>`).join('') + (rows.length > af.limit ? '<div class="row end" style="padding:10px"><button class="btn ghost" id="afM">عرض المزيد</button></div>' : '') : '<div class="empty">لا توجد سجلات بعد.</div>'}</div>`;
  $('#afA').onchange = e => { af.act = e.target.value; af.limit = 100; auditScreen(el); };
  $('#afQ').oninput = e => { af.q = e.target.value; const p = e.target.selectionStart; af.limit = 100; auditScreen(el); const n = $('#afQ'); n.focus(); n.setSelectionRange(p, p); };
  if ($('#afM')) $('#afM').onclick = () => { af.limit += 100; auditScreen(el); };
  if ($('#afX')) $('#afX').onclick = () => downloadCsv('سجل-التعديلات-' + today() + '.csv', [['الوقت', 'المستخدم', 'الدور', 'العملية', 'المادة', 'النوع', 'المحاضرة', 'التفاصيل']].concat(rows.map(r => [fmt(r.at), r.userName, ROLE[r.role] || '', AUDIT_ACT[r.action] || r.action, r.subjectName || '', r.sessionId ? TYPE[r.type || 'theory'] : '', r.lectureNo || '', (r.detail || '').replace(/\n/g, ' ; ')])));
}

/* ---------- الكادر والحسابات (شاشة موحّدة) ---------- */
const usedInSubjects = id => live('subjects').some(x => [x.teacherId, x.teacherAltId, x.labId, x.labAltId].includes(id));
const userTeacherIds = u => [...(u.teacherIds || []), u.teacherId].filter(Boolean);
function staffRows() {
  const groups = new Map();
  live('teachers').filter(myDeptFilter).forEach(t => { const k = t.personId || t.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const users = isAdmin() ? live('users') : [];
  const rows = []; const linked = new Set();
  groups.forEach((recs, key) => {
    const ids = recs.map(r => r.id);
    const user = users.find(u => userTeacherIds(u).some(x => ids.includes(x)));
    if (user) linked.add(user.id);
    const f = recs[0];
    rows.push({ key, name: f.name, kind: user && ['head', 'rapporteur'].includes(user.role) ? user.role : (f.kind || 'teacher'), phone: f.phone || '', depts: [...new Set(recs.map(r => r.deptId))], recs, user });
  });
  users.filter(u => !linked.has(u.id)).forEach(u => rows.push({ key: 'u:' + u.id, name: u.name, kind: u.role === 'teacher' ? 'teacher' : u.role, phone: '', depts: u.deptId ? [u.deptId] : [], recs: [], user: u }));
  return rows;
}
async function saveStaff(v, row) {
  const admin = isAdmin(), kind = v.kind, name = (v.name || '').trim(), phone = (v.phone || '').trim();
  const isHead = kind === 'head' || kind === 'rapporteur', isAdm = kind === 'admin';
  const depts = isAdm ? [] : (v.depts || []);
  if (!name) throw new Error('اكتب الاسم');
  if (!admin && !['teacher', 'lab', 'tech'].includes(kind)) throw new Error('هذا النوع يضيفه مدير النظام فقط');
  if (!isAdm && !depts.length) throw new Error('اختر قسماً واحداً على الأقل');
  if (isHead && depts.length !== 1) throw new Error('رئيس القسم والمقرر يتبعان قسماً واحداً');
  if (!admin && depts.some(d => !myDepts().includes(d))) throw new Error('قسم غير مسموح');
  const personId = row && !String(row.key).startsWith('u:') ? row.key : uid('p');
  const needsRecs = !isAdm && (!isHead || !!v.teaches);
  const existing = row ? row.recs : [];
  const recsOut = needsRecs ? depts.map(d => Object.assign({}, existing.find(r => r.deptId === d) || { id: uid('t') }, { name, kind: isHead ? 'teacher' : kind, phone, deptId: d, personId, deleted: false })) : [];
  const dropped = existing.filter(r => !recsOut.some(o => o.id === r.id));
  dropped.forEach(r => { if (usedInSubjects(r.id)) throw new Error('لا يمكن إزالة ' + deptName(r.deptId) + ' لأن له مواد مخصّصة، أزل تخصيصها من صفحة المواد أولاً'); });
  let user = null;
  if (admin) {
    const uname = (v.username || '').trim().toLowerCase();
    if (uname || (row && row.user)) {
      if (!uname) throw new Error('اسم المستخدم مطلوب لهذا الحساب');
      if (!/^\S{3,40}$/.test(uname)) throw new Error('اسم المستخدم 3 رموز فأكثر بلا مسافات');
      if (!(row && row.user) && !v.password) throw new Error('اكتب كلمة المرور للحساب الجديد');
      if (v.password && String(v.password).length < 6) throw new Error('كلمة المرور 6 رموز فأكثر');
      const me0 = row && row.user;
      if (live('users').some(u => u.username === uname && (!me0 || u.id !== me0.id))) throw new Error('اسم المستخدم مستخدم مسبقاً');
      const role = isAdm ? 'admin' : (isHead ? kind : 'teacher');
      if (me0 && me0.id === me().id && (role !== 'admin' || v.active === false)) throw new Error('لا يمكنك تغيير دور حسابك أو تعطيله');
      const keepDept = me0 && depts.includes(me0.deptId) ? me0.deptId : depts[0];
      user = Object.assign({}, me0 || { id: uid('u'), deleted: false }, { name, username: uname, role, active: v.active !== false, deptId: isAdm ? '' : keepDept, teacherIds: recsOut.map(r => r.id), teacherId: recsOut.length ? recsOut[0].id : '' });
      if (v.password) user.password = v.password; else delete user.password;
    }
  }
  if (recsOut.length) await saveRecs('teachers', recsOut);
  if (dropped.length) await saveRecs('teachers', dropped.map(r => Object.assign({}, r, { deleted: true })));
  if (user) await saveRecs('users', [user]);
}
const sview = { q: '', kind: '', dept: '', limit: 100 };
function staffScreen(el) {
  const admin = isAdmin();
  let rows = staffRows();
  if (sview.kind) rows = rows.filter(r => r.kind === sview.kind);
  if (multiDept() && sview.dept) rows = rows.filter(r => r.depts.includes(sview.dept));
  if (sview.q) rows = rows.filter(r => (r.name + ' ' + (r.user ? r.user.username : '') + ' ' + r.phone).includes(sview.q));
  rows.sort(byName);
  const kinds = admin ? Object.entries(SKIND) : [['teacher', SKIND.teacher], ['lab', SKIND.lab], ['tech', SKIND.tech]];
  el.innerHTML = `<div class="filters"><input type="search" id="sq" placeholder="بحث بالاسم أو اسم المستخدم أو الهاتف…" value="${esc(sview.q)}">
   <select id="sk"><option value="">كل الأنواع</option>${kinds.map(([k, l]) => `<option value="${k}"${k === sview.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
   ${multiDept() ? `<select id="sd"><option value="">كل الأقسام</option>${deptOpts().map(o => `<option value="${o[0]}"${o[0] === sview.dept ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : ''}
   <button class="btn" id="sadd">+ إضافة</button>${can('importData') ? '<button class="btn ghost" id="simp">استيراد CSV</button>' : ''}${can('exportData') ? '<button class="btn ghost" id="sexp">تصدير CSV</button>' : ''}</div>
   ${admin ? '' : '<p class="muted">إنشاء حسابات الدخول وكلمات المرور من صلاحية مدير النظام.</p>'}
   <div class="card" style="padding:0"><div class="muted" style="padding:8px 12px">العدد: ${rows.length}</div><div class="tblwrap"><table><thead><tr><th>الاسم</th><th>النوع</th><th>الهاتف</th><th>الأقسام</th>${admin ? '<th>اسم المستخدم</th><th>الحساب</th>' : ''}<th></th></tr></thead><tbody>
   ${rows.slice(0, sview.limit).map(r => `<tr><td>${esc(r.name)}</td><td>${SKIND[r.kind] || ''}</td><td dir="ltr" style="text-align:right">${esc(r.phone)}</td><td>${esc(r.depts.map(deptName).join('، '))}</td>${admin ? `<td dir="ltr" style="text-align:right">${r.user ? esc(r.user.username) : '<span class="muted">—</span>'}</td><td>${r.user ? (r.user.active === false ? '<span class="badge bad">معطّل</span>' : '<span class="badge ok">فعّال</span>') : '<span class="muted">بلا حساب</span>'}</td>` : ''}
   <td><button class="btn ghost sm" data-e="${esc(r.key)}">تعديل</button> ${r.user && r.user.id === me().id ? '' : `<button class="btn danger sm" data-d="${esc(r.key)}">حذف</button>`}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">لا يوجد</td></tr>`}</tbody></table></div>
   ${rows.length > sview.limit ? '<div class="row end" style="padding:10px"><button class="btn ghost" id="smore">عرض المزيد</button></div>' : ''}</div>`;
  const all = staffRows(); const byKey = k => all.find(r => String(r.key) === k);
  $('#sq').oninput = e => { sview.q = e.target.value; const p = e.target.selectionStart; staffScreen(el); const n = $('#sq'); n.focus(); n.setSelectionRange(p, p); };
  $('#sk').onchange = e => { sview.kind = e.target.value; staffScreen(el); };
  if ($('#sd')) $('#sd').onchange = e => { sview.dept = e.target.value; staffScreen(el); };
  if ($('#smore')) $('#smore').onclick = () => { sview.limit += 200; staffScreen(el); };
  $('#sadd').onclick = () => staffForm(null, el);
  if ($('#simp')) $('#simp').onclick = () => importModal('staff', () => staffScreen(el));
  if ($('#sexp')) $('#sexp').onclick = () => downloadCsv('الكادر-' + today() + '.csv', [['الاسم', 'النوع', 'الهاتف', 'الأقسام'].concat(admin ? ['اسم المستخدم'] : [])].concat(rows.map(r => [r.name, SKIND[r.kind] || '', r.phone, r.depts.map(deptName).join('، ')].concat(admin ? [r.user ? r.user.username : ''] : []))));
  el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => staffForm(byKey(b.dataset.e), el));
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
    const r = byKey(b.dataset.d); if (!r) return;
    if (r.recs.some(x => usedInSubjects(x.id))) return toast('لا يمكن الحذف: له مواد مخصّصة، أزل تخصيصها من صفحة المواد أولاً', true);
    if (!confirm('حذف «' + r.name + '»' + (admin && r.user ? ' وحسابه' : '') + '؟')) return;
    if (r.recs.length) await saveRecs('teachers', r.recs.map(x => Object.assign({}, x, { deleted: true })));
    if (admin && r.user) await saveRecs('users', [Object.assign({}, r.user, { deleted: true })]);
    toast('تم الحذف'); staffScreen(el);
  });
}
function staffForm(row, el) {
  const admin = isAdmin();
  const kinds = admin ? Object.entries(SKIND) : [['teacher', SKIND.teacher], ['lab', SKIND.lab], ['tech', SKIND.tech]];
  const fields = [{ key: 'name', label: 'الاسم', required: true }, { key: 'kind', label: 'النوع', type: 'select', blank: false, required: true, options: kinds, def: 'teacher' }, { key: 'phone', label: 'الهاتف' },
    { key: 'depts', label: 'القسم / الأقسام (للتدريسي والمسؤول والفني يمكن اختيار أكثر من قسم، ولكل قسم سجل مستقل. ورئيس القسم والمقرر قسم واحد)', type: 'checks', options: deptOpts() },
    { key: 'teaches', label: 'يُدرّس مواد أيضاً (لرئيس القسم أو المقرر)', type: 'checkbox' }];
  if (admin) fields.push({ key: 'username', label: 'اسم المستخدم للدخول (إنجليزي بلا مسافات) — اتركه فارغاً لشخص بلا حساب' }, { key: 'password', label: row && row.user ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور التي تُسلَّم له (6 رموز فأكثر)', type: 'password' }, { key: 'active', label: 'الحساب فعّال', type: 'checkbox', def: true });
  const values = row ? { name: row.name, kind: row.kind, phone: row.phone, depts: row.depts, teaches: ['head', 'rapporteur'].includes(row.kind) && row.recs.length > 0, username: row.user ? row.user.username : '', active: row.user ? row.user.active !== false : true } : { kind: 'teacher', depts: admin ? [] : [me().deptId], active: true };
  openForm({ title: row ? 'تعديل ' + row.name : 'إضافة', fields, values,
    onOpen: () => { const k = $('#mform [name=kind]'), t = $('#mform [name=teaches]'); const upd = () => { t.closest('label').style.display = ['head', 'rapporteur'].includes(k.value) ? '' : 'none'; }; k.onchange = upd; upd(); },
    onSave: async v => { await saveStaff(v, row); toast('تم الحفظ'); staffScreen(el); } });
}

const SCREENS = {
  home: homeScreen, attend: attendScreen, reports: reportsScreen,
  students: manageScreen('students'), subjects: manageScreen('subjects'),
  staff: staffScreen, departments: manageScreen('departments'), settings: settingsScreen, permissions: permsScreen, audit: auditScreen, leaves: manageScreen('leaves'), branches: manageScreen('branches')
};

/* ---------- الإقلاع ---------- */
onChange(k => {
  if (k === 'status') return paintSync();
  if (k === 'auth') { state.error = 'انتهت الجلسة - أعد تسجيل الدخول من الإعدادات'; setStatus('error'); return toast('انتهت الجلسة. يمكنك متابعة العمل بدون إنترنت، وأعد تسجيل الدخول من «الإعدادات» لرفع بياناتك.', true); }
  if (k === 'logout') return renderLogin();
  if (k === 'remote' && state.user && !modalOpen && route !== 'attend') render();
  if (k === 'local') paintSync();
});
(async function boot() {
  await openDB(); await loadAll();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const h = location.hash.replace('#', ''); if (SCREENS[h]) route = h;
  if (state.user) { render(); if (state.token) syncNow(); }
  else renderLogin();
})();
