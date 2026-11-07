/* Проверка базы заказов и статусов (этап 2). Без браузера, без настоящих заказов, писем и платежей.
   Запуск: node test/orders-db.js → в конце «ошибок: 0».
   С PostgreSQL: PG_TEST_URL=postgres://пользователь:пароль@localhost:5432/postgres node test/orders-db.js
   (для каждой проверки создаётся и потом удаляется своя временная база). */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = require('../lib/pricing.js'), DBL = require('../lib/db.js'), O = require('../lib/orders.js'), OB = require('../lib/outbox.js');
const fail = [], ok = (c, m) => { if (!c) fail.push(m); };
const throwsCode = async (fn, code, m) => { try { await fn(); fail.push(m + ': не было отказа'); } catch (e) { if (e.code !== code) fail.push(m + ': ' + e.code + ' ' + e.message); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frudom-')), M = 'менеджер';

/* ---------- 1. Расчёт на сайте совпадает с расчётом таблицы (server/Code.gs) ---------- */
{
  const ctx = { JSON, String, Math, Object, parseInt, parseFloat, Date, isNaN, isFinite, Array, Number };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'server/Code.gs'), 'utf8'), ctx);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const items = [];
  for (let i = 0; i < 30; i++) {
    const p = Math.round((20 + rnd() * 3000) * 100) / 100, it = { n: 'Товар ' + i, p, u: 'кг', w: rnd() < .5 ? 1 : 0 };
    if (i % 4 === 0) Object.assign(it, { pk: Math.round(p * 1.1 * 100) / 100, pack: 'мешок', step: [5, 10, 25][i % 3], th: [5, 10, 20][i % 3] });
    items.push(it);
  }
  let same = 0, n = 0;
  for (let t = 0; t < 600; t++) {
    const lines = [];
    for (let k = 1 + Math.floor(rnd() * 6); k > 0; k--) {
      const it = items[Math.floor(rnd() * items.length)], pack = it.pk && rnd() < .5;
      lines.push({ n: it.n, mode: pack ? 'pack' : 'kg', qty: pack ? it.step * (1 + Math.floor(rnd() * 3)) : Math.round((0.01 + rnd() * 40) * 100) / 100 });
    }
    const o = { who: rnd() < .3 ? 'nds' : 'nonds', zone: rnd() < .5 ? 'msk' : 'mo', items: lines };
    const a = ctx.orderCalc_(JSON.parse(JSON.stringify(o)), items), b = P.calc(o, items);
    n++;
    if (a.ok === b.ok && (!a.ok ? a.code === b.code : a.totalK === b.totalK && a.goodsK === b.goodsK && a.feeK === b.feeK && a.vatK === b.vatK)) same++;
    else if (fail.length < 3) fail.push('1. расчёт сайта ≠ таблицы: ' + JSON.stringify(o) + ' таблица ' + JSON.stringify([a.ok, a.totalK, a.code]) + ' сайт ' + JSON.stringify([b.ok, b.totalK, b.code]));
  }
  console.log('1. расчёт совпал с таблицей:', same + '/' + n);
}

/* ---------- 2. База: заказы, статусы, правила ---------- */
const CAT = {
  source: 'таблица', at: Date.now(), updated: 'тест',
  items: [
    { n: 'Картофель', p: 63.95, pk: 70.35, pack: 'мешок', step: 25, th: 20, u: 'кг', w: 1 },
    { n: 'Кешью', p: 1190, u: 'кг', w: 0 },
    { n: 'Морковь', p: 64, u: 'кг', w: 1 }
  ]
};
const STALE = Object.assign({}, CAT, { source: 'запасной файл', at: 0 });
const person = (items, extra) => Object.assign({ who: 'nonds', zone: 'msk', phone: '+7 999 000-00-00', addr: 'Москва', items }, extra || {});
const co = { name: 'ООО Тест', inn: '7701234567', email: 'buh@test.ru', daddr: 'Москва' };

