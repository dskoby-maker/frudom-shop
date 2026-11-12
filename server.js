/* Сайт frudom.ru: страницы каталога, корзина, приём заказов. Запуск: node server.js (порт из PORT, по умолчанию 3000). */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const D = require('./lib/data.js'), R = require('./lib/render.js'), ART = require('./public/art.js');

/* База заказов включается переменной ORDERS_DB: адрес облачной PostgreSQL (postgres://…) или путь к файлу SQLite (для проверки).
   Без неё — как раньше: заказ сразу уходит в Google Таблицу. Пока база не подключилась (или недоступна) — тоже в таблицу, заказы не теряются. */
let DB = null, O = null, OB = null, ADMIN = null, ACC = null, DB_STATE = null;   /* ACC — личный кабинет покупателя /account */   /* ADMIN — кабинет менеджера /admin (только вместе с базой) */
if (process.env.ORDERS_DB) {
  const DBL = require('./lib/db.js'); O = require('./lib/orders.js'); OB = require('./lib/outbox.js');
  const where = DBL.describe(process.env.ORDERS_DB);
  DB_STATE = 'подключается';
  const initDb = async () => {
    try {
      const db = await DBL.open(process.env.ORDERS_DB);
      await OB.recover(db);
      ADMIN = require('./lib/admin.js').create({ DB: db, O, D, auth: require('./lib/auth.js').create(process.env.ADMIN_USERS), send, clientIp });
      ACC = require('./lib/account.js').create({ DB: db, D, R, send, clientIp });
      DB = db; DB_STATE = 'ok';
      console.log('База заказов подключена: ' + where);
      const tick = () => OB.runOnce(DB, O.getOrder, D.sendOrder).catch(e => console.error('Очередь:', e.message));
      setInterval(tick, 30000).unref(); setTimeout(tick, 2000).unref();
      /* копия файла базы раз в сутки (только SQLite; у PostgreSQL копии делает хостинг) */
      const BK_DIR = process.env.ORDERS_BACKUP_DIR;
      if (BK_DIR && db.kind === 'sqlite') {
        const doBackup = async () => { try {
          fs.mkdirSync(BK_DIR, { recursive: true });
          await DBL.backup(DB, path.join(BK_DIR, 'orders-' + new Date().toISOString().slice(0, 10) + '.db'));
          fs.readdirSync(BK_DIR).filter(f => /^orders-.*\.db$/.test(f)).sort().slice(0, -14).forEach(f => fs.unlinkSync(path.join(BK_DIR, f)));
        } catch (e) { console.error('Копия базы не сделана:', e.message); } };
        setInterval(doBackup, 24 * 3600000).unref(); setTimeout(doBackup, 60000).unref();
      }
    } catch (e) {
      DB_STATE = 'ошибка: ' + String(e.message || e).slice(0, 200);
      console.error('База заказов (' + where + ') не подключилась, повтор через 30 с:', e.message);
      setTimeout(initDb, 30000).unref();
    }
  };
  initDb();
}

const PORT = +process.env.PORT || 3000;
/* Генератор документов остаётся в Тильде: адрес /1c пропускаем на страницу Тильды без изменений.
   Если Тильда не отдаёт страницу (например, перенаправляет), показываем тот же генератор с GitHub. */
const TILDA_ORIGIN = (process.env.TILDA_ORIGIN || 'https://project8349547.tilda.ws').replace(/\/$/, '');
const DOCS_ORIGIN = (process.env.DOCS_ORIGIN || 'https://dskoby-maker.github.io/frudom-docs').replace(/\/$/, '');
/* Страницы, которые остаются на Тильде и открываются через этот сервер как есть (frudom.ru/1c — генератор документов, frudom.ru/pdf — редактор PDF).
   Свои добавить: TILDA_PATHS="/1c,/pdf,/ещё" в настройках сервера. */
