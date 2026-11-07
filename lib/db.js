/* База заказов магазина. Два варианта с одинаковым набором функций:
     • PostgreSQL — облачная база (ORDERS_DB=postgres://…): основной вариант на хостинге, данные не пропадают при обновлении сайта;
     • SQLite — файл на диске (ORDERS_DB=путь/к/файлу.db): для проверки на своём компьютере.
   Все функции асинхронные: await db.get / all / run / exec, await db.tx(async () => { … }).
   Запросы пишутся с «?», для PostgreSQL они сами превращаются в $1, $2…
   Внутри db.tx все запросы этого действия идут в одной транзакции; остальные запросы ждут её окончания
   (одно соединение, всё по очереди — для магазина этого с запасом).
   Деньги — целые копейки, вес — целые граммы. */
'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const PG = require('./pg.js');

let DatabaseSync;
function sqliteDriver() {
  if (DatabaseSync) return DatabaseSync;
  const warn = process.emitWarning; process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...a));
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = warn; }
  return DatabaseSync;
}

/* {ID} — ключ строки с автонумерацией, {INT} — целое (в PostgreSQL 64 бита) */
const MIGRATIONS = [
`CREATE TABLE counters (name TEXT PRIMARY KEY, v {INT} NOT NULL);
CREATE TABLE orders (
  id {ID},
  no {INT} NOT NULL UNIQUE,
  idem_key TEXT UNIQUE,
  req_hash TEXT,
  channel TEXT NOT NULL,
  who TEXT NOT NULL CHECK (who IN ('nonds','nds')),
  zone TEXT NOT NULL CHECK (zone IN ('msk','mo')),
  name TEXT, phone TEXT NOT NULL, email TEXT, addr TEXT NOT NULL, comment TEXT, company TEXT,
  goods_k {INT} NOT NULL CHECK (goods_k >= 0), fee_k {INT} NOT NULL CHECK (fee_k >= 0), vat_k {INT} NOT NULL CHECK (vat_k >= 0), total_k {INT} NOT NULL CHECK (total_k >= 0),
  final_goods_k {INT}, final_fee_k {INT}, final_vat_k {INT}, final_total_k {INT},
  paid_k {INT} NOT NULL DEFAULT 0 CHECK (paid_k >= 0),
  has_weight {INT} NOT NULL,
  price_ok {INT} NOT NULL,
  catalog_at TEXT,
  order_status TEXT NOT NULL, payment_status TEXT NOT NULL, fulfillment_status TEXT NOT NULL,
  version {INT} NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE order_items (
  id {ID},
  order_id {INT} NOT NULL REFERENCES orders(id),
  pos {INT} NOT NULL,
  product_key TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('kg','pack')), weighed {INT} NOT NULL,
  opt_k {INT} NOT NULL, retail_k {INT}, th_g {INT},
  qty_g {INT} NOT NULL CHECK (qty_g > 0), price_k {INT} NOT NULL CHECK (price_k >= 0), sum_k {INT} NOT NULL CHECK (sum_k >= 0),
  actual_g {INT}, final_price_k {INT}, final_sum_k {INT},
  UNIQUE (order_id, pos)
);
CREATE TABLE payments (
  id {ID},
  order_id {INT} NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL, method TEXT, ext_id TEXT,
  amount_k {INT} NOT NULL CHECK (amount_k >= 0),
  authorized_k {INT} NOT NULL DEFAULT 0, captured_k {INT} NOT NULL DEFAULT 0, refunded_k {INT} NOT NULL DEFAULT 0,
  status TEXT NOT NULL, basis TEXT, paid_on TEXT, created_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (provider, ext_id)
);
CREATE TABLE payment_events (
  id {ID}, provider TEXT NOT NULL, event_hash TEXT NOT NULL UNIQUE, payload TEXT, verified {INT} NOT NULL, result TEXT, created_at TEXT NOT NULL
);
CREATE TABLE invoices (
  id {ID}, order_id {INT} NOT NULL REFERENCES orders(id), number TEXT NOT NULL, date TEXT NOT NULL,
  amount_k {INT} NOT NULL CHECK (amount_k > 0), url TEXT, version {INT} NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE status_history (
  id {ID}, order_id {INT} NOT NULL REFERENCES orders(id), field TEXT NOT NULL, from_v TEXT, to_v TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT, at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id {ID}, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id {INT}, data TEXT, at TEXT NOT NULL
);
CREATE TABLE outbox (
  id {ID}, kind TEXT NOT NULL, ref TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', attempts {INT} NOT NULL DEFAULT 0, next_at TEXT NOT NULL, last_error TEXT,
  created_at TEXT NOT NULL, done_at TEXT, UNIQUE (kind, ref)
);
CREATE INDEX orders_status ON orders(order_status, payment_status, fulfillment_status);
CREATE INDEX orders_created ON orders(created_at);
CREATE INDEX outbox_due ON outbox(status, next_at);`
];
const NO_ID = new Set(['counters', 'schema_version']);       /* таблицы без автонумерации */

