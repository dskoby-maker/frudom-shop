/* Проверка базы заказов и статусов (этап 2). Без браузера, без настоящих заказов, писем и платежей.
   Запуск: node test/orders-db.js → в конце «ошибок: 0». */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = require('../lib/pricing.js'), DBL = require('../lib/db.js'), O = require('../lib/orders.js'), OB = require('../lib/outbox.js');
const fail = [], ok = (c, m) => { if (!c) fail.push(m); };
const throwsCode = (fn, code, m) => { try { fn(); fail.push(m + ': не было отказа'); } catch (e) { if (e.code !== code) fail.push(m + ': ' + e.code + ' ' + e.message); } };
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
const file = path.join(tmp, 'orders.db');
let db = DBL.open(file);
const person = (items, extra) => Object.assign({ who: 'nonds', zone: 'msk', phone: '+7 999 000-00-00', addr: 'Москва', items }, extra || {});
const co = { name: 'ООО Тест', inn: '7701234567', email: 'buh@test.ru', daddr: 'Москва' };

/* 2.1 обычный заказ */
let r = O.createOrder(db, person([{ n: 'Кешью', qty: 2 }], { key: 'k-person-0001', total: 3070 }), CAT);
ok(r.ok && r.no === 5001 && r.total === 3070 && r.status === 'placed', '2.1 заказ: ' + JSON.stringify(r));
/* 2.2 повтор — тот же заказ; тот же ключ с другим составом — отказ */
const r2 = O.createOrder(db, person([{ n: 'Кешью', qty: 2 }], { key: 'k-person-0001', total: 3070 }), CAT);
ok(r2.ok && r2.no === 5001 && O.listOrders(db).length === 1, '2.2 повтор создал второй заказ');
ok(O.createOrder(db, person([{ n: 'Кешью', qty: 3 }], { key: 'k-person-0001' }), CAT).code === 'key_reused', '2.2 ключ с другим составом принят');
/* 2.3 подмена, неизвестный товар, расхождение суммы */
ok(O.createOrder(db, person([{ n: 'Кешью', qty: 1, price: 1 }]), CAT).goods === 1190, '2.3 цена из браузера');
ok(O.createOrder(db, person([{ n: 'Золото', qty: 1 }]), CAT).code === 'unknown_item', '2.3 неизвестный товар');
ok(O.createOrder(db, person([{ n: 'Кешью', qty: 1 }], { total: 10 }), CAT).code === 'prices_changed', '2.3 расхождение суммы');

/* 2.4 устаревший каталог: заказ принят, но цены не подтверждены — ни счёта, ни сборки, ни оплаты до пересчёта */
r = O.createOrder(db, person([{ n: 'Морковь', qty: 3 }]), STALE);
ok(r.ok && !r.priceOk && r.status === 'awaiting_manager_review', '2.4 заказ при устаревшем каталоге: ' + JSON.stringify(r));
throwsCode(() => O.startPicking(db, r.id, M), 'price_unconfirmed', '2.4 сборка без подтверждения цен');
throwsCode(() => O.confirmTransfer(db, r.id, { amountK: 100, basis: 'п/п 1', date: '2026-11-07' }, M), 'price_unconfirmed', '2.4 оплата без подтверждения цен');
throwsCode(() => O.reprice(db, r.id, STALE, M), 'catalog', '2.4 пересчёт по запасному файлу');
let g = O.reprice(db, r.id, CAT, M);
ok(g.price_ok === 1 && g.order_status === 'placed' && g.total_k === 88200, '2.4 пересчёт: ' + JSON.stringify([g.price_ok, g.order_status, g.total_k]));