const TILDA_PATHS = (process.env.TILDA_PATHS || '/1c,/pdf').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(x => /^\/[^/]/.test(x));
const isTilda = p => TILDA_PATHS.some(t => p === t || p.startsWith(t + '/'));
const SITE_URL = (process.env.SITE_URL || 'https://frudom.ru').replace(/\/$/, ''), SITE_HOST = new URL(SITE_URL).hostname.toLowerCase();
const TECH_HOST = h => /\.twc1\.net$/.test(h);
const REDIRECTS = { '/magazin': '/catalog', '/where': '/kontakty', '/test': '/', '/index.html': '/', '/catalog/': '/catalog' };
const PUB = path.join(__dirname, 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };

function send(req, res, status, type, body, extra) {
  const h = Object.assign({ 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' }, extra || {});
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

/* простая защита от потока роботов: не больше 10 заказов в 10 минут с одного адреса.
   Адрес посетителя: TRUST_PROXY=N — сколько своих прокси стоит перед сайтом (у Timeweb обычно 1). Без настройки — адрес соединения,
   заголовку X-Forwarded-For не верим (его может подделать кто угодно). */
const TRUST_PROXY = Math.max(0, parseInt(process.env.TRUST_PROXY || '0', 10) || 0);
function clientIp(req) {
  const sock = String(req.socket.remoteAddress || '');
  if (!TRUST_PROXY) return sock;
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return chain[chain.length - TRUST_PROXY] || sock;
}
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000); a.push(now); hits.set(ip, a);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 600000)) hits.delete(k);
  return a.length > 10;
}
/* Из браузера принимаем только то, что нужно для заказа. Цена, доставка, НДС и сумма товаров не передаются: их считает таблица. */
const s_ = (v, n) => typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : undefined;
function cleanOrder(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const items = Array.isArray(o.items) ? o.items.slice(0, 81).map(l => (l && typeof l === 'object') ? { n: s_(l.n, 120), qty: typeof l.qty === 'number' ? l.qty : s_(l.qty, 20), mode: s_(l.mode, 8) } : {}) : [];
  const co = o.company && typeof o.company === 'object' ? o.company : null;
  const out = { who: s_(o.who, 8), zone: s_(o.zone, 8), items, name: s_(o.name, 100), phone: s_(o.phone, 40), email: s_(o.email, 100), addr: s_(o.addr, 300),
    comment: s_(o.comment, 500), total: typeof o.total === 'number' ? o.total : s_(o.total, 20), key: s_(o.key, 64), hp: s_(o.hp, 50), src: s_(o.src, 300) };
  if (co) out.company = ['inn', 'kpp', 'ogrn', 'name', 'addr', 'email', 'phone', 'daddr'].reduce((m, k) => { m[k] = s_(co[k], 300); return m; }, {});
  Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
  return out;
}

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