/* Временная база: файл SQLite или новая база в PostgreSQL */
const PGT = process.env.PG_TEST_URL;
async function tempDb(kind, name) {
  if (kind === 'sqlite') return path.join(tmp, name + '.db');
  const admin = await require('../lib/pg.js').connect(PGT), db = 'frudom_test_' + name.replace(/\W/g, '_') + '_' + process.pid;
  await admin.exec('DROP DATABASE IF EXISTS ' + db + '; '); await admin.exec('CREATE DATABASE ' + db); admin.end();
  const u = new URL(PGT); u.pathname = '/' + db; return u.toString();
}
async function dropDb(spec) {
  if (!DBL.isPg(spec)) return;
  const admin = await require('../lib/pg.js').connect(PGT); await admin.exec('DROP DATABASE IF EXISTS ' + new URL(spec).pathname.slice(1) + ' WITH (FORCE)'); admin.end();
}

async function suite(kind) {
  const L = '[' + kind + '] ', T = m => L + m;
  const spec = await tempDb(kind, 'orders');
  let db = await DBL.open(spec);
  const C = (...a) => O.createOrder(db, ...a);

  /* 2.1 обычный заказ */
  let r = await C(person([{ n: 'Кешью', qty: 2 }], { key: 'k-person-0001', total: 3070 }), CAT);
  ok(r.ok && r.no === 5001 && r.total === 3070 && r.status === 'placed', T('2.1 заказ: ' + JSON.stringify(r)));
  /* 2.2 повтор — тот же заказ; тот же ключ с другим составом — отказ */
  const r2 = await C(person([{ n: 'Кешью', qty: 2 }], { key: 'k-person-0001', total: 3070 }), CAT);
  ok(r2.ok && r2.no === 5001 && (await O.listOrders(db)).length === 1, T('2.2 повтор создал второй заказ'));
  ok((await C(person([{ n: 'Кешью', qty: 3 }], { key: 'k-person-0001' }), CAT)).code === 'key_reused', T('2.2 ключ с другим составом принят'));
  /* 2.2б одновременные повторы одного заказа — один заказ */
  const par = await Promise.all([1, 2, 3].map(() => C(person([{ n: 'Морковь', qty: 1 }], { key: 'k-parallel-001' }), CAT)));
  ok(par.every(x => x.ok && x.no === par[0].no) && (await O.listOrders(db)).length === 2, T('2.2б параллельный повтор: ' + JSON.stringify(par.map(x => x.no))));
  /* 2.3 подмена, неизвестный товар, расхождение суммы */
  ok((await C(person([{ n: 'Кешью', qty: 1, price: 1 }]), CAT)).goods === 1190, T('2.3 цена из браузера'));
  ok((await C(person([{ n: 'Золото', qty: 1 }]), CAT)).code === 'unknown_item', T('2.3 неизвестный товар'));
  ok((await C(person([{ n: 'Кешью', qty: 1 }], { total: 10 }), CAT)).code === 'prices_changed', T('2.3 расхождение суммы'));

  /* 2.4 устаревший каталог: заказ принят, но цены не подтверждены — ни счёта, ни сборки, ни оплаты до пересчёта */
  r = await C(person([{ n: 'Морковь', qty: 3 }]), STALE);
  ok(r.ok && !r.priceOk && r.status === 'awaiting_manager_review', T('2.4 заказ при устаревшем каталоге: ' + JSON.stringify(r)));
  await throwsCode(() => O.startPicking(db, r.id, M), 'price_unconfirmed', T('2.4 сборка без подтверждения цен'));
  await throwsCode(() => O.confirmTransfer(db, r.id, { amountK: 100, basis: 'п/п 1', date: '2026-11-07' }, M), 'price_unconfirmed', T('2.4 оплата без подтверждения цен'));
  await throwsCode(() => O.reprice(db, r.id, STALE, M), 'catalog', T('2.4 пересчёт по запасному файлу'));
  let g = await O.reprice(db, r.id, CAT, M);
  ok(g.price_ok === 1 && g.order_status === 'placed' && g.total_k === 88200, T('2.4 пересчёт: ' + JSON.stringify([g.price_ok, g.order_status, g.total_k])));

  /* 2.5 весовой товар: факт меньше и больше; без полной оплаты не отгрузить */
  r = await C(person([{ n: 'Морковь', qty: 10 }]), CAT);            /* 640 + 690 = 1330 */
  const id5 = r.id;
  await throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'bad_transition', T('2.5 к отгрузке до сборки'));
  await O.startPicking(db, id5, M);
  await throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'not_weighed', T('2.5 к отгрузке без взвешивания'));
  g = await O.setWeights(db, id5, [11500], M);                       /* 11,5 кг × 64 = 736 + 690 = 1426 */
  ok(g.final_total_k === 142600 && g.fulfillment_status === 'weighed', T('2.5 итог после веса: ' + g.final_total_k));
  await O.confirmTransfer(db, id5, { amountK: 133000, basis: 'оплата по ссылке', date: '2026-11-07', method: 'link' }, M);
  g = await O.getOrder(db, id5);
  ok(g.due_k === 9600, T('2.5 «нужна доплата» 96 ₽: ' + g.due_k));
  await throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'unpaid', T('2.5 отгрузка с недоплатой'));
  await O.confirmTransfer(db, id5, { amountK: 9600, basis: 'доплата', date: '2026-11-07', method: 'link' }, M);
  await O.setFulfillment(db, id5, 'ready_to_ship', M); await O.setFulfillment(db, id5, 'shipped', M); g = await O.setFulfillment(db, id5, 'delivered', M);
  ok(g.order_status === 'completed' && g.fulfillment_status === 'delivered', T('2.5 доставка: ' + g.order_status));
  await throwsCode(() => O.setFulfillment(db, id5, 'picking', M), 'bad_transition', T('2.5 из «доставлен» в «сборку»'));
  await throwsCode(() => O.cancelOrder(db, id5, 'передумали', M), 'paid', T('2.5 отмена оплаченного'));
  /* порог опта по факту: картофель 19 кг поштучно → взвесили 21 кг → оптовая цена */
  r = await C(person([{ n: 'Картофель', qty: 19, mode: 'kg' }]), CAT);
  await O.startPicking(db, r.id, M); g = await O.setWeights(db, r.id, [21000], M);
  ok(g.items[0].final_price_k === 6395 && g.final_goods_k === Math.round(6395 * 21), T('2.5 порог опта по факту: ' + g.items[0].final_price_k));

  /* 2.6 заказ со счётом: сборка только после оплаты */
  r = await C(person([{ n: 'Кешью', qty: 5 }], { who: 'nds', company: co, total: 7304 }), CAT);
  ok(r.ok && r.status === 'awaiting_manager_review' && r.vat === 664, T('2.6 заказ со счётом: ' + JSON.stringify(r)));
  await throwsCode(() => O.startPicking(db, r.id, M), 'unpaid', T('2.6 сборка до оплаты'));
  await throwsCode(() => O.issueInvoice(db, r.id, { number: '' }, M), 'invoice', T('2.6 счёт без номера'));
  g = await O.issueInvoice(db, r.id, { number: 'СЧ-17', date: '2026-11-07' }, M);
  ok(g.order_status === 'awaiting_bank_transfer' && g.invoices[0].amount_k === 730400 && g.payment_status === 'not_started', T('2.6 счёт выставлен ≠ оплачен'));
  await throwsCode(() => O.confirmTransfer(db, r.id, { amountK: 730400, date: '2026-11-07' }, M), 'basis', T('2.6 оплата без основания'));
  g = await O.confirmTransfer(db, r.id, { amountK: 730400, basis: 'п/п № 512', date: '2026-11-07' }, M);
  ok(g.order_status === 'processing' && g.payment_status === 'manual_transfer_confirmed', T('2.6 после оплаты: ' + g.order_status));
  await O.startPicking(db, r.id, M); g = await O.setFulfillment(db, r.id, 'ready_to_ship', M);
  ok(g.fulfillment_status === 'ready_to_ship', T('2.6 без весового — к отгрузке после оплаты'));

  /* 2.7 одновременная правка двумя менеджерами */
  r = await C(person([{ n: 'Кешью', qty: 1 }]), CAT);
  const v = (await O.getOrder(db, r.id)).version;
  await O.startPicking(db, r.id, 'Наталья', v);
  await throwsCode(() => O.cancelOrder(db, r.id, 'дубль', 'Даниил', v), 'conflict', T('2.7 вторая правка по старой версии'));
  await throwsCode(() => O.startPicking(db, r.id, ''), 'actor', T('2.7 действие без имени'));
  /* 2.7б два менеджера нажали одновременно — проходит ровно одно действие */
  r = await C(person([{ n: 'Кешью', qty: 1 }]), CAT);
  const v7 = (await O.getOrder(db, r.id)).version;
  const both = await Promise.allSettled([O.startPicking(db, r.id, 'Наталья', v7), O.cancelOrder(db, r.id, 'дубль', 'Даниил', v7)]);
  ok(both.filter(x => x.status === 'fulfilled').length === 1 && both.some(x => x.reason && x.reason.code === 'conflict'), T('2.7б одновременные действия: ' + JSON.stringify(both.map(x => x.status))));

  /* 2.8 отмена */
  r = await C(person([{ n: 'Кешью', qty: 1 }]), CAT);
  await throwsCode(() => O.cancelOrder(db, r.id, '', M), 'reason', T('2.8 отмена без причины'));
  g = await O.cancelOrder(db, r.id, 'клиент отказался', M);
  ok(g.order_status === 'cancelled' && g.payment_status === 'cancelled', T('2.8 отмена'));
  await throwsCode(() => O.startPicking(db, r.id, M), 'cancelled', T('2.8 сборка отменённого'));

  /* 2.9 история и журнал, ограничения базы (деньги не бывают отрицательными), откат транзакции целиком */
  ok((await db.get('SELECT COUNT(*) AS n FROM status_history')).n > 20 && (await db.get('SELECT COUNT(*) AS n FROM audit_log')).n > 10, T('2.9 история/журнал пусты'));
  await throwsCode(async () => { try { await db.run('UPDATE orders SET paid_k = -1 WHERE id = 1'); } catch (e) { e.code = 'db'; throw e; } }, 'db', T('2.9 база приняла отрицательную сумму'));
  const before = (await db.get('SELECT COUNT(*) AS n FROM orders')).n;
  await throwsCode(() => db.tx(async () => { await C(person([{ n: 'Кешью', qty: 1 }]), CAT); const e = new Error('сбой'); e.code = 'boom'; throw e; }), 'boom', T('2.9 сбой внутри'));
  ok((await db.get('SELECT COUNT(*) AS n FROM orders')).n === before, T('2.9 после сбоя остался половинчатый заказ'));

  /* 2.10 переживает перезапуск; нумерация продолжается */
  const cnt = (await O.listOrders(db)).length;
  if (kind === 'sqlite') { await DBL.backup(db, path.join(tmp, 'copy.db')); }
  await db.close();
  db = await DBL.open(spec);
  ok((await O.listOrders(db)).length === cnt, T('2.10 после перезапуска заказов: ' + (await O.listOrders(db)).length));
  if (kind === 'sqlite') { const cp = await DBL.open(path.join(tmp, 'copy.db')); ok((await O.listOrders(cp)).length === cnt, T('2.10 копия базы неполная')); await cp.close(); }
  ok((await O.createOrder(db, person([{ n: 'Кешью', qty: 1 }]), CAT)).no === 5001 + cnt, T('2.10 нумерация продолжилась без пропусков'));

  /* ---------- 3. Очередь копий в таблицу: сбой → повтор, без дублей ---------- */
  await OB.runOnce(db, O.getOrder, async () => ({ ok: false, error: 'таблица недоступна' }), 100);
  const st1 = await OB.stats(db);
  ok(st1.retry > 0 && !st1.done, T('3. после сбоя задачи не ушли в повтор: ' + JSON.stringify(st1)));
  await db.run("UPDATE outbox SET next_at = '2000-01-01'");
  const sent = [];
  await OB.runOnce(db, O.getOrder, async p => { sent.push(p); return { ok: true }; }, 100);
  const st2 = await OB.stats(db);
  ok(!st2.retry && st2.done === sent.length && sent.every(p => /^db-\d+$/.test(p.key) && !('price' in p.items[0])), T('3. очередь: ' + JSON.stringify(st2)));
  await OB.runOnce(db, O.getOrder, async p => { sent.push(p); return { ok: true }; }, 100);
  ok((await OB.stats(db)).done === sent.length, T('3. повторная отправка готовых задач'));
  await db.close();
  await dropDb(spec);
}

