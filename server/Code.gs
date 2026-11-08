/**
 * Сервер магазина «Фруктовый Дом» (frudom.ru).
 * Живёт в таблице «Магазин Фруктовый Дом» → Расширения → Apps Script → файл Code.gs.
 * Листы: «Витрина» (товары и цены; колонка Q — описание товара для сайта), «Заказы с сайта» (сюда пишутся заказы), «Товары» (цены из «Документы ФД», только чтение).
 * Таблицу «Документы ФД» этот скрипт НЕ трогает.
 *
 * Что умеет:
 *   ?action=shopCatalog            — отдаёт товары с листа «Витрина» (где «Показывать» = да)
 *   POST {action:"shopOrder", ...} — принимает заказ, пишет строку на лист «Заказы с сайта» и шлёт письмо владельцу
 *   POST {action:"shopMail", key, to, subject, text, html} — письмо покупателю (код входа в личный кабинет).
 *        Ключ key сайт присылает сам; первый присланный ключ запоминается (свойство MAIL_KEY), чужой ключ — отказ.
 *        Если сайт переехал или ключ сменился: Apps Script → Настройки проекта → Свойства скрипта → удалить MAIL_KEY.
 */

/* Запустите один раз вручную (выбрать authorize → Выполнить → Разрешить), чтобы скрипт мог отправлять письма */
function authorize() {
  Logger.log('Таблица: ' + SpreadsheetApp.getActive().getName());
  Logger.log('Писем о заказах можно отправить сегодня: ' + MailApp.getRemainingDailyQuota());
  return 'ok';
}

