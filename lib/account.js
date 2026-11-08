/* Личный кабинет покупателя: вход по коду на почту, заказы и их статусы, повтор заказа, профиль и реквизиты компании.
   Работает вместе с базой заказов (ORDERS_DB). Письмо с кодом отправляет таблица (server/Code.gs, действие shopMail).
   Безопасность: код — 6 цифр, 10 минут, 5 попыток; в базе хранится только отпечаток кода и сессии;
   cookie HttpOnly + SameSite=Lax (+Secure при COOKIE_SECURE=1); каждый POST проверяет, что пришёл с нашего сайта;
   заказы видны только свои: оформленные из кабинета или на ту же почту. */
'use strict';
const crypto = require('crypto');

const CODE_TTL = 10 * 60000, SESSION_TTL = 60 * 864e5, COOKIE = 'fs_acc';
const now = () => new Date().toISOString();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);
const normEmail = e => str(e, 120).toLowerCase();
const okEmail = e => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/.test(e);
const rub = k => (k / 100).toLocaleString('ru-RU', { minimumFractionDigits: k % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' ₽';
const kg = g => String(+(g / 1000).toFixed(3)).replace('.', ',');
const dt = s => { try { return new Date(s).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
const day = s => { try { return new Date(s).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return s; } };

const L = {
  order_status: { placed: 'Принят, менеджер позвонит', awaiting_manager_review: 'Проверяем заказ', invoice_issued: 'Счёт выставлен', awaiting_bank_transfer: 'Ждём оплату по счёту', processing: 'В работе', completed: 'Выполнен', cancelled: 'Отменён' },
  payment_status: { not_started: 'Не оплачен', pending: 'Оплата в процессе', authorized: 'Деньги зарезервированы', captured: 'Оплачен', manual_transfer_confirmed: 'Оплачен', partially_refunded: 'Частичный возврат', refunded: 'Возврат денег', failed: 'Оплата не прошла', cancelled: 'Оплата отменена', expired: 'Резерв истёк', requires_reconciliation: 'Проверяем оплату' },
  fulfillment_status: { not_released: 'Ещё не собирается', picking: 'Собираем', weighed: 'Взвешен', ready_to_ship: 'Готов к отправке', shipped: 'В пути', delivered: 'Доставлен', returned: 'Возврат' },
};
const PAID = new Set(['captured', 'manual_transfer_confirmed']);
function stage(o) {
  if (o.order_status === 'cancelled') return { label: 'Отменён', cls: 'r' };
  if (o.fulfillment_status === 'delivered' || o.order_status === 'completed') return { label: 'Доставлен', cls: 'g' };
  if (o.fulfillment_status === 'shipped') return { label: 'В пути', cls: 'b' };
  if (['ready_to_ship', 'weighed', 'picking'].includes(o.fulfillment_status)) return { label: L.fulfillment_status[o.fulfillment_status], cls: 'b' };
  if (o.order_status === 'invoice_issued' || o.order_status === 'awaiting_bank_transfer') return { label: 'Ждём оплату', cls: 'o' };
  return { label: L.order_status[o.order_status] || 'Принят', cls: 'o' };
}
function steps(o) {
  const confirmed = o.order_status !== 'placed' && o.order_status !== 'awaiting_manager_review' || o.fulfillment_status !== 'not_released';
  const paid = PAID.has(o.payment_status);
  const packed = ['weighed', 'ready_to_ship', 'shipped', 'delivered'].includes(o.fulfillment_status);
  const shipped = ['shipped', 'delivered'].includes(o.fulfillment_status) || o.order_status === 'completed';
  const delivered = o.fulfillment_status === 'delivered' || o.order_status === 'completed';
  const a = [['Принят', true], ['Подтверждён', confirmed], ['Оплачен', paid], ['Собран', packed || shipped], ['Доставлен', delivered]];
  if (o.order_status === 'cancelled') return a.map((x, i) => [i === 0 ? x[0] : i === 1 ? 'Отменён' : x[0], i === 0, i === 1 ? 'x' : '']);
  let nowSet = false;
  return a.map(x => { if (x[1]) return [x[0], true, 'done']; if (!nowSet) { nowSet = true; return [x[0], false, 'now']; } return [x[0], false, '']; });
}

function create({ DB, D, R, send, clientIp }) {
  const hits = new Map();
  const limited = (key, max, ms) => { const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < ms); if (a.length >= max) { hits.set(key, a); return true; } a.push(t); hits.set(key, a); if (hits.size > 5000) hits.clear(); return false; };
  const SECURE = process.env.COOKIE_SECURE === '1';

  async function setting(name, make) {
    const r = await DB.get('SELECT v FROM settings WHERE name = ?', name);
    if (r && r.v) return r.v;
    const v = make();
    await DB.run('INSERT INTO settings (name, v) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', name, v);
    return (await DB.get('SELECT v FROM settings WHERE name = ?', name)).v;
  }
  const mailKey = () => setting('mail_key', () => crypto.randomBytes(30).toString('base64url'));
  const pepper = () => setting('code_pepper', () => crypto.randomBytes(24).toString('base64url'));

  function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
  async function who(req) {
    const sid = cookies(req)[COOKIE]; if (!sid || sid.length < 30) return null;
    const s = await DB.get('SELECT s.customer_id, s.expires_at, c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.sid_hash = ?', sha(sid));
    if (!s || s.expires_at < now()) return null;
    let company = null; try { company = s.company ? JSON.parse(s.company) : null; } catch (e) {}
    return { id: s.customer_id, email: s.email, name: s.name || '', phone: s.phone || '', addr: s.addr || '', company, sidHash: sha(sid) };
  }
  const cookie = (v, age) => COOKIE + '=' + v + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (SECURE ? '; Secure' : '');
  const sameSite = req => { const o = req.headers.origin || req.headers.referer || ''; if (!o) return false; try { return new URL(o).host === req.headers.host; } catch (e) { return false; } };
  function readForm(req) {
    return new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', d => { n += d.length; if (n > 20000) { no(new Error('big')); req.destroy(); } else ch.push(d); }); req.on('end', () => {
      const b = Buffer.concat(ch).toString('utf8'), t = req.headers['content-type'] || '';
      try { ok(/json/.test(t) ? JSON.parse(b || '{}') : Object.fromEntries(new URLSearchParams(b))); } catch (e) { ok({}); } }); req.on('error', no); });
  }
  const page = (res, req, html, status, extra) => send(req, res, status || 200, 'text/html; charset=utf-8', html, Object.assign({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }, extra || {}));
  const json = (res, req, o, status, extra) => send(req, res, status || 200, 'application/json', JSON.stringify(o), Object.assign({ 'cache-control': 'no-store' }, extra || {}));
  const go = (res, to, extra) => { res.writeHead(303, Object.assign({ location: to, 'cache-control': 'no-store' }, extra || {})); res.end(); };
  const esc = R.esc;

  async function shell(title, body, me) {
    const cat = await D.getCatalog();
    return R.layout({ path: '/account', noindex: true, noLoc: true, tab: 'account', title: title + ' | Фруктовый Дом', desc: 'Личный кабинет покупателя «Фруктовый Дом»: заказы, статусы, история, реквизиты.',
      body: '<section class="sec pg"><div class="wrap acc">' + body + '</div></section>' }, cat);
  }
  const tabsHtml = (cur, n) => '<div class="acc-tabs"><a href="/account" class="' + (cur === 'orders' ? 'on' : '') + '">Мои заказы' + (n ? '<span class="n">' + n + '</span>' : '') + '</a><a href="/account/profile" class="' + (cur === 'profile' ? 'on' : '') + '">Профиль и реквизиты</a><a href="/catalog?fav=1">Избранное</a></div>';
  const head = (me, h) => '<nav class="crumbs"><a href="/">Главная</a> <span>/</span> <span>Личный кабинет</span></nav><div class="acc-h"><h1>' + h + '</h1><form method="post" action="/account/logout"><button class="btns" type="submit">Выйти</button></form></div>' +
    '<p class="intro" style="margin-top:-6px">' + esc(me.name ? me.name + ' · ' : '') + esc(me.email) + '</p>';

  /* ---------- вход ---------- */
  function loginForm(err, email) {
    return '<div class="acc-card acc-login"><h1>Вход в личный кабинет</h1><p class="intro">Укажите почту — пришлём код. Пароль не нужен. Там будут все ваши заказы на эту почту: статусы, суммы, история, повтор в один клик.</p>' +
      (err ? '<div class="msg err">' + esc(err) + '</div>' : '') +
      '<form method="post" action="/account/login"><div class="fld"><label for="em">Email</label><input id="em" name="email" type="email" inputmode="email" autocomplete="email" required value="' + esc(email || '') + '" placeholder="you@mail.ru"></div>' +
      '<button class="bprimary" type="submit">Получить код</button></form><p class="hint" style="margin-top:12px;text-align:center">Нажимая «Получить код», вы соглашаетесь на обработку персональных данных для выполнения заказов.</p></div>';
  }
  function codeForm(email, err) {
    return '<div class="acc-card acc-login"><h1>Введите код</h1><p class="intro">Отправили 6 цифр на <b>' + esc(email) + '</b>. Код действует 10 минут. Не пришло — проверьте «Спам».</p>' +
      (err ? '<div class="msg err">' + esc(err) + '</div>' : '') +
      '<form method="post" action="/account/verify"><input type="hidden" name="email" value="' + esc(email) + '"><div class="fld"><label for="cd">Код из письма</label><input id="cd" class="codein" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></div>' +
      '<button class="bprimary" type="submit">Войти</button></form><form method="post" action="/account/login" style="margin-top:10px;text-align:center"><input type="hidden" name="email" value="' + esc(email) + '"><button class="btns" type="submit">Отправить код ещё раз</button></form>' +
      '<p class="hint" style="margin-top:12px;text-align:center"><a href="/account">Другая почта</a></p></div>';
  }
  async function sendCode(req, email) {
    if (limited('ip:' + clientIp(req), 12, 3600000) || limited('em:' + email, 3, 15 * 60000)) return 'Слишком много запросов кода. Подождите 15 минут или позвоните +7 999 833-05-53.';
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), t = now();
    await DB.run('UPDATE login_codes SET used = 1 WHERE email = ? AND used = 0', email);
    await DB.run('INSERT INTO login_codes (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', email, sha((await pepper()) + email + code), new Date(Date.now() + CODE_TTL).toISOString(), t);
    await DB.run('DELETE FROM login_codes WHERE created_at < ?', new Date(Date.now() - 864e5).toISOString());
    const text = 'Ваш код для входа в личный кабинет «Фруктовый Дом»: ' + code + '\n\nКод действует 10 минут. Если вы не запрашивали код — просто проигнорируйте письмо.\n\nfrudom.ru · +7 999 833-05-53';
    const html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#16201a"><h2 style="color:#1f5a2e;margin:0 0 12px">Фруктовый Дом</h2><p>Ваш код для входа в личный кабинет:</p>' +
      '<p style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#f3f8ef;border-radius:12px;padding:16px;text-align:center;margin:16px 0">' + code + '</p><p style="color:#6e776f">Код действует 10 минут. Если вы не запрашивали код — просто проигнорируйте письмо.</p><p style="color:#6e776f">frudom.ru · +7 999 833-05-53</p></div>';
    if (process.env.MAIL_DEV === '1') { console.log('[MAIL_DEV] код для ' + email + ': ' + code); return null; }
    let r; try { r = await D.sendMail({ key: await mailKey(), to: email, subject: 'Код входа на frudom.ru: ' + code, text, html }); } catch (e) { r = { ok: false, error: e.message }; }
    if (r && r.ok) return null;
    console.error('Код входа не отправлен:', JSON.stringify(r).slice(0, 300));
    if (r && r.hint) return 'Вход временно недоступен: обновите скрипт таблицы магазина (Code.gs). Заказы оформляются как обычно.';
    if (r && r.code === 'quota') return 'Сегодня письма больше не отправляются (лимит Google). Попробуйте завтра или позвоните нам.';
    return 'Не удалось отправить письмо. Попробуйте ещё раз через минуту или позвоните +7 999 833-05-53.';
  }
  async function verify(req, email, code) {
    if (limited('vip:' + clientIp(req), 30, 3600000)) return { err: 'Слишком много попыток. Подождите час.' };
    const r = await DB.get('SELECT * FROM login_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1', email);
    if (!r || r.expires_at < now()) return { err: 'Код устарел — запросите новый.' };
    if (r.tries >= 5) return { err: 'Слишком много неверных попыток — запросите новый код.' };
    const good = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(r.code_hash), Buffer.from(sha((await pepper()) + email + code)));
    if (!good) { await DB.run('UPDATE login_codes SET tries = tries + 1 WHERE id = ?', r.id); return { err: 'Неверный код. Осталось попыток: ' + (4 - r.tries) + '.' }; }
    const t = now();
    return DB.tx(async () => {
      await DB.run('UPDATE login_codes SET used = 1 WHERE id = ?', r.id);
      let c = await DB.get('SELECT id FROM customers WHERE email = ?', email);
      if (!c) {
        /* новый покупатель: имя, телефон и адрес — из последнего заказа на эту почту */
        const last = await DB.get('SELECT name, phone, addr, company, who FROM orders WHERE lower(email) = ? ORDER BY id DESC LIMIT 1', email);
        await DB.run('INSERT INTO customers (email, name, phone, addr, company, created_at) VALUES (?, ?, ?, ?, ?, ?)', email,
          last && last.who !== 'nds' ? last.name : null, last ? last.phone : null, last ? last.addr : null, last && last.company ? last.company : null, t);
        c = await DB.get('SELECT id FROM customers WHERE email = ?', email);
      }
      await DB.run('UPDATE customers SET last_login = ? WHERE id = ?', t, c.id);
      const sid = crypto.randomBytes(32).toString('base64url');
      await DB.run('INSERT INTO customer_sessions (sid_hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha(sid), c.id, new Date(Date.now() + SESSION_TTL).toISOString(), t);
      await DB.run('DELETE FROM customer_sessions WHERE expires_at < ?', t);
      return { sid };
    });
  }

  /* ---------- заказы ---------- */
  const mine = me => ['(customer_id = ? OR lower(email) = ?)', me.id, me.email];
  async function orders(me) { const [w, a, b] = mine(me); return DB.all('SELECT * FROM orders WHERE ' + w + ' ORDER BY id DESC LIMIT 200', a, b); }
  async function order(me, no) {
    const [w, a, b] = mine(me), o = await DB.get('SELECT * FROM orders WHERE no = ? AND ' + w, no, a, b); if (!o) return null;
    o.items = await DB.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY pos', o.id);
    o.payments = await DB.all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', o.id);
    o.invoices = await DB.all('SELECT * FROM invoices WHERE order_id = ? ORDER BY id', o.id);
    o.history = await DB.all('SELECT * FROM status_history WHERE order_id = ? ORDER BY id', o.id);
    return o;
  }
  const total = o => o.final_total_k != null ? o.final_total_k : o.total_k;
  function listHtml(me, list) {
    const active = list.filter(o => !['completed', 'cancelled'].includes(o.order_status) && o.fulfillment_status !== 'delivered');
    const sum = list.filter(o => o.order_status !== 'cancelled').reduce((s, o) => s + total(o), 0);
    return head(me, 'Личный кабинет') + tabsHtml('orders', list.length) +
      '<div class="ostat"><div><b>' + list.length + '</b><span>заказов всего</span></div><div><b>' + active.length + '</b><span>сейчас в работе</span></div><div><b>' + rub(sum) + '</b><span>на сумму</span></div></div>' +
      (list.length ? '<div class="olist">' + list.map((o, i) => { const st = stage(o), n = (o._n || '');
        return '<a class="orow" href="/account/order/' + o.no + '" style="animation-delay:' + Math.min(i, 10) * 40 + 'ms"><div><b>Заказ № ' + o.no + '</b> <span class="chip ' + st.cls + '">' + esc(st.label) + '</span>' + (o.who === 'nds' ? ' <span class="chip">счёт</span>' : '') +
          '</div><div class="os"><b>' + (o.has_weight && o.final_total_k == null ? '≈ ' : '') + rub(total(o)) + '</b><span class="om">' + esc(L.payment_status[o.payment_status] || '') + '</span></div><div class="om">' + day(o.created_at) + ' · ' + esc(o.addr) + n + '</div></a>'; }).join('') + '</div>'
        : '<div class="acc-card" style="text-align:center"><p class="intro" style="margin:0 auto 14px">Заказов на ' + esc(me.email) + ' пока нет. Оформите заказ с этой почтой — он появится здесь.</p><a class="btnp" href="/catalog">Перейти в каталог</a></div>');
  }
  function orderHtml(me, o) {
    const st = stage(o), fin = o.final_total_k != null, approx = o.has_weight && !fin;
    const items = o.items.map(it => {
      const q = it.actual_g != null ? kg(it.actual_g) + ' кг (взвешено)' : kg(it.qty_g) + ' кг' + (it.mode === 'pack' ? ' · мешком' : '');
      const s = it.final_sum_k != null ? it.final_sum_k : it.sum_k, pr = it.final_price_k != null ? it.final_price_k : it.price_k;
      return '<tr><td>' + esc(it.name) + '<small>' + q + ' × ' + rub(pr) + '/кг</small></td><td>' + (it.weighed && it.actual_g == null ? '≈ ' : '') + rub(s) + '</td></tr>';
    }).join('');
    const rep = JSON.stringify(o.items.map(it => ({ n: it.name, qty: +((it.actual_g != null && it.mode !== 'pack' ? it.qty_g : it.qty_g) / 1000).toFixed(2), mode: it.mode })));
    const g = fin ? o.final_goods_k : o.goods_k, fee = fin ? o.final_fee_k : o.fee_k, vat = fin ? o.final_vat_k : o.vat_k, tot = total(o), due = Math.max(0, tot - (o.paid_k || 0));
    const hist = o.history.map(h => '<li><time>' + dt(h.at) + '</time><span>' + esc((L[h.field] && L[h.field][h.to_v]) || h.to_v) + (h.reason && h.field === 'order_status' && h.to_v === 'cancelled' ? ' — ' + esc(h.reason) : '') + '</span></li>').join('');
    let co = null; try { co = o.company ? JSON.parse(o.company) : null; } catch (e) {}
    return '<nav class="crumbs"><a href="/">Главная</a> <span>/</span> <a href="/account">Личный кабинет</a> <span>/</span> <span>Заказ № ' + o.no + '</span></nav>' +
      '<div class="acc-h"><h1>Заказ № ' + o.no + '</h1><span class="chip ' + st.cls + '">' + esc(st.label) + '</span></div><p class="intro" style="margin-top:-6px">от ' + dt(o.created_at) + (o.who === 'nds' ? ' · со счётом' + (co ? ' на ' + esc(co.name) : '') : ' · без НДС') + '</p>' +
      '<div class="acc-card"><div class="otrack">' + steps(o).map((s, i) => '<div class="tstep ' + s[2] + '"><i>' + (s[2] === 'done' ? '✓' : s[2] === 'x' ? '×' : i + 1) + '</i>' + esc(s[0]) + '</div>').join('') + '</div>' +
      '<div class="acc-grid" style="margin-top:16px"><div><div class="sect">Оплата</div><div>' + esc(L.payment_status[o.payment_status] || '') + (o.paid_k ? ' · получено ' + rub(o.paid_k) : '') + (due && o.order_status !== 'cancelled' && !PAID.has(o.payment_status) ? '<br><b>К оплате: ' + (approx ? '≈ ' : '') + rub(due) + '</b>' : '') + '</div></div>' +
      '<div><div class="sect">Сборка и доставка</div><div>' + esc(L.fulfillment_status[o.fulfillment_status] || '') + '<br>' + esc(o.addr) + ' <span class="om">(' + (o.zone === 'mo' ? 'Московская обл.' : 'Москва') + ')</span>' + '</div></div></div>' +
      (approx ? '<div class="note">В заказе весовой товар — точную сумму пришлём после взвешивания.</div>' : '') + '</div>' +
      '<div class="acc-grid" style="margin-top:14px"><div class="acc-card"><div class="sect">Товары</div><table class="otbl">' + items + '</table><div class="otot"><div><span>Товары</span><b>' + rub(g) + '</b></div><div><span>Доставка</span><b>' + (fee ? rub(fee) : 'Бесплатно') + '</b></div>' + (vat ? '<div><span>НДС 10%</span><b>' + rub(vat) + '</b></div>' : '') + '<div class="big"><span>Итого</span><b>' + (approx ? '≈ ' : '') + rub(tot) + '</b></div></div>' +
      '<div class="acts"><button type="button" class="btnp" data-repeat="' + esc(rep) + '">Повторить заказ</button><a class="btns" href="tel:+79998330553" data-goal="phone_click">Позвонить</a></div></div>' +
      '<div class="acc-card"><div class="sect">История</div><ul class="hist">' + (hist || '<li>Заказ принят</li>') + '</ul>' +
      (o.invoices.length ? '<div class="sect">Счета</div>' + o.invoices.map(v => '<div style="margin-bottom:6px">Счёт № ' + esc(v.number) + ' от ' + esc(v.date) + ' — ' + rub(v.amount_k) + (v.url && /^https:\/\//.test(v.url) ? ' · <a href="' + esc(v.url) + '" target="_blank" rel="noopener">открыть</a>' : '') + '</div>').join('') : '') +
      (o.payments.length ? '<div class="sect">Платежи</div>' + o.payments.map(p => '<div style="margin-bottom:6px">' + (p.paid_on ? esc(p.paid_on) + ' · ' : '') + rub(p.captured_k || p.amount_k) + ' · ' + esc(L.payment_status[p.status] || p.status) + '</div>').join('') : '') +
      (o.comment ? '<div class="sect">Комментарий</div><p>' + esc(o.comment) + '</p>' : '') + '</div></div>' +
      '<p style="margin-top:16px"><a class="more" href="/account">‹ Все заказы</a></p>';
  }
  function profileHtml(me, msg) {
    const c = me.company || {}, f = (n, l, v, ph, ex) => '<div class="fld"><label for="' + n + '">' + l + '</label><input id="' + n + '" name="' + n + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + (ex || '') + '></div>';
    return head(me, 'Личный кабинет') + tabsHtml('profile') + (msg ? '<div class="msg ok">' + esc(msg) + '</div>' : '') +
      '<form method="post" action="/account/profile"><div class="acc-grid"><div class="acc-card"><div class="sect">Для заказов без НДС</div>' +
      f('name', 'Имя', me.name, 'Как к вам обращаться', ' autocomplete="name"') + f('phone', 'Телефон', me.phone, '+7', ' inputmode="tel" autocomplete="tel"') + f('addr', 'Адрес доставки', me.addr, 'Город, улица, дом, подъезд', ' autocomplete="street-address"') +
      '<div class="fld"><label>Почта для входа</label><input value="' + esc(me.email) + '" readonly></div></div>' +
      '<div class="acc-card"><div class="sect">Компания — для счетов с НДС</div>' + f('inn', 'ИНН', c.inn, '10 или 12 цифр', ' inputmode="numeric"') + f('cname', 'Название', c.name, 'ООО «…» или ИП …', ' autocomplete="organization"') +
      '<div class="two">' + f('kpp', 'КПП', c.kpp, '', ' inputmode="numeric"') + f('ogrn', 'ОГРН', c.ogrn, '', ' inputmode="numeric"') + '</div>' + f('caddr', 'Юридический адрес', c.addr, '') +
      '<div class="two">' + f('cemail', 'Email для счетов', c.email || me.email, 'buh@company.ru', ' inputmode="email"') + f('cphone', 'Телефон', c.phone || me.phone, '+7', ' inputmode="tel"') + '</div>' + f('daddr', 'Адрес доставки', c.daddr || me.addr, 'Куда везти заказы') + '</div></div>' +
      '<div class="acts"><button class="btnp" type="submit">Сохранить</button><a class="btns" href="/catalog">В каталог</a></div></form>';
  }
  function companyOf(b) {
    const c = { inn: str(b.inn, 12).replace(/\D/g, ''), name: str(b.cname || b.name, 300), kpp: str(b.kpp, 9), ogrn: str(b.ogrn, 15), addr: str(b.caddr || b.addr, 300), email: str(b.cemail || b.email, 100), phone: str(b.cphone || b.phone, 40), daddr: str(b.daddr, 300) };
    return c.inn || c.name ? c : null;
  }

  /* ---------- маршруты ---------- */
  return async function handle(req, res, p) {
    if (p === '/api/me') { const me = await who(req); return json(res, req, me ? { ok: true, me: { email: me.email, name: me.name, phone: me.phone, addr: me.addr, company: me.company } } : { ok: false }); }
    if (p === '/api/me/company' && req.method === 'POST') {
      if (!sameSite(req)) return json(res, req, { ok: false }, 403);
      const me = await who(req); if (!me) return json(res, req, { ok: false }, 401);
      const b = await readForm(req), c = companyOf(Object.assign({}, b.company || {}, { cname: b.company && b.company.name, caddr: b.company && b.company.addr, cemail: b.company && b.company.email, cphone: b.company && b.company.phone }));
      if (c && /^\d{10}(\d{2})?$/.test(c.inn)) await DB.run('UPDATE customers SET company = ? WHERE id = ?', JSON.stringify(c), me.id);
      return json(res, req, { ok: true });
    }
    const me = await who(req);
    if (req.method === 'POST') {
      if (!sameSite(req)) return page(res, req, await shell('Ошибка', '<div class="acc-card">Запрос пришёл не с нашего сайта. Обновите страницу.</div>'), 403);
      const b = await readForm(req);
      if (p === '/account/logout') { if (me) await DB.run('DELETE FROM customer_sessions WHERE sid_hash = ?', me.sidHash); return go(res, '/account', { 'set-cookie': cookie('', 0) }); }
      if (p === '/account/login') {
        const email = normEmail(b.email);
        if (!okEmail(email)) return page(res, req, await shell('Вход', loginForm('Проверьте адрес почты', b.email)), 400);
        const err = await sendCode(req, email);
        return page(res, req, await shell('Вход', err ? loginForm(err, email) : codeForm(email)), err ? 429 : 200);
      }
      if (p === '/account/verify') {
        const email = normEmail(b.email), r = await verify(req, email, str(b.code, 10).replace(/\D/g, ''));
        if (r.err) return page(res, req, await shell('Вход', codeForm(email, r.err)), 400);
        return go(res, '/account', { 'set-cookie': cookie(r.sid, SESSION_TTL / 1000) });
      }
      if (p === '/account/profile' && me) {
        const c = companyOf(b);
        if (c && c.inn && !/^\d{10}(\d{2})?$/.test(c.inn)) return page(res, req, await shell('Профиль', profileHtml(Object.assign({}, me, { company: c }), '') .replace('<form', '<div class="msg err">ИНН — 10 цифр для компании или 12 для ИП</div><form')), 400);
        await DB.run('UPDATE customers SET name = ?, phone = ?, addr = ?, company = ? WHERE id = ?', str(b.name, 100), str(b.phone, 40), str(b.addr, 300), c ? JSON.stringify(c) : null, me.id);
        return page(res, req, await shell('Профиль', profileHtml(await who(req), 'Сохранено. Данные подставятся в следующий заказ.')));
      }
      return go(res, '/account');
    }
    if (!me) return p === '/account' ? page(res, req, await shell('Вход в личный кабинет', loginForm())) : go(res, '/account');
    if (p === '/account') return page(res, req, await shell('Мои заказы', listHtml(me, await orders(me)), me));
    if (p === '/account/profile') return page(res, req, await shell('Профиль', profileHtml(me), me));
    const m = p.match(/^\/account\/order\/(\d{1,9})$/);
    if (m) { const o = await order(me, +m[1]); return o ? page(res, req, await shell('Заказ № ' + o.no, orderHtml(me, o), me)) : page(res, req, await shell('Заказ не найден', '<div class="acc-card">Такого заказа нет среди ваших. <a href="/account">Мои заказы</a></div>'), 404); }
    return go(res, '/account');
  };
}

/* кто вошёл — для привязки заказа (без лишних запросов, если cookie нет) */
async function customerId(DB, req) {
  const m = /(?:^|;\s*)fs_acc=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const s = await DB.get('SELECT customer_id, expires_at FROM customer_sessions WHERE sid_hash = ?', sha(decodeURIComponent(m[1])));
  return s && s.expires_at >= now() ? s.customer_id : null;
}

module.exports = { create, customerId, stage, steps, L };
