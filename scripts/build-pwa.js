import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const entries = await readdir('dist/assets');
const assets = ['/', '/index.html', '/manifest.webmanifest', '/icons/health-180.png', '/icons/health-192.png', '/icons/health-512.png', ...entries.map(name=>`/assets/${name}`)];
const version=createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,12);
await writeFile('dist/sw.js',`const CACHE='ritmo-shell-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ritmo-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate') {event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}
 if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||fetch(event.request))));
});
`);
console.log(`PWA: ${assets.length} arquivos públicos no cache ${version}; APIs excluídas.`);
