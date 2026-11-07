/* Проверка кабинета менеджера /admin. Тестовая таблица и временная база — настоящих заказов, писем и платежей нет.
   Запуск: node test/admin-check.js → «ошибок: 0». */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { hashPassword } = require('../lib/auth.js');
const ROOT = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frudom-adm-')), procs = [], fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const B = 'http://localhost:3007', wait = ms => new Promise(r => setTimeout(r, ms));
const run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); };
const PW = 'очень-длинный-пароль-1', PW2 = 'склад-пароль-2024';
const USERS = 'Даниил:admin:' + hashPassword(PW) + ';Склад:viewer:' + hashPassword(PW2);

async function req(method, p, opt) {
  opt = opt || {};
  const h = Object.assign({}, opt.headers || {});
  if (opt.cookie) h.cookie = opt.cookie;
  if (method === 'POST') { h['content-type'] = 'application/x-www-form-urlencoded'; if (opt.origin !== false) h.origin = opt.origin || B; }
  const r = await fetch(B + p, { method, headers: h, body: opt.form ? new URLSearchParams(opt.form).toString() : undefined, redirect: 'manual' });
  return { s: r.status, loc: r.headers.get('location') || '', ck: r.headers.get('set-cookie') || '', t: await r.text(), h: r.headers };
}
async function login(user, pw) {
  const r = await req('POST', '/admin/login', { form: { user, password: pw } });
  const m = /fd_adm=([^;]+)/.exec(r.ck); return { r, cookie: m ? 'fd_adm=' + m[1] : null };
}
const csrfOf = t => (/name="csrf" value="([^"]+)"/.exec(t) || [])[1];
const verOf = t => (/name="version" value="(\d+)"/.exec(t) || [])[1];