/* ---------- драйверы: одинаковые сырые функции q(sql, args) → {rows, changes, id}, script(sql), close() ---------- */
function sqlite(file) {
  const db = new (sqliteDriver())(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;');
  const norm = a => a.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  return {
    kind: 'sqlite', file,
    types: { ID: 'INTEGER PRIMARY KEY', INT: 'INTEGER' }, begin: 'BEGIN IMMEDIATE',
    async q(sql, args) {
      const st = db.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) return { rows: st.all(...norm(args)), changes: 0 };
      const r = st.run(...norm(args));
      return { rows: [], changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    async script(sql) { db.exec(sql); },
    async close() { db.close(); },
    raw: db
  };
}

function postgres(url) {
  const cfg = PG.parseUrl(url);
  let client = null, txc = null;            /* txc — соединение открытой транзакции: если оно оборвалось, запросы не уходят «мимо» неё */
  const conn = async () => { if (txc) return txc; if (!client || !client.alive) client = await PG.connect(cfg); return client; };
  const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
  return {
    kind: 'postgres', host: cfg.host,
    types: { ID: 'BIGSERIAL PRIMARY KEY', INT: 'BIGINT' }, begin: 'BEGIN',
    async q(sql, args) {
      let text = toPg(sql);
      const ins = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql), want = ins && !NO_ID.has(ins[1].toLowerCase()) && !/\bRETURNING\b/i.test(sql);
      if (want) text += ' RETURNING id';
      const r = await (await conn()).query(text, args);
      return { rows: want ? [] : r.rows, changes: r.changes, id: want && r.rows[0] ? r.rows[0].id : undefined };
    },
    async script(sql) {
      if (sql === 'BEGIN') { const c = await conn(); await c.exec(sql); txc = c; return; }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { const c = txc; txc = null; if (!c) return; if (!c.alive && sql === 'ROLLBACK') return; return c.exec(sql); }
      await (await conn()).exec(sql);
    },
    async close() { if (client) client.end(); },
    connect: conn
  };
}

/* ---------- общий слой: очередь, транзакции ---------- */
function wrap(drv) {
  const als = new AsyncLocalStorage();
  let tail = Promise.resolve();
  const lock = fn => { const p = tail.then(fn, fn); tail = p.then(() => {}, () => {}); return p; };
  const inTx = () => { const t = als.getStore(); return t && t.active; };
  const call = fn => (inTx() ? fn() : lock(fn));

  const db = {
    kind: drv.kind, driver: drv,
    get: (sql, ...a) => call(async () => (await drv.q(sql, a)).rows[0]),
    all: (sql, ...a) => call(async () => (await drv.q(sql, a)).rows),
    run: (sql, ...a) => call(async () => { const r = await drv.q(sql, a); return { changes: r.changes, id: r.id }; }),
    exec: sql => call(() => drv.script(sql)),
    /* Всё внутри fn — одна транзакция. Ошибка → откат целиком. */
    tx(fn) {
      if (inTx()) return fn(db);
      return lock(() => {
        const t = { active: true };
        return als.run(t, async () => {
          await drv.script(drv.begin);
          try { const r = await fn(db); await drv.script('COMMIT'); return r; }
          catch (e) { try { await drv.script('ROLLBACK'); } catch (x) {} throw e; }
          finally { t.active = false; }
        });
      });
    },
    close: () => lock(() => drv.close())
  };
  return db;
}

async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const cur = (await db.get('SELECT MAX(v) AS v FROM schema_version')).v || 0;
  const T = db.driver.types;
  for (let i = cur; i < MIGRATIONS.length; i++)
    await db.tx(async () => { await db.exec(MIGRATIONS[i].replace(/\{ID\}/g, T.ID).replace(/\{INT\}/g, T.INT)); await db.run('INSERT INTO schema_version (v) VALUES (?)', i + 1); });
  return MIGRATIONS.length;
}

const isPg = spec => /^postgres(ql)?:\/\//i.test(String(spec || ''));

/* Открыть базу: адрес postgres://… или путь к файлу SQLite. Таблицы создаются сами. */
async function open(spec) {
  const db = wrap(isPg(spec) ? postgres(spec) : sqlite(spec));
  await migrate(db);
  return db;
}

/* Копия базы в файл — только для SQLite. У облачной PostgreSQL копии делает хостинг (включить в панели базы). */
async function backup(db, file) {
  if (db.kind !== 'sqlite') return null;
  await db.exec("VACUUM INTO '" + String(file).replace(/'/g, "''") + "'");
  return file;
}

/* Проверка, что база жива и записи доступны. */
async function check(db) { return (await db.get('SELECT COUNT(*) AS n FROM orders')).n; }

/* Без пароля — для журнала и /health */
function describe(spec) {
  if (!isPg(spec)) return 'файл';
  try { const c = PG.parseUrl(spec); return 'PostgreSQL ' + c.host; } catch (e) { return 'PostgreSQL'; }
}

module.exports = { open, backup, check, migrate, describe, isPg };
