/* База заказов магазина. Сейчас — SQLite, встроенная в Node.js 22.5+ (файл на диске сервера, ничего устанавливать не нужно).
   Все запросы — в этом файле и в lib/orders.js; переход на PostgreSQL = замена этого файла с тем же набором функций.
   Деньги — целые копейки (INTEGER), вес — целые граммы. */
'use strict';
let DatabaseSync;
function driver() {
  if (DatabaseSync) return DatabaseSync;
  const warn = process.emitWarning; process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...a));
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = warn; }
  return DatabaseSync;
}

const MIGRATIONS = [
`CREATE TABLE counters (name TEXT PRIMARY KEY, v INTEGER NOT NULL);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  no INTEGER NOT NULL UNIQUE,
  idem_key TEXT UNIQUE,
  req_hash TEXT,
  channel TEXT NOT NULL,
  who TEXT NOT NULL CHECK (who IN ('nonds','nds')),
  zone TEXT NOT NULL CHECK (zone IN ('msk','mo')),
  name TEXT, phone TEXT NOT NULL, email TEXT, addr TEXT NOT NULL, comment TEXT, company TEXT,
  goods_k INTEGER NOT NULL CHECK (goods_k >= 0), fee_k INTEGER NOT NULL CHECK (fee_k >= 0), vat_k INTEGER NOT NULL CHECK (vat_k >= 0), total_k INTEGER NOT NULL CHECK (total_k >= 0),
  final_goods_k INTEGER, final_fee_k INTEGER, final_vat_k INTEGER, final_total_k INTEGER,
  paid_k INTEGER NOT NULL DEFAULT 0 CHECK (paid_k >= 0),
  has_weight INTEGER NOT NULL,
  price_ok INTEGER NOT NULL,
  catalog_at TEXT,
  order_status TEXT NOT NULL, payment_status TEXT NOT NULL, fulfillment_status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  pos INTEGER NOT NULL,
  product_key TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('kg','pack')), weighed INTEGER NOT NULL,
  opt_k INTEGER NOT NULL, retail_k INTEGER, th_g INTEGER,
  qty_g INTEGER NOT NULL CHECK (qty_g > 0), price_k INTEGER NOT NULL CHECK (price_k >= 0), sum_k INTEGER NOT NULL CHECK (sum_k >= 0),
  actual_g INTEGER, final_price_k INTEGER, final_sum_k INTEGER,
  UNIQUE (order_id, pos)
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL, method TEXT, ext_id TEXT,
  amount_k INTEGER NOT NULL CHECK (amount_k >= 0),
  authorized_k INTEGER NOT NULL DEFAULT 0, captured_k INTEGER NOT NULL DEFAULT 0, refunded_k INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, basis TEXT, paid_on TEXT, created_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (provider, ext_id)
);
CREATE TABLE payment_events (
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, event_hash TEXT NOT NULL UNIQUE, payload TEXT, verified INTEGER NOT NULL, result TEXT, created_at TEXT NOT NULL
);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), number TEXT NOT NULL, date TEXT NOT NULL,
  amount_k INTEGER NOT NULL CHECK (amount_k > 0), url TEXT, version INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE status_history (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), field TEXT NOT NULL, from_v TEXT, to_v TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT, at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, data TEXT, at TEXT NOT NULL
);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, last_error TEXT,
  created_at TEXT NOT NULL, done_at TEXT, UNIQUE (kind, ref)
);
CREATE INDEX orders_status ON orders(order_status, payment_status, fulfillment_status);
CREATE INDEX orders_created ON orders(created_at);
CREATE INDEX outbox_due ON outbox(status, next_at);`
];

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (x) {} throw e; }
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const cur = db.prepare('SELECT MAX(v) AS v FROM schema_version').get().v || 0;
  for (let i = cur; i < MIGRATIONS.length; i++) tx(db, () => { db.exec(MIGRATIONS[i]); db.prepare('INSERT INTO schema_version (v) VALUES (?)').run(i + 1); });
  return MIGRATIONS.length;
}

function open(file) {
  const db = new (driver())(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;');
  migrate(db);
  return db;
}

/* Копия базы целиком в один файл (можно делать на работающем сайте). */
function backup(db, file) { db.exec("VACUUM INTO '" + String(file).replace(/'/g, "''") + "'"); return file; }

/* Проверка, что база жива и записи доступны. */
function check(db) { return db.prepare('SELECT COUNT(*) AS n FROM orders').get().n; }

module.exports = { open, tx, backup, check, migrate };