/* 2.5 весовой товар: холд «1000 ₽» → факт меньше и больше; без полной оплаты не отгрузить */
r = O.createOrder(db, person([{ n: 'Морковь', qty: 10 }]), CAT);            /* 640 + 690 = 1330 */
const id5 = r.id;
throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'bad_transition', '2.5 к отгрузке до сборки');
O.startPicking(db, id5, M);
throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'not_weighed', '2.5 к отгрузке без взвешивания');
g = O.setWeights(db, id5, [11500], M);                                     /* 11,5 кг × 64 = 736 + 690 = 1426 */
ok(g.final_total_k === 142600 && g.fulfillment_status === 'weighed', '2.5 итог после веса: ' + g.final_total_k);
O.confirmTransfer(db, id5, { amountK: 133000, basis: 'оплата по ссылке', date: '2026-11-07', method: 'link' }, M);
g = O.getOrder(db, id5);
ok(g.due_k === 9600, '2.5 «нужна доплата» 96 ₽: ' + g.due_k);
throwsCode(() => O.setFulfillment(db, id5, 'ready_to_ship', M), 'unpaid', '2.5 отгрузка с недоплатой');
O.confirmTransfer(db, id5, { amountK: 9600, basis: 'доплата', date: '2026-11-07', method: 'link' }, M);
O.setFulfillment(db, id5, 'ready_to_ship', M); O.setFulfillment(db, id5, 'shipped', M); g = O.setFulfillment(db, id5, 'delivered', M);
ok(g.order_status === 'completed' && g.fulfillment_status === 'delivered', '2.5 доставка: ' + g.order_status);
throwsCode(() => O.setFulfillment(db, id5, 'picking', M), 'bad_transition', '2.5 из «доставлен» в «сборку»');
throwsCode(() => O.cancelOrder(db, id5, 'передумали', M), 'paid', '2.5 отмена оплаченного');
/* порог опта по факту: картофель 19 кг по кг (поштучно) → взвесили 21 кг → оптовая цена */
r = O.createOrder(db, person([{ n: 'Картофель', qty: 19, mode: 'kg' }]), CAT);
O.startPicking(db, r.id, M); g = O.setWeights(db, r.id, [21000], M);
ok(g.items[0].final_price_k === 6395 && g.final_goods_k === Math.round(6395 * 21), '2.5 порог опта по факту: ' + g.items[0].final_price_k);

/* 2.6 заказ со счётом: сборка только после оплаты */
r = O.createOrder(db, person([{ n: 'Кешью', qty: 5 }], { who: 'nds', company: co, total: 7304 }), CAT);
ok(r.ok && r.status === 'awaiting_manager_review' && r.vat === 664, '2.6 заказ со счётом: ' + JSON.stringify(r));
throwsCode(() => O.startPicking(db, r.id, M), 'unpaid', '2.6 сборка до оплаты');
throwsCode(() => O.issueInvoice(db, r.id, { number: '' }, M), 'invoice', '2.6 счёт без номера');
g = O.issueInvoice(db, r.id, { number: 'СЧ-17', date: '2026-11-07' }, M);
ok(g.order_status === 'awaiting_bank_transfer' && g.invoices[0].amount_k === 730400 && g.payment_status === 'not_started', '2.6 счёт выставлен ≠ оплачен');
throwsCode(() => O.confirmTransfer(db, r.id, { amountK: 730400, date: '2026-11-07' }, M), 'basis', '2.6 оплата без основания');
g = O.confirmTransfer(db, r.id, { amountK: 730400, basis: 'п/п № 512', date: '2026-11-07' }, M);
ok(g.order_status === 'processing' && g.payment_status === 'manual_transfer_confirmed', '2.6 после оплаты: ' + g.order_status);
O.startPicking(db, r.id, M); g = O.setFulfillment(db, r.id, 'ready_to_ship', M);
ok(g.fulfillment_status === 'ready_to_ship', '2.6 без весового — к отгрузке после оплаты');

/* 2.7 одновременная правка двумя менеджерами */
r = O.createOrder(db, person([{ n: 'Кешью', qty: 1 }]), CAT);
const v = O.getOrder(db, r.id).version;
O.startPicking(db, r.id, 'Наталья', v);
throwsCode(() => O.cancelOrder(db, r.id, 'дубль', 'Даниил', v), 'conflict', '2.7 вторая правка по старой версии');
throwsCode(() => O.startPicking(db, r.id, ''), 'actor', '2.7 действие без имени');

/* 2.8 отмена */
r = O.createOrder(db, person([{ n: 'Кешью', qty: 1 }]), CAT);
throwsCode(() => O.cancelOrder(db, r.id, '', M), 'reason', '2.8 отмена без причины');
g = O.cancelOrder(db, r.id, 'клиент отказался', M);
ok(g.order_status === 'cancelled' && g.payment_status === 'cancelled', '2.8 отмена');
throwsCode(() => O.startPicking(db, r.id, M), 'cancelled', '2.8 сборка отменённого');

