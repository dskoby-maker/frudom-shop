/* Полная проверка сайта. Запуск: node test/site-check.js → в конце «ошибок: 0».
   Сам поднимает: тестовую таблицу (test/server.js), сайт, заглушки Тильды и GitHub для /1c. */
const { spawn } = require('child_process'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), fail = [], log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
function run(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; }
const mock = (port, fn) => http.createServer(fn).listen(port);

(async () => {
  const tilda = mock(8791, (q, s) => { if (/redir/.test(q.url)) { s.writeHead(302, { location: 'https://frudom.ru/1c' }); return s.end(); } s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end('<html>TILDA-1C ' + q.url + '</html>'); });
  const docs = mock(8792, (q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end('<html>DOCS ' + q.url + '</html>'); });
  run('test/server.js');
  run('server.js', { PORT: 3001, GS_URL: 'http://localhost:8790/api', TILDA_ORIGIN: 'http://localhost:8791', DOCS_ORIGIN: 'http://localhost:8792' });
  run('server.js', { PORT: 3002, GS_URL: 'http://localhost:1/none' });            // таблица недоступна → запасной каталог
  await sleep(2500);
  const B = 'http://localhost:3001', get = async (u, o) => { const r = await fetch(B + u, Object.assign({ redirect: 'manual' }, o || {})); return { s: r.status, t: await r.text(), loc: r.headers.get('location') }; };

  /* 1. адреса, редиректы, /1c */
  for (const [u, code] of [['/', 200], ['/catalog', 200], ['/catalog/ovoshchi', 200], ['/catalog/ovoshchi/kartofel', 200], ['/dostavka-i-oplata', 200], ['/kontakty', 200], ['/sitemap.xml', 200], ['/robots.txt', 200], ['/nope', 404], ['/catalog/zelen', 404], ['/magazin', 301], ['/catalog/', 301]]) {
    const r = await get(u); if (r.s !== code) fail.push(u + ': код ' + r.s + ' вместо ' + code);
  }
  let r = await get('/1c'); if (r.s !== 200 || !/TILDA-1C \/1c/.test(r.t)) fail.push('/1c не пропущен в Тильду: ' + r.s + ' ' + r.t.slice(0, 60)); else log('/1c → Тильда ✓');
  r = await get('/1c?redir=1'); if (r.s !== 301 || r.loc !== '/1c/?redir=1') fail.push('/1c при перенаправлении Тильды: ' + r.s + ' ' + r.loc);
  r = await get('/1c/?redir=1'); if (!/DOCS \/\?redir=1/.test(r.t)) fail.push('/1c/ запасной (GitHub) не сработал: ' + r.t.slice(0, 60)); else log('/1c → запасной GitHub ✓');
  const sm = (await get('/sitemap.xml')).t; if (!sm.includes('https://frudom.ru/catalog/ovoshchi/kartofel')) fail.push('в sitemap нет страницы товара');
  if (sm.includes('/catalog/zelen<')) fail.push('в sitemap пустая категория');
  const fb = await (await fetch('http://localhost:3002/health')).json(); if (fb.items < 50 || fb.source !== 'запасной файл') fail.push('запасной каталог не включился: ' + JSON.stringify(fb)); else log('запасной каталог: ' + fb.items + ' товаров ✓');

  /* 2. SEO на каждой странице */
  for (const u of ['/', '/catalog', '/catalog/ovoshchi', '/catalog/ovoshchi/kartofel', '/dostavka-i-oplata', '/kontakty']) {
    const h = (await get(u)).t, t = (h.match(/<title>(.*?)<\/title>/) || [])[1] || '', d = (h.match(/name="description" content="(.*?)"/) || [])[1] || '';
    const h1 = (h.match(/<h1/g) || []).length;
    if (!t || t.length > 95) fail.push(u + ': заголовок пустой или длинный (' + t.length + ')');
    if (d.length < 50 || d.length > 220) fail.push(u + ': описание ' + d.length + ' симв.');
    if (h1 !== 1) fail.push(u + ': H1 на странице — ' + h1);
    if (!/rel="canonical" href="https:\/\/frudom\.ru/.test(h)) fail.push(u + ': нет canonical');
    for (const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { fail.push(u + ': сломана разметка JSON-LD'); } }
  }
  const ph = (await get('/catalog/ovoshchi/kartofel')).t;
  if (!/"@type":"Product"/.test(ph) || !/"price":"63.95"/.test(ph)) fail.push('товар: нет разметки Product с ценой');
  if (!ph.includes('63,95')) fail.push('товар: цены нет в HTML');
  if (!(await get('/catalog/orehi-i-semena/keshyu')).t.includes('Кешью W320 из Вьетнама')) fail.push('товар: своё описание из колонки Q не показано');

  /* 3. в браузере: корзина между страницами, оба заказа, телефон */
  const b = await chromium.launch(), errs = [];
  for (const [w, h, name] of [[1280, 900, 'ПК'], [390, 844, 'телефон']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.route('**/fonts.googleapis.com/**', r => r.abort()); await p.route('**/fonts.gstatic.com/**', r => r.abort());
    for (const u of ['/', '/catalog', '/catalog/ovoshchi', '/catalog/ovoshchi/kartofel', '/dostavka-i-oplata', '/kontakty']) {
      await p.goto(B + u); await p.waitForLoadState('load');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) fail.push(name + ' ' + u + ': прокрутка вбок ' + sw);
    }
    await p.goto(B + '/catalog/ovoshchi/kartofel');
    await p.click('.prod [data-add]'); await p.waitForTimeout(300);                       // 1 мешок
    if (!/1 мешок/.test(await p.textContent('.prod .qv'))) fail.push(name + ': на странице товара не добавился мешок');
    await p.goto(B + '/catalog/ovoshchi');                                                // корзина переносится
    if (!/1 мешок/.test(await p.textContent('.p[data-slug="kartofel"] .qv'))) fail.push(name + ': корзина не сохранилась при переходе');
    await p.click('.p[data-slug="kartofel"] [data-mode="kg"]'); await p.waitForTimeout(500);
    for (let i = 0; i < 6; i++) { await p.click('.p[data-slug="kartofel"] [data-q="-1"]'); await p.waitForTimeout(80); } // 25 → 19 кг: цена поштучная
    const pr = await p.textContent('.p[data-slug="kartofel"] .pr b');
    if (!/70,35/.test(pr)) fail.push(name + ': ниже 20 кг цена должна быть 70,35, а показано ' + pr);
    await p.click('.p[data-slug="kartofel"] [data-q="1"]'); await p.waitForTimeout(300);  // 20 кг → опт
    if (!/63,95/.test(await p.textContent('.p[data-slug="kartofel"] .pr b'))) fail.push(name + ': от 20 кг не включился опт');
    if (name === 'телефон') { await p.click('.burger'); await p.waitForTimeout(500); if (!(await p.isVisible('#mnav a'))) fail.push('мобильное меню не открылось'); await p.click('.burger'); }
    await p.click('[data-open="cart"]'); await p.waitForTimeout(600);
    await p.click('#pay'); await p.waitForSelector('#g_phone');
    await p.fill('#g_phone', '+7 999 111-22-33'); await p.fill('#g_addr', 'Москва, Тестовая 1'); await p.click('#g_send');
    await p.waitForSelector('.center h3', { timeout: 15000 }); log(name, '→', await p.textContent('.center h3'));
    await p.click('.center [data-close="modal"]'); await p.waitForTimeout(300);
    await p.goto(B + '/catalog/orehi-i-semena/keshyu');
    await p.click('.prod [data-add]'); for (let i = 0; i < 4; i++) { await p.click('.prod [data-q="1"]'); await p.waitForTimeout(80); }
    await p.click('[data-open="cart"]'); await p.waitForTimeout(500); await p.click('#who button[data-v="nds"]'); await p.waitForTimeout(200); await p.click('#pay');
    await p.waitForSelector('#c_inn'); await p.fill('#c_inn', '7701234567'); await p.fill('#c_name', 'ООО Тест'); await p.fill('#c_email', 'buh@test.ru'); await p.fill('#c_phone', '+7 900 000-00-00'); await p.fill('#c_daddr', 'Москва, Склад 5');
    await p.click('#c_save'); await p.waitForSelector('.ord', { timeout: 15000 }); log(name, '→', (await p.textContent('.ord')).replace(/\s+/g, ' ').trim());
    await ctx.close();
  }
  await b.close();

  /* 4. заказы в таблице: суммы сайта и сервера совпадают */
  const dump = await (await fetch('http://localhost:8790/dump')).json(), rows = (dump.sheets['Заказы с сайта'] || []).slice(1);
  rows.forEach(r => { log('заказ', r[0], r[2], '|', r[14].replace(/\n/g, ' / '), '| сайт', r[18], 'сервер', r[19]); if (r[18] !== r[19]) fail.push('заказ ' + r[0] + ': сумма сайта ' + r[18] + ' ≠ сервера ' + r[19]); });
  if (rows.length !== 4) fail.push('ожидалось 4 заказа, записано ' + rows.length);

  const all = errs.concat(fail); console.log('ошибок:', all.length, all);
  procs.forEach(p => p.kill()); tilda.close(); docs.close(); process.exit(all.length ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1); });
