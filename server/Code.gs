/**
 * Сервер магазина «Фруктовый Дом» (frudom.ru).
 * Живёт в таблице «Магазин Фруктовый Дом» → Расширения → Apps Script → файл Code.gs.
 * Листы: «Витрина» (товары и цены), «Заказы с сайта» (сюда пишутся заказы), «Товары» (цены из «Документы ФД», только чтение).
 * Таблицу «Документы ФД» этот скрипт НЕ трогает.
 *
 * Что умеет:
 *   ?action=shopCatalog            — отдаёт товары с листа «Витрина» (где «Показывать» = да)
 *   POST {action:"shopOrder", ...} — принимает заказ, пишет строку на лист «Заказы с сайта» и шлёт письмо владельцу
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
  const rows = sh.getRange(2, 1, n - 1, 16).getDisplayValues(), out = [];
  rows.forEach((r, i) => {
    const name = str_(r[0], 120), p = num_(r[8]);
    if (!name || !(p > 0) || String(r[2]).trim().toLowerCase() !== 'да') return;
    const o = { id: i + 1, n: name, c: str_(r[1], 60) || 'Другое', o: num_(r[3]) || 9999, p: p, u: 'кг', w: String(r[13]).trim().toLowerCase() === 'да' ? 1 : 0, vat: num_(r[14]) };
    const pack = str_(r[10], 30).toLowerCase(), step = num_(r[11]), th = num_(r[12]), pk = num_(r[9]);
    if (pack && step > 0 && th > 0 && pk > 0) Object.assign(o, { pk: pk, pack: pack, step: step, th: th });
    if (/^https:\/\//.test(r[15])) o.img = str_(r[15], 500);
    out.push(o);
  });
  return out.sort((a, b) => a.o - b.o);
}

function shopCatalog_() {
  const items = shopItems_();
  if (!items) return { ok: false, error: 'нет листа «' + SHOP_SHEET + '»' };
  return { ok: true, updated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), items: items };
}

function shopOrder_(p) {
  let o = p.order; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (x) { o = null; } }
  if (!o || typeof o !== 'object') return { ok: false, error: 'пустой заказ' };
  if (o.hp) return { ok: true, no: 0 };                       /* ловушка для роботов: молча игнорируем */
  const phone = str_(o.phone, 40), who = o.who === 'nds' ? 'nds' : 'nonds', zone = o.zone === 'mo' ? 'mo' : 'msk', co = o.company || {};
  if (phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'укажите телефон' };
  if (who === 'nds' && (!str_(co.inn) || !str_(co.name))) return { ok: false, error: 'укажите ИНН и название компании' };
  const items = shopItems_() || [], byName = {}; items.forEach(x => byName[x.n] = x);
  const lines = (Array.isArray(o.items) ? o.items : []).slice(0, 80).map(l => {
    const it = byName[str_(l.n, 120)], k = Math.max(0, num_(l.qty)), pack = l.mode === 'pack';
    const up = !it ? num_(l.price) : (!it.pk || pack || k >= it.th) ? it.p : it.pk;
    return { n: str_(l.n, 120), qty: k, mode: pack ? 'pack' : 'kg', price: up, sum: Math.round(k * up * 100) / 100, known: !!it };
  }).filter(l => l.qty > 0);
  if (!lines.length) return { ok: false, error: 'в заказе нет товаров' };
  const goods = lines.reduce((s, l) => s + l.sum, 0), thr = zone === 'msk' ? 30000 : 50000;
  const fee = goods >= thr ? 0 : (zone === 'msk' ? 690 : 1290), vat = who === 'nds' ? Math.round((goods + fee) * 0.10) : 0, total = Math.round((goods + fee + vat) * 100) / 100;
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  let no;
  try {
    const pr = PropertiesService.getScriptProperties();
    no = (parseInt(pr.getProperty('shopNo') || '1000', 10) || 1000) + 1; pr.setProperty('shopNo', String(no));
    const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(SHOP_ORDERS);
    if (!sh) sh = ss.insertSheet(SHOP_ORDERS);
    if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, SHOP_ORDER_COLS.length).setValues([SHOP_ORDER_COLS]); sh.setFrozenRows(1); }
    const list = lines.map(l => l.n + ' — ' + String(l.qty).replace('.', ',') + ' кг × ' + l.price + ' ₽' + (l.known ? '' : ' (нет на витрине!)')).join('\n');
    const row = [no, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), who === 'nds' ? 'С НДС (счёт)' : 'Без НДС', 'Новый',
      who === 'nds' ? str_(co.name) : str_(o.name, 100), phone, str_(who === 'nds' ? co.email : o.email, 100), str_(o.addr || co.daddr, 300), str_(o.comment, 500),
      str_(co.inn, 12), str_(co.kpp, 9), str_(co.ogrn, 15), str_(co.addr, 300), zone === 'msk' ? 'Москва' : 'МО', list,
      Math.round(goods * 100) / 100, fee, vat, num_(o.total), total, JSON.stringify(lines).slice(0, 45000)];
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    try { if (typeof MailApp !== 'undefined') MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Заказ с сайта № ' + no + ' — ' + total + ' ₽',
      'Новый заказ с сайта frudom.ru\n\n' + SHOP_ORDER_COLS.slice(0, 20).map((h, i) => h + ': ' + row[i]).join('\n')); } catch (x) {}
  } finally { lock.releaseLock(); }
  return { ok: true, no: no, total: total, goods: goods, fee: fee, vat: vat };
}