function doGet(e)  { return out_(handle_(Object.assign({}, e && e.parameter))); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return out_(handle_(p)); }
function out_(o)   { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  try {
    if (p.action === 'shopCatalog') return shopCatalog_();
    if (p.action === 'shopOrder') return shopOrder_(p);
    if (p.action === 'shopMail') return shopMail_(p);
    return { ok: true, shop: 'frudom', hint: 'используйте action=shopCatalog' };
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
}

const SHOP_SHEET = 'Витрина', SHOP_ORDERS = 'Заказы с сайта';
const SHOP_ORDER_COLS = ['№ заказа','Время','Тип','Статус','Имя / компания','Телефон','Email','Адрес доставки','Комментарий','ИНН','КПП','ОГРН','Юр. адрес',
  'Зона','Товары','Сумма товаров','Доставка','НДС','Итого (сайт)','Итого (проверка сервера)','Состав (JSON)'];
const num_ = v => { const x = parseFloat(String(v == null ? '' : v).replace(/\s| /g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
const str_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);

function shopItems_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHOP_SHEET);
  if (!sh) return null;
  const n = sh.getLastRow();
  if (n < 2) return [];
  const rows = sh.getRange(2, 1, n - 1, 17).getDisplayValues(), out = [];
  rows.forEach((r, i) => {
    const name = str_(r[0], 120), p = num_(r[8]);
    if (!name || !(p > 0) || String(r[2]).trim().toLowerCase() !== 'да') return;
    const o = { id: i + 1, n: name, c: str_(r[1], 60) || 'Другое', o: num_(r[3]) || 9999, p: p, u: 'кг', w: String(r[13]).trim().toLowerCase() === 'да' ? 1 : 0, vat: num_(r[14]) };
    const pack = str_(r[10], 30).toLowerCase(), step = num_(r[11]), th = num_(r[12]), pk = num_(r[9]);
    if (pack && step > 0 && th > 0 && pk > 0) Object.assign(o, { pk: pk, pack: pack, step: step, th: th });
    if (/^https:\/\//.test(r[15])) o.img = str_(r[15], 500);
    if (str_(r[16], 3000)) o.d = str_(r[16], 3000);      /* колонка Q «Описание для сайта» */
    out.push(o);
  });
  return out.sort((a, b) => a.o - b.o);
}

function shopCatalog_() {
  const items = shopItems_();
  if (!items) return { ok: false, error: 'нет листа «' + SHOP_SHEET + '»' };
  return { ok: true, updated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), items: items };
}

/* ===== Приём заказа. Сервер — единственный источник цены: из браузера берём только товар, количество и способ (кг / мешок).
   Цена, доставка, НДС и итог считаются здесь, в копейках (целые числа). Неизвестный или снятый с витрины товар — отказ. ===== */
const ORDER_MAX_LINES = 80, ORDER_MAX_KG = 5000;
/* защита от «формул» в таблице: строка, начинающаяся с = + - @, иначе станет формулой */
const cell_ = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
const kop_ = r => Math.round(num_(r) * 100);
const rub_ = k => Math.round(k) / 100;
function orderErr_(error, code, extra) { return Object.assign({ ok: false, error: error, code: code || 'invalid' }, extra || {}); }

/* Проверка и пересчёт заказа. Возвращает {ok:true, lines, goodsK, feeK, vatK, totalK} или отказ. Ничего не пишет. */
function orderCalc_(o, items) {
  const who = o.who === undefined ? 'nonds' : o.who, zone = o.zone === undefined ? 'msk' : o.zone;
  if (who !== 'nds' && who !== 'nonds') return orderErr_('неизвестный тип заказа');
  if (zone !== 'msk' && zone !== 'mo') return orderErr_('неизвестная зона доставки');
  const src = Array.isArray(o.items) ? o.items : [];
  if (!src.length) return orderErr_('в заказе нет товаров', 'empty');
  if (src.length > ORDER_MAX_LINES) return orderErr_('слишком много позиций в одном заказе — позвоните нам', 'too_many');
  const byName = {}; items.forEach(x => byName[x.n] = x);
  const merged = {}, order = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i] || {}, n = str_(l.n, 120), it = byName[n];
    if (!it) return orderErr_('товара «' + (n || '?') + '» нет в каталоге — обновите страницу', 'unknown_item', { item: n });
    const mode = l.mode === undefined || l.mode === 'kg' ? 'kg' : l.mode === 'pack' ? 'pack' : null;
    if (!mode || (mode === 'pack' && !it.pk)) return orderErr_('неверный способ покупки у «' + n + '»');
    const k = typeof l.qty === 'number' ? l.qty : num_(l.qty);
    if (!isFinite(k) || k <= 0 || k > ORDER_MAX_KG) return orderErr_('неверное количество у «' + n + '»', 'bad_qty', { item: n });
    let qC = Math.round(k * 100);                                  /* сотые доли кг */
    if (mode === 'pack') {
      const bags = Math.round(k / it.step);
      if (bags < 1 || Math.abs(bags * it.step - k) > 0.01) return orderErr_('у «' + n + '» количество должно быть целым числом ' + it.pack + 'ов', 'bad_qty', { item: n });
      qC = Math.round(bags * it.step * 100);
    }
    if (qC < 1) return orderErr_('неверное количество у «' + n + '»', 'bad_qty', { item: n });
    const key = n + '|' + mode;
    if (!merged[key]) { merged[key] = { it: it, n: n, mode: mode, qC: 0 }; order.push(key); }
    merged[key].qC += qC;
  }
  const lines = order.map(key => {
    const m = merged[key], it = m.it, k = m.qC / 100;
    if (k > ORDER_MAX_KG) return null;
    const pK = (!it.pk || m.mode === 'pack' || k >= it.th) ? kop_(it.p) : kop_(it.pk);
    return { n: m.n, qty: k, mode: m.mode, price: rub_(pK), sumK: Math.round(pK * m.qC / 100), w: it.w ? 1 : 0 };
  });
  if (lines.some(l => !l)) return orderErr_('слишком большое количество — позвоните нам', 'bad_qty');
  const goodsK = lines.reduce((s, l) => s + l.sumK, 0), thrK = zone === 'msk' ? 3000000 : 5000000;
  const feeK = goodsK >= thrK ? 0 : (zone === 'msk' ? 69000 : 129000);
  /* НДС — как было на сайте: 10% от (товары + доставка), округление до рубля. Ставку нужно подтвердить с бухгалтером (см. отчёт). */
  const vatK = who === 'nds' ? Math.round((goodsK + feeK) / 1000) * 100 : 0;
  if (who === 'nds' && goodsK < 500000) return orderErr_('минимальная сумма заказа со счётом — 5 000 ₽', 'min_sum');
  return { ok: true, who: who, zone: zone, lines: lines, goodsK: goodsK, feeK: feeK, vatK: vatK, totalK: goodsK + feeK + vatK };
}