/* остальные страницы Тильды (редактор PDF и т. п.): как есть, без запасного варианта */
async function proxyTilda(req, res, u) {
  try {
    const r = await fetch(TILDA_ORIGIN + u.pathname + u.search, { redirect: 'manual', headers: { 'user-agent': req.headers['user-agent'] || 'frudom-site' } });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location') || '/';
      const to = new URL(loc, TILDA_ORIGIN + u.pathname);
      /* Тильда отправляет обратно на frudom.ru ту же страницу (в Тильде ещё указан домен) — не крутить по кругу */
      if (/(^|\.)frudom\.ru$/.test(to.hostname) && to.pathname.replace(/\/+$/, '') === u.pathname.replace(/\/+$/, '')) throw new Error('loop');
      res.writeHead(302, { location: (to.origin === new URL(TILDA_ORIGIN).origin || /(^|\.)frudom\.ru$/.test(to.hostname)) ? to.pathname + to.search : '/', 'cache-control': 'no-cache' }); return res.end();
    }
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    return send(req, res, 200, r.headers.get('content-type') || 'text/html; charset=utf-8', Buffer.from(await r.arrayBuffer()), { 'cache-control': 'no-cache', 'x-robots-tag': 'noindex' });
  } catch (e) { return send(req, res, 502, 'text/plain; charset=utf-8', 'Страница временно недоступна, обновите через минуту', { 'x-robots-tag': 'noindex' }); }
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://local');
  let p = decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/');
  /* www.frudom.ru → frudom.ru (одна копия сайта для поисковиков, один вход в кабинеты) */
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  if (host.startsWith('www.') && host.slice(4) === SITE_HOST) return redirect(res, SITE_URL + u.pathname + u.search);
  /* технический адрес хостинга (…twc1.net) не индексировать — в поиске только frudom.ru */
  if (TECH_HOST(host)) res.setHeader('x-robots-tag', 'noindex, nofollow');
  if (p === '/1c' || p.startsWith('/1c/')) return proxy1c(req, res, u);
  if (isTilda(p)) return proxyTilda(req, res, u);
  if (p === '/admin' || p.startsWith('/admin/')) {
    if (!ADMIN) return DB_STATE ? send(req, res, 503, 'text/plain; charset=utf-8', 'База заказов ещё подключается — обновите страницу через минуту', { 'x-robots-tag': 'noindex', 'retry-after': '30' })
      : send(req, res, 404, 'text/plain; charset=utf-8', 'Не найдено', { 'x-robots-tag': 'noindex' });
    return ADMIN(req, res, p === '/admin/' ? '/admin' : p, u);
  }
  if (p === '/account' || p.startsWith('/account/') || p === '/api/me' || p === '/api/me/company') {
    if (ACC) return ACC(req, res, p, u);
    if (p.startsWith('/api/')) return send(req, res, 200, 'application/json', JSON.stringify({ ok: false }), { 'cache-control': 'no-store' });
    const cat = await D.getCatalog();
    return send(req, res, 200, 'text/html; charset=utf-8', R.layout({ path: '/account', noindex: true, noLoc: true, tab: 'account', title: 'Личный кабинет | Фруктовый Дом', desc: 'Личный кабинет покупателя',
      body: '<section class="sec pg"><div class="wrap acc"><div class="acc-card acc-login"><h1>Личный кабинет</h1><p class="intro">' + (DB_STATE ? 'Кабинет подключается — обновите страницу через минуту.' : 'Личный кабинет скоро заработает.') + ' Заказы принимаются как обычно, статус подскажет менеджер: +7 999 833-05-53.</p><a class="btnp" href="/catalog" style="width:100%">В каталог</a></div></div></section>' }, cat), { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  }
  if (REDIRECTS[p]) return redirect(res, REDIRECTS[p] + (u.search || ''));
  if (p.length > 1 && p.endsWith('/')) return redirect(res, p.replace(/\/+$/, '') + (u.search || ''));

  if (p === '/api/order' && req.method === 'POST') {
    if (tooMany(clientIp(req))) return send(req, res, 429, 'application/json', JSON.stringify({ ok: false, error: 'слишком много заказов подряд, позвоните нам' }));
    if (!/application\/json/.test(req.headers['content-type'] || '')) return send(req, res, 415, 'application/json', JSON.stringify({ ok: false, error: 'неверный запрос' }));
    let order;
    try { const body = JSON.parse(await readBody(req, 100000)); order = cleanOrder(body && body.order); }
    catch (e) { return send(req, res, 400, 'application/json', JSON.stringify({ ok: false, error: 'неверный запрос' })); }
    if (!order) return send(req, res, 400, 'application/json', JSON.stringify({ ok: false, error: 'пустой заказ' }));
    if (DB) {
      try {
        const c = await D.getCatalog();
        const cid = await require('./lib/account.js').customerId(DB, req).catch(() => null);
        const r = await O.createOrder(DB, order, { items: c.items, source: c.source, at: c.fetchedAt, updated: c.updated }, { channel: 'site', customerId: cid });
        return send(req, res, 200, 'application/json', JSON.stringify(r), { 'cache-control': 'no-store' });
      } catch (e) {
        /* база не ответила — заказ не теряем: отправляем сразу в таблицу, как без базы (с пометкой) */
        console.error('Заказ не записан в базу, отправляю в таблицу:', e.message);
        order.comment = ('БАЗА НЕДОСТУПНА · ' + (order.comment || '')).slice(0, 500);
      }
    }
    delete order.src;                                       /* в таблицу заказ уходит как раньше */
    try {
      const r = await D.sendOrder(order);
      return send(req, res, 200, 'application/json', JSON.stringify(r && typeof r === 'object' ? r : { ok: false, error: 'сервер заказов не ответил' }), { 'cache-control': 'no-store' });
    } catch (e) { console.error('Заказ не отправлен:', e.message); return send(req, res, 502, 'application/json', JSON.stringify({ ok: false, error: 'сервер заказов не ответил' })); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'text/plain; charset=utf-8', 'Method not allowed');

  if (p.startsWith('/assets/')) {
    const f = path.join(PUB, path.normalize(p.slice(8)).replace(/^(\.\.[\/\\])+/, ''));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(req, res, 404, 'text/plain; charset=utf-8', 'Не найдено');
    return send(req, res, 200, TYPES[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f), { 'cache-control': u.search ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
  }
  if (p === '/health') {
    const c = await D.getCatalog(), h = { ok: true, items: c.items.length, source: c.source, updated: c.updated, pricesAgeMin: c.fetchedAt ? Math.round((Date.now() - c.fetchedAt) / 60000) : null };
    /* проблемы базы — в поле warn, а не ошибкой: хостинг проверяет /health и перезапускал бы сайт, хотя заказы и без базы уходят в таблицу */
    if (DB) { try { await require('./lib/db.js').check(DB); h.db = 'ok'; h.queue = await OB.stats(DB); if (h.queue.failed) h.warn = 'есть заказы, не попавшие в таблицу'; } catch (e) { h.db = 'ошибка'; h.warn = 'база не отвечает'; } }
    else if (DB_STATE) { h.db = DB_STATE === 'подключается' ? DB_STATE : 'ошибка (подробности — в логах приложения)'; h.warn = 'база не подключена — заказы идут сразу в таблицу'; }
    return send(req, res, h.ok ? 200 : 503, 'application/json', JSON.stringify(h), { 'cache-control': 'no-store' });
  }
  if (p === '/favicon.ico') return send(req, res, 200, TYPES['.svg'], fs.readFileSync(path.join(PUB, 'favicon.svg')), { 'cache-control': 'public, max-age=86400' });

  const cat = await D.getCatalog();
  /* нарисованные картинки товаров и категорий (SVG); если в таблице есть своё фото — на сайте показывается оно */
  const im = p.match(/^\/img\/(p|c|hero)\/(?:([a-z0-9-]+)\/)?([a-z0-9-]+)\.svg$/);
  if (im) {
    let svg = null;
    if (im[1] === 'p') { const it = cat.items.find(x => x.cs === im[2] && x.slug === im[3]); if (it) svg = ART.fileItem(it); }
    else if (im[1] === 'c' && !im[2]) { const c = D.CATS.find(x => x.slug === im[3]); if (c) svg = ART.fileCat(c.name); }
    else if (im[1] === 'hero' && !im[2] && ART.hero[im[3]]) svg = ART.fileHero(im[3]);
    if (svg) return send(req, res, 200, 'image/svg+xml', svg, { 'cache-control': 'public, max-age=86400' });
    return send(req, res, 404, 'text/plain; charset=utf-8', 'Не найдено');
  }
  if (p === '/feed/yandex.yml' || p === '/feed/yandex.xml') return send(req, res, 200, 'application/xml; charset=utf-8', R.feedYandex(cat), { 'cache-control': 'public, max-age=900' });
  if (p === '/feed/google.xml') return send(req, res, 200, 'application/xml; charset=utf-8', R.feedGoogle(cat), { 'cache-control': 'public, max-age=900' });
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
