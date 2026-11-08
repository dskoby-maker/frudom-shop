/* Проверка страницы первой настройки входа /admin/setup. Запуск: node test/admin-setup.js → «ошибок: 0». */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { create } = require('../lib/auth.js');
const ROOT = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frudom-setup-')), procs = [], fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const B = 'http://localhost:3009', wait = ms => new Promise(r => setTimeout(r, ms));
const run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
const post = (p, form, origin) => fetch(B + p, { method: 'POST', redirect: 'manual', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, origin === false ? {} : { origin: B }), body: new URLSearchParams(form).toString() });
const lineOf = t => { const m = /<textarea[^>]*>([^<]*)<\/textarea>/.exec(t); return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : null; };

(async () => {
  run('test/server.js');
  let srv = run('server.js', { PORT: 3009, GS_URL: 'http://localhost:8790/api', ORDERS_DB: path.join(tmp, 'o.db'), ADMIN_USERS: '' });
  for (let i = 0; i < 40; i++) { try { const h = await fetch(B + '/health').then(x => x.json()); if (h.db === 'ok') break; } catch (e) {} await wait(250); }
  let t = await fetch(B + '/admin/login').then(x => x.text());
  ok(/href="\/admin\/setup"/.test(t), '1. на входе нет ссылки на настройку');
  t = await fetch(B + '/admin/setup').then(x => x.text());
  ok(/Первый пользователь/.test(t), '2. страница настройки не открылась');
  /* ошибки */
  ok(/не совпадают/.test(await post('/admin/setup', { name: 'Даниил', role: 'admin', pw: 'очень-длинный-1', pw2: 'другой-пароль-2' }).then(x => x.text())), '3. разные пароли');
  ok(/не меньше 10/.test(await post('/admin/setup', { name: 'Даниил', role: 'admin', pw: 'коротко', pw2: 'коротко' }).then(x => x.text())), '3. короткий пароль');
  ok(/без знаков/.test(await post('/admin/setup', { name: 'Д:a', role: 'admin', pw: 'очень-длинный-1', pw2: 'очень-длинный-1' }).then(x => x.text())), '3. двоеточие в имени');
  ok((await post('/admin/setup', { name: 'X', role: 'admin', pw: 'очень-длинный-1', pw2: 'очень-длинный-1' }, false)).status === 403, '3. запрос с чужого сайта');
  /* два пользователя → одна строка */
  t = await post('/admin/setup', { name: 'Даниил', role: 'admin', pw: 'очень-длинный-1', pw2: 'очень-длинный-1' }).then(x => x.text());
  let line = lineOf(t);
  ok(line && /^Даниил:admin:scrypt\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(line) && !/очень-длинный/.test(t), '4. строка для первого: ' + line);
  const f2 = new URLSearchParams({ name: 'Наталья', role: 'manager', pw: 'пароль-наталья-2', pw2: 'пароль-наталья-2' }); f2.append('acc[]', line);
  t = await fetch(B + '/admin/setup', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: B }, body: f2.toString() }).then(x => x.text());
  line = lineOf(t);
  ok(line && line.split(';').length === 2 && /;Наталья:manager:scrypt\./.test(line), '5. строка для двоих: ' + line);
  /* подделанная строка в скрытом поле не проходит */
  const f3 = new URLSearchParams({ name: 'Склад', role: 'viewer', pw: 'пароль-склад-33', pw2: 'пароль-склад-33' }); f3.append('acc[]', 'Хакер:admin:plain');
  ok(!/Хакер/.test(lineOf(await fetch(B + '/admin/setup', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: B }, body: f3.toString() }).then(x => x.text())) || ''), '6. принята подделанная строка');
  /* строка подходит для входа */
  const a = create(line);
  ok(a.login('даниил', 'очень-длинный-1', '1').ok && a.login('Наталья', 'пароль-наталья-2', '2').ok && !a.login('Наталья', 'не-тот-пароль', '3').ok, '7. строка не подходит для входа');
  /* после настройки страница закрыта */
  srv.kill(); await wait(400);
  srv = run('server.js', { PORT: 3009, GS_URL: 'http://localhost:8790/api', ORDERS_DB: path.join(tmp, 'o.db'), ADMIN_USERS: line });
  for (let i = 0; i < 40; i++) { try { const h = await fetch(B + '/health').then(x => x.json()); if (h.db === 'ok') break; } catch (e) {} await wait(250); }
  const r = await fetch(B + '/admin/setup', { redirect: 'manual' });
  ok(r.status === 303 && /\/admin\/login/.test(r.headers.get('location')), '8. настройка открыта при заданных пользователях: ' + r.status);
  ok((await post('/admin/setup', { name: 'Z', role: 'admin', pw: 'очень-длинный-1', pw2: 'очень-длинный-1' })).status === 303, '8. POST настройки при заданных пользователях');
  procs.forEach(p => p.kill());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ошибок:', fail.length, fail);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1); });
