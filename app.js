'use strict';
const ROLE = { admin: 'مدير النظام', head: 'رئيس القسم', rapporteur: 'مقرر القسم', teacher: 'تدريسي / مسؤول مختبر' };
const TYPE = { theory: 'نظري', lab: 'عملي' };
const KIND = { teacher: 'تدريسي', lab: 'مسؤول مختبر' };
const STAGE = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
const STATUS = { present: 'حاضر', absent: 'غائب', excused: 'مجاز', late: 'متأخر', pfirst: 'حضر الساعة الأولى فقط', plast: 'حضر الساعة الأخيرة فقط' };
const BSHORT = { present: 'حاضر', absent: 'غائب', excused: 'مجاز', late: 'متأخر', pfirst: 'أول ساعة', plast: 'آخر ساعة' };
const BADGE = { absent: 'bad', excused: 'exc', late: 'warn', pfirst: 'part', plast: 'part' };
const isPartial = st => st === 'pfirst' || st === 'plast';
const CFG = window.APP_CONFIG || {};
const ACTIONS = [['manageStudents', 'إدارة الطلبة (إضافة / تعديل / حذف)'], ['manageTeachers', 'إدارة التدريسيين ومسؤولي المختبرات'], ['manageSubjects', 'إدارة المواد وتخصيصها'],
  ['recordAttendance', 'تسجيل الغياب'], ['editAttendance', 'تعديل حضور محاضرة مسجّلة سابقاً'], ['deleteAttendance', 'حذف محاضرة مسجّلة'], ['viewAudit', 'عرض سجل التعديلات'], ['manageLeaves', 'إدخال الإجازات (لطالب أو مرحلة أو قسم لفترة من تاريخ إلى تاريخ)'], ['viewReports', 'عرض التقارير ولوحة المتابعة'], ['exportData', 'تصدير البيانات'], ['importData', 'استيراد البيانات']];
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
const deptName = id => (get('departments', id) || {}).name || '—';
const teacherName = id => (get('teachers', id) || {}).name || '—';
const subjectName = id => (get('subjects', id) || {}).name || '—';
const planOf = (s, t) => Number(t === 'lab' ? (s.labCount == null ? 0 : s.labCount) : (s.theoryCount == null ? 15 : s.theoryCount)) || 0;
const staffOf = (s, t) => t === 'lab' ? [s.labId, s.labAltId] : [s.teacherId, s.teacherAltId];
function typesFor(s) {
  const u = me();
  return ['theory', 'lab'].filter(t => planOf(s, t) > 0 && (u.role !== 'teacher' || (u.teacherId && staffOf(s, t).includes(u.teacherId))));
}
const settings = () => Object.assign({ warnPct: 10, banPct: 20, partialWeight: 0.5 }, get('settings', 'main') || {});
const optStages = () => Object.entries(STAGE).map(([v, l]) => [v, l]);

let route = 'home';
let modalOpen = false;

function toast(msg, err) {
  const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3500);
}

/* ---------- النوافذ ---------- */
function showModal(title, html, wide) {
  modalOpen = true;
  $('#modalRoot').innerHTML = `<div class="ov"><div class="modal ${wide ? 'wide' : ''}"><h3>${esc(title)}</h3>${html}</div></div>`;
  $('#modalRoot').onclick = e => { if (e.target.matches('[data-close]') || e.target.classList.contains('ov')) closeModal(); };
}
function closeModal() { modalOpen = false; $('#modalRoot').innerHTML = ''; }