function shopOrder_(p) {
  let o = p.order; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (x) { o = null; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return orderErr_('пустой заказ', 'empty');
  if (o.hp) return { ok: true, no: 0 };                       /* ловушка для роботов: молча игнорируем */
  const phone = str_(o.phone, 40), co = (o.company && typeof o.company === 'object') ? o.company : {};
  if (phone.replace(/\D/g, '').length < 10) return orderErr_('укажите телефон', 'contacts');
  const items = shopItems_();
  if (!items || !items.length) return orderErr_('каталог временно недоступен — позвоните нам', 'catalog');
  const c = orderCalc_(o, items);
  if (!c.ok) return c;
  if (c.who === 'nds') {
    if (!str_(co.name)) return orderErr_('укажите название компании', 'contacts');
    if (!/^\d{10}(\d{2})?$/.test(str_(co.inn))) return orderErr_('ИНН — 10 цифр для компании или 12 для ИП', 'contacts');
    if (!/.+@.+\..+/.test(str_(co.email, 100))) return orderErr_('укажите email для счёта', 'contacts');
  }
  if (!str_(o.addr || co.daddr, 300)) return orderErr_('укажите адрес доставки', 'contacts');
  /* сумма, которую видел покупатель, должна совпасть с серверной (до рубля) — иначе цены успели измениться */
  const shown = num_(o.total);
  if (o.total !== undefined && o.total !== null && o.total !== '' && Math.abs(kop_(shown) - c.totalK) > 100)
    return orderErr_('цены обновились — проверьте сумму и отправьте заказ ещё раз', 'prices_changed',
      { total: rub_(c.totalK), lines: c.lines.map(l => ({ n: l.n, qty: l.qty, price: l.price })) });
  const key = /^[A-Za-z0-9_-]{8,64}$/.test(String(o.key || '')) ? String(o.key) : '';
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  let res;
  try {
    const pr = PropertiesService.getScriptProperties();
    if (key) { const was = pr.getProperty('ord_' + key); if (was) return JSON.parse(was); }   /* повтор того же заказа — тот же ответ */
    const no = (parseInt(pr.getProperty('shopNo') || '1000', 10) || 1000) + 1; pr.setProperty('shopNo', String(no));
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(SHOP_ORDERS);
    if (!sh) sh = ss.insertSheet(SHOP_ORDERS);
    if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, SHOP_ORDER_COLS.length).setValues([SHOP_ORDER_COLS]); sh.setFrozenRows(1); }
    const nds = c.who === 'nds';
    const list = c.lines.map(l => l.n + ' — ' + String(l.qty).replace('.', ',') + ' кг' + (l.mode === 'pack' ? ' (мешком)' : '') + ' × ' + String(l.price).replace('.', ',') + ' ₽').join('\n');
    const row = [no, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), nds ? 'С НДС (счёт)' : 'Без НДС', 'Новый',
      nds ? str_(co.name) : str_(o.name, 100), phone, str_(nds ? co.email : o.email, 100), str_(o.addr || co.daddr, 300), str_(o.comment, 500),
      str_(co.inn, 12), str_(co.kpp, 9), str_(co.ogrn, 15), str_(co.addr, 300), c.zone === 'msk' ? 'Москва' : 'МО', list,
      rub_(c.goodsK), rub_(c.feeK), rub_(c.vatK), shown || '', rub_(c.totalK),
      JSON.stringify(c.lines.map(l => ({ n: l.n, qty: l.qty, mode: l.mode, price: l.price, sum: rub_(l.sumK) }))).slice(0, 45000)].map(cell_);
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    res = { ok: true, no: no, total: rub_(c.totalK), goods: rub_(c.goodsK), fee: rub_(c.feeK), vat: rub_(c.vatK) };
    if (key) {
      pr.setProperty('ord_' + key, JSON.stringify(res));
      const keys = JSON.parse(pr.getProperty('ordKeys') || '[]'); keys.push(key);
      while (keys.length > 300) { const old = keys.shift(); try { pr.deleteProperty('ord_' + old); } catch (x) {} }
      pr.setProperty('ordKeys', JSON.stringify(keys));
    }
    try { if (typeof MailApp !== 'undefined') MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Заказ с сайта № ' + no + ' — ' + rub_(c.totalK) + ' ₽',
      'Новый заказ с сайта frudom.ru\n\n' + SHOP_ORDER_COLS.slice(0, 20).map((h, i) => h + ': ' + row[i]).join('\n')); } catch (x) {}
  } finally { lock.releaseLock(); }
  return res;
}



/* ===== Письмо покупателю (код входа в личный кабинет) ===== */
function shopMail_(p) {
  const key = String(p.key || '');
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(key)) return { ok: false, code: 'key', error: 'нет ключа' };
  const pr = PropertiesService.getScriptProperties(), was = pr.getProperty('MAIL_KEY');
  if (!was) pr.setProperty('MAIL_KEY', key);
  else if (was !== key) return { ok: false, code: 'mail_key', error: 'ключ почты не совпадает (удалите свойство MAIL_KEY в настройках скрипта)' };
  const to = String(p.to || '').trim().slice(0, 120);
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(to)) return { ok: false, code: 'to', error: 'неверный адрес' };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok: false, code: 'quota', error: 'лимит писем Google на сегодня исчерпан' };
  const opt = { name: 'Фруктовый Дом' };
  if (p.html) opt.htmlBody = String(p.html).slice(0, 20000);
  MailApp.sendEmail(to, String(p.subject || 'Фруктовый Дом').slice(0, 200), String(p.text || '').slice(0, 5000), opt);
  return { ok: true };
}
