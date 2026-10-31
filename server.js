/* Сайт frudom.ru: страницы каталога, корзина, приём заказов. Запуск: node server.js (порт из PORT, по умолчанию 3000). */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const D = require('./lib/data.js'), R = require('./lib/render.js');

const PORT = +process.env.PORT || 3000;
/* Генератор документов остаётся в Тильде: адрес /1c пропускаем на страницу Тильды без изменений.
   Если Тильда не отдаёт страницу (например, перенаправляет), показываем тот же генератор с GitHub. */
const TILDA_ORIGIN = (process.env.TILDA_ORIGIN || 'https://project8349547.tilda.ws').replace(/\/$/, '');
const DOCS_ORIGIN = (process.env.DOCS_ORIGIN || 'https://dskoby-maker.github.io/frudom-docs').replace(/\/$/, '');
const REDIRECTS = { '/magazin': '/catalog', '/where': '/kontakty', '/test': '/', '/index.html': '/', '/catalog/': '/catalog' };
const PUB = path.join(__dirname, 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };

function send(req, res, status, type, body, extra) {
  const h = Object.assign({ 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' }, extra || {});
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  if (buf.length > 1024 && /text|javascript|json|xml|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { buf = zlib.gzipSync(buf); h['content-encoding'] = 'gzip'; h.vary = 'Accept-Encoding'; }
  h['content-length'] = buf.length;
  res.writeHead(status, h); res.end(req.method === 'HEAD' ? undefined : buf);
}
const html = (req, res, body, status) => send(req, res, status || 200, 'text/html; charset=utf-8', body, { 'cache-control': 'public, max-age=60' });
const redirect = (res, to) => { res.writeHead(301, { location: to, 'cache-control': 'public, max-age=86400' }); res.end(); };

function readBody(req, max) {
  return new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', d => { n += d.length; if (n > max) { no(new Error('слишком большой заказ')); req.destroy(); } else ch.push(d); }); req.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); req.on('error', no); });
}

/* простая защита от потока роботов: не больше 10 заказов в 10 минут с одного адреса */
const hits = new Map();
function tooMany(ip) { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000); a.push(now); hits.set(ip, a); return a.length > 10; }

async function proxy1c(req, res, u) {
  const tryFetch = async (target) => { const r = await fetch(target, { redirect: 'manual', headers: { 'user-agent': req.headers['user-agent'] || 'frudom-site' } }); if (r.status !== 200) throw new Error('HTTP ' + r.status); return r; };
  try {
    const r = await tryFetch(TILDA_ORIGIN + u.pathname + u.search);
    return send(req, res, 200, r.headers.get('content-type') || 'text/html; charset=utf-8', Buffer.from(await r.arrayBuffer()), { 'cache-control': 'no-cache', 'x-robots-tag': 'noindex' });
  } catch (e) {
    /* запасной вариант: тот же генератор с GitHub (данные в браузере сохраняются — адрес сайта не меняется) */
    if (u.pathname === '/1c') return redirect(res, '/1c/' + u.search);
    try {
      const r = await tryFetch(DOCS_ORIGIN + u.pathname.replace(/^\/1c/, '') + u.search);
      return send(req, res, 200, r.headers.get('content-type') || 'text/html; charset=utf-8', Buffer.from(await r.arrayBuffer()), { 'cache-control': 'no-cache', 'x-robots-tag': 'noindex' });
    } catch (e2) { return send(req, res, 502, 'text/plain; charset=utf-8', 'Генератор документов временно недоступен. Откройте ' + DOCS_ORIGIN + '/'); }
  }
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://local');
  let p = decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/');
  if (p === '/1c' || p.startsWith('/1c/')) return proxy1c(req, res, u);
  if (REDIRECTS[p]) return redirect(res, REDIRECTS[p] + (u.search || ''));
  if (p.length > 1 && p.endsWith('/')) return redirect(res, p.replace(/\/+$/, '') + (u.search || ''));

  if (p === '/api/order' && req.method === 'POST') {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (tooMany(ip)) return send(req, res, 429, 'application/json', JSON.stringify({ ok: false, error: 'слишком много заказов подряд, позвоните нам' }));
    try {
      const body = JSON.parse(await readBody(req, 100000));
      const r = await D.sendOrder(body.order || {});
      return send(req, res, 200, 'application/json', JSON.stringify(r));
    } catch (e) { console.error('Заказ не отправлен:', e.message); return send(req, res, 502, 'application/json', JSON.stringify({ ok: false, error: 'сервер заказов не ответил' })); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'text/plain; charset=utf-8', 'Method not allowed');

  if (p.startsWith('/assets/')) {
    const f = path.join(PUB, path.normalize(p.slice(8)).replace(/^(\.\.[\/\\])+/, ''));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(req, res, 404, 'text/plain; charset=utf-8', 'Не найдено');
    return send(req, res, 200, TYPES[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f), { 'cache-control': u.search ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
  }
  if (p === '/health') { const c = await D.getCatalog(); return send(req, res, 200, 'application/json', JSON.stringify({ ok: true, items: c.items.length, source: c.source, updated: c.updated })); }
  if (p === '/favicon.ico') return send(req, res, 200, TYPES['.svg'], fs.readFileSync(path.join(PUB, 'favicon.svg')), { 'cache-control': 'public, max-age=86400' });

  const cat = await D.getCatalog();
  if (p === '/robots.txt') return send(req, res, 200, 'text/plain; charset=utf-8', R.robots());
  if (p === '/sitemap.xml') return send(req, res, 200, 'application/xml; charset=utf-8', R.sitemap(cat));
  if (p === '/') return html(req, res, R.pageHome(cat));
  if (p === '/catalog') return html(req, res, R.pageCatalog(cat));
  if (p === '/dostavka-i-oplata') return html(req, res, R.pageDelivery(cat));
  if (p === '/kontakty') return html(req, res, R.pageContacts(cat));
  const m = p.match(/^\/catalog\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
  if (m) {
    const c = D.CATS.find(x => x.slug === m[1]) || (cat.items.find(x => x.cs === m[1]) && D.catOf(cat.items.find(x => x.cs === m[1]).c));
    if (c && !m[2] && cat.items.some(x => x.cs === m[1])) return html(req, res, R.pageCategory(cat, c));
    if (c && m[2]) { const it = cat.items.find(x => x.cs === m[1] && x.slug === m[2]); if (it) return html(req, res, R.pageProduct(cat, it)); }
  }
  return html(req, res, R.page404(cat), 404);
}

http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error(e); try { send(req, res, 500, 'text/plain; charset=utf-8', 'Ошибка сервера'); } catch (x) {} });
}).listen(PORT, () => { console.log('frudom.ru запущен на порту ' + PORT); D.getCatalog(); });
