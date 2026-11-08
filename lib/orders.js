/* Заказы: создание, статусы, действия менеджера. Всё, что меняет заказ, — в одной транзакции вместе с историей и журналом.
   Три независимых статуса:
     order_status       — что с заказом в целом;
     payment_status     — что с деньгами (резерв ≠ оплата);
     fulfillment_status — сборка и отгрузка.
   Главное правило: отгрузить (ready_to_ship / shipped) можно только если оплачена вся окончательная сумма. */
'use strict';
const crypto = require('crypto');
const P = require('./pricing.js');

const ORDER = {
  placed: ['processing', 'cancelled'],
  awaiting_manager_review: ['placed', 'invoice_issued', 'cancelled'],
  invoice_issued: ['awaiting_bank_transfer', 'cancelled'],
  awaiting_bank_transfer: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [], cancelled: []
};
const PAYMENT = {
  not_started: ['pending', 'manual_transfer_confirmed', 'cancelled'],
  pending: ['authorized', 'captured', 'failed', 'cancelled', 'expired', 'requires_reconciliation'],
  authorized: ['captured', 'cancelled', 'expired', 'requires_reconciliation'],
  captured: ['partially_refunded', 'refunded', 'requires_reconciliation'],
  partially_refunded: ['partially_refunded', 'refunded'],
  manual_transfer_confirmed: ['manual_transfer_confirmed', 'partially_refunded', 'refunded'],
  failed: ['pending', 'cancelled'], expired: ['pending', 'cancelled'], cancelled: ['pending'],
  requires_reconciliation: ['authorized', 'captured', 'failed', 'cancelled', 'expired'],
  refunded: []
};
const FULFILL = {
  not_released: ['picking'],
  picking: ['weighed', 'ready_to_ship', 'not_released'],
  weighed: ['picking', 'weighed', 'ready_to_ship'],
  ready_to_ship: ['shipped', 'picking'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'], returned: []
};
const MACHINES = { order_status: ORDER, payment_status: PAYMENT, fulfillment_status: FULFILL };
const PAID = new Set(['captured', 'manual_transfer_confirmed']);

class OrderError extends Error { constructor(msg, code, extra) { super(msg); this.code = code || 'invalid'; Object.assign(this, extra || {}); } }
const now = () => new Date().toISOString();
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);

function canMove(field, from, to) { return (MACHINES[field][from] || []).includes(to); }

/* Сумма к оплате: после взвешивания — окончательная, до — по заказу. */
const dueK = o => (o.final_total_k != null ? o.final_total_k : o.total_k);

async function nextNo(db) {
  const start = parseInt(process.env.ORDER_NO_START || '5001', 10) || 5001;
  const r = await db.get('SELECT v FROM counters WHERE name = ?', 'order_no');
  const v = r ? r.v + 1 : start;
  await db.run('INSERT INTO counters (name, v) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET v = excluded.v', 'order_no', v);
  return v;
}

async function audit(db, actor, action, entity, id, data) {
  await db.run('INSERT INTO audit_log (actor, action, entity, entity_id, data, at) VALUES (?, ?, ?, ?, ?, ?)', actor, action, entity, id == null ? null : id, data == null ? null : JSON.stringify(data), now());
}

/* Сменить статус с проверкой перехода; пишет историю. Вызывать только внутри транзакции. */
async function move(db, o, field, to, actor, reason) {
  const from = o[field];
  if (from === to && !(MACHINES[field][from] || []).includes(to)) return;
  if (!canMove(field, from, to)) throw new OrderError('нельзя перевести «' + field + '» из «' + from + '» в «' + to + '»', 'bad_transition', { field, from, to });
  if (field === 'fulfillment_status' && (to === 'ready_to_ship' || to === 'shipped')) assertPaid(o);
  await db.run('UPDATE orders SET ' + field + ' = ?, version = version + 1, updated_at = ? WHERE id = ?', to, now(), o.id);
  await db.run('INSERT INTO status_history (order_id, field, from_v, to_v, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)', o.id, field, from, to, actor, reason || null, now());
  o[field] = to; o.version++;
}

