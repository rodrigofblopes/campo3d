/* Service worker do Campo3D: deixa o visualizador abrir sem internet na obra.
   - Página (HTML): tenta a rede primeiro; sem sinal, usa a última cópia salva.
   - Modelos (.glb): usa a cópia salva na hora e confere a versão do servidor em
     segundo plano; se o arquivo mudou (nova exportação do Revit), avisa a página.
   - Bibliotecas e fontes (CDN): cópia salva primeiro, as URLs têm versão fixa. */
const APP = 'campo3d-app-v1', MODELS = 'campo3d-modelos', LIBS = 'campo3d-libs-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.endsWith('.glb')) { e.respondWith(model(req)); return; }
  if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/')) { e.respondWith(page(req)); return; }
  if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) { e.respondWith(lib(req)); return; }
  if (url.origin === location.origin) { e.respondWith(page(req)); }
});

async function page(req){
  const cache = await caches.open(APP);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/')) || Response.error();
  }
}

async function lib(req){
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function model(req){
  const cache = await caches.open(MODELS);
  const key = req.url.split('?')[0];
  const hit = await cache.match(key);
  const refresh = fetch(req, { cache: 'no-cache' }).then(async (res) => {
    if (!res.ok) return res;
    const oldTag = hit && (hit.headers.get('etag') || hit.headers.get('content-length'));
    const newTag = res.headers.get('etag') || res.headers.get('content-length');
    await cache.put(key, res.clone());
    if (hit && oldTag && newTag && oldTag !== newTag) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.postMessage({ type: 'model-updated', url: key }));
    }
    return res;
  });
  if (hit) { refresh.catch(() => {}); return hit; }
  return refresh;
}
