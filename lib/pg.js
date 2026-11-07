/* Маленький клиент PostgreSQL без сторонних библиотек (протокол v3): шифрование TLS, вход по SCRAM-SHA-256 / md5 / паролю,
   запросы с параметрами (значения передаются отдельно от текста запроса — подстановка SQL невозможна).
   Строка подключения: postgres://пользователь:пароль@адрес:порт/база?sslmode=require
     sslmode: disable — без шифрования (только для проверки на своём компьютере), require — шифровать (по умолчанию),
              verify-full — шифровать и проверять сертификат (корневой сертификат — в PGSSLROOTCERT, путь к файлу).
   Один клиент = одно соединение; запросы выполняются строго по очереди. */
'use strict';
const net = require('net'), tls = require('tls'), crypto = require('crypto'), fs = require('fs');

const NUM = new Set([20, 21, 23, 26, 700, 701, 1700]);       /* int8, int2, int4, oid, float4, float8, numeric → число */

function parseUrl(s) {
  const u = new URL(String(s).replace(/^postgresql:/, 'postgres:'));
  if (u.protocol !== 'postgres:') throw new Error('адрес базы должен начинаться с postgres://');
  return { host: u.hostname, port: +u.port || 5432, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || decodeURIComponent(u.username), ssl: u.searchParams.get('sslmode') || 'require' };
}

class PgError extends Error {
  constructor(f) { super(f.M || 'ошибка базы'); this.code = f.C; this.detail = f.D; this.severity = f.S; }
}

/* ---------- сборка сообщений ---------- */
const cstr = s => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
const i16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
function msg(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from(type), i32(body.length + 4), body]);
}
function param(v) {
  if (v === null || v === undefined) return i32(-1);
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (typeof v === 'number' && !isFinite(v)) throw new Error('нечисловое значение в запросе');
  const b = Buffer.from(String(v), 'utf8');
  return Buffer.concat([i32(b.length), b]);
}

/* ---------- SCRAM-SHA-256 ---------- */
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function scram(password) {
  const nonce = crypto.randomBytes(18).toString('base64'), first = 'n=*,r=' + nonce;
  let final = null, serverSig = null;
  return {
    first: 'n,,' + first,
    next(serverFirst) {
      const a = Object.fromEntries(serverFirst.split(',').map(x => [x[0], x.slice(2)]));
      if (!a.r || !a.r.startsWith(nonce) || !a.s || !a.i) throw new Error('база ответила странно при входе');
      const salted = crypto.pbkdf2Sync(String(password).normalize('NFKC'), Buffer.from(a.s, 'base64'), +a.i, 32, 'sha256');
      const clientKey = hmac(salted, 'Client Key'), stored = crypto.createHash('sha256').update(clientKey).digest();
      const without = 'c=biws,r=' + a.r, auth = first + ',' + serverFirst + ',' + without;
      const sig = hmac(stored, auth), proof = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) proof[i] = clientKey[i] ^ sig[i];
      serverSig = hmac(hmac(salted, 'Server Key'), auth).toString('base64');
      return (final = without + ',p=' + proof.toString('base64'));
    },
    check(serverFinal) { if (serverFinal.replace(/^v=/, '').trim() !== serverSig) throw new Error('база не подтвердила подлинность'); }
  };
}

/* ---------- соединение ---------- */
function connect(url, opt) {
  opt = opt || {};
  const c = typeof url === 'string' ? parseUrl(url) : url;
  return new Promise((resolve, reject) => {
    let sock = net.connect({ host: c.host, port: c.port }), buf = Buffer.alloc(0), stage = 'ssl', sc = null, done = false;
    const timer = setTimeout(() => fail(new Error('база не отвечает (адрес ' + c.host + ':' + c.port + ')')), opt.connectTimeout || 10000);
    const fail = e => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch (x) {} reject(e); };
    const write = b => sock.write(b);
    const startup = () => {
      const body = Buffer.concat([i32(196608), cstr('user'), cstr(c.user), cstr('database'), cstr(c.database),
        cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('frudom-shop'), Buffer.from([0])]);
      write(Buffer.concat([i32(body.length + 4), body]));
      stage = 'auth';
    };
    const onData = d => {
      buf = Buffer.concat([buf, d]);
      if (stage === 'ssl') {
        const ch = String.fromCharCode(buf[0]); buf = buf.subarray(1);
        if (ch === 'S') {
          sock.removeListener('data', onData);
          const verify = c.ssl === 'verify-full' || c.ssl === 'verify-ca';
          const ca = process.env.PGSSLROOTCERT ? fs.readFileSync(process.env.PGSSLROOTCERT) : undefined;
          sock = tls.connect({ socket: sock, servername: net.isIP(c.host) ? undefined : c.host, rejectUnauthorized: verify, ca,
            checkServerIdentity: c.ssl === 'verify-ca' ? () => undefined : tls.checkServerIdentity });
          sock.on('data', onData); sock.on('error', fail); sock.on('close', () => fail(new Error('база закрыла соединение')));
          sock.once('secureConnect', startup);
          return;
        }
        if (c.ssl !== 'disable' && c.ssl !== 'prefer' && c.ssl !== 'allow') return fail(new Error('база не поддерживает шифрование, а оно обязательно (sslmode=' + c.ssl + ')'));
        startup();
      }
      while (buf.length >= 5) {
        const type = String.fromCharCode(buf[0]), len = buf.readInt32BE(1);
        if (buf.length < len + 1) break;
        const body = buf.subarray(5, len + 1); buf = buf.subarray(len + 1);
        try { handle(type, body); } catch (e) { return fail(e); }
        if (done) return;
      }
    };
    const handle = (type, body) => {
      if (type === 'E') throw new PgError(fields(body));
      if (type === 'R') {
        const code = body.readInt32BE(0);
        if (code === 0) return;
        if (code === 3) return write(msg('p', cstr(c.password)));
        if (code === 5) {
          const inner = crypto.createHash('md5').update(c.password + c.user).digest('hex');
          return write(msg('p', cstr('md5' + crypto.createHash('md5').update(Buffer.concat([Buffer.from(inner), body.subarray(4, 8)])).digest('hex'))));
        }
        if (code === 10) {
          const mechs = body.subarray(4).toString('utf8').split('\0');
          if (!mechs.includes('SCRAM-SHA-256')) throw new Error('база требует неизвестный способ входа: ' + mechs.join(', '));
          sc = scram(c.password);
          const f = Buffer.from(sc.first, 'utf8');
          return write(msg('p', cstr('SCRAM-SHA-256'), i32(f.length), f));
        }
        if (code === 11) return write(msg('p', Buffer.from(sc.next(body.subarray(4).toString('utf8')), 'utf8')));
        if (code === 12) return sc.check(body.subarray(4).toString('utf8'));
        throw new Error('база требует неизвестный способ входа (код ' + code + ')');
      }
      if (type === 'Z') {                                   /* вход выполнен, база готова */
        done = true; clearTimeout(timer);
        sock.removeAllListeners('data'); sock.removeAllListeners('error'); sock.removeAllListeners('close');
        resolve(new Client(sock, buf, opt));
      }
      /* S (параметры), K (ключ отмены), N (уведомления) — пропускаем */
    };
    sock.on('data', onData);
    sock.on('error', fail);
    sock.on('close', () => fail(new Error('база закрыла соединение')));
    sock.on('connect', () => { if (c.ssl === 'disable') { stage = 'auth0'; startup(); } else write(Buffer.concat([i32(8), i32(80877103)])); });
  });
}