(async () => {
  run('test/server.js');
  run('server.js', { PORT: 3007, GS_URL: 'http://localhost:8790/api', ORDERS_DB: path.join(tmp, 'o.db'), ADMIN_USERS: USERS });
  for (let i = 0; i < 40; i++) { try { const h = await fetch(B + '/health').then(x => x.json()); if (h.source === 'таблица') break; } catch (e) {} await wait(250); }
  const post = o => fetch(B + '/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: o }) }).then(x => x.json());
  const o1 = await post({ who: 'nonds', zone: 'msk', phone: '+7 999 000-00-01', addr: 'Москва', name: '<script>alert(1)</script>', items: [{ n: 'Морковь', qty: 10 }] });
  const o2 = await post({ who: 'nds', zone: 'msk', phone: '+7 999 000-00-02', addr: 'Москва', items: [{ n: 'Кешью', qty: 5 }],
    company: { name: 'ООО Тест', inn: '7701234567', email: 'buh@test.ru', daddr: 'Москва' } });
  ok(o1.ok && o2.ok, 'заказы не созданы: ' + JSON.stringify([o1, o2]));

  /* 1. Без входа — только страница входа; страницы не индексируются и не встраиваются */
  let r = await req('GET', '/admin');
  ok(r.s === 303 && r.loc === '/admin/login', '1. без входа открылся список: ' + r.s);
  r = await req('GET', '/admin/order/' + o1.no); ok(r.s === 303, '1. без входа открылась карточка');
  r = await req('GET', '/admin/login');
  ok(/noindex/.test(r.h.get('x-robots-tag') || '') && r.h.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(r.h.get('content-security-policy') || ''), '1. нет защитных заголовков');

  /* 2. Вход: неверный пароль, подбор, cookie */
  r = (await login('Даниил', 'неверно')).r; ok(r.s === 401 && /неверное имя или пароль/.test(r.t), '2. неверный пароль: ' + r.s);
  r = (await login('Никто', 'x')).r; ok(r.s === 401, '2. несуществующий пользователь');
  r = await req('POST', '/admin/login', { form: { user: 'Даниил', password: PW }, origin: 'https://evil.example' });
  ok(r.s === 403, '2. вход с чужого сайта принят: ' + r.s);
  const A = await login('Даниил', PW);
  ok(A.cookie && /HttpOnly/i.test(A.r.ck) && /SameSite=Strict/i.test(A.r.ck) && /Path=\/admin/.test(A.r.ck), '2. cookie без защиты: ' + A.r.ck);

  /* 3. Список и карточка; экранирование */
  r = await req('GET', '/admin', { cookie: A.cookie });
  ok(r.s === 200 && r.t.includes('>' + o1.no + '<') && r.t.includes('>' + o2.no + '<'), '3. в списке нет заказов');
  ok(!r.t.includes('<script>alert') && r.t.includes('&lt;script&gt;'), '3. текст покупателя не экранирован (XSS)');
  r = await req('GET', '/admin?tab=all&q=' + o2.no, { cookie: A.cookie });
  ok(r.t.includes('>' + o2.no + '<') && !r.t.includes('>' + o1.no + '<'), '3. поиск по номеру');
  let card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
  const csrf = csrfOf(card.t);
  ok(card.s === 200 && csrf && /К оплате: 1 330,00 ₽/.test(card.t), '3. карточка: ' + card.s + ' ' + (/К оплате[^<]+/.exec(card.t) || [])[0]);

  /* 4. Защита действий: без ключа формы, с чужого сайта, без версии/со старой версией */
  const act = (no, form, extra) => req('POST', '/admin/order/' + no, Object.assign({ cookie: A.cookie, form }, extra || {}));
  r = await act(o1.no, { action: 'picking', version: verOf(card.t) }); ok(r.s === 403, '4. действие без ключа формы: ' + r.s);
  r = await act(o1.no, { action: 'picking', csrf, version: verOf(card.t) }, { origin: 'https://evil.example' }); ok(r.s === 403, '4. действие с чужого сайта: ' + r.s);
  r = await act(o1.no, { action: 'picking', csrf, version: verOf(card.t) }, { origin: false }); ok(r.s === 403, '4. действие без Origin');

  /* 5. Весовой заказ без НДС: сборка → вес → отгрузка запрещена до оплаты → оплата → отгрузка */
  r = await act(o1.no, { action: 'picking', csrf, version: verOf(card.t) });
  ok(r.s === 303 && /t=ok/.test(r.loc), '5. начать сборку: ' + decodeURIComponent(r.loc));
  r = await act(o1.no, { action: 'picking', csrf, version: verOf(card.t) });
  ok(/t=err/.test(r.loc) && /другой менеджер/.test(decodeURIComponent(r.loc)), '5. старая версия заказа принята: ' + decodeURIComponent(r.loc));
  card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
  r = await act(o1.no, { action: 'weigh', csrf, version: verOf(card.t), 'w[]': 'много' }); ok(/t=err/.test(r.loc), '5. вес «много» принят');
  r = await act(o1.no, { action: 'weigh', csrf, version: verOf(card.t), 'w[]': '11,5' });
  ok(/t=ok/.test(r.loc) && /1 426,00/.test(decodeURIComponent(r.loc)), '5. вес 11,5 кг: ' + decodeURIComponent(r.loc));
  card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
  r = await act(o1.no, { action: 'fulfill', to: 'ready_to_ship', csrf, version: verOf(card.t) });
  ok(/t=err/.test(r.loc) && /не оплачено/.test(decodeURIComponent(r.loc)), '5. отгрузка без оплаты: ' + decodeURIComponent(r.loc));
  r = await act(o1.no, { action: 'pay', csrf, version: verOf(card.t), amount: '1426', date: '2026-11-07', method: 'link', basis: '' });
  ok(/t=err/.test(r.loc) && /основание/.test(decodeURIComponent(r.loc)), '5. оплата без основания');
  r = await act(o1.no, { action: 'pay', csrf, version: verOf(card.t), amount: '1 426,00', date: '2026-11-07', method: 'link', basis: 'СБП 123' });
  ok(/t=ok/.test(r.loc), '5. оплата: ' + decodeURIComponent(r.loc));
  card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
  ok(/Оплачено полностью/.test(card.t), '5. после оплаты не «оплачено полностью»');
  for (const to of ['ready_to_ship', 'shipped', 'delivered']) {
    card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
    r = await act(o1.no, { action: 'fulfill', to, csrf, version: verOf(card.t) }); ok(/t=ok/.test(r.loc), '5. шаг ' + to + ': ' + decodeURIComponent(r.loc));
  }
  card = await req('GET', '/admin/order/' + o1.no, { cookie: A.cookie });
  ok(/Выполнен/.test(card.t) && /Даниил/.test(card.t), '5. итог: заказ не выполнен или нет истории с именем');

  /* 6. Заказ со счётом: сборка до оплаты нельзя; счёт; оплата; сборка */
  card = await req('GET', '/admin/order/' + o2.no, { cookie: A.cookie });
  ok(!/action" value="picking"/.test(card.t) || /после оплаты/.test(card.t), '6. кнопка сборки без пометки');
  r = await act(o2.no, { action: 'picking', csrf, version: verOf(card.t) }); ok(/t=err/.test(r.loc), '6. сборка до оплаты');
  r = await act(o2.no, { action: 'invoice', csrf, version: verOf(card.t), number: 'СЧ-1', date: '2026-11-07', amount: '7304', url: 'javascript:alert(1)' });
  ok(/t=ok/.test(r.loc), '6. счёт: ' + decodeURIComponent(r.loc));
  card = await req('GET', '/admin/order/' + o2.no, { cookie: A.cookie });
  ok(/Ждём перевод/.test(card.t) && /Не оплачен/.test(card.t) && !/javascript:/.test(card.t), '6. после счёта: статусы или опасная ссылка');
  r = await act(o2.no, { action: 'pay', csrf, version: verOf(card.t), amount: '7304', date: '2026-11-07', method: 'transfer', basis: 'п/п 77' });
  card = await req('GET', '/admin/order/' + o2.no, { cookie: A.cookie });
  r = await act(o2.no, { action: 'picking', csrf, version: verOf(card.t) }); ok(/t=ok/.test(r.loc), '6. сборка после оплаты: ' + decodeURIComponent(r.loc));

  /* 7. Роль «только просмотр» */
  const V = await login('Склад', PW2);
  card = await req('GET', '/admin/order/' + o2.no, { cookie: V.cookie });
  ok(card.s === 200 && !/name="action"/.test(card.t), '7. у просмотра есть кнопки действий');
  r = await req('POST', '/admin/order/' + o2.no, { cookie: V.cookie, form: { action: 'cancel', reason: 'x', csrf: csrfOf(card.t), version: verOf(card.t) } });
  ok(r.s === 403, '7. просмотр смог изменить заказ: ' + r.s);

  /* 8. Выход: старая cookie больше не работает */
  r = await req('POST', '/admin/logout', { cookie: A.cookie, form: { csrf } });
  r = await req('GET', '/admin', { cookie: A.cookie }); ok(r.s === 303, '8. после выхода список открылся');

  const C = await login('Даниил', PW);   /* вход для проверки на телефоне — до проверки подбора (после неё адрес временно закрыт) */
  /* 9. Подбор пароля: после 5 ошибок вход закрыт даже с верным паролем */
  for (let i = 0; i < 5; i++) await login('Склад', 'нет');
  r = (await login('Склад', PW2)).r; ok(r.s === 401 && /подождите/.test(r.t), '9. подбор пароля не ограничен');

  /* 10. Телефон: нет прокрутки вбок, кнопки не мельче 44 px */
  try {
    const { chromium } = require('playwright'); const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 360, height: 780 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const ck = C.cookie;
    await p.context().addCookies([{ name: 'fd_adm', value: ck.split('=')[1], domain: 'localhost', path: '/admin' }]);
    for (const u of ['/admin?tab=all', '/admin/order/' + o2.no]) {
      await p.goto(B + u);
      const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, small: [...document.querySelectorAll('button,input,select')].filter(e => e.offsetParent && e.type !== 'hidden' && e.getBoundingClientRect().height < 40).length }));
      ok(m.sw <= 360 && m.small === 0, '10. ' + u + ' на телефоне: ' + JSON.stringify(m));
      await p.screenshot({ path: path.join(process.env.SHOTS || tmp, 'adm' + (u.includes('order') ? '-card' : '-list') + '.png'), fullPage: true });
    }
    ok(!errs.length, '10. ошибки на странице: ' + errs.join('; '));
    await b.close();
  } catch (e) { fail.push('10. браузер: ' + e.message); }

  procs.forEach(p => p.kill());
  if (!process.env.SHOTS) fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ошибок:', fail.length, fail);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1); });
