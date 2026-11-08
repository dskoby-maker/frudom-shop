/* Проверка личного кабинета покупателя. Запуск: node test/account-check.js → в конце «ошибок: 0».
   Сам поднимает тестовую таблицу (настоящий server/Code.gs) и сайт с базой SQLite во временной папке. */
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), fail = [], log = (...a) => console.log(...a), sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [], run = (file, env) => { const p = spawn('node', [file], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-acc-')), B = 'http://localhost:3011';
const ok = (c, m) => { if (!c) fail.push(m); };

(async () => {
  run('test/server.js');
  run('server.js', { PORT: 3011, GS_URL: 'http://localhost:8790/api', ORDERS_DB: path.join(TMP, 'o.db') });
  for (let i = 0; i < 40; i++) { await sleep(250); try { const h = await (await fetch(B + '/health')).json(); if (h.db === 'ok') break; } catch (e) {} }
  const H = { origin: B, 'content-type': 'application/x-www-form-urlencoded' };
  const req = (u, o) => fetch(B + u, Object.assign({ redirect: 'manual' }, o || {})).then(async r => ({ s: r.status, t: await r.text(), c: r.headers.get('set-cookie'), loc: r.headers.get('location') }));
  const form = (u, data, cookie) => req(u, { method: 'POST', headers: Object.assign({}, H, cookie ? { cookie } : {}), body: new URLSearchParams(data).toString() });
  const order = (o, cookie) => fetch(B + '/api/order', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}), body: JSON.stringify({ order: Object.assign({ who: 'nonds', zone: 'msk', phone: '+7 900 111-22-33', addr: 'Москва, Тест 1' }, o) }) }).then(r => r.json());
  const mails = async to => (await (await fetch('http://localhost:8790/dump')).json()).mail.filter(m => m.to === to);
  const codeOf = async to => { const m = (await mails(to)).pop(); return m && (/(\d{6})/.exec(m.body) || [])[1]; };

  /* заказы до входа: один на нашу почту (с заглавными буквами), один чужой */
  const o1 = await order({ name: 'Анна', email: 'Anna@Test.ru', items: [{ n: 'Морковь', qty: 3, mode: 'kg' }], src: 'utm_source=yandex&utm_medium=cpc' });
  const o2 = await order({ name: 'Борис', email: 'boris@test.ru', items: [{ n: 'Кешью', qty: 1, mode: 'kg' }] });
  ok(o1.ok && o2.ok, 'заказы не приняты: ' + JSON.stringify([o1, o2]));

  /* вход: код на почту */
  let r = await form('/account/login', { email: 'не почта' }); ok(r.s === 400, 'неверная почта должна давать 400');
  r = await form('/account/login', { email: ' ANNA@test.ru ' }); ok(r.s === 200 && /Введите код/.test(r.t), 'нет формы кода: ' + r.s);
  const m = (await mails('anna@test.ru')).pop(); ok(m && /^Код входа на frudom\.ru: \d{6}$/.test(m.subj) && m.name === 'Фруктовый Дом', 'письмо с кодом не ушло: ' + JSON.stringify(m));
  const code = await codeOf('anna@test.ru');
  r = await form('/account/verify', { email: 'anna@test.ru', code: code === '000000' ? '111111' : '000000' }); ok(r.s === 400 && /Неверный код/.test(r.t), 'неверный код принят');
  r = await req('/account/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=anna%40test.ru&code=' + code }); ok(r.s === 403, 'запрос без Origin должен отклоняться: ' + r.s);
  r = await form('/account/verify', { email: 'anna@test.ru', code }); ok(r.s === 303 && /fs_acc=.+HttpOnly; SameSite=Lax/.test(r.c || ''), 'вход по верному коду не сработал: ' + r.s);
  const ck = (r.c || '').split(';')[0];
  r = await form('/account/verify', { email: 'anna@test.ru', code }); ok(r.s === 400, 'код сработал второй раз');

  /* заказы: свой виден, чужой нет */
  r = await req('/account', { headers: { cookie: ck } });
  ok(r.s === 200 && r.t.includes('Заказ № ' + o1.no) && !r.t.includes('Заказ № ' + o2.no), 'список заказов неверный');
  ok(/noindex/.test(r.t), 'кабинет должен быть закрыт от поиска');
  r = await req('/account/order/' + o2.no, { headers: { cookie: ck } }); ok(r.s === 404, 'чужой заказ открылся');
  r = await req('/account/order/' + o1.no, { headers: { cookie: ck } }); ok(r.s === 200 && /Морковь/.test(r.t) && /data-repeat/.test(r.t) && /otrack/.test(r.t), 'карточка заказа неполная');
  r = await req('/account', {}); ok(r.s === 200 && /Вход в личный кабинет/.test(r.t), 'без входа должна быть форма входа');
  r = await req('/account/order/' + o1.no, {}); ok(r.s === 303, 'заказ без входа открылся');

  /* профиль подставился из заказа, сохранение реквизитов */
  let me = await (await fetch(B + '/api/me', { headers: { cookie: ck } })).json();
  ok(me.ok && me.me.email === 'anna@test.ru' && me.me.name === 'Анна' && me.me.phone, '/api/me: ' + JSON.stringify(me));
  r = await form('/account/profile', { name: 'Анна П.', phone: '+7 900 000-00-01', addr: 'Москва, Новая 2', inn: '12345', cname: 'ООО Ромашка' }, ck); ok(r.s === 400, 'неверный ИНН сохранился');
  r = await form('/account/profile', { name: 'Анна П.', phone: '+7 900 000-00-01', addr: 'Москва, Новая 2', inn: '7701234567', cname: 'ООО Ромашка', cemail: 'buh@romashka.ru', daddr: 'Москва, Склад 3' }, ck); ok(r.s === 200 && /Сохранено/.test(r.t), 'профиль не сохранён');
  me = await (await fetch(B + '/api/me', { headers: { cookie: ck } })).json();
  ok(me.me.name === 'Анна П.' && me.me.company && me.me.company.inn === '7701234567' && me.me.company.name === 'ООО Ромашка', 'профиль не обновился: ' + JSON.stringify(me.me));

  /* заказ из кабинета без почты — всё равно привязан к покупателю */
  const o3 = await order({ name: 'Анна', items: [{ n: 'Картофель', qty: 25, mode: 'pack' }] }, ck); ok(o3.ok, 'заказ из кабинета не принят: ' + JSON.stringify(o3));
  r = await req('/account', { headers: { cookie: ck } }); ok(r.t.includes('Заказ № ' + o3.no), 'заказ из кабинета не виден в списке');

  /* защита: лимит кодов, чужой ключ почты в таблице, выход */
  for (let i = 0; i < 3; i++) r = await form('/account/login', { email: 'lim@test.ru' });
  ok(r.s === 200, 'третий код подряд должен уйти'); r = await form('/account/login', { email: 'lim@test.ru' }); ok(r.s === 429, 'нет лимита на коды: ' + r.s);
  const gs = await (await fetch('http://localhost:8790/api', { method: 'POST', body: JSON.stringify({ action: 'shopMail', key: 'x'.repeat(30), to: 'spam@test.ru', subject: 'x', text: 'x' }) })).json();
  ok(!gs.ok && gs.code === 'mail_key', 'таблица отправила письмо с чужим ключом: ' + JSON.stringify(gs));
  r = await form('/account/logout', {}, ck); ok(r.s === 303 && /Max-Age=0/.test(r.c || ''), 'выход не сработал');
  me = await (await fetch(B + '/api/me', { headers: { cookie: ck } })).json(); ok(!me.ok, 'после выхода сессия осталась');

  /* в браузере (телефон): вход, повтор заказа, оформление с подставленными данными */
  const b = await chromium.launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/fonts.g*/**', x => x.abort());
  await p.goto(B + '/account'); await p.fill('#em', 'anna@test.ru'); await p.click('form[action="/account/login"] button'); await p.waitForSelector('#cd');
  await p.fill('#cd', await codeOf('anna@test.ru')); await p.click('form[action="/account/verify"] button'); await p.waitForSelector('.orow');
  ok((await p.$$('.orow')).length === 2, 'в браузере не 2 заказа');
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'кабинет: прокрутка вбок');
  await p.screenshot({ path: path.join(TMP, 'acc-list.png') });
  await p.click('.orow[href="/account/order/' + o1.no + '"]'); await p.waitForSelector('[data-repeat]');
  await p.screenshot({ path: path.join(TMP, 'acc-order.png'), fullPage: true });
  await p.click('[data-repeat]'); await p.waitForTimeout(700);
  ok(/Морковь/.test(await p.textContent('#items')), 'повтор заказа не положил товар в корзину');
  await p.click('#pay'); await p.waitForSelector('#g_phone');
  ok(await p.inputValue('#g_email') === 'anna@test.ru' && await p.inputValue('#g_addr') === 'Москва, Новая 2', 'данные кабинета не подставились в заказ');
  await p.click('#g_send'); await p.waitForSelector('.center h3', { timeout: 15000 });
  const no4 = +(/№ (\d+)/.exec(await p.textContent('.center h3')) || [])[1];
  await p.goto(B + '/account'); ok((await p.textContent('.olist')).includes('Заказ № ' + no4), 'новый заказ не появился в кабинете');
  await p.goto(B + '/account/profile'); ok(await p.inputValue('#inn') === '7701234567', 'профиль в браузере пустой');
  await b.close();
  log('снимки кабинета:', TMP);
  if (errs.length) fail.push('ошибки на странице: ' + errs.join('; '));
  log('ошибок:', fail.length, fail);
  procs.forEach(x => x.kill()); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(x => x.kill()); process.exit(1); });