/* ---------- 4. Сайт с базой: заказ, повтор параллельно, копия в тестовую таблицу, проверка здоровья ---------- */
async function siteCheck(kind) {
  const T = m => '[' + kind + '] ' + m, spec = await tempDb(kind, 'site');
  const procs = [], run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
  const wait = ms => new Promise(x => setTimeout(x, ms));
  run('test/server.js'); run('server.js', { PORT: 3006, GS_URL: 'http://localhost:8790/api', ORDERS_DB: spec });
  for (let i = 0; i < 40; i++) { try { await fetch('http://localhost:8790/dump'); const h = await fetch('http://localhost:3006/health').then(x => x.json()); if (h.source === 'таблица' && h.db === 'ok') break; } catch (e) {} await wait(250); }
  const post = o => fetch('http://localhost:3006/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: o }) }).then(x => x.json());
  const o4 = person([{ n: 'Морковь', qty: 3 }], { key: 'site-par-0001', total: 882 });
  const res = await Promise.all([post(o4), post(o4), post(o4)]);
  ok(res.every(x => x.ok && x.no === res[0].no), T('4. параллельный повтор: ' + JSON.stringify(res)));
  await wait(3500);
  const rows = ((await fetch('http://localhost:8790/dump').then(x => x.json())).sheets['Заказы с сайта'] || []).filter(x => x && /Заказ на сайте № 5001/.test(x[8] || ''));
  ok(rows.length === 1, T('4. копия в таблицу: строк ' + rows.length));
  const h = await fetch('http://localhost:3006/health').then(x => x.json());
  ok(h.db === 'ok' && h.queue && h.queue.done >= 1 && !h.warn, T('4. проверка здоровья: ' + JSON.stringify(h)));
  procs.forEach(p => p.kill()); await wait(500);
  await dropDb(spec);
}

/* ---------- 5. База недоступна: сайт работает, заказ уходит сразу в таблицу ---------- */
async function noDbCheck() {
  const procs = [], run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
  const wait = ms => new Promise(x => setTimeout(x, ms));
  run('test/server.js'); run('server.js', { PORT: 3007, GS_URL: 'http://localhost:8790/api', ORDERS_DB: 'postgres://u:p@127.0.0.1:1/nope?sslmode=disable' });
  let h = null;
  for (let i = 0; i < 40; i++) { try { await fetch('http://localhost:8790/dump'); const x = await fetch('http://localhost:3007/health'); h = Object.assign(await x.json(), { status: x.status }); if (h.source === 'таблица') break; } catch (e) {} await wait(250); }
  ok(h && h.status === 200 && h.warn && /ошибка|подключается/.test(h.db) && !/u:p|nope/.test(JSON.stringify(h)), '5. /health без базы: ' + JSON.stringify(h));
  const r = await fetch('http://localhost:3007/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: person([{ n: 'Морковь', qty: 3 }], { key: 'nodb-000001' }) }) }).then(x => x.json());
  ok(r.ok, '5. заказ без базы не принят: ' + JSON.stringify(r));
  const adm = await fetch('http://localhost:3007/admin', { redirect: 'manual' });
  ok(adm.status === 503, '5. кабинет без базы: ' + adm.status);
  procs.forEach(p => p.kill()); await wait(500);
}

(async () => {
  const kinds = ['sqlite'].concat(PGT ? ['postgres'] : []);
  if (!PGT) console.log('PostgreSQL не проверяется (нет PG_TEST_URL)');
  for (const k of kinds) { await suite(k); await siteCheck(k); console.log('2–4. ' + k + ' проверено'); }
  await noDbCheck();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ошибок:', fail.length, fail);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
