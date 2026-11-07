/* Очередь задач после записи заказа: копия в Google Таблицу (там же письмо владельцу).
   Заказ сначала надёжно записан в базу; если таблица не ответила — повторим позже, заказ не теряется и не дублируется
   (в таблицу уходит постоянный ключ db-<номер>, повтор даёт ту же строку). */
'use strict';
const P = require('./pricing.js');
const now = () => new Date().toISOString();
const BACKOFF = [1, 2, 5, 15, 30, 60, 180, 360];             /* минуты между попытками */

function sheetPayload(o) {
  const co = o.company || null;
  return { who: o.who, zone: o.zone, name: o.name, phone: o.phone, email: o.email, addr: o.addr,
    comment: ('Заказ на сайте № ' + o.no + (o.price_ok ? '' : ' · ЦЕНЫ НЕ ПОДТВЕРЖДЕНЫ') + (o.comment ? ' · ' + o.comment : '')).slice(0, 500),
    company: co, key: 'db-' + o.no,
    items: o.items.map(i => ({ n: i.name, qty: i.qty_g / 1000, mode: i.mode })) };
}

/* Обработать задачи, срок которых подошёл. send(order) → Promise<{ok, error}>. Возвращает число обработанных. */
async function runOnce(db, getOrder, send, limit) {
  const due = await db.all("SELECT * FROM outbox WHERE status IN ('new','retry') AND next_at <= ? ORDER BY id LIMIT ?", now(), limit || 10);
  let n = 0;
  for (const j of due) {
    /* «занять» задачу, чтобы параллельный запуск её не взял */
    const took = await db.run("UPDATE outbox SET status = 'working', attempts = attempts + 1 WHERE id = ? AND status IN ('new','retry')", j.id);
    if (!took.changes) continue;
    try {
      if (j.kind !== 'sheet_copy') throw new Error('неизвестная задача ' + j.kind);
      const o = await getOrder(db, JSON.parse(j.payload).id || (await db.get('SELECT id FROM orders WHERE no = ?', +j.ref)).id);
      const r = await send(sheetPayload(o));
      if (!r || !r.ok) throw new Error((r && r.error) || 'таблица не ответила');
      await db.run("UPDATE outbox SET status = 'done', done_at = ?, last_error = NULL WHERE id = ?", now(), j.id);
      n++;
    } catch (e) {
      const a = j.attempts + 1, wait = BACKOFF[Math.min(a - 1, BACKOFF.length - 1)];
      const st = a >= 20 ? 'failed' : 'retry';
      await db.run('UPDATE outbox SET status = ?, next_at = ?, last_error = ? WHERE id = ?',
        st, new Date(Date.now() + wait * 60000).toISOString(), String(e.message || e).slice(0, 300), j.id);
    }
  }
  return n;
}

/* Задачи, которые «зависли» в работе (сервер перезапустили посреди отправки), — вернуть в очередь. */
async function recover(db) { return (await db.run("UPDATE outbox SET status = 'retry' WHERE status = 'working'")).changes; }
async function stats(db) { return (await db.all("SELECT status, COUNT(*) AS n FROM outbox GROUP BY status")).reduce((m, r) => (m[r.status] = r.n, m), {}); }

module.exports = { runOnce, recover, stats, sheetPayload };