function fieldHtml(f, v) {
  const req = f.required ? ' required' : '';
  const val = v == null ? (f.def == null ? '' : f.def) : v;
  if (f.type === 'select')
    return `<label class="f">${f.label}<select name="${f.key}"${req}>${f.blank !== false ? '<option value="">—</option>' : ''}${f.options.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  if (f.type === 'checkbox')
    return `<label class="f chk"><input type="checkbox" name="${f.key}"${val ? ' checked' : ''}> ${f.label}</label>`;
  if (f.type === 'textarea')
    return `<label class="f">${f.label}<textarea name="${f.key}" rows="3">${esc(val)}</textarea></label>`;
  return `<label class="f">${f.label}<input name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.type === 'password' ? ' autocomplete="new-password" minlength="6"' : ''}${f.type === 'number' ? ' min="0"' : ''}></label>`;
}
function openForm({ title, fields, values, onSave }) {
  showModal(title, `<form id="mform">${fields.map(f => fieldHtml(f, (values || {})[f.key])).join('')}
   <div class="row end"><button type="button" class="btn ghost" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  $('#mform').onsubmit = async e => {
    e.preventDefault();
    const v = {};
    fields.forEach(f => {
      const el = $('#mform [name="' + f.key + '"]');
      v[f.key] = f.type === 'checkbox' ? el.checked : (f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim());
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
  if (can('manageTeachers')) n.push(['teachers', 'التدريسيون ومسؤولو المختبرات']);
  if (can('manageSubjects')) n.push(['subjects', 'المواد الدراسية']);
  if (can('manageLeaves')) n.push(['leaves', 'الإجازات']);
  if (can('viewAudit')) n.push(['audit', 'سجل التعديلات']);
  if (isAdmin()) n.push(['users', 'المستخدمون وكلمات المرور'], ['departments', 'الأقسام'], ['permissions', 'تحديد الصلاحيات']);
  n.push(['settings', 'الإعدادات والحساب']);
  return n;
}
const waLink = () => CFG.AUTHOR_PHONE ? `<a href="https://wa.me/${'964' + String(CFG.AUTHOR_PHONE).replace(/^0/, '')}" target="_blank" rel="noopener" dir="ltr">${esc(CFG.AUTHOR_PHONE)} (واتساب)</a>` : '';
const footer = () => `<div class="foot">${esc(CFG.UNIVERSITY || '')} — ${esc(CFG.COLLEGE || '')}<br>تصميم وتطوير: ${esc(CFG.AUTHOR || '')} · <span dir="ltr">${esc(CFG.AUTHOR_EMAIL || '')}</span> · ${waLink()} · الإصدار ${esc(CFG.VERSION || '')}</div>`;
const logoImg = () => '<img src="logo.png" class="logo" alt="" onerror="this.remove()">';
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
   <aside class="side" id="side"><div class="brand">${logoImg()}<div class="brand-u">${esc(CFG.UNIVERSITY || '')}</div><div class="brand-c">${esc(CFG.COLLEGE || '')}</div><small>${esc(me().name)} — ${ROLE[me().role]}</small></div>
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
  $('#app').innerHTML = `<div class="login"><div class="card" style="text-align:center">${logoImg().replace('class="logo"', 'class="logo" style="margin:0 auto 8px;width:80px;height:80px"')}<h2 style="margin-bottom:2px">${esc(CFG.UNIVERSITY || '')}</h2><div class="brand-c" style="color:var(--pd);font-weight:700">${esc(CFG.COLLEGE || '')}</div>
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
  return live('subjects').filter(s => (u.role === 'admin' || (u.role === 'teacher' ? true : s.deptId === u.deptId)) && typesFor(s).length).sort(byName);
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
    const alt = isStaff && staffOf(s, ty)[1] === me().teacherId && staffOf(s, ty)[0] !== me().teacherId;
    return `<div class="mycard" data-att="${s.id}|${ty}"><div class="mc-name">${esc(s.name)}</div>
     <div class="mc-sub"><span class="badge ${ty === 'lab' ? 'exc' : 'ok'}">${TYPE[ty]}</span>${alt ? ' <span class="badge warn">بديل</span>' : ''} المرحلة ${STAGE[s.stage] || ''}${s.section ? ' — شعبة ' + esc(s.section) : ''}</div>
     <div class="mc-sub">سُجّلت ${recordedCount(s.id, ty)} من ${planOf(s, ty)} محاضرة</div><button class="btn">تسجيل الغياب</button></div>`;
  }).join('');
  el.innerHTML = `${isStaff ? `<h2 style="font-size:1.4rem">موادي</h2>${cards ? `<div class="grid mygrid">${cards}</div>` : '<div class="card empty">لم تُخصَّص لك مواد بعد. تواصل مع مدير النظام.</div>'}` : `<div class="grid kpis">
   <div class="kpi"><b>${ss.length}</b><span>محاضرات مسجلة اليوم</span></div>
   <div class="kpi"><b>${ab}</b><span>غيابات اليوم</span></div>
   <div class="kpi"><b>${live('students').length}</b><span>الطلبة</span></div>
   <div class="kpi"><b>${mySubjects().length}</b><span>المواد</span></div></div>
   <div class="card" style="margin-top:14px"><h2>إجراءات سريعة</h2><div class="row">
   ${can('recordAttendance') ? '<button class="btn" data-go="attend">تسجيل غياب محاضرة</button>' : ''}${can('viewReports') ? '<button class="btn ghost" data-go="reports">التقارير</button>' : ''}</div>
   ${!mySubjects().length ? '<p class="muted">لا توجد مواد بعد. أضِف المواد من قسم «المواد الدراسية».</p>' : ''}</div>`}
   ${state.pending ? `<p class="muted">يوجد ${state.pending} تعديل بانتظار الرفع إلى الخادم عند توفر الإنترنت.</p>` : ''}`;
  el.onclick = e => {
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
const leaveFor = (st, date) => live('leaves').find(l => l.deptId === st.deptId && l.from <= date && date <= l.to && (l.scope === 'dept' || (l.scope === 'stage' && String(l.stage) === String(st.stage)) || (l.scope === 'student' && l.studentId === st.id)));
function leavePrefill(s) { studentsOf(s, att.section).forEach(x => { if (leaveFor(x, att.date)) att.states[x.id] = 'excused'; }); }
function attLoad() {
  const s = get('subjects', att.subjectId); if (!s) return;
  const id = sessKey(s.id, att.type, att.no, att.section);
  const ex = get('sessions', id);
  att.states = {}; att.existing = !!ex;
  if (ex) { att.date = ex.date; live('absences').forEach(a => { if (a.sessionId === id) att.states[a.studentId] = a.status; }); }
  else leavePrefill(s);
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
  const cnt = { absent: 0, excused: 0, late: 0, part: 0 };
  list.forEach(x => { const st = att.states[x.id]; if (isPartial(st)) cnt.part++; else if (cnt[st] != null) cnt[st]++; });
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
  ${recd.size ? `<div class="card"><h3 style="margin:0 0 8px">المحاضرات المسجّلة</h3><div class="chips">${[...recd.entries()].sort((x, y) => x[0] - y[0]).map(([n, x]) => `<button class="chip${n === att.no ? ' on' : ''}" data-lec="${n}">${n === att.no ? '' : (can('editAttendance') ? '✏ ' : '👁 ')}محاضرة ${n} · ${esc(x.date || '')}</button>`).join('')}</div><p class="muted" style="margin:6px 0 0">${can('editAttendance') ? 'اضغط على محاضرة لفتحها وتعديل حضورها' + (can('deleteAttendance') ? ' أو حذفها.' : ' (الحذف غير مسموح لك).') : 'اضغط لعرض الحضور فقط — لا تملك صلاحية التعديل.'}</p></div>` : ''}
  <div class="card" style="padding:0">
   <div class="filters" style="padding:10px;margin:0"><input type="search" id="aQ" placeholder="بحث عن طالب…" value="${esc(att.q)}"><button class="btn ghost sm" id="aAll">الكل حاضر</button></div>
   ${list.length ? `<div class="bhead"><span class="n"></span><span class="nm"></span>${Object.keys(STATUS).map(k => `<span class="bc">${BSHORT[k]}</span>`).join('')}</div>` : ''}
   <div id="aList">${list.length ? list.filter(x => !q || x.name.includes(q)).map((x, i) => { const cur = att.states[x.id] || 'present'; return `<div class="stu ${att.states[x.id] || ''}" data-id="${x.id}"><span class="n">${i + 1}</span><span class="nm">${esc(x.name)}${x.section ? ' <span class="muted">(' + esc(x.section) + ')</span>' : ''}${leaveFor(x, att.date) ? ' <span class="badge exc">إجازة</span>' : ''}</span>${Object.keys(STATUS).map(k => `<span class="bc"><span class="bub b-${k}${k === cur ? ' on' : ''}" data-s="${k}" role="radio" aria-checked="${k === cur}" aria-label="${STATUS[k]}"></span></span>`).join('')}</div>`; }).join('') : '<div class="empty">لا يوجد طلبة مطابقون لهذه المادة/المرحلة/الشعبة.</div>'}</div>
   <div class="sticky-save"><span>غائب <b>${cnt.absent}</b> · جزئي <b>${cnt.part}</b> · مجاز <b>${cnt.excused}</b> · متأخر <b>${cnt.late}</b> · من ${list.length}</span><span class="grow"></span>
    ${can('exportData') ? '<button class="btn ghost sm" id="aExp">تصدير الكشف</button>' : ''}${att.existing && can('deleteAttendance') ? '<button class="btn danger sm" id="aDel">حذف المحاضرة</button>' : ''}${locked ? '' : `<button class="btn" id="aSave">${att.existing ? 'حفظ التعديل' : 'حفظ المحاضرة'}</button>`}</div></div>`;
  const rerender = () => attendScreen(el);
  $('#aSub').onchange = e => { const [id, ty] = e.target.value.split('|'); attInit(id, ty); rerender(); };
  $('#aNo').onchange = e => { att.no = Number(e.target.value) || 1; att.date = today(); attLoad(); rerender(); };
  el.querySelectorAll('[data-lec]').forEach(c => c.onclick = () => { att.no = Number(c.dataset.lec); att.date = today(); attLoad(); rerender(); window.scrollTo(0, 0); });
  $('#aDate').onchange = e => { att.date = e.target.value || today(); if (!att.existing) { att.states = {}; leavePrefill(s); rerender(); } };
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
  const dept = u.role === 'admin' ? f.dept : u.deptId;
  const subs = live('subjects').filter(s => (!dept || s.deptId === dept) && (!f.stage || String(s.stage) === f.stage) && (!f.subject || s.id === f.subject) && (u.role !== 'teacher' || s.teacherId === u.teacherId));
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
    const row = { st, total: 0, absent: 0, partial: 0, excused: 0, late: 0 };
    subs.forEach(sb => {
      if (sb.deptId !== st.deptId || String(sb.stage) !== String(st.stage) || (sb.section && sb.section !== st.section)) return;
      const planned = types.reduce((n, t) => n + planOf(sb, t), 0);
      const tot = planned || (sessBy[sb.id] || []).filter(x => !x.section || x.section === st.section).length;
      const list = absBy[st.id + '|' + sb.id] || [];
      const a = list.filter(x => x.status === 'absent').length;
      const pa = list.filter(x => isPartial(x.status)).length;
      row.total += tot; row.absent += a; row.partial += pa;
      row.excused += list.filter(x => x.status === 'excused').length;
      row.late += list.filter(x => x.status === 'late').length;
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
  const dept = u.role === 'admin' ? rf.dept : u.deptId;
  const subsAll = mySubjects().filter(s => (!dept || s.deptId === dept) && (!rf.stage || String(s.stage) === rf.stage));
  const sections = [...new Set(live('students').filter(x => (!dept || x.deptId === dept) && (!rf.stage || String(x.stage) === rf.stage)).map(x => x.section).filter(Boolean))].sort();
  const C = calc(rf);
  let rows = C.rows.filter(r => r.total > 0 || rf.level === '');
  if (rf.level) rows = rows.filter(r => r.level === rf.level);
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
   <select id="fLevel"><option value="">كل الحالات</option><option value="warn"${rf.level === 'warn' ? ' selected' : ''}>إنذار</option><option value="ban"${rf.level === 'ban' ? ' selected' : ''}>حرمان</option></select>
   <input type="search" id="fQ" placeholder="بحث باسم الطالب" value="${esc(rf.q)}"></div>
  <div class="grid kpis"><div class="kpi"><b>${C.sessions.length}</b><span>محاضرات مسجلة</span></div>
   <div class="kpi"><b>${+totAbs.toFixed(1)}</b><span>إجمالي الغيابات (الجزئي بوزنه)</span></div>
   <div class="kpi"><b>${totPos ? (totAbs / totPos * 100).toFixed(1) : 0}%</b><span>نسبة الغياب العامة</span></div>
   <div class="kpi"><b>${warnCnt}</b><span>طلبة (إنذار/حرمان)</span></div></div>
  ${C.bySub.length ? `<div class="card" style="margin-top:14px"><h2>نسبة الغياب حسب المادة</h2>${C.bySub.sort((a, b) => b.absent / (b.total || 1) - a.absent / (a.total || 1)).map(b => { const p = b.total ? b.absent / b.total * 100 : 0; const S = settings(); return `<div class="bar"><span class="lb">${esc(b.sb.name)}</span><div class="tr"><div class="fi ${p >= S.banPct ? 'b' : p >= S.warnPct ? 'w' : ''}" style="width:${Math.min(100, p * 2)}%"></div></div><b>${p.toFixed(1)}%</b></div>`; }).join('')}<p class="muted">الإنذار عند ${settings().warnPct}% والحرمان عند ${settings().banPct}% (يغيّرها مدير النظام من الإعدادات).</p></div>` : ''}
  <div class="card" style="padding:0"><div class="row" style="padding:10px"><h2 class="grow" style="margin:0">الطلبة (${rows.length})</h2>${can('exportData') ? '<button class="btn ghost sm" id="fCsv">تصدير الملخص</button><button class="btn ghost sm" id="fDet">تصدير تفصيلي</button>' : ''}</div>
   <div class="tblwrap"><table><thead><tr><th>الطالب</th><th>المرحلة</th><th>الشعبة</th><th>المقررة</th><th>غياب كامل</th><th>جزئي</th><th>مجاز</th><th>تأخر</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>
   ${rows.slice(0, rf.limit).map(r => `<tr data-st="${r.st.id}" style="cursor:pointer"><td>${esc(r.st.name)}</td><td>${STAGE[r.st.stage] || ''}</td><td>${esc(r.st.section || '')}</td><td>${r.total}</td><td>${r.absent}</td><td>${r.partial}</td><td>${r.excused}</td><td>${r.late}</td><td>${r.total ? r.pct.toFixed(1) + '%' : '—'}</td><td>${r.level ? `<span class="badge ${LEVEL[r.level][0]}">${LEVEL[r.level][1]}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">لا توجد بيانات</td></tr>'}</tbody></table></div>
   ${rows.length > rf.limit ? '<div class="row end" style="padding:10px"><button class="btn ghost" id="fMore">عرض المزيد</button></div>' : ''}</div>`;
  const bind = (id, key, ev) => { const n = $('#' + id); if (n) n[ev || 'onchange'] = e => { rf[key] = e.target.value; if (key === 'dept' || key === 'stage') rf.subject = ''; rf.limit = 100; reportsScreen(el); }; };
  bind('fDept', 'dept'); bind('fType', 'type'); bind('fStage', 'stage'); bind('fSub', 'subject'); bind('fSec', 'section'); bind('fFrom', 'from'); bind('fTo', 'to'); bind('fLevel', 'level');
  $('#fQ').oninput = e => { rf.q = e.target.value; const p = e.target.selectionStart; reportsScreen(el); const n = $('#fQ'); n.focus(); n.setSelectionRange(p, p); };
  if ($('#fMore')) $('#fMore').onclick = () => { rf.limit += 200; reportsScreen(el); };
  if ($('#fDet')) $('#fDet').onclick = () => downloadCsv('غيابات-تفصيلي-' + today() + '.csv', [['التاريخ', 'المادة', 'النوع', 'المحاضرة', 'الطالب', 'المرحلة', 'الشعبة', 'الحالة']].concat(C.abs.slice().sort((a, b) => a.date.localeCompare(b.date)).map(a => { const t = get('students', a.studentId) || {}; return [a.date, subjectName(a.subjectId), TYPE[a.type || 'theory'], a.lectureNo || '', t.name || '', STAGE[t.stage] || '', t.section || '', STATUS[a.status] || a.status]; })));
  if ($('#fCsv')) $('#fCsv').onclick = () => downloadCsv('تقرير-الغيابات-' + today() + '.csv',
    [['الطالب', 'المرحلة', 'الشعبة', 'المحاضرات المقررة', 'غياب كامل', 'جزئي', 'مجاز', 'تأخر', 'النسبة %', 'الحالة']].concat(rows.map(r => [r.st.name, STAGE[r.st.stage] || '', r.st.section || '', r.total, r.absent, r.partial, r.excused, r.late, r.total ? r.pct.toFixed(1) : '', r.level ? LEVEL[r.level][1] : ''])));
  el.querySelectorAll('tr[data-st]').forEach(tr => tr.onclick = () => studentDetail(tr.dataset.st));
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
const deptOpts = () => live('departments').sort(byName).map(d => [d.id, d.name]);
const personOpts = (kind, deptId) => live('teachers').filter(t => (!deptId || t.deptId === deptId) && (!kind || (t.kind || 'teacher') === kind)).sort(byName).map(t => [t.id, t.name]);
const personOptsAll = deptId => live('teachers').filter(t => !deptId || t.deptId === deptId).sort(byName).map(t => [t.id, t.name + ' (' + KIND[t.kind || 'teacher'] + ')']);
const deptField = () => isAdmin() ? [{ key: 'deptId', label: 'القسم', type: 'select', options: deptOpts(), required: true, blank: false }] : [];
const myDeptFilter = r => isAdmin() || r.deptId === me().deptId;

const LSCOPE = { student: 'طالب محدد', stage: 'مرحلة كاملة', dept: 'كل طلبة القسم' };
const MANAGE = {
  students: {
    title: 'طالب', table: 'students', stageFilter: true,
    cols: [['الاسم', r => esc(r.name)], ['الرقم الجامعي', r => esc(r.studentNo || '')], ['المرحلة', r => STAGE[r.stage] || ''], ['الشعبة', r => esc(r.section || '')], ['القسم', r => esc(deptName(r.deptId))]],
    fields: () => [{ key: 'name', label: 'اسم الطالب', required: true }, { key: 'studentNo', label: 'الرقم الجامعي (اختياري)' }, { key: 'stage', label: 'المرحلة', type: 'select', options: optStages(), required: true, blank: false }, { key: 'section', label: 'الشعبة (A, B …)' }, ...deptField()],
    clean: v => { v.stage = Number(v.stage); return v; }, perm: 'manageStudents',
    expHead: ['الاسم', 'المرحلة', 'الشعبة', 'الرقم الجامعي'], expRow: r => [r.name, STAGE[r.stage] || '', r.section || '', r.studentNo || ''],
    impHelp: 'الأعمدة بالترتيب: <b>الاسم، المرحلة (1-4 أو الأولى…)، الشعبة، الرقم الجامعي</b>.', needDept: true
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
    fields: rec => { const d = rec && rec.deptId || (isAdmin() ? '' : me().deptId); return [
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
    cols: [['المشمول', r => esc(r.name || '') + ' <span class="muted">(' + LSCOPE[r.scope] + ')</span>'], ['من', r => esc(r.from)], ['إلى', r => esc(r.to)], ['السبب', r => esc(r.reason || '')], ['القسم', r => esc(deptName(r.deptId))]],
    fields: () => [{ key: 'scope', label: 'نوع الإجازة', type: 'select', blank: false, required: true, def: 'student', options: Object.entries(LSCOPE) },
      { key: 'who', label: 'اسم الطالب أو رقمه الجامعي (لإجازة الطالب فقط)' },
      { key: 'stage', label: 'المرحلة (لإجازة المرحلة فقط)', type: 'select', options: optStages() },
      { key: 'from', label: 'من تاريخ', type: 'date', required: true }, { key: 'to', label: 'إلى تاريخ', type: 'date', required: true },
      { key: 'reason', label: 'السبب (اختياري، لا يظهر للتدريسي)' }, ...deptField()],
    perm: 'manageLeaves',
    expHead: ['المشمول', 'النوع', 'من', 'إلى', 'السبب'], expRow: r => [r.name, LSCOPE[r.scope], r.from, r.to, r.reason || ''],
    clean: v => { v.stage = v.stage ? Number(v.stage) : ''; return v; },
    prepare: (out, rec) => {
      if (out.to < out.from) throw new Error('تاريخ النهاية قبل البداية');
      if (out.scope === 'student') {
        const q = String(out.who || (rec && rec.name) || '').trim(); if (!q) throw new Error('اكتب اسم الطالب أو رقمه الجامعي');
        const m = live('students').filter(x => x.deptId === out.deptId && (x.name === q || (x.studentNo && x.studentNo === q)));
        if (!m.length) throw new Error('لم يُعثر على طالب بهذا الاسم أو الرقم في القسم'); if (m.length > 1) throw new Error('يوجد أكثر من طالب بهذا الاسم، استخدم الرقم الجامعي');
        out.studentId = m[0].id; out.name = m[0].name; out.stage = m[0].stage; out.section = m[0].section || '';
      } else if (out.scope === 'stage') { if (!out.stage) throw new Error('اختر المرحلة'); out.name = 'المرحلة ' + STAGE[out.stage]; out.studentId = ''; out.section = ''; }
      else { out.name = 'كل طلبة القسم'; out.studentId = ''; out.stage = ''; out.section = ''; }
      delete out.who;
    }
  },
  departments: {
    title: 'قسم', table: 'departments', noDept: true,
    cols: [['القسم', r => esc(r.name)]], fields: () => [{ key: 'name', label: 'اسم القسم', required: true }],
    perm: 'admin', expHead: ['القسم'], expRow: r => [r.name], impHelp: 'عمود واحد: <b>اسم القسم</b>.'
  },
  users: {
    title: 'مستخدم', table: 'users',
    cols: [['الاسم', r => esc(r.name)], ['اسم المستخدم', r => esc(r.username)], ['الدور', r => ROLE[r.role] || ''], ['التدريسي المرتبط', r => r.teacherId ? esc(teacherName(r.teacherId)) : ''], ['القسم', r => esc(deptName(r.deptId))], ['الحالة', r => r.active === false ? '<span class="badge bad">معطّل</span>' : '<span class="badge ok">فعّال</span>']],
    fields: (rec) => [{ key: 'name', label: 'الاسم', required: true }, { key: 'username', label: 'اسم المستخدم (إنجليزي بلا مسافات)', required: true },
      { key: 'password', label: rec ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور التي تُسلَّم للمستخدم (6 رموز فأكثر)', type: 'password', required: !rec },
      { key: 'role', label: 'الدور', type: 'select', required: true, blank: false, options: ['teacher', 'rapporteur', 'head', 'admin'].map(r => [r, ROLE[r]]) },
      { key: 'teacherId', label: 'ربط بسجل التدريسي / مسؤول المختبر (للدور الأخير فقط)', type: 'select', options: personOptsAll(rec && rec.deptId || '') },
      { key: 'active', label: 'الحساب فعّال', type: 'checkbox', def: true }, ...deptField()],
    clean: v => { v.username = v.username.toLowerCase(); if (!v.password) delete v.password; if (v.role !== 'teacher') v.teacherId = ''; if (v.role === 'admin') v.deptId = ''; return v; },
    lockSelf: true, perm: 'admin', needDept: true,
    expHead: ['الاسم', 'اسم المستخدم', 'كلمة المرور', 'الدور', 'التدريسي المرتبط'], expRow: r => [r.name, r.username, '', ROLE[r.role] || r.role, r.teacherId ? teacherName(r.teacherId) : ''],
    impHelp: 'الأعمدة بالترتيب: <b>الاسم، اسم المستخدم، كلمة المرور (6 رموز فأكثر)، الدور (تدريسي / مسؤول مختبر → «تدريسي / مسؤول مختبر»، رئيس القسم، مقرر القسم، مدير النظام)، اسم التدريسي أو مسؤول المختبر المرتبط</b>.'
  }
};
const mview = {};
function manageScreen(kind) {
  return el => {
    const C = MANAGE[kind]; const V = mview[kind] = mview[kind] || { q: '', stage: '', dept: '', limit: 100 };
    let rows = live(C.table).filter(r => C.noDept ? true : (myDeptFilter(r) || (kind === 'users' && r.id === me().id)));
    if (isAdmin() && V.dept && !C.noDept) rows = rows.filter(r => r.deptId === V.dept);
    if (V.stage) rows = rows.filter(r => String(r.stage) === V.stage);
    if (V.q) rows = rows.filter(r => (r.name + ' ' + (r.studentNo || '') + ' ' + (r.username || '')).includes(V.q));
    if (kind === 'leaves') rows.sort((a, b) => b.from.localeCompare(a.from)); else rows.sort(byName);
    el.innerHTML = `<div class="filters"><input type="search" id="mq" placeholder="بحث…" value="${esc(V.q)}">
      ${C.stageFilter ? `<select id="ms"><option value="">كل المراحل</option>${optStages().map(o => `<option value="${o[0]}"${o[0] === V.stage ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>` : ''}
      ${isAdmin() && !C.noDept ? `<select id="md"><option value="">كل الأقسام</option>${deptOpts().map(o => `<option value="${o[0]}"${o[0] === V.dept ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : ''}
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
      await removeRec(C.table, get(C.table, b.dataset.d)); manageScreen(kind)(el);
    });
  };
}
function editRec(kind, rec, el) {
  const C = MANAGE[kind];
  openForm({
    title: (rec ? 'تعديل ' : 'إضافة ') + C.title, fields: C.fields(rec), values: rec ? Object.assign({}, rec, kind === 'leaves' ? { who: rec.scope === 'student' ? rec.name : '' } : {}) : { active: true },
    onSave: async v => {
      if (C.clean) v = C.clean(v);
      const base = rec ? Object.assign({}, rec) : { id: uid(kind[0]), deleted: false };
      const out = Object.assign(base, v);
      if (!C.noDept && !isAdmin()) out.deptId = me().deptId;
      if (!C.noDept && !out.deptId) throw new Error('اختر القسم');
      if (kind === 'users' && out.role === 'teacher' && !out.teacherId) throw new Error('اربط المستخدم بسجل التدريسي / مسؤول المختبر');
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
function readFileText(f) {
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
      if (exist.has(key)) { skipped++; return; } exist.add(key);
      recs.push({ id: uid('s'), name, stage, section: (r[2] || '').trim(), studentNo: no, deptId, deleted: false });
    });
    if (recs.length) await saveRecs('students', recs);
    return { count: recs.length, skipped };
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
    const exist = new Set(live('departments').map(d => d.name)); const recs = []; let skipped = 0;
    rows.forEach(r => { const n = (r[0] || '').trim(); if (!n || exist.has(n)) { skipped++; return; } exist.add(n); recs.push({ id: uid('d'), name: n, deleted: false }); });
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
  const C = MANAGE[kind];
  showModal('استيراد ' + C.title + ' من ملف CSV', `<p class="muted">${C.impHelp} السطر الأول يمكن أن يكون عناوين. في Excel: حفظ باسم ← CSV UTF-8.</p>
   ${C.needDept && isAdmin() ? `<label class="f">القسم<select id="idept">${deptOpts().map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></label>` : ''}
   <input type="file" id="ifile" accept=".csv,.txt"><label class="f">أو الصق البيانات هنا<textarea id="itxt" rows="6" dir="auto"></textarea></label>
   <div class="row end"><button class="btn ghost" data-close>إلغاء</button><button class="btn" id="igo">استيراد</button></div>`);
  $('#ifile').onchange = async e => { const f = e.target.files[0]; if (f) $('#itxt').value = await readFileText(f); };
  $('#igo').onclick = async () => {
    const deptId = isAdmin() ? ($('#idept') ? $('#idept').value : '') : me().deptId;
    if (C.needDept && !deptId) return toast('اختر القسم', true);
    const rows = parseCsv($('#itxt').value.replace(/^﻿/, ''));
    if (!rows.length) return toast('لا توجد بيانات للاستيراد', true);
    try {
      const r = await IMPORTERS[kind](rows, deptId);
      if (!r.count) return toast('لا توجد سجلات صالحة (تخطي ' + r.skipped + ')', true);
      closeModal(); toast('تم استيراد ' + r.count + (r.skipped ? ' (تخطي ' + r.skipped + ')' : '')); after && after();
    } catch (e) { toast(e.message, true); }
  };
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
  ${isAdmin() ? `<div class="card"><h2>حدود الإنذار والحرمان</h2><form id="sForm"><div class="row"><label class="f grow">نسبة الإنذار %<input name="warnPct" type="number" min="1" max="100" value="${S.warnPct}"></label><label class="f grow">نسبة الحرمان %<input name="banPct" type="number" min="1" max="100" value="${S.banPct}"></label><label class="f grow">وزن الغياب الجزئي (0.5 = نصف غياب)<input name="pw" type="number" min="0" max="1" step="0.1" value="${S.partialWeight}"></label></div>
   <button class="btn">حفظ</button></form><p class="muted">القيم الافتراضية للتجربة؛ عدّلها حسب تعليمات الكلية.</p></div>` : ''}
  <div class="card"><h2>حول التطبيق</h2><p>${esc(CFG.UNIVERSITY || '')} — ${esc(CFG.COLLEGE || '')}<br>نظام متابعة غيابات الطلبة (يعمل بدون إنترنت)<br>تصميم وتطوير: <b>${esc(CFG.AUTHOR || '')}</b><br><span dir="ltr">${esc(CFG.AUTHOR_EMAIL || '')}</span><br>${waLink()}<br>الإصدار ${esc(CFG.VERSION || '')}</p></div>`;
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

const SCREENS = {
  home: homeScreen, attend: attendScreen, reports: reportsScreen,
  students: manageScreen('students'), teachers: manageScreen('teachers'), subjects: manageScreen('subjects'),
  users: manageScreen('users'), departments: manageScreen('departments'), settings: settingsScreen, permissions: permsScreen, audit: auditScreen, leaves: manageScreen('leaves')
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