/* 2.9 история и журнал, ограничения базы (деньги не бывают отрицательными) */
ok(db.prepare('SELECT COUNT(*) n FROM status_history').get().n > 20 && db.prepare('SELECT COUNT(*) n FROM audit_log').get().n > 10, '2.9 история/журнал пусты');
throwsCode(() => { try { db.prepare('UPDATE orders SET paid_k = -1 WHERE id = 1').run(); } catch (e) { e.code = 'db'; throw e; } }, 'db', '2.9 база приняла отрицательную сумму');

/* 2.10 переживает перезапуск, копия открывается */
const cnt = O.listOrders(db).length;
DBL.backup(db, path.join(tmp, 'copy.db')); db.close();
db = DBL.open(file);
ok(O.listOrders(db).length === cnt, '2.10 после перезапуска заказов: ' + O.listOrders(db).length);
const cp = DBL.open(path.join(tmp, 'copy.db')); ok(O.listOrders(cp).length === cnt, '2.10 копия базы неполная'); cp.close();
ok(O.createOrder(db, person([{ n: 'Кешью', qty: 1 }]), CAT).no === 5001 + cnt, '2.10 нумерация продолжилась');

/* ---------- 3. Очередь копий в таблицу: сбой → повтор, без дублей ---------- */
(async () => {
  let calls = 0;
  const bad = async () => { calls++; return { ok: false, error: 'таблица недоступна' }; };
  await OB.runOnce(db, O.getOrder, bad, 100);
  const st1 = OB.stats(db);
  ok(st1.retry > 0 && !st1.done, '3. после сбоя задачи не ушли в повтор: ' + JSON.stringify(st1));
  db.prepare("UPDATE outbox SET next_at = '2000-01-01'").run();
  const sent = [];
  await OB.runOnce(db, O.getOrder, async p => { sent.push(p); return { ok: true }; }, 100);
  const st2 = OB.stats(db);
  ok(!st2.retry && st2.done === sent.length && sent.every(p => /^db-\d+$/.test(p.key) && !('price' in p.items[0])), '3. очередь: ' + JSON.stringify(st2));
  await OB.runOnce(db, O.getOrder, async p => { sent.push(p); return { ok: true }; }, 100);
  ok(OB.stats(db).done === sent.length, '3. повторная отправка готовых задач');
  db.close();

  /* ---------- 4. Сайт с базой: заказ, повтор параллельно, копия в тестовую таблицу, проверка здоровья ---------- */
  const procs = [], run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
  const wait = ms => new Promise(x => setTimeout(x, ms));
  run('test/server.js'); run('server.js', { PORT: 3006, GS_URL: 'http://localhost:8790/api', ORDERS_DB: path.join(tmp, 'site.db') });
  for (let i = 0; i < 40; i++) { try { await fetch('http://localhost:8790/dump'); const h = await fetch('http://localhost:3006/health').then(x => x.json()); if (h.source === 'таблица') break; } catch (e) {} await wait(250); }
  const post = o => fetch('http://localhost:3006/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: o }) }).then(x => x.json());
  const o4 = person([{ n: 'Морковь', qty: 3 }], { key: 'site-par-0001', total: 882 });
  const res = await Promise.all([post(o4), post(o4), post(o4)]);
  ok(res.every(x => x.ok && x.no === res[0].no), '4. параллельный повтор: ' + JSON.stringify(res.map(x => x.no)));
  await wait(3500);
  const rows = ((await fetch('http://localhost:8790/dump').then(x => x.json())).sheets['Заказы с сайта'] || []).filter(x => x && /Заказ на сайте № 5001/.test(x[8] || ''));
  ok(rows.length === 1, '4. копия в таблицу: строк ' + rows.length);
  const h = await fetch('http://localhost:3006/health').then(x => x.json());
  ok(h.db === 'ok' && h.queue && h.queue.done >= 1, '4. проверка здоровья: ' + JSON.stringify(h));
  procs.forEach(p => p.kill());

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ошибок:', fail.length, fail);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
