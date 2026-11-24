'use strict';
/* النواة: التخزين المحلي (IndexedDB) + قائمة الانتظار + المزامنة مع Apps Script */
const TABLES = ['departments', 'teachers', 'subjects', 'students', 'sessions', 'absences', 'users', 'settings', 'audit', 'leaves'];
const state = { apiUrl: '', token: '', user: null, since: 0, epoch: '', offset: 0, pending: 0, status: 'idle', lastSync: 0, error: '' };
const DB = {};
TABLES.forEach(t => DB[t] = new Map());
let idb = null;
const listeners = [];
const onChange = fn => listeners.push(fn);
const emit = k => listeners.forEach(f => { try { f(k); } catch (e) { console.error(e); } });

const nowTs = () => Date.now() + state.offset;
function uid(p) {
  const a = new Uint8Array(9); crypto.getRandomValues(a);
  return (p || '') + Array.from(a, b => (b % 36).toString(36)).join('');
}

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('absence-app', 3);
    r.onupgradeneeded = () => {
      const db = r.result;
      TABLES.forEach(t => { if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' }); });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
function txMulti(names, mode, fn) {
  return new Promise((res, rej) => {
    const t = idb.transaction(names, mode);
    const st = {}; names.forEach(n => st[n] = t.objectStore(n));
    let out; try { out = fn(st); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbAll = async s => { let out; await txMulti([s], 'readonly', st => { out = reqP(st[s].getAll()); }); return out; };
const metaGet = async k => { let out; await txMulti(['meta'], 'readonly', st => { out = reqP(st.meta.get(k)); }); const v = await out; return v ? v.v : undefined; };
const metaSet = (k, v) => txMulti(['meta'], 'readwrite', st => { st.meta.put({ k, v }); });

async function loadAll() {
  for (const t of TABLES) { DB[t] = new Map((await dbAll(t)).map(r => [r.id, r])); }
  const s = await metaGet('session');
  if (s) { state.token = s.token; state.user = s.user; }
  state.apiUrl = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || (await metaGet('apiUrl')) || '';
  state.since = (await metaGet('since')) || 0;
  state.epoch = (await metaGet('epoch')) || '';
  state.offset = (await metaGet('offset')) || 0;
  await refreshPending();
}
async function refreshPending() { state.pending = (await dbAll('outbox')).length; }

const live = t => { const o = []; DB[t].forEach(r => { if (!r.deleted) o.push(r); }); return o; };
const get = (t, id) => { const r = DB[t].get(id); return r && !r.deleted ? r : null; };

async function saveRecs(table, recs) {
  const ts = nowTs();
  recs.forEach(r => {
    const old = DB[table].get(r.id);
    r.updatedAt = Math.max(ts, (old && old.updatedAt || 0) + 1);
    if (r.deleted === undefined) r.deleted = false;
    DB[table].set(r.id, r);
  });
  await txMulti([table, 'outbox'], 'readwrite', st => {
    recs.forEach(r => { st[table].put(r); st.outbox.put({ k: table + ':' + r.id, table, rec: r }); });
  });
  await refreshPending();
  emit('local');
  scheduleSync();
}
const saveRec = (t, r) => saveRecs(t, [r]);
const removeRec = (t, r) => saveRec(t, Object.assign({}, r, { deleted: true }));

/* ---------- الشبكة ---------- */
async function api(action, payload) {
  if (!state.apiUrl) throw new Error('لم يُضبط رابط الخدمة');
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 45000);
  let r;
  try {
    r = await fetch(state.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ac.signal,
      body: JSON.stringify(Object.assign({ action, token: state.token }, payload || {}))
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'انتهت مهلة الاتصال' : 'تعذّر الاتصال بالخادم'); } finally { clearTimeout(to); }
  if (!r.ok) throw new Error('خطأ في الاتصال (' + r.status + ')');
  return r.json();
}

async function login(username, password) {
  const res = await api('login', { username, password });
  if (!res.ok) throw new Error(res.error || 'فشل الدخول');
  const prev = state.user;
  if (prev && prev.id !== res.user.id) {
    if (state.pending && !confirm('توجد تعديلات غير مزامَنة لمستخدم آخر وستُحذف. متابعة؟')) throw new Error('أُلغي الدخول');
    await wipeLocal();
  }
  state.token = res.token; state.user = res.user;
  await metaSet('session', { token: res.token, user: res.user });
  emit('login');
  syncNow();
}

async function wipeLocal() {
  await txMulti([...TABLES, 'outbox'], 'readwrite', st => { Object.values(st).forEach(s => s.clear()); });
  TABLES.forEach(t => DB[t] = new Map());
  state.since = 0; state.pending = 0;
  await metaSet('since', 0);
}
async function logout() {
  await wipeLocal();
  state.token = ''; state.user = null;
  await metaSet('session', null);
  emit('logout');
}

/* ---------- المزامنة ---------- */
let syncing = false, syncStart = 0, timer = null, errCount = 0;
function scheduleSync(ms) { clearTimeout(timer); timer = setTimeout(syncNow, ms || 2500); registerBgSync(); }
/** مزامنة في الخلفية عبر الـ Service Worker (أندرويد/كروم): تُنفَّذ عند عودة الإنترنت حتى لو أُغلق التطبيق */
async function registerBgSync() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) await reg.sync.register('abs-sync');
    if (reg.periodicSync && !registerBgSync.p) { registerBgSync.p = 1; await reg.periodicSync.register('abs-periodic', { minInterval: 15 * 60 * 1000 }); }
  } catch (e) { /* غير مدعوم */ }
}

async function syncNow(force) {
  if (syncing && Date.now() - syncStart < 60000) return;
  if (!state.token || !state.apiUrl) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  syncing = true; syncStart = Date.now(); setStatus('syncing');
  let changed = false;
  try {
    for (let round = 0; round < 50; round++) {
      const outbox = (await dbAll('outbox')).slice(0, 400);
      const res = await api('sync', { since: state.since, epoch: state.epoch, ops: outbox.map(o => ({ table: o.table, rec: o.rec })) });
      if (!res.ok) {
        if (res.code === 'auth') { state.token = ''; await metaSet('session', { token: '', user: state.user }); emit('auth'); return; }
        throw new Error(res.error || 'فشلت المزامنة');
      }
      if (res.reset) { // صُفّر البرنامج من جهاز آخر: امسح النسخة المحلية وأعد التنزيل
        await wipeLocal(); state.epoch = res.epoch; await metaSet('epoch', res.epoch); changed = true; continue;
      }
      if (res.epoch && res.epoch !== state.epoch) { state.epoch = res.epoch; await metaSet('epoch', res.epoch); }
      state.offset = res.serverTime - Date.now();
      await metaSet('offset', state.offset);
      // حذف العمليات المُرسَلة التي لم تتغير محلياً بعد الإرسال
      await txMulti(['outbox'], 'readwrite', st => {
        outbox.forEach(o => {
          const cur = DB[o.table].get(o.rec.id);
          if (!cur || cur.updatedAt === o.rec.updatedAt) st.outbox.delete(o.k);
        });
      });
      const keys = new Set((await dbAll('outbox')).map(o => o.k));
      const writes = {};
      TABLES.forEach(t => (res.changes[t] || []).forEach(r => { if (!keys.has(t + ':' + r.id)) (writes[t] = writes[t] || []).push(r); }));
      const names = Object.keys(writes);
      if (names.length) {
        await txMulti(names, 'readwrite', st => names.forEach(t => writes[t].forEach(r => st[t].put(r))));
        names.forEach(t => writes[t].forEach(r => DB[t].set(r.id, r)));
        changed = true;
      }
      if (res.revoked && res.revoked.length) {
        const rv = res.revoked.filter(id => !keys.has('subjects:' + id) && DB.subjects.has(id));
        if (rv.length) {
          await txMulti(['subjects'], 'readwrite', st => rv.forEach(id => st.subjects.delete(id)));
          rv.forEach(id => DB.subjects.delete(id)); changed = true;
        }
      }
      if (res.rejected && res.rejected.length) {
        toast('رُفض ' + res.rejected.length + ' تعديل: ' + res.rejected[0].reason, true);
        state.since = 0; // لإعادة تنزيل النسخة الصحيحة
      } else state.since = res.serverTime;
      await metaSet('since', state.since);
      if (!outbox.length || outbox.length < 400) break;
    }
    await refreshPending();
    state.lastSync = Date.now(); state.error = '';
    errCount = 0;
    setStatus(state.pending ? 'pending' : 'ok');
    if (changed) emit('remote');
    if (state.pending) scheduleSync(8000);
  } catch (e) {
    state.error = e.message || String(e);
    await refreshPending();
    setStatus(navigator.onLine ? 'error' : 'offline');
    errCount++; if (navigator.onLine && state.token) scheduleSync(Math.min(60000, 4000 * Math.pow(2, errCount)));
  } finally { syncing = false; }
}
function setStatus(s) { state.status = s; emit('status'); }

window.addEventListener('online', () => syncNow());
window.addEventListener('offline', () => setStatus('offline'));
setInterval(() => { if (state.token && navigator.onLine && !document.hidden) syncNow(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.token) syncNow(); });
window.addEventListener('focus', () => { if (state.token) syncNow(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'abs-sync') syncNow(); });