function fields(body) {
  const f = {}; let i = 0;
  while (i < body.length && body[i] !== 0) { const k = String.fromCharCode(body[i]); const e = body.indexOf(0, i + 1); f[k] = body.toString('utf8', i + 1, e); i = e + 1; }
  return f;
}

class Client {
  constructor(sock, rest, opt) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.queue = []; this.cur = null; this.dead = null; this.timeout = (opt && opt.queryTimeout) || 30000;
    sock.on('data', d => this._data(d));
    sock.on('error', e => this._die(e));
    sock.on('close', () => this._die(new Error('соединение с базой прервалось')));
    if (rest && rest.length) this._data(rest);
  }
  get alive() { return !this.dead; }
  _die(e) {
    if (this.dead) return;
    this.dead = e;
    const all = (this.cur ? [this.cur] : []).concat(this.queue); this.cur = null; this.queue = [];
    all.forEach(q => { clearTimeout(q.timer); q.reject(e); });
    try { this.sock.destroy(); } catch (x) {}
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const type = String.fromCharCode(this.buf[0]), body = this.buf.subarray(5, len + 1);
      this.buf = this.buf.subarray(len + 1);
      this._msg(type, body);
    }
  }
  _msg(type, body) {
    const q = this.cur;
    if (!q) return;                                           /* уведомления между запросами */
    if (type === 'T') {
      const n = body.readInt16BE(0); let i = 2; q.cols = [];
      for (let k = 0; k < n; k++) { const e = body.indexOf(0, i); const name = body.toString('utf8', i, e); i = e + 1; const oid = body.readInt32BE(i + 6); i += 18; q.cols.push({ name, oid }); }
    } else if (type === 'D') {
      const n = body.readInt16BE(0); let i = 2; const row = {};
      for (let k = 0; k < n; k++) {
        const len = body.readInt32BE(i); i += 4; const col = q.cols[k];
        if (len < 0) { row[col.name] = null; continue; }
        const s = body.toString('utf8', i, i + len); i += len;
        row[col.name] = NUM.has(col.oid) ? Number(s) : col.oid === 16 ? s === 't' : s;
      }
      q.rows.push(row);
    } else if (type === 'C') {
      const tag = body.toString('utf8', 0, body.length - 1), m = / (\d+)$/.exec(tag);
      q.changes += m ? +m[1] : 0;
    } else if (type === 'E') {
      q.error = q.error || new PgError(fields(body));
    } else if (type === 'Z') {
      this.cur = null; clearTimeout(q.timer);
      q.error ? q.reject(q.error) : q.resolve({ rows: q.rows, changes: q.changes });
      this._next();
    }
  }
  _next() {
    if (this.cur || !this.queue.length || this.dead) return;
    const q = this.cur = this.queue.shift();
    q.timer = setTimeout(() => this._die(new Error('база слишком долго не отвечает')), this.timeout);
    this.sock.write(q.data);
  }
  _push(data) {
    if (this.dead) return Promise.reject(this.dead);
    return new Promise((resolve, reject) => { this.queue.push({ data, resolve, reject, rows: [], changes: 0, cols: [] }); this._next(); });
  }
  /* Запрос с параметрами $1, $2… → {rows, changes} */
  query(sql, params) {
    params = params || [];
    const data = Buffer.concat([
      msg('P', cstr(''), cstr(sql), i16(0)),
      msg('B', cstr(''), cstr(''), i16(0), i16(params.length), ...params.map(param), i16(0)),
      msg('D', Buffer.from('P'), cstr('')),
      msg('E', cstr(''), i32(0)),
      msg('S')
    ]);
    return this._push(data);
  }
  /* Несколько команд без параметров (создание таблиц) */
  exec(sql) { return this._push(msg('Q', cstr(sql))); }
  end() { if (!this.dead) { try { this.sock.end(msg('X')); } catch (x) {} this.dead = new Error('соединение закрыто'); } }
}

module.exports = { connect, parseUrl, PgError };
