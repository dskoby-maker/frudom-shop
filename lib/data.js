/* Каталог: берём «Витрину» из Apps Script, держим в памяти, при сбое — последний удачный или catalog.json */
const fs = require('fs'), path = require('path');

const GS_URL = process.env.GS_URL || 'https://script.google.com/macros/s/AKfycbyXGAVgnoDs8B8GDPAQcy9KavP3TFk4u7brkMp8pKAXArB-Jq4QJBroP6EWz6AQb0Fr/exec';
const TTL = (+process.env.CATALOG_TTL_SEC || 300) * 1000;   // как часто обновлять цены (по умолчанию 5 минут)

const CATS = [ // порядок, адрес и тексты категорий
  { name: 'Овощи', slug: 'ovoshchi', h1: 'Овощи оптом', gen: 'овощей', icon: 'veg', bg: '#e9eee4' },
  { name: 'Зелень', slug: 'zelen', h1: 'Зелень оптом', gen: 'зелени', icon: 'herb', bg: '#e4ede6' },
  { name: 'Фрукты и ягоды', slug: 'frukty-i-yagody', h1: 'Фрукты и ягоды оптом', gen: 'фруктов и ягод', icon: 'fruit', bg: '#f1ebe3' },
  { name: 'Сухофрукты', slug: 'suhofrukty', h1: 'Сухофрукты оптом', gen: 'сухофруктов', icon: 'dry', bg: '#f2ece2' },
  { name: 'Орехи и семена', slug: 'orehi-i-semena', h1: 'Орехи и семена оптом', gen: 'орехов и семян', icon: 'nut', bg: '#ece8e1' },
  { name: 'Заморозка', slug: 'zamorozka', h1: 'Замороженные ягоды оптом', gen: 'замороженной продукции', icon: 'frz', bg: '#e5eaee' },
];
const PN = { 'мешок': ['мешок', 'мешка', 'мешков'], 'ящик': ['ящик', 'ящика', 'ящиков'], 'коробка': ['коробка', 'коробки', 'коробок'],
  'сетка': ['сетка', 'сетки', 'сеток'], 'упаковка': ['упаковка', 'упаковки', 'упаковок'] };

const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function slugify(s) {
  return String(s).toLowerCase().split('').map(c => TR[c] !== undefined ? TR[c] : c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'tovar';
}

function catOf(name) {
  return CATS.find(c => c.name === name) || { name: name || 'Другое', slug: slugify(name || 'drugoe'), h1: (name || 'Другое') + ' оптом', gen: 'товаров', icon: 'dry', bg: '#eceae4' };
}

function normalize(items) {
  const used = {}, out = [];
  (items || []).forEach(x => {
    const p = +x.p;
    if (!x.n || !(p > 0)) return;
    const cat = catOf(x.c);
    let slug = slugify(x.n), i = 2;
    while (used[cat.slug + '/' + slug]) slug = slugify(x.n) + '-' + i++;
    used[cat.slug + '/' + slug] = 1;
    const o = { slug, n: String(x.n), c: cat.name, cs: cat.slug, p, u: x.u || 'кг', w: x.w ? 1 : 0, vat: +x.vat || 10,
      d: x.d ? String(x.d) : '', img: /^https:\/\//.test(x.img || '') ? x.img : '' };
    if (x.pack && +x.step > 0 && +x.th > 0 && +x.pk > 0) {
      o.pack = String(x.pack).toLowerCase(); o.step = +x.step; o.th = +x.th; o.pk = +x.pk;
      o.pn = PN[o.pack] || [o.pack, o.pack, o.pack];
    }
    out.push(o);
  });
  const order = c => { const i = CATS.findIndex(k => k.name === c); return i < 0 ? 99 : i; };
  return out.map((o, i) => [o, i]).sort((a, b) => order(a[0].c) - order(b[0].c) || a[1] - b[1]).map(a => a[0]);
}

let cache = null, loading = null;

function fallback() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'catalog.json'), 'utf8'));
    return { items: normalize(j.items), updated: j.updated || '', source: 'запасной файл', at: 0, fetchedAt: 0 };
  } catch (e) { return { items: [], updated: '', source: 'пусто', at: 0 }; }
}

async function fetchJson(url, opt, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 15000);
  try { const r = await fetch(url, Object.assign({ redirect: 'follow', signal: ctl.signal }, opt || {})); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

async function refresh() {
  try {
    const j = await fetchJson(GS_URL + '?action=shopCatalog');
    const items = normalize(j && j.items);
    if (!j || !j.ok || !items.length) throw new Error((j && j.error) || 'пустой каталог');
    cache = { items, updated: j.updated || '', source: 'таблица', at: Date.now(), fetchedAt: Date.now() };   /* fetchedAt — когда цены точно были свежими */
  } catch (e) {
    console.error('Каталог: не удалось обновить —', e.message);
    if (!cache || !cache.items.length) cache = fallback();
    else cache.at = Date.now() - TTL + 60000;      // попробуем снова через минуту
  }
  return cache;
}

/* Отдаёт каталог сразу; если устарел — обновляет в фоне (страница не ждёт таблицу) */
async function getCatalog() {
  if (!cache) { loading = loading || refresh().finally(() => { loading = null; }); return loading; }
  if (Date.now() - cache.at > TTL && !loading) loading = refresh().finally(() => { loading = null; });
  return cache;
}

async function sendOrder(order) {
  return fetchJson(GS_URL, { method: 'POST', body: JSON.stringify({ action: 'shopOrder', order }), headers: { 'content-type': 'text/plain;charset=utf-8' } }, 25000);
}

module.exports = { getCatalog, refresh, sendOrder, CATS, catOf, slugify, normalize };
