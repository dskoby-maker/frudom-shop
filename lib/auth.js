/* Вход в кабинет менеджера. Пароли хранятся только в виде отпечатка (scrypt), в настройке сервера ADMIN_USERS:
     ADMIN_USERS="Даниил:admin:scrypt$<соль>$<отпечаток>;Наталья:manager:scrypt$...;Склад:viewer:scrypt$..."
   Отпечаток делает команда: node tools/hash-password.js
   Роли: admin и manager — все действия с заказами; viewer — только просмотр.
   Сессия — случайный ключ в cookie (HttpOnly, SameSite=Strict), живёт 12 часов; у каждой сессии свой ключ защиты форм (CSRF). */
'use strict';
const crypto = require('crypto');
const TTL = 12 * 3600 * 1000;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('base64url');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(String(pw), salt, 32).toString('base64url');
}
function verify(pw, stored) {
  const m = /^scrypt\$([^$]+)\$([^$]+)$/.exec(stored || '');
  if (!m) return false;
  const a = crypto.scryptSync(String(pw), m[1], 32), b = Buffer.from(m[2], 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseUsers(s) {
  const out = new Map();
  String(s || '').split(';').map(x => x.trim()).filter(Boolean).forEach(x => {
    const i = x.indexOf(':'), j = x.indexOf(':', i + 1);
    if (i < 1 || j < 0) return;
    const name = x.slice(0, i).trim(), role = x.slice(i + 1, j).trim(), hash = x.slice(j + 1).trim();
    if (['admin', 'manager', 'viewer'].includes(role) && hash.startsWith('scrypt$')) out.set(name.toLowerCase(), { name, role, hash });
  });
  return out;
}

function create(usersSpec) {
  const users = parseUsers(usersSpec), sessions = new Map(), fails = new Map();
  const DUMMY = hashPassword(crypto.randomBytes(8).toString('hex'));

  function tooManyFails(key) { const now = Date.now(), a = (fails.get(key) || []).filter(t => now - t < 15 * 60000); fails.set(key, a); return a.length >= 5; }
  function addFail(key) { const a = fails.get(key) || []; a.push(Date.now()); fails.set(key, a); }

  /* Вход: {ok, sid, user} или {ok:false, error}. ip — для ограничения подбора пароля. */
  function login(name, pw, ip) {
    const kIp = 'ip:' + ip, kUser = 'u:' + String(name || '').toLowerCase();
    if (tooManyFails(kIp) || tooManyFails(kUser)) return { ok: false, error: 'слишком много неудачных попыток — подождите 15 минут' };
    const u = users.get(String(name || '').trim().toLowerCase());
    const good = verify(pw, u ? u.hash : DUMMY) && !!u;       /* одинаковое время проверки для существующих и несуществующих имён */
    if (!good) { addFail(kIp); addFail(kUser); return { ok: false, error: 'неверное имя или пароль' }; }
    fails.delete(kUser);
    const sid = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
    sessions.set(sid, { user: u.name, role: u.role, csrf, exp: Date.now() + TTL });
    if (sessions.size > 1000) for (const [k, s] of sessions) if (s.exp < Date.now()) sessions.delete(k);
    return { ok: true, sid, user: u.name };
  }
  function get(sid) {
    const s = sid && sessions.get(sid);
    if (!s) return null;
    if (s.exp < Date.now()) { sessions.delete(sid); return null; }
    return s;
  }
  function logout(sid) { sessions.delete(sid); }
  const csrfOk = (s, token) => {
    if (!s || typeof token !== 'string') return false;
    const a = Buffer.from(s.csrf), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  return { login, get, logout, csrfOk, hasUsers: () => users.size > 0 };
}

module.exports = { create, hashPassword, verify, parseUsers };
