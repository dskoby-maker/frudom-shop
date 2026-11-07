/* Расчёт заказа на сервере сайта. Те же правила, что в server/Code.gs (orderCalc_), но здесь — для базы заказов.
   Деньги — целые копейки, вес — целые граммы. Дробных чисел в итогах нет.
   Правило цены: мешком или от порога «Опт от, кг» — оптовая (p), иначе поштучная (pk). Без pk — одна цена.
   Доставка: Москва бесплатно от 30 000 ₽ (иначе 690), МО от 50 000 ₽ (иначе 1 290).
   НДС: только «С НДС», 10% от (товары + доставка), до рубля — как было на сайте; ставку должен подтвердить бухгалтер. */
'use strict';
const MAX_LINES = 80, MAX_KG = 5000;
const FEE = { msk: { thr: 3000000, fee: 69000 }, mo: { thr: 5000000, fee: 129000 } };
const MIN_INVOICE_K = 500000;

const kop = r => Math.round(Number(r) * 100);          /* рубли из каталога (2 знака) → копейки */
const rub = k => k / 100;
const num = v => typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s| /g, '').replace(',', '.'));
const err = (error, code, extra) => Object.assign({ ok: false, error, code: code || 'invalid' }, extra || {});

/* цена за кг в копейках для количества g граммов */
function unitK(it, g, mode) { return (!it.pk || mode === 'pack' || g >= Math.round(it.th * 1000)) ? kop(it.p) : kop(it.pk); }
/* сумма строки: цена за кг × граммы / 1000, округление до копейки (половина — вверх) */
const lineK = (pK, g) => Math.round(pK * g / 1000);

/* Разбор и проверка строк заказа. items — каталог (как отдаёт lib/data.js). Возвращает {ok, lines} или отказ. */
function parseLines(src, items) {
  if (!Array.isArray(src) || !src.length) return err('в заказе нет товаров', 'empty');
  if (src.length > MAX_LINES) return err('слишком много позиций в одном заказе — позвоните нам', 'too_many');
  const byName = new Map(items.map(x => [x.n, x]));
  const merged = new Map();
  for (const raw of src) {
    const l = raw && typeof raw === 'object' ? raw : {};
    const n = String(l.n == null ? '' : l.n).trim().slice(0, 120), it = byName.get(n);
    if (!it) return err('товара «' + (n || '?') + '» нет в каталоге — обновите страницу', 'unknown_item', { item: n });
    const mode = l.mode === undefined || l.mode === 'kg' ? 'kg' : l.mode === 'pack' ? 'pack' : null;
    if (!mode || (mode === 'pack' && !it.pk)) return err('неверный способ покупки у «' + n + '»');
    const k = num(l.qty);
    if (!isFinite(k) || k <= 0 || k > MAX_KG) return err('неверное количество у «' + n + '»', 'bad_qty', { item: n });
    let g = Math.round(k * 100) * 10;                      /* как в таблице: до 10 г (0,01 кг) */
    if (mode === 'pack') {
      const bags = Math.round(k / it.step);
      if (bags < 1 || Math.abs(bags * it.step - k) > 0.01) return err('у «' + n + '» количество должно быть целым числом упаковок', 'bad_qty', { item: n });
      g = Math.round(bags * it.step * 1000);
    }
    if (g < 10) return err('неверное количество у «' + n + '»', 'bad_qty', { item: n });
    const key = n + '|' + mode, m = merged.get(key) || { it, n, mode, g: 0 };
    m.g += g; merged.set(key, m);
  }
  const lines = [];
  for (const m of merged.values()) {
    if (m.g > MAX_KG * 1000) return err('слишком большое количество — позвоните нам', 'bad_qty');
    const pK = unitK(m.it, m.g, m.mode);
    lines.push({ n: m.n, key: m.it.key || m.n, mode: m.mode, g: m.g, priceK: pK, sumK: lineK(pK, m.g), w: m.it.w ? 1 : 0,
      optK: kop(m.it.p), retailK: m.it.pk ? kop(m.it.pk) : null, thG: m.it.pk ? Math.round(m.it.th * 1000) : null });
  }
  return { ok: true, lines };
}

/* Итоги по готовым строкам (используется и при заказе, и после взвешивания). */
function totals(lines, who, zone) {
  const goodsK = lines.reduce((s, l) => s + l.sumK, 0), z = FEE[zone];
  const feeK = goodsK >= z.thr ? 0 : z.fee;
  const vatK = who === 'nds' ? Math.round((goodsK + feeK) / 1000) * 100 : 0;
  return { goodsK, feeK, vatK, totalK: goodsK + feeK + vatK };
}

/* Полный расчёт заказа из того, что прислал браузер. Цена из браузера не используется. */
function calc(o, items) {
  const who = o.who === undefined ? 'nonds' : o.who, zone = o.zone === undefined ? 'msk' : o.zone;
  if (who !== 'nds' && who !== 'nonds') return err('неизвестный тип заказа');
  if (zone !== 'msk' && zone !== 'mo') return err('неизвестная зона доставки');
  const p = parseLines(o.items, items);
  if (!p.ok) return p;
  const t = totals(p.lines, who, zone);
  if (who === 'nds' && t.goodsK < MIN_INVOICE_K) return err('минимальная сумма заказа со счётом — 5 000 ₽', 'min_sum');
  return Object.assign({ ok: true, who, zone, lines: p.lines }, t);
}

/* Пересчёт после взвешивания: фактические граммы по строкам. Цены — те, что были в каталоге при заказе;
   порог опта считается по фактическому весу (мешком — всегда опт). */
function lineUnitK(l, g) { return (l.retailK == null || l.mode === 'pack' || g >= l.thG) ? l.optK : l.retailK; }
function reweigh(lines, actualG, who, zone) {
  const out = lines.map((l, i) => {
    const g = actualG[i] == null ? l.g : actualG[i];
    const pK = lineUnitK(l, g);
    return Object.assign({}, l, { g, priceK: pK, sumK: lineK(pK, g) });
  });
  return Object.assign({ lines: out }, totals(out, who, zone));
}

module.exports = { calc, parseLines, totals, reweigh, unitK, lineK, kop, rub, MAX_KG, MIN_INVOICE_K };
