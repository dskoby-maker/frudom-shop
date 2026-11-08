/* Кабинет менеджера: /admin. Работает только при включённой базе заказов (ORDERS_DB) и заданных ADMIN_USERS.
   Страницы собираются на сервере, без внешних библиотек. Защита: вход по паролю, сессия в cookie (HttpOnly, SameSite=Strict),
   ключ формы (CSRF) + проверка Origin в каждом действии, ограничение попыток входа, запрет индексации и встраивания,
   все тексты экранируются. Любое действие проходит через lib/orders.js (правила статусов, журнал, версия заказа). */
'use strict';
const { hashPassword } = require('./auth.js');
const L = {
  order_status: { placed: 'Новый', awaiting_manager_review: 'Проверить', invoice_issued: 'Счёт выставлен', awaiting_bank_transfer: 'Ждём перевод', processing: 'В работе', completed: 'Выполнен', cancelled: 'Отменён' },
  payment_status: { not_started: 'Не оплачен', pending: 'Ждём банк', authorized: 'Деньги в резерве', captured: 'Оплачен', partially_refunded: 'Частичный возврат', refunded: 'Возврат', failed: 'Ошибка оплаты', cancelled: 'Отменена', expired: 'Резерв истёк', manual_transfer_confirmed: 'Оплата получена', requires_reconciliation: 'Нужна сверка' },
  fulfillment_status: { not_released: 'Не собирали', picking: 'Сборка', weighed: 'Взвешен', ready_to_ship: 'Готов к отгрузке', shipped: 'Отгружен', delivered: 'Доставлен', returned: 'Возврат товара' }
};
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = k => k == null ? '—' : (k / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ') + ' ₽';
const kg = g => (g / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 }).replace(/ | /g, ' ') + ' кг';
const rubToK = s => { const v = Number(String(s == null ? '' : s).replace(/\s| /g, '').replace(',', '.')); return isFinite(v) && String(s).trim() !== '' ? Math.round(v * 100) : NaN; };
const kgToG = s => { if (String(s == null ? '' : s).trim() === '') return null; const v = Number(String(s).replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? Math.round(v * 1000) : NaN; };
const dt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const badge = (f, v) => '<span class="b b-' + esc(v) + '">' + esc(L[f][v] || v) + '</span>';
const COOKIE = 'fd_adm';

const CSS = `:root{--g:#236B38;--g2:#1A5129;--gl:#E6EFE3;--milk:#F8F7F2;--sand:#EEDDC6;--ink:#20271F;--mut:#5E665B;--line:#E6E3DA;--err:#A2342A}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--milk)}
a{color:var(--g)}header{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:2}
header .w{display:flex;gap:12px;align-items:center;justify-content:space-between;min-height:56px}
.w{max-width:1100px;margin:0 auto;padding:0 16px}h1{font-size:22px;margin:20px 0 12px}h2{font-size:17px;margin:0 0 10px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin:0 0 12px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.tabs a{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;text-decoration:none;color:var(--ink);font-weight:600;font-size:14px}
.tabs a.on{background:var(--g);color:#fff;border-color:var(--g)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}th{color:var(--mut);font-weight:600;font-size:12.5px}
.r{text-align:right;white-space:nowrap}.mut{color:var(--mut);font-size:13px}
.b{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12.5px;font-weight:700;background:#eee;margin:1px 0;white-space:nowrap}
.b-placed,.b-awaiting_manager_review,.b-requires_reconciliation,.b-not_started{background:var(--sand);color:#6b4410}
.b-processing,.b-picking,.b-weighed,.b-invoice_issued,.b-awaiting_bank_transfer,.b-pending,.b-authorized{background:#E4ECF6;color:#22416b}
.b-manual_transfer_confirmed,.b-captured,.b-ready_to_ship,.b-shipped,.b-delivered,.b-completed{background:var(--gl);color:var(--g)}
.b-cancelled,.b-failed,.b-expired,.b-refunded,.b-returned{background:#F6E2E0;color:var(--err)}
label{display:block;font-size:13px;font-weight:600;margin:0 0 4px}input,select{width:100%;height:44px;border:1px solid #D8D4C8;border-radius:10px;padding:0 12px;font:inherit;background:#fff}
input:focus,select:focus,button:focus-visible{outline:2px solid var(--g);outline-offset:1px}
.f{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
button{height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--g);color:#fff;font:inherit;font-weight:700;cursor:pointer}
button:hover{background:var(--g2)}button.sec{background:#fff;color:var(--ink);border:1px solid #D8D4C8}button.danger{background:#fff;color:var(--err);border:1px solid #e3b7b2}
.msg{padding:12px 14px;border-radius:12px;margin:12px 0;font-weight:600}.msg.ok{background:var(--gl);color:var(--g)}.msg.err{background:#F6E2E0;color:var(--err)}
.sum{display:grid;grid-template-columns:1fr auto;gap:4px 16px;max-width:420px}.sum b{text-align:right}
.due{font-size:18px;font-weight:800}.due.no{color:var(--g)}.due.yes{color:var(--err)}
.acts{display:grid;gap:12px}
.login{max-width:380px;margin:12vh auto}.login .card{padding:24px}
@media(max-width:700px){.hide-m{display:none}table.list tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}table.list td{display:inline-block;border:0;padding:2px 8px 2px 0}table.list thead{display:none}}`;
const JS = `document.addEventListener('submit',function(e){var m=e.target.getAttribute('data-confirm');if(m&&!window.confirm(m)){e.preventDefault();return}var b=e.target.querySelector('button[type=submit],button:not([type])');if(b){setTimeout(function(){b.disabled=true;b.textContent='Сохраняем…'},0)}});`;

function page(title, body, user, csrf) {
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">' +
    '<title>' + esc(title) + ' — кабинет Фруктового Дома</title><link rel="stylesheet" href="/admin/admin.css"><script src="/admin/app.js" defer></script></head><body>' +
    (user ? '<header><div class="w"><a href="/admin" style="font-weight:800;text-decoration:none">Фруктовый Дом · заказы</a><form method="post" action="/admin/logout" style="display:flex;gap:10px;align-items:center"><span class="mut">' + esc(user) + '</span><input type="hidden" name="csrf" value="' + esc(csrf) + '"><button class="sec" type="submit">Выйти</button></form></div></header>' : '') +
    '<main class="w">' + body + '</main></body></html>';
}

function create(ctx) {
  const { DB, O, D, auth, send, clientIp } = ctx;
  const SEC = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
  const html = (req, res, body, status, extra) => send(req, res, status || 200, 'text/html; charset=utf-8', body, Object.assign({}, SEC, extra || {}));
  const go = (res, to, cookie) => { const h = Object.assign({ location: to }, SEC); if (cookie) h['set-cookie'] = cookie; res.writeHead(303, h); res.end(); };
  const sidOf = req => { const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(req.headers.cookie || ''); return m ? m[1] : null; };
  const secure = req => process.env.COOKIE_SECURE === '1' || (+process.env.TRUST_PROXY > 0 && /https/.test(req.headers['x-forwarded-proto'] || ''));
  const cookie = (req, v, age) => COOKIE + '=' + v + '; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=' + age + (secure(req) ? '; Secure' : '');
  /* действие должно прийти с нашей же страницы */
  const sameOrigin = req => { const o = req.headers.origin || req.headers.referer || ''; try { return new URL(o).host === req.headers.host; } catch (e) { return false; } };

  function readForm(req) {
    return new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', d => { n += d.length; if (n > 20000) { no(new Error('big')); req.destroy(); } else ch.push(d); });
      req.on('end', () => { const p = new URLSearchParams(Buffer.concat(ch).toString('utf8')), o = {}; for (const [k, v] of p) { if (k.endsWith('[]')) (o[k] = o[k] || []).push(v); else o[k] = v; } ok(o); }); req.on('error', no); });
  }

  function loginPage(req, res, err) {
    return html(req, res, page('Вход', '<div class="login"><div class="card"><h1 style="margin-top:0">Вход в кабинет</h1>' + (err ? '<div class="msg err">' + esc(err) + '</div>' : '') +
      (auth.hasUsers() ? '' : '<div class="msg err">Вход не настроен: на сервере не задан ADMIN_USERS. <a href="/admin/setup">Настроить вход</a></div>') +
      '<form method="post" action="/admin/login"><label for="u">Имя</label><input id="u" name="user" autocomplete="username" required><div style="height:10px"></div>' +
      '<label for="p">Пароль</label><input id="p" type="password" name="password" autocomplete="current-password" required><div style="height:14px"></div><button type="submit" style="width:100%">Войти</button></form></div></div>'), err ? 401 : 200);
  }

  /* ---------- список ---------- */
  const TABS = [['need', 'Нужно действие'], ['work', 'В работе'], ['all', 'Все'], ['done', 'Выполненные'], ['cancel', 'Отменённые']];
  const needs = o => o.order_status !== 'cancelled' && (o.order_status === 'awaiting_manager_review' || !o.price_ok || o.order_status === 'placed' ||
    (o.final_total_k != null && o.paid_k < o.final_total_k) || o.fulfillment_status === 'ready_to_ship');
  async function listPage(req, res, s, u) {
    const tab = TABS.some(t => t[0] === u.searchParams.get('tab')) ? u.searchParams.get('tab') : 'need', q = (u.searchParams.get('q') || '').replace(/\D/g, '');
    let rows = await O.listOrders(DB, { limit: 500, no: q || undefined });
    if (!q) rows = rows.filter(o => tab === 'all' ? true : tab === 'need' ? needs(o) : tab === 'work' ? o.order_status === 'processing' : tab === 'done' ? o.order_status === 'completed' : o.order_status === 'cancelled');
    const body = '<h1>Заказы</h1><form method="get" action="/admin" class="f" style="max-width:420px"><div><label for="q">Номер заказа</label><input id="q" name="q" inputmode="numeric" value="' + esc(q) + '"></div><button type="submit" class="sec">Найти</button></form>' +
      '<nav class="tabs">' + TABS.map(t => '<a href="/admin?tab=' + t[0] + '"' + (t[0] === tab && !q ? ' class="on"' : '') + '>' + t[1] + '</a>').join('') + '</nav>' +
      '<div class="card" style="padding:4px 12px"><table class="list"><thead><tr><th>№</th><th>Дата</th><th>Покупатель</th><th class="r">Сумма</th><th>Статус</th><th>Оплата</th><th>Сборка</th></tr></thead><tbody>' +
      (rows.length ? rows.map(o => '<tr><td><a href="/admin/order/' + o.no + '"><b>' + o.no + '</b></a></td><td class="mut">' + dt(o.created_at) + '</td><td>' + esc(o.name || o.phone) +
        (o.who === 'nds' ? ' <span class="mut">· счёт</span>' : '') + (o.price_ok ? '' : ' <span class="b b-requires_reconciliation">цены?</span>') + '</td><td class="r">' + money(o.final_total_k != null ? o.final_total_k : o.total_k) +
        '</td><td>' + badge('order_status', o.order_status) + '</td><td>' + badge('payment_status', o.payment_status) + '</td><td>' + badge('fulfillment_status', o.fulfillment_status) + '</td></tr>').join('')
        : '<tr><td colspan="7" class="mut" style="padding:24px 8px">Заказов нет</td></tr>') + '</tbody></table></div>';
    return html(req, res, page('Заказы', body, s.user, s.csrf));
  }

  /* ---------- карточка ---------- */
  async function orderPage(req, res, s, no, u) {
    const row = await DB.get('SELECT id FROM orders WHERE no = ?', no);
    if (!row) return html(req, res, page('Не найден', '<h1>Заказ не найден</h1><a href="/admin">К списку</a>', s.user, s.csrf), 404);
    const o = await O.getOrder(DB, row.id), can = s.role !== 'viewer', due = o.due_k, msg = u.searchParams.get('m'), mt = u.searchParams.get('t') === 'ok' ? 'ok' : 'err';
    const hid = '<input type="hidden" name="csrf" value="' + esc(s.csrf) + '"><input type="hidden" name="version" value="' + o.version + '">';
    const form = (act, inner, opt) => '<form method="post" action="/admin/order/' + o.no + '"' + (opt && opt.confirm ? ' data-confirm="' + esc(opt.confirm) + '"' : '') + '>' + hid + '<input type="hidden" name="action" value="' + act + '">' + inner + '</form>';
    const today = new Date().toISOString().slice(0, 10), co = o.company || {};
    let acts = [];
    if (can && o.order_status !== 'cancelled') {
      if (!o.price_ok) acts.push('<div class="card"><h2>Цены не подтверждены</h2><p class="mut">Заказ принят, когда цены на сайте могли устареть. Пересчитайте по текущей «Витрине» — покупателю, возможно, нужно сообщить новую сумму.</p>' + form('reprice', '<button type="submit">Пересчитать по текущим ценам</button>', { confirm: 'Пересчитать заказ по текущим ценам?' }) + '</div>');
      if (o.price_ok && o.who === 'nds' && o.order_status === 'awaiting_manager_review')
        acts.push('<div class="card"><h2>Выставить счёт</h2>' + form('invoice', '<div class="f"><div><label>Номер счёта</label><input name="number" required></div><div><label>Дата</label><input type="date" name="date" value="' + today + '" required></div><div><label>Сумма, ₽</label><input name="amount" inputmode="decimal" value="' + (due / 100).toFixed(2).replace('.', ',') + '" required></div><div><label>Ссылка на файл (необязательно)</label><input name="url" type="url"></div><button type="submit">Счёт выставлен</button></div>') + '<p class="mut">Выставленный счёт — ещё не оплата.</p></div>');
      if (o.price_ok && due > 0 && !(o.who === 'nds' && o.order_status === 'awaiting_manager_review'))
        acts.push('<div class="card"><h2>Отметить поступление денег</h2>' + form('pay', '<div class="f"><div><label>Сумма, ₽</label><input name="amount" inputmode="decimal" value="' + (due / 100).toFixed(2).replace('.', ',') + '" required></div><div><label>Дата поступления</label><input type="date" name="date" value="' + today + '" required></div><div><label>Как оплатили</label><select name="method"><option value="transfer">Перевод по счёту</option><option value="link">По ссылке (карта/СБП)</option><option value="cash">Наличными</option></select></div><div><label>Основание (№ платёжки, выписка)</label><input name="basis" required></div><button type="submit">Деньги получены</button></div>', { confirm: 'Подтвердить, что деньги действительно поступили?' }) + '<p class="mut">Отмечайте только по выписке банка или после проверки. Скриншот клиента — не оплата.</p></div>');
      if (o.fulfillment_status === 'not_released' && o.price_ok) acts.push('<div class="card">' + form('picking', '<button type="submit">Начать сборку</button>') + (o.who === 'nds' && !o.paid_k ? '<p class="mut">Заказ со счётом собираем после оплаты.</p>' : '') + '</div>');
      if (o.fulfillment_status === 'picking' || o.fulfillment_status === 'weighed')
        acts.push('<div class="card"><h2>Фактический вес</h2>' + form('weigh', '<table><tbody>' + o.items.map(i => '<tr><td>' + esc(i.name) + '<div class="mut">заказано ' + kg(i.qty_g) + '</div></td><td style="width:140px"><label class="mut">кг</label><input name="w[]" inputmode="decimal" value="' + ((i.actual_g != null ? i.actual_g : i.qty_g) / 1000).toString().replace('.', ',') + '"></td></tr>').join('') + '</tbody></table><div style="height:10px"></div><button type="submit">Сохранить вес и пересчитать</button>') + '</div>');
      const next = { picking: o.has_weight ? null : ['ready_to_ship', 'Готов к отгрузке'], weighed: ['ready_to_ship', 'Готов к отгрузке'], ready_to_ship: ['shipped', 'Отгружен'], shipped: ['delivered', 'Доставлен'] }[o.fulfillment_status];
      if (next) acts.push('<div class="card">' + form('fulfill', '<input type="hidden" name="to" value="' + next[0] + '"><button type="submit">' + next[1] + '</button>' + (due > 0 && next[0] !== 'delivered' ? '<p class="mut">Не оплачено ' + money(due) + ' — отгрузить не получится.</p>' : '')) + '</div>');
      if (!o.paid_k && !['shipped', 'delivered'].includes(o.fulfillment_status))
        acts.push('<div class="card"><h2>Отменить заказ</h2>' + form('cancel', '<div class="f"><div><label>Причина</label><input name="reason" required></div><button type="submit" class="danger">Отменить</button></div>', { confirm: 'Отменить заказ? Это нельзя вернуть.' }) + '</div>');
    }
    const body = '<p><a href="/admin">← Все заказы</a></p><h1>Заказ № ' + o.no + ' <span class="mut" style="font-size:14px;font-weight:400">от ' + dt(o.created_at) + '</span></h1>' +
      (msg ? '<div class="msg ' + mt + '">' + esc(msg) + '</div>' : '') +
      '<div class="card">' + badge('order_status', o.order_status) + ' ' + badge('payment_status', o.payment_status) + ' ' + badge('fulfillment_status', o.fulfillment_status) +
      (o.price_ok ? '' : ' <span class="b b-requires_reconciliation">цены не подтверждены</span>') + '<div style="height:12px"></div>' +
      '<div class="sum"><span>Товары</span><b>' + money(o.final_goods_k != null ? o.final_goods_k : o.goods_k) + '</b><span>Доставка (' + (o.zone === 'msk' ? 'Москва' : 'МО') + ')</span><b>' + money(o.final_fee_k != null ? o.final_fee_k : o.fee_k) + '</b>' +
      (o.who === 'nds' ? '<span>НДС</span><b>' + money(o.final_vat_k != null ? o.final_vat_k : o.vat_k) + '</b>' : '') +
      '<span>Итого по заказу</span><b>' + money(o.total_k) + '</b>' + (o.final_total_k != null ? '<span>Окончательно (по весу)</span><b>' + money(o.final_total_k) + '</b>' : '') +
      '<span>Оплачено</span><b>' + money(o.paid_k) + '</b></div><div style="height:8px"></div><div class="due ' + (due > 0 ? 'yes' : 'no') + '">' + (due > 0 ? 'К оплате: ' + money(due) : due < 0 ? 'Переплата: ' + money(-due) : 'Оплачено полностью') + '</div></div>' +
      '<div class="card"><h2>Покупатель</h2>' + (o.who === 'nds' ? '<div><b>' + esc(co.name) + '</b>, ИНН ' + esc(co.inn) + (co.kpp ? ', КПП ' + esc(co.kpp) : '') + '</div><div class="mut">Счёт на ' + esc(co.email) + '</div>' : '<div><b>' + esc(o.name || '—') + '</b></div>') +
      '<div>' + esc(o.phone) + (o.email ? ' · ' + esc(o.email) : '') + '</div><div>' + esc(o.addr) + '</div>' + (o.comment ? '<div class="mut">«' + esc(o.comment) + '»</div>' : '') + (o.src ? '<div class="mut">Источник: ' + esc(o.src) + '</div>' : '') + (o.customer_id ? '<div class="mut">Из личного кабинета покупателя</div>' : '') + '</div>' +
      '<div class="card"><h2>Товары</h2><table><thead><tr><th>Товар</th><th class="r">Заказано</th><th class="r hide-m">Цена</th><th class="r">Факт</th><th class="r">Сумма</th></tr></thead><tbody>' +
      o.items.map(i => '<tr><td>' + esc(i.name) + (i.mode === 'pack' ? ' <span class="mut">мешком</span>' : '') + (i.weighed ? ' <span class="mut">· весовой</span>' : '') + '</td><td class="r">' + kg(i.qty_g) + '</td><td class="r hide-m">' + money(i.final_price_k != null ? i.final_price_k : i.price_k) + '/кг</td><td class="r">' + (i.actual_g != null ? kg(i.actual_g) : '—') + '</td><td class="r">' + money(i.final_sum_k != null ? i.final_sum_k : i.sum_k) + '</td></tr>').join('') + '</tbody></table></div>' +
      (acts.length ? '<div class="acts">' + acts.join('') + '</div>' : '') +
      (o.invoices.length ? '<div class="card"><h2>Счета</h2>' + o.invoices.map(i => '<div>№ ' + esc(i.number) + ' от ' + esc(i.date) + ' · ' + money(i.amount_k) + (i.url ? ' · <a href="' + esc(/^https:\/\//.test(i.url) ? i.url : '#') + '" rel="noopener noreferrer" target="_blank">файл</a>' : '') + ' <span class="mut">(' + esc(i.created_by) + ')</span></div>').join('') + '</div>' : '') +
      (o.payments.length ? '<div class="card"><h2>Оплаты</h2>' + o.payments.map(p => '<div>' + money(p.captured_k) + ' · ' + esc(p.paid_on || '') + ' · ' + esc({ transfer: 'перевод', link: 'по ссылке', cash: 'наличные' }[p.method] || p.method) + ' · ' + esc(p.basis || '') + ' <span class="mut">(отметил ' + esc(p.created_by) + ')</span></div>').join('') + '</div>' : '') +
      '<div class="card"><h2>История</h2>' + o.history.map(h => '<div class="mut">' + dt(h.at) + ' · ' + esc(h.actor) + ': ' + esc((L[h.field] || {})[h.to_v] || h.to_v) + (h.reason ? ' — ' + esc(h.reason) : '') + '</div>').join('') + '</div>';
    return html(req, res, page('Заказ ' + o.no, body, s.user, s.csrf));
  }

  async function doAction(req, res, s, no) {
    const f = await readForm(req);
    if (!auth.csrfOk(s, f.csrf)) return html(req, res, page('Ошибка', '<h1>Форма устарела</h1><p>Обновите страницу и повторите.</p><a href="/admin">К заказам</a>', s.user, s.csrf), 403);
    if (s.role === 'viewer') return html(req, res, page('Нет прав', '<h1>Нет прав на изменение заказов</h1>', s.user, s.csrf), 403);
    const row = await DB.get('SELECT id FROM orders WHERE no = ?', no);
    if (!row) return go(res, '/admin');
    const id = row.id, v = f.version == null ? null : +f.version, who = s.user, back = (m, ok) => go(res, '/admin/order/' + no + '?t=' + (ok ? 'ok' : 'err') + '&m=' + encodeURIComponent(m));
    try {
      switch (f.action) {
        case 'reprice': { const c = await D.getCatalog(); const fresh = c.fetchedAt && Date.now() - c.fetchedAt < 30 * 60000;
          if (!fresh) return back('Цены из таблицы сейчас недоступны или устарели — попробуйте через несколько минут');
          await O.reprice(DB, id, { items: c.items, source: c.source, at: c.fetchedAt, updated: c.updated }, who, v); return back('Цены пересчитаны', true); }
        case 'invoice': { const a = rubToK(f.amount); if (!(a > 0)) return back('Неверная сумма счёта');
          await O.issueInvoice(DB, id, { number: f.number, date: f.date, amountK: a, url: f.url && /^https:\/\//.test(f.url) ? f.url : '' }, who, v); return back('Счёт записан. Ждём оплату.', true); }
        case 'pay': { const a = rubToK(f.amount); if (!(a > 0)) return back('Неверная сумма');
          await O.confirmTransfer(DB, id, { amountK: a, date: f.date, basis: f.basis, method: ['transfer', 'link', 'cash'].includes(f.method) ? f.method : 'transfer' }, who, v); return back('Оплата отмечена', true); }
        case 'picking': await O.startPicking(DB, id, who, v); return back('Сборка начата', true);
        case 'weigh': { const w = (f['w[]'] || []).map(kgToG); if (w.some(x => x !== null && !(x >= 0))) return back('Вес — число в килограммах, например 11,5');
          const o = await O.setWeights(DB, id, w, who, v); return back('Вес сохранён. Окончательно: ' + money(o.final_total_k) + (o.due_k > 0 ? '. Нужна доплата ' + money(o.due_k) : ''), true); }
        case 'fulfill': await O.setFulfillment(DB, id, String(f.to || ''), who, v); return back('Готово', true);
        case 'cancel': await O.cancelOrder(DB, id, f.reason, who, v); return back('Заказ отменён', true);
        default: return back('Неизвестное действие');
      }
    } catch (e) {
      if (e instanceof O.OrderError) return back(e.message);
      console.error('Кабинет:', e); return back('Ошибка сервера — действие не выполнено');
    }
  }

  /* ---------- первая настройка входа (только пока ADMIN_USERS не задан) ----------
     Пароль превращается в отпечаток на сервере и показывается строкой для настройки ADMIN_USERS в панели хостинга.
     Сам пароль нигде не сохраняется; после того как ADMIN_USERS задан, страница не открывается. */
  const setupHits = new Map();
  const LINE_RE = /^[^:;\s<>"'&][^:;<>"'&]{0,39}:(admin|manager|viewer):scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;
  const ROLE_TXT = { admin: 'владелец — всё', manager: 'менеджер — все действия с заказами', viewer: 'склад — только смотреть' };
  function setupPage(req, res, acc, err) {
    const lines = acc.filter(x => LINE_RE.test(x));
    const out = lines.length ? '<div class="card"><h2>Готово: строка для настройки ADMIN_USERS</h2><p>Пользователи: ' + lines.map(l => '<b>' + esc(l.split(':')[0]) + '</b> (' + esc(ROLE_TXT[l.split(':')[1]]) + ')').join(', ') + '</p>' +
      '<textarea readonly rows="4" style="width:100%;font:12px monospace">' + esc(lines.join(';')) + '</textarea>' +
      '<p class="mut">Скопируйте всё из этого поля → Timeweb → приложение → Настройки → Настройки деплоя → «Редактировать» → Переменные → «Добавить»: название <b>ADMIN_USERS</b>, значение — эта строка. Сохранить. Пароль в строке не виден — только его «отпечаток».</p></div>' : '';
    const body = '<div class="login" style="max-width:560px"><h1>Настройка входа в кабинет</h1>' + (err ? '<div class="msg err">' + esc(err) + '</div>' : '') + out +
      '<div class="card"><h2>' + (lines.length ? 'Добавить ещё пользователя' : 'Первый пользователь') + '</h2><form method="post" action="/admin/setup">' +
      lines.map(l => '<input type="hidden" name="acc[]" value="' + esc(l) + '">').join('') +
      '<label for="n">Имя для входа</label><input id="n" name="name" maxlength="40" required autocomplete="off"><div style="height:10px"></div>' +
      '<label for="r">Права</label><select id="r" name="role"><option value="admin">Владелец — всё</option><option value="manager">Менеджер — все действия с заказами</option><option value="viewer">Склад — только смотреть</option></select><div style="height:10px"></div>' +
      '<label for="p1">Пароль (не меньше 10 символов)</label><input id="p1" type="password" name="pw" minlength="10" required autocomplete="new-password"><div style="height:10px"></div>' +
      '<label for="p2">Пароль ещё раз</label><input id="p2" type="password" name="pw2" minlength="10" required autocomplete="new-password"><div style="height:14px"></div>' +
      '<button type="submit" style="width:100%">Получить строку</button></form><p class="mut">Пароль запомните или сохраните у себя — восстановить его нельзя, только задать новый.</p></div></div>';
    return html(req, res, page('Настройка входа', body), err ? 400 : 200);
  }
  async function setupPost(req, res) {
    const ip = clientIp(req), now = Date.now(), a = (setupHits.get(ip) || []).filter(t => now - t < 600000); a.push(now); setupHits.set(ip, a);
    if (setupHits.size > 2000) setupHits.clear();
    const f = await readForm(req), acc = (f['acc[]'] || []).slice(0, 10);
    if (a.length > 20) return setupPage(req, res, acc, 'слишком много попыток — подождите 10 минут');
    const name = String(f.name || '').trim(), role = ['admin', 'manager', 'viewer'].includes(f.role) ? f.role : null, pw = String(f.pw || '');
    if (!name || name.length > 40 || /[:;<>"'&]/.test(name)) return setupPage(req, res, acc, 'имя — без знаков : ; < > " \' &');
    if (!role) return setupPage(req, res, acc, 'выберите права');
    if (pw.length < 10) return setupPage(req, res, acc, 'пароль — не меньше 10 символов');
    if (pw !== String(f.pw2 || '')) return setupPage(req, res, acc, 'пароли не совпадают');
    if (acc.some(l => l.split(':')[0].toLowerCase() === name.toLowerCase())) return setupPage(req, res, acc, 'такое имя уже есть');
    return setupPage(req, res, acc.concat(name + ':' + role + ':' + hashPassword(pw)));
  }

  return async function handle(req, res, p, u) {
    if (p === '/admin/admin.css') return send(req, res, 200, 'text/css; charset=utf-8', CSS, { 'cache-control': 'no-cache' });
    if (p === '/admin/app.js') return send(req, res, 200, 'text/javascript; charset=utf-8', JS, { 'cache-control': 'no-cache' });
    const sid = sidOf(req), s = auth.get(sid);
    if (req.method === 'POST' && !sameOrigin(req)) return html(req, res, page('Ошибка', '<h1>Запрос отклонён</h1>'), 403);
    if (p === '/admin/setup') {
      if (auth.hasUsers()) return go(res, '/admin/login');
      if (req.method === 'GET') return setupPage(req, res, []);
      if (req.method === 'POST') return setupPost(req, res);
      return html(req, res, 'Method not allowed', 405);
    }
    if (p === '/admin/login') {
      if (req.method === 'GET') return s ? go(res, '/admin') : loginPage(req, res);
      if (req.method !== 'POST') return html(req, res, 'Method not allowed', 405);
      const f = await readForm(req), r = auth.login(f.user, f.password, clientIp(req));
      if (!r.ok) return loginPage(req, res, r.error);
      if (sid) auth.logout(sid);
      return go(res, '/admin', cookie(req, r.sid, 43200));
    }
    if (!s) return req.method === 'GET' ? go(res, '/admin/login') : html(req, res, page('Вход', '<h1>Войдите заново</h1><a href="/admin/login">Вход</a>'), 401);
    if (p === '/admin/logout' && req.method === 'POST') { const f = await readForm(req); if (auth.csrfOk(s, f.csrf)) auth.logout(sid); return go(res, '/admin/login', cookie(req, '', 0)); }
    if (p === '/admin' && req.method === 'GET') return listPage(req, res, s, u);
    const m = /^\/admin\/order\/(\d{1,9})$/.exec(p);
    if (m && req.method === 'GET') return orderPage(req, res, s, +m[1], u);
    if (m && req.method === 'POST') return doAction(req, res, s, +m[1]);
    return html(req, res, page('Не найдено', '<h1>Не найдено</h1><a href="/admin">К заказам</a>', s.user, s.csrf), 404);
  };
}

module.exports = { create };