function assertPaid(o) {
  if (o.order_status === 'cancelled') throw new OrderError('заказ отменён', 'cancelled');
  if (o.has_weight && o.final_total_k == null) throw new OrderError('сначала введите фактический вес', 'not_weighed');
  if (!PAID.has(o.payment_status) || o.paid_k < dueK(o))
    throw new OrderError('нельзя отгрузить: не оплачено ' + ((dueK(o) - o.paid_k) / 100).toFixed(2) + ' ₽', 'unpaid', { dueK: dueK(o) - o.paid_k });
}

async function load(db, id, expectVersion) {
  const o = await db.get('SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new OrderError('заказ не найден', 'not_found');
  if (expectVersion != null && o.version !== expectVersion) throw new OrderError('заказ уже изменил другой менеджер — обновите страницу', 'conflict');
  return o;
}

async function enqueue(db, kind, ref, payload) {
  await db.run('INSERT INTO outbox (kind, ref, payload, next_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, ref) DO NOTHING', kind, String(ref), JSON.stringify(payload), now(), now());
}

/* ===== Создание заказа =====
   input — то, что прислал браузер (товар, количество, способ, контакты, итог для сверки, ключ повтора).
   catalog — {items, source, at} из lib/data.js. Если каталог не из таблицы или старше maxStaleMs —
   заказ принимается, но цены «не подтверждены»: оплата и счёт недоступны, пока менеджер не пересчитает. */
async function createOrder(db, input, catalog, opt) {
  opt = opt || {};
  const o = input && typeof input === 'object' ? input : {};
  const phone = str(o.phone, 40), co = o.company && typeof o.company === 'object' ? o.company : null;
  if (phone.replace(/\D/g, '').length < 10) return { ok: false, code: 'contacts', error: 'укажите телефон' };
  const c = P.calc(o, catalog.items || []);
  if (!c.ok) return c;
  if (c.who === 'nds') {
    if (!co || !str(co.name)) return { ok: false, code: 'contacts', error: 'укажите название компании' };
    if (!/^\d{10}(\d{2})?$/.test(str(co.inn))) return { ok: false, code: 'contacts', error: 'ИНН — 10 цифр для компании или 12 для ИП' };
    if (!/.+@.+\..+/.test(str(co.email, 100))) return { ok: false, code: 'contacts', error: 'укажите email для счёта' };
  }
  const addr = str(o.addr || (co && co.daddr), 300);
  if (!addr) return { ok: false, code: 'contacts', error: 'укажите адрес доставки' };
  const shown = o.total === undefined || o.total === null || o.total === '' ? null : Math.round(Number(String(o.total).replace(',', '.')) * 100);
  if (shown != null && (!isFinite(shown) || Math.abs(shown - c.totalK) > 100))
    return { ok: false, code: 'prices_changed', error: 'цены обновились — проверьте сумму и отправьте заказ ещё раз', total: P.rub(c.totalK),
      lines: c.lines.map(l => ({ n: l.n, qty: l.g / 1000, price: P.rub(l.priceK) })) };
  const maxStale = opt.maxStaleMs == null ? 30 * 60 * 1000 : opt.maxStaleMs;
  const priceOk = catalog.source === 'таблица' && catalog.at && (Date.now() - catalog.at) <= maxStale ? 1 : 0;
  const key = /^[A-Za-z0-9_-]{8,64}$/.test(String(o.key || '')) ? String(o.key) : null;
  const reqHash = crypto.createHash('sha256').update(JSON.stringify([c.who, c.zone, c.lines.map(l => [l.n, l.mode, l.g]), phone])).digest('hex');

  return db.tx(async () => {
    if (key) {
      const was = await db.get('SELECT * FROM orders WHERE idem_key = ?', key);
      if (was) {
        if (was.req_hash !== reqHash) return { ok: false, code: 'key_reused', error: 'заказ изменился — отправьте ещё раз' };
        return result(was);
      }
    }
    const t = now(), no = await nextNo(db), nds = c.who === 'nds';
    const st = !priceOk || nds ? 'awaiting_manager_review' : 'placed';
    const r = await db.run(`INSERT INTO orders (no, idem_key, req_hash, channel, who, zone, name, phone, email, addr, comment, company,
      goods_k, fee_k, vat_k, total_k, has_weight, price_ok, catalog_at, order_status, payment_status, fulfillment_status, created_at, updated_at, customer_id, src)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'not_released', ?, ?, ?, ?)`,
      no, key, reqHash, str(opt.channel || 'site', 20), c.who, c.zone, str(nds ? co.name : o.name, 100), phone, str(nds ? co.email : o.email, 100), addr, str(o.comment, 500),
      co ? JSON.stringify(['inn', 'kpp', 'ogrn', 'name', 'addr', 'email', 'phone', 'daddr'].reduce((m, k) => { m[k] = str(co[k], 300); return m; }, {})) : null,
      c.goodsK, c.feeK, c.vatK, c.totalK, c.lines.some(l => l.w) ? 1 : 0, priceOk, catalog.updated || null, st, t, t,
      opt.customerId || null, str(o.src, 300) || null);
    const id = r.id;
    await insItems(db, id, c.lines);
    await db.run('INSERT INTO status_history (order_id, field, from_v, to_v, actor, reason, at) VALUES (?, ?, NULL, ?, ?, ?, ?)', id, 'order_status', st, 'site', priceOk ? null : 'цены не подтверждены: каталог устарел или из запасного файла', t);
    await audit(db, 'site', 'order.create', 'order', id, { no, totalK: c.totalK, priceOk });
    const o2 = await load(db, id);
    await enqueue(db, 'sheet_copy', no, { no });              /* копия в Google Таблицу и письмо — после записи, через очередь */
    return result(o2);
  });
}

/* Записать строки заказа (позиция = порядок в заказе) */
async function insItems(db, id, lines) {
  for (let i = 0; i < lines.length; i++) { const l = lines[i];
    await db.run(`INSERT INTO order_items (order_id, pos, product_key, name, mode, weighed, opt_k, retail_k, th_g, qty_g, price_k, sum_k) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, i, String(l.key), l.n, l.mode, l.w, l.optK, l.retailK, l.thG, l.g, l.priceK, l.sumK); }
}

function result(o) {
  return { ok: true, no: o.no, id: o.id, total: P.rub(o.total_k), goods: P.rub(o.goods_k), fee: P.rub(o.fee_k), vat: P.rub(o.vat_k),
    priceOk: !!o.price_ok, status: o.order_status };
}

/* ===== Чтение ===== */
async function getOrder(db, id) {
  const o = await load(db, id);
  o.items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY pos', id);
  o.payments = await db.all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', id);
  o.invoices = await db.all('SELECT * FROM invoices WHERE order_id = ? ORDER BY id', id);
  o.history = await db.all('SELECT * FROM status_history WHERE order_id = ? ORDER BY id', id);
  o.company = o.company ? JSON.parse(o.company) : null;
  o.due_k = dueK(o) - o.paid_k;
  return o;
}
async function listOrders(db, f) {
  f = f || {};
  const where = [], args = [];
  for (const k of ['order_status', 'payment_status', 'fulfillment_status', 'who']) if (f[k]) { where.push(k + ' = ?'); args.push(f[k]); }
  if (f.no) { where.push('no = ?'); args.push(+f.no); }
  if (f.from) { where.push('created_at >= ?'); args.push(f.from); }
  if (f.to) { where.push('created_at < ?'); args.push(f.to); }
  return db.all('SELECT * FROM orders' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC LIMIT ' + Math.min(500, +f.limit || 100), ...args);
}

/* ===== Действия менеджера. actor — кто делает; version — версия заказа, которую видел менеджер (защита от одновременной правки). ===== */
async function act(db, id, actor, version, name, fn) {
  if (!actor) throw new OrderError('неизвестно, кто делает действие', 'actor');
  return db.tx(async () => { const o = await load(db, id, version); const r = await fn(o); await audit(db, actor, name, 'order', id, r && r.audit); return getOrder(db, id); });
}

/* Пересчитать цены по свежему каталогу (если заказ принят при устаревшем каталоге) и подтвердить их. */
async function reprice(db, id, catalog, actor, version) {
  if (catalog.source !== 'таблица') throw new OrderError('каталог из запасного файла — цены подтвердить нельзя', 'catalog');
  return act(db, id, actor, version, 'order.reprice', async o => {
    if (o.payment_status !== 'not_started') throw new OrderError('по заказу уже есть оплата — пересчёт запрещён', 'paid');
    const items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY pos', id);
    const c = P.calc({ who: o.who, zone: o.zone, items: items.map(i => ({ n: i.name, qty: i.qty_g / 1000, mode: i.mode })) }, catalog.items);
    if (!c.ok) throw new OrderError('не удалось пересчитать: ' + c.error, c.code);
    await db.run('DELETE FROM order_items WHERE order_id = ?', id);
    await insItems(db, id, c.lines);
    await db.run('UPDATE orders SET goods_k = ?, fee_k = ?, vat_k = ?, total_k = ?, price_ok = 1, catalog_at = ?, version = version + 1, updated_at = ? WHERE id = ?', c.goodsK, c.feeK, c.vatK, c.totalK, catalog.updated || null, now(), id);
    o.version++;
    if (o.who === 'nonds' && o.order_status === 'awaiting_manager_review') await move(db, o, 'order_status', 'placed', actor, 'цены подтверждены');
    return { audit: { was: o.total_k, now: c.totalK } };
  });
}

/* Счёт (заказ с НДС): номер, дата, сумма, ссылка на файл. Сумма по умолчанию — к оплате по заказу. */
async function issueInvoice(db, id, inv, actor, version) {
  return act(db, id, actor, version, 'invoice.issue', async o => {
    if (o.who !== 'nds') throw new OrderError('счёт выставляется только по заказу с НДС', 'not_nds');
    if (!o.price_ok) throw new OrderError('сначала подтвердите цены (пересчитать)', 'price_unconfirmed');
    const number = str(inv && inv.number, 40), date = str(inv && inv.date, 10) || now().slice(0, 10);
    const amountK = inv && inv.amountK != null ? Math.round(+inv.amountK) : dueK(o) - o.paid_k;
    if (!number) throw new OrderError('укажите номер счёта', 'invoice');
    if (!(amountK > 0)) throw new OrderError('сумма счёта должна быть больше нуля', 'invoice');
    const ver = (await db.get('SELECT COUNT(*) AS n FROM invoices WHERE order_id = ?', id)).n + 1;
    await db.run('INSERT INTO invoices (order_id, number, date, amount_k, url, version, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, number, date, amountK, str(inv && inv.url, 500) || null, ver, actor, now());
    if (o.order_status === 'awaiting_manager_review') await move(db, o, 'order_status', 'invoice_issued', actor, 'счёт № ' + number);
    if (o.order_status === 'invoice_issued') await move(db, o, 'order_status', 'awaiting_bank_transfer', actor, 'ждём перевод');
    return { audit: { number, amountK, ver } };
  });
}

/* Деньги пришли (перевод по счёту или оплата по ссылке): только вручную, с суммой, датой и основанием. */
async function confirmTransfer(db, id, pay, actor, version) {
  return act(db, id, actor, version, 'payment.confirm_manual', async o => {
    const amountK = Math.round(+(pay && pay.amountK));
    const basis = str(pay && pay.basis, 300), date = str(pay && pay.date, 10);
    if (!(amountK > 0)) throw new OrderError('сумма должна быть больше нуля', 'amount');
    if (!basis) throw new OrderError('укажите основание (номер платёжки / выписки)', 'basis');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new OrderError('укажите дату поступления', 'date');
    if (o.order_status === 'cancelled') throw new OrderError('заказ отменён', 'cancelled');
    if (!o.price_ok) throw new OrderError('сначала подтвердите цены (пересчитать)', 'price_unconfirmed');
    if (o.paid_k + amountK > dueK(o) + 100000) throw new OrderError('сумма намного больше заказа — проверьте', 'amount');
    const t = now();
    await db.run(`INSERT INTO payments (order_id, provider, method, amount_k, captured_k, status, basis, paid_on, created_by, created_at, updated_at)
      VALUES (?, 'manual', ?, ?, ?, 'manual_transfer_confirmed', ?, ?, ?, ?, ?)`, id, str(pay.method, 20) || 'transfer', amountK, amountK, basis, date, actor, t, t);
    await db.run('UPDATE orders SET paid_k = paid_k + ?, version = version + 1, updated_at = ? WHERE id = ?', amountK, t, id);
    o.paid_k += amountK; o.version++;
    if (o.payment_status !== 'manual_transfer_confirmed') await move(db, o, 'payment_status', 'manual_transfer_confirmed', actor, basis);
    if (o.order_status === 'awaiting_bank_transfer') await move(db, o, 'order_status', 'processing', actor, 'оплата получена');
    return { audit: { amountK, basis, date } };
  });
}

/* Начать сборку. С НДС — только после поступления оплаты. Без НДС — после подтверждения цен. */
async function startPicking(db, id, actor, version) {
  return act(db, id, actor, version, 'fulfillment.picking', async o => {
    if (o.order_status === 'cancelled') throw new OrderError('заказ отменён', 'cancelled');
    if (!o.price_ok) throw new OrderError('сначала подтвердите цены (пересчитать)', 'price_unconfirmed');
    if (o.who === 'nds' && !(o.paid_k > 0 && PAID.has(o.payment_status))) throw new OrderError('заказ со счётом собираем после оплаты', 'unpaid');
    if (o.order_status === 'placed') await move(db, o, 'order_status', 'processing', actor);
    await move(db, o, 'fulfillment_status', 'picking', actor);
  });
}

/* Фактический вес: массив граммов по позициям (null — как в заказе). Пересчёт окончательной суммы на сервере. */
async function setWeights(db, id, actualG, actor, version) {
  return act(db, id, actor, version, 'fulfillment.weigh', async o => {
    if (o.fulfillment_status !== 'picking' && o.fulfillment_status !== 'weighed') throw new OrderError('вес вводится во время сборки', 'bad_state');
    const items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY pos', id);
    if (!Array.isArray(actualG) || actualG.length !== items.length) throw new OrderError('укажите вес по каждой позиции', 'weights');
    const g = actualG.map((v, i) => {
      if (v == null || v === '') return items[i].qty_g;
      const n = Math.round(+v);
      if (!isFinite(n) || n < 0 || n > P.MAX_KG * 1000) throw new OrderError('неверный вес у «' + items[i].name + '»', 'weights');
      return n;
    });
    const lines = items.map(i => ({ n: i.name, mode: i.mode, g: i.qty_g, optK: i.opt_k, retailK: i.retail_k, thG: i.th_g }));
    const r = P.reweigh(lines, g, o.who, o.zone);
    for (let i = 0; i < r.lines.length; i++) { const l = r.lines[i]; await db.run('UPDATE order_items SET actual_g = ?, final_price_k = ?, final_sum_k = ? WHERE id = ?', l.g, l.priceK, l.sumK, items[i].id); }
    await db.run('UPDATE orders SET final_goods_k = ?, final_fee_k = ?, final_vat_k = ?, final_total_k = ?, version = version + 1, updated_at = ? WHERE id = ?', r.goodsK, r.feeK, r.vatK, r.totalK, now(), id);
    o.final_total_k = r.totalK; o.version++;
    await move(db, o, 'fulfillment_status', 'weighed', actor, 'итог ' + (r.totalK / 100).toFixed(2) + ' ₽');
    return { audit: { weights: g, totalK: r.totalK, wasK: o.total_k } };
  });
}

/* Готов к отгрузке / отгружен / доставлен — проверка оплаты внутри move(). */
async function setFulfillment(db, id, to, actor, version) {
  if (!['ready_to_ship', 'shipped', 'delivered', 'returned', 'picking'].includes(to)) throw new OrderError('неизвестный шаг', 'bad_state');
  return act(db, id, actor, version, 'fulfillment.' + to, async o => {
    if (to === 'ready_to_ship' && !o.has_weight && o.fulfillment_status === 'picking') { /* без весового товара взвешивать не нужно */ }
    await move(db, o, 'fulfillment_status', to, actor);
    if (to === 'delivered' && o.order_status === 'processing') await move(db, o, 'order_status', 'completed', actor);
  });
}

/* Отмена — только пока нет оплаты и товар не уехал. Возвраты денег — отдельным действием (этап 3). */
async function cancelOrder(db, id, reason, actor, version) {
  return act(db, id, actor, version, 'order.cancel', async o => {
    if (!str(reason)) throw new OrderError('укажите причину отмены', 'reason');
    if (o.paid_k > 0) throw new OrderError('по заказу есть оплата — сначала оформите возврат', 'paid');
    if (['shipped', 'delivered'].includes(o.fulfillment_status)) throw new OrderError('товар уже отгружен', 'shipped');
    await move(db, o, 'order_status', 'cancelled', actor, str(reason));
    if (['not_started', 'failed', 'expired'].includes(o.payment_status)) await move(db, o, 'payment_status', 'cancelled', actor, str(reason));
  });
}

module.exports = { createOrder, getOrder, listOrders, reprice, issueInvoice, confirmTransfer, startPicking, setWeights, setFulfillment, cancelOrder,
  canMove, OrderError, MACHINES, enqueue };
