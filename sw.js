const CACHE = 'absence-v23';
const FILES = ['./', 'index.html', 'styles.css', 'config.js', 'core.js', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // الشبكة أولاً (لتصل التحديثات فوراً)، والنسخة المحفوظة عند انقطاع الإنترنت
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});

/* ---------- المزامنة في الخلفية (Background Sync) ---------- */
const idbOpen = () => new Promise((res, rej) => { const r = indexedDB.open('absence-app'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbAll = (db, s) => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const idbGet = (db, s, k) => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function bgSync() {
  const cs = await self.clients.matchAll({ includeUncontrolled: true });
  if (cs.length) { cs.forEach(c => c.postMessage({ type: 'abs-sync' })); return; } // التطبيق مفتوح: يتولاها هو
  let db; try { db = await idbOpen(); } catch (e) { return; }
  const api = (await idbGet(db, 'meta', 'apiUrl')), ses = (await idbGet(db, 'meta', 'session')), ep = (await idbGet(db, 'meta', 'epoch'));
  let cfgUrl = ''; try { const t = await (await fetch('config.js', { cache: 'no-cache' })).text(); const m = t.match(/API_URL:\s*'([^']*)'/); cfgUrl = m ? m[1] : ''; } catch (e) {}
  const url = cfgUrl || (api && api.v), token = ses && ses.v && ses.v.token;
  if (!url || !token) return;
  const outbox = (await idbAll(db, 'outbox')).slice(0, 400);
  if (!outbox.length) return;
  const res = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sync', token, since: 2e15, epoch: ep && ep.v || '', ops: outbox.map(o => ({ table: o.table, rec: o.rec })) }) })).json();
  if (!res.ok || res.reset || (res.rejected && res.rejected.length)) throw new Error('bg');
  await new Promise((ok, no) => { // احذف المُرسَل فقط إن لم يتغير سجله محلياً
    const tx = db.transaction(['outbox'], 'readwrite'), st = tx.objectStore('outbox'); outbox.forEach(o => { const g = st.get(o.k); g.onsuccess = () => { if (g.result && g.result.rec.updatedAt === o.rec.updatedAt) st.delete(o.k); }; }); tx.oncomplete = ok; tx.onerror = () => no(tx.error);
  });
}
self.addEventListener('sync', e => { if (e.tag === 'abs-sync') e.waitUntil(bgSync()); });
self.addEventListener('periodicsync', e => { if (e.tag === 'abs-periodic') e.waitUntil(bgSync().catch(() => {})); });
