/* Шаблоны страниц сайта. Всё содержимое (товары, цены, тексты) пишется прямо в HTML — поисковики видят его сразу.
   Оформление — как на frudom.ru/test (index.html): слайдер, категории, каталог по 2 карточки на телефоне, нижнее меню. */
const fs = require('fs'), path = require('path');
const S = require('../public/shared.js');
const ART = require('../public/art.js');
const { CATS, catOf } = require('./data.js');
const { esc, money, fmt, cap } = S;

const SITE = (process.env.SITE_URL || 'https://frudom.ru').replace(/\/$/, '');
const METRIKA = (process.env.METRIKA_ID || '').replace(/\D/g, '');
/* Google: GA4 (G-XXXX) и/или Google Ads (AW-XXXX); метка конверсии «заказ» — GADS_ORDER_LABEL (часть после «/» в send_to) */
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.GA_ID || '') ? process.env.GA_ID : '';
const GADS_ID = /^AW-\d+$/.test(process.env.GADS_ID || '') ? process.env.GADS_ID : '';
const GADS_LABEL = /^[A-Za-z0-9_-]+$/.test(process.env.GADS_ORDER_LABEL || '') ? process.env.GADS_ORDER_LABEL : '';
/* подтверждение прав в Яндекс Вебмастере и Google Search Console (код из мета-тега) */
const YA_VERIFY = /^[a-f0-9]{8,40}$/i.test(process.env.YANDEX_VERIFICATION || '') ? process.env.YANDEX_VERIFICATION : '';
const G_VERIFY = /^[A-Za-z0-9_-]{20,80}$/.test(process.env.GOOGLE_VERIFICATION || '') ? process.env.GOOGLE_VERIFICATION : '';
const ASSET_V = process.env.ASSET_V || String(Date.now()).slice(-8);
const ORG = {
  name: 'Фруктовый Дом', legal: 'ИП Скобёлкин Даниил Владимирович', ogrn: '324774600023327',
  phone: '+7 999 833-05-53', phoneHref: '+79998330553', phone2: '+7 926 479-14-99', email: 'info@frudom.ru',
  addr: 'г. Москва, ул. Мелитопольская, д. 1, к. 2, стр. 2', street: 'ул. Мелитопольская, д. 1, к. 2, стр. 2', zip: '117403',
  hours: 'Пн–Пт 9:00–18:00, Сб 9:00–17:00', since: 2016,
};
const INSTR = { 'мешок': 'мешками', 'ящик': 'ящиками', 'коробка': 'коробками', 'сетка': 'сетками', 'упаковка': 'упаковками' };
const CT = { 'Овощи': '#eef5e4', 'Фрукты и ягоды': '#fdf0e0', 'Зелень': '#eaf4e2', 'Сухофрукты': '#f8efe0', 'Орехи и семена': '#f6efe3', 'Заморозка': '#e9f1f7' };
const bg = c => CT[c] || '#f5f1e8';

const url = p => '/catalog/' + p.cs + '/' + p.slug;
const abs = u => SITE + u;
const perUnit = p => money(p.p) + '/' + p.u;
/* картинки: своё фото из таблицы (колонка «Фото») или нарисованная; PNG — для рекламы и соцсетей */
const PNG_DIR = path.join(__dirname, '..', 'public', 'img');
const has = f => { try { return fs.statSync(path.join(PNG_DIR, f)).isFile(); } catch (e) { return false; } };
const imgOf = p => p.img || '/img/p/' + p.cs + '/' + p.slug + '.svg';
function pngOf(p) {
  if (p.img) return p.img;
  if (has('p/' + p.cs + '/' + p.slug + '.jpg')) return abs('/assets/img/p/' + p.cs + '/' + p.slug + '.jpg');
  if (has('c/' + p.cs + '.jpg')) return abs('/assets/img/c/' + p.cs + '.jpg');
  return abs('/assets/og.png');
}

/* ---------- значки ---------- */
const I = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6"/></svg>',
  cart: S.CARTI,
  pin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.6"/></svg>',
  chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  truck: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.2v3.3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  leaf: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/></svg>',
  layers: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/></svg>',
  doc: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  card: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 10.6 12 3.5l8.5 7.1V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  pct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const LOGO = '/assets/logo.png';

/* ---------- тексты для SEO ---------- */
function productText(p) {
  if (p.d) return p.d;
  const cat = catOf(p.c);
  const a = [p.n + ' с доставкой по Москве и Московской области — в розницу от 1 ' + p.u + ' и оптом.'];
  if (p.pk) a.push('Продаём на развес по ' + money(p.pk) + ' за кг или ' + (INSTR[p.pack] || p.pack) + ' около ' + fmt(p.step) + ' кг по оптовой цене ' + money(p.p) + ' за кг. Оптовая цена включается автоматически от ' + fmt(p.th) + ' кг.');
  else a.push('Цена — ' + money(p.p) + ' за ' + p.u + '.');
  a.push('С ' + ORG.since + ' года поставляем ' + cat.gen + ' ресторанам, кафе, столовым, магазинам и частным покупателям.');
  if (p.w) a.push('Весовой товар взвешиваем при сборке, итоговая сумма — по фактическому весу.');
  a.push('Доставка на следующий день: по Москве бесплатно от 30 000 ₽, по области — от 50 000 ₽. Для компаний — счёт, УПД, ЭДО, с НДС и без НДС.');
  return a.join(' ');
}
const productTitle = p => p.n + ' — купить по цене ' + perUnit(p) + ' с доставкой по Москве | Фруктовый Дом';
const productDesc = p => p.n + ': ' + (p.pk ? money(p.pk) + '/кг на развес, ' + money(p.p) + '/кг ' + (INSTR[p.pack] || p.pack) : 'цена ' + perUnit(p)) + '. Доставка по Москве и МО на следующий день. Розница и опт, счёт и УПД для компаний.';

/* ---------- куски разметки ---------- */
function subOf(p) {
  const parts = p.n.split(/,\s*/);
  if (parts.length > 1) return cap(parts.slice(1).join(', '));
  if (p.pk) return 'На развес от 1 кг';
  return p.w ? 'Весовой товар' : 'Цена за 1 ' + p.u;
}
function card(p, i) {
  const badge = p.pk ? '<span class="bdg g">Опт от ' + fmt(p.th) + ' кг</span>' : '';
  return '<div class="p" data-slug="' + esc(p.slug) + '" style="animation-delay:' + Math.min(i || 0, 12) * 40 + 'ms">' +
    '<a class="ph" href="' + url(p) + '" style="--bgc:' + bg(p.c) + '" aria-label="' + esc(p.n) + '"><img class="art" src="' + esc(imgOf(p)) + '" alt="' + esc(p.n) + '" loading="lazy" width="400" height="300">' + badge + '</a>' +
    '<button type="button" class="fav" data-fav="' + esc(p.slug) + '" aria-label="В избранное">' + I.heart + '</button>' +
    '<div class="pb"><a class="pn" href="' + url(p) + '">' + esc(p.n) + '</a><div class="pm">' + esc(subOf(p)) + '</div>' +
    '<div class="dyn">' + S.dyn(p, 0, 'kg') + '</div></div></div>';
}
const grid = items => '<div class="grid">' + items.map(card).join('') + '</div>';
function crumbs(list) {
  const html = '<nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a>' + list.map(c => ' <span>/</span> ' + (c.u && c !== list[list.length - 1] ? '<a href="' + c.u + '">' + esc(c.n) + '</a>' : '<span aria-current="page">' + esc(c.n) + '</span>')).join('') + '</nav>';
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ n: 'Главная', u: '/' }].concat(list).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.n, item: abs(c.u || '') })) };
  return { html, ld };
}
const usedCats = items => CATS.filter(c => items.some(p => p.c === c.name));
function catTiles(items, cur) {
  return '<div class="ctiles">' + usedCats(items).map((c, i) =>
    '<a class="ct rv' + (c.slug === cur ? ' on' : '') + '" href="/catalog/' + c.slug + '" style="transition-delay:' + i * 50 + 'ms"><span class="ci2" style="background:' + bg(c.name) + '"><img src="/img/c/' + c.slug + '.svg" alt="' + esc(c.name) + '" loading="lazy" width="200" height="150"></span>' +
    '<span class="cn"><span>' + esc(c.name) + '</span><i><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></i></span></a>').join('') + '</div>';
}
function toolbar(items, cur) {
  const n = c => items.filter(p => !c || p.c === c.name).length;
  return '<div class="catbar"><div class="cats"><a class="cat' + (cur ? '' : ' on') + '" href="/catalog">Все<span class="n">' + n() + '</span></a>' +
    usedCats(items).map(c => '<a class="cat' + (c.slug === cur ? ' on' : '') + '" href="/catalog/' + c.slug + '">' + esc(c.name) + '<span class="n">' + n(c) + '</span></a>').join('') + '</div>' +
    '<label class="search" id="sbox"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg><input id="q" type="search" placeholder="Поиск: курага, томаты, миндаль…" aria-label="Поиск по каталогу" autocomplete="off"><button type="button" class="clr" id="qclr" aria-label="Очистить">' + I.x + '</button></label></div>';
}
const buySeg = () => '<div class="seg2" id="buy"><span class="pill"></span><button type="button" class="on" data-v="retail">Розница</button><button type="button" data-v="opt">Опт</button></div>';
const live = cat => '<div class="cmeta"><span class="live"><span class="dot"></span><span>' + cat.items.length + ' ' + S.pl(cat.items.length, ['позиция', 'позиции', 'позиций']) + ' · цены из прайса' + (cat.updated ? ' от ' + esc(String(cat.updated).split(' ')[0].split('-').reverse().join('.')) : '') + '</span></span></div>';

const ORG_LD = { '@context': 'https://schema.org', '@type': ['Organization', 'LocalBusiness', 'GroceryStore'], '@id': SITE + '/#org', name: ORG.name, legalName: ORG.legal, url: SITE + '/',
  logo: SITE + LOGO, telephone: ORG.phone, email: ORG.email, foundingDate: String(ORG.since), image: SITE + '/assets/og.png', priceRange: '₽₽',
  address: { '@type': 'PostalAddress', streetAddress: ORG.street, addressLocality: 'Москва', postalCode: ORG.zip, addressCountry: 'RU' },
  areaServed: ['Москва', 'Московская область'],
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '17:00' }] };

/* ---------- общий каркас ---------- */
function layout(o, cat) {
  const lds = [].concat(o.ld || []).map(x => '<script type="application/ld+json">' + JSON.stringify(x).replace(/</g, '\\u003c') + '</script>').join('');
  const canon = abs(o.path);
  const items = cat.items.map(p => ({ slug: p.slug, n: p.n, c: p.c, cs: p.cs, p: p.p, pk: p.pk, th: p.th, step: p.step, pack: p.pack, pn: p.pn, u: p.u, w: p.w, img: imgOf(p) }));
  const shop = { items, metrika: METRIKA, ga: GA_ID, gads: GADS_ID, gadsLabel: GADS_LABEL, updated: cat.updated, bg: CT };
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<title>' + esc(o.title) + '</title><meta name="description" content="' + esc(o.desc) + '">' +
    (o.noindex ? '<meta name="robots" content="noindex, follow">' : '<link rel="canonical" href="' + canon + '">') +
    (YA_VERIFY ? '<meta name="yandex-verification" content="' + YA_VERIFY + '">' : '') + (G_VERIFY ? '<meta name="google-site-verification" content="' + G_VERIFY + '">' : '') +
    '<meta property="og:type" content="' + (o.ogType || 'website') + '"><meta property="og:site_name" content="Фруктовый Дом"><meta property="og:locale" content="ru_RU">' +
    '<meta property="og:title" content="' + esc(o.ogTitle || o.title) + '"><meta property="og:description" content="' + esc(o.desc) + '"><meta property="og:url" content="' + canon + '">' +
    '<meta property="og:image" content="' + esc(o.img || SITE + '/assets/og.png') + '"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#1f5a2e">' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="' + LOGO + '"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="/assets/site.css?v=' + ASSET_V + '">' + lds + tags() + '</head><body class="pg-' + (o.kind || 'page') + '">' +
    header(cat.items, o) + '<main id="main">' + o.body + '</main>' + footer(cat.items) + chrome(cat.items, o) +
    '<script>window.__SHOP=' + JSON.stringify(shop).replace(/</g, '\\u003c') + '</script>' +
    '<script src="/assets/shared.js?v=' + ASSET_V + '" defer></script><script src="/assets/site.js?v=' + ASSET_V + '" defer></script></body></html>';
}
/* счётчики: Яндекс Метрика (с электронной коммерцией) и Google (GA4 + Google Ads) */
function tags() {
  let h = '<script>window.dataLayer=window.dataLayer||[];</script>';
  if (METRIKA) h += '<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");' +
    'ym(' + METRIKA + ',"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});</script>' +
    '<noscript><div><img src="https://mc.yandex.ru/watch/' + METRIKA + '" style="position:absolute;left:-9999px" alt=""></div></noscript>';
  const g = GA_ID || GADS_ID;
  if (g) h += '<script async src="https://www.googletagmanager.com/gtag/js?id=' + g + '"></script><script>function gtag(){dataLayer.push(arguments)}gtag("js",new Date());' +
    (GA_ID ? 'gtag("config","' + GA_ID + '");' : '') + (GADS_ID ? 'gtag("config","' + GADS_ID + '");' : '') + '</script>';
  return h;
}
function header(items, o) {
  return '<header id="hd"><div class="wrap hd">' +
    '<a href="/" class="logo" aria-label="Фруктовый Дом — на главную"><img class="lg" src="' + LOGO + '" alt="" width="52" height="52"><span class="t"><b>Фруктовый Дом</b><small>Овощи · Фрукты · Сухофрукты · Орехи</small></span></a>' +
    '<nav class="main" aria-label="Главное меню"><a href="/catalog">Каталог</a><a href="/catalog?opt=1">Опт</a><a href="/dostavka-i-oplata">Доставка и оплата</a><a href="/kontakty">Контакты</a></nav>' +
    '<div class="hd-r"><a class="phone" href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + ORG.phone + '</a>' +
    '<a class="ib" href="/catalog?find=1" data-find="1" aria-label="Поиск">' + I.search + '</a>' +
    '<a class="ib" href="/account" id="accBtn" aria-label="Личный кабинет" title="Личный кабинет">' + I.user + '</a>' +
    '<span class="ctot" id="ctotal">0 ₽</span>' +
    '<button type="button" class="ib" id="cartBtn" data-open="cart" aria-label="Корзина">' + I.cart + '<span class="cnt z" id="ccount">0</span></button>' +
    '<button type="button" class="ib burger" data-open="menu" aria-label="Меню"><span><span></span><span></span><span></span></span></button></div></div></header>' +
    (o.noLoc ? '' : '<div class="wrap"><div class="locbar compact"><button type="button" class="loc" id="loc" aria-expanded="false" aria-haspopup="true">' + I.pin + '<span id="locName">Москва</span>' + I.chev + '</button>' +
    '<span class="dlv">' + I.truck + '<span id="dlvTxt">Доставка завтра</span></span>' +
    '<div class="locmenu" id="locMenu" role="menu"><button type="button" data-z="msk" class="on" role="menuitem"><b>Москва</b><small>Бесплатно от 30 000 ₽, иначе 690 ₽</small></button><button type="button" data-z="mo" role="menuitem"><b>Московская область</b><small>Бесплатно от 50 000 ₽, иначе 1 290 ₽</small></button></div></div></div>');
}
function footer(items) {
  return '<footer id="contacts"><div class="wrap"><div><b class="flogo"><img src="' + LOGO + '" alt="" width="40" height="40" loading="lazy">Фруктовый Дом</b>Овощи, фрукты, зелень, сухофрукты, орехи и заморозка с доставкой по Москве и Московской области с ' + ORG.since + ' года.' +
    '<div class="req">' + ORG.legal + ' · ОГРНИП ' + ORG.ogrn + '</div></div>' +
    '<div><b>Каталог</b>' + usedCats(items).map(c => '<a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>').join('<br>') + '</div>' +
    '<div><b>Покупателям</b><a href="/dostavka-i-oplata">Доставка и оплата</a><br><a href="/account">Личный кабинет</a><br><a href="/kontakty">Контакты и реквизиты</a></div>' +
    '<div><b>Связь</b><a href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + ORG.phone + '</a><br><a href="mailto:' + ORG.email + '" data-goal="email_click">' + ORG.email + '</a><br>Мессенджер MAX<br>' + esc(ORG.hours) + '</div></div></footer>';
}
/* нижнее меню, плавающая корзина, боковое меню, корзина, окна */
function chrome(items, o) {
  const t = o.tab || '';
  const tb = (href, key, ic, label) => '<a href="' + href + '" class="' + (t === key ? 'on' : '') + '">' + ic + label + '</a>';
  return '<nav class="tabbar" id="tabbar" aria-label="Нижнее меню">' + tb('/', 'home', I.home, 'Главная') + tb('/catalog', 'catalog', I.grid, 'Каталог') + tb('/catalog?opt=1', 'opt', I.pct, 'Опт') +
    tb('/dostavka-i-oplata', 'delivery', I.truck.replace('width="26" height="26" ', ''), 'Доставка') + tb('/account', 'account', I.user, 'Кабинет') + '</nav>' +
    '<button type="button" class="fcart" id="fcart" data-open="cart" aria-label="Открыть корзину"><span class="fc1"><small id="fcN">0 позиций</small><b id="fcS">0 ₽</b></span><span class="fgo">Корзина ' + I.next.replace('width="18" height="18"', 'width="16" height="16"') + '</span></button>' +
    '<div class="ov" id="ov"></div>' +
    '<aside class="menu" id="mnav" aria-label="Меню"><div class="mtop"><b>Фруктовый Дом</b><button type="button" class="x" data-close="menu" aria-label="Закрыть">' + I.x + '</button></div><nav>' +
    '<a href="/catalog"><i>' + I.grid.replace('<svg ', '<svg width="20" height="20" ') + '</i>Весь каталог</a>' +
    usedCats(items).map(c => '<a href="/catalog/' + c.slug + '"><i><img src="/img/c/' + c.slug + '.svg" alt="" width="34" height="26" loading="lazy"></i>' + esc(c.name) + '</a>').join('') +
    '<a href="/catalog?opt=1"><i>' + I.pct.replace('<svg ', '<svg width="20" height="20" ') + '</i>Оптовые цены</a>' +
    '<a href="/catalog?fav=1"><i>' + I.heart.replace('<svg ', '<svg width="20" height="20" ') + '</i>Избранное</a>' +
    '<a href="/account"><i>' + I.user.replace('<svg ', '<svg width="20" height="20" ') + '</i>Личный кабинет</a>' +
    '<a href="/dostavka-i-oplata"><i>' + I.truck.replace('width="26" height="26"', 'width="20" height="20"') + '</i>Доставка и оплата</a>' +
    '<a href="/kontakty"><i>' + I.phone + '</i>Контакты</a></nav>' +
    '<div class="mfoot"><a href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + ORG.phone + '</a>' + ORG.email + ' · MAX<br>' + esc(ORG.hours) + '<br>' + esc(ORG.addr) + '</div></aside>' +
    '<aside class="drawer" id="drawer" aria-label="Корзина"><div class="dh"><h3>Корзина</h3><button type="button" class="x" data-close="cart" aria-label="Закрыть">' + I.x + '</button></div>' +
    '<div class="db"><div class="seg" id="who"><span class="pill"></span><button type="button" class="on" data-v="nonds">Без НДС</button><button type="button" data-v="nds">С НДС</button></div><div class="hint" id="whoHint"></div>' +
    '<div class="seg" id="zone"><span class="pill"></span><button type="button" class="on" data-v="msk">Москва</button><button type="button" data-v="mo">Московская обл.</button></div><div id="items"></div><div id="sum"></div></div>' +
    '<div class="df"><button type="button" id="pay">Оформить заказ</button></div></aside><div class="mov" id="mov"><div class="modal" id="modal" role="dialog" aria-modal="true"></div></div><div class="toast" id="toast" role="status"></div>';
}

/* ---------- блоки ---------- */
const feats = () => '<div class="feats">' +
  '<a class="feat rv" href="/catalog"><span class="fi">' + I.leaf + '</span><span><b>Натуральные</b><br>продукты</span></a>' +
  '<a class="feat rv d1" href="/catalog?opt=1"><span class="fi">' + I.layers + '</span><span><b>Опт</b><br>дешевле</span></a>' +
  '<a class="feat rv d2" href="/dostavka-i-oplata"><span class="fi">' + I.truck + '</span><span><b>Доставка</b><br>по Москве и МО</span></a>' +
  '<a class="feat rv d3" href="/account"><span class="fi">' + I.doc + '</span><span><b>Документы</b><br>счёт, УПД</span></a></div>';
const stepsBlock = () => '<section class="sec"><div class="wrap"><div class="sh"><h2 class="rv">Как сделать заказ</h2></div><div class="steps">' +
  '<div class="stp rv"><span class="si">' + I.cart.replace('<svg ', '<svg width="24" height="24" ') + '</span><b>Корзина</b><span>Цены в каталоге актуальные — не нужно запрашивать прайс</span></div>' +
  '<div class="stp rv d1"><span class="si">' + I.phone + '</span><b>Подтверждение</b><span>Менеджер позвонит. Без НДС — ссылка на оплату, с НДС — счёт на почту</span></div>' +
  '<div class="stp rv d2"><span class="si">' + I.layers.replace('width="26" height="26"', 'width="24" height="24"') + '</span><b>Сборка</b><span>Взвешиваем весовой товар, сумма — по факту</span></div>' +
  '<div class="stp rv d3"><span class="si">' + I.truck.replace('width="26" height="26"', 'width="24" height="24"') + '</span><b>Доставка</b><span>На следующий день вместе с документами</span></div></div></div></section>';
const termsBlock = () => '<div class="terms"><div class="term rv"><h3><i>' + I.truck.replace('width="26" height="26"', 'width="22" height="22"') + '</i>Доставка</h3><dl><dt>Москва</dt><dd>бесплатно от 30 000 ₽</dd><dt>Московская область</dt><dd>бесплатно от 50 000 ₽</dd><dt>Заказ меньше порога</dt><dd>690 ₽ Москва · 1 290 ₽ МО</dd><dt>Минимальный заказ со счётом</dt><dd>5 000 ₽</dd><dt>Срок</dt><dd>заказ до 20:00 — завтра</dd><dt>Самовывоз</dt><dd>Мелитопольская, 1к2с2</dd></dl></div>' +
  '<div class="term rv d1"><h3><i>' + I.card + '</i>Оплата и точный вес</h3><p>Весовой товар — например, мешок картофеля 25–30 кг — взвешиваем при сборке и присылаем итоговую сумму до отправки.</p><p><b>Без НДС:</b> оформление без регистрации. Менеджер подтвердит заказ и пришлёт ссылку на оплату картой или СБП по фактическому весу.</p><p><b>С НДС:</b> заполните данные компании один раз — счёт придёт на почту. Сборка начинается после поступления оплаты, УПД — по фактическому весу.</p></div></div>';
const helpBlock = () => '<section class="sec"><div class="wrap"><div class="help rv"><div><h3>Поможем собрать заказ</h3><p>Подскажем по ассортименту и ценам — звоните или пишите в MAX</p></div><a href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + I.phone + ORG.phone + '</a></div></div></section>';
const hero = () => '<section class="hero"><div class="wrap"><div class="slider" id="slider"><div class="track" id="track">' +
  '<div class="slide s1 on"><div class="sx"><h1>Натуральные овощи, фрукты и сухофрукты</h1><p>От 1 кг — в розницу.<br>Мешками и от порога — оптовые цены.</p><a class="sbtn" href="/catalog">Выбрать продукты ' + I.next + '</a></div><div class="sa"><img class="hv" src="/img/hero/hero1.svg" alt="" width="460" height="320"></div></div>' +
  '<div class="slide s2"><div class="sx"><h2>Доставка завтра утром</h2><p>Заказ до 20:00. По Москве бесплатно от 30 000 ₽, по области — от 50 000 ₽.</p><a class="sbtn" href="/dostavka-i-oplata">Условия доставки ' + I.next + '</a></div><div class="sa"><img class="hv" src="/img/hero/hero2.svg" alt="" width="460" height="320" loading="lazy"></div></div>' +
  '<div class="slide s3"><div class="sx"><h2>Счёт, УПД и ЭДО для бизнеса</h2><p>С НДС и без. Войдите в личный кабинет — реквизиты сохранятся, заказы и счета всегда под рукой.</p><a class="sbtn" href="/account">Личный кабинет ' + I.next + '</a></div><div class="sa"><img class="hv" src="/img/hero/hero3.svg" alt="" width="460" height="320" loading="lazy"></div></div>' +
  '</div><div class="dots" id="dots"><button type="button" class="on" aria-label="Слайд 1"></button><button type="button" aria-label="Слайд 2"></button><button type="button" aria-label="Слайд 3"></button></div></div>' + feats() + '</div></section>';

/* ---------- страницы ---------- */
function pageHome(cat) {
  const items = cat.items, top = [];
  CATS.forEach(c => items.filter(p => p.c === c.name).slice(0, 4).forEach(p => top.push(p)));
  const body = hero() +
    '<section class="sec"><div class="wrap"><div class="sh"><h2 class="rv">Категории</h2><a class="more rv d1" href="/catalog">Смотреть все ' + I.arrow + '</a></div>' + catTiles(items) + '</div></section>' +
    '<section class="sec" id="catalog"><div class="wrap"><div class="sh"><h2>Популярные товары</h2>' + buySeg() + '</div>' + live(cat) + grid(top) +
    '<a class="moreb" href="/catalog">Весь каталог — ' + items.length + ' ' + S.pl(items.length, ['позиция', 'позиции', 'позиций']) + ' ' + I.arrow + '</a></div></section>' +
    stepsBlock() + '<section class="sec" id="terms"><div class="wrap"><div class="sh"><h2 class="rv">Доставка и оплата</h2></div>' + termsBlock() + '</div></section>' + helpBlock() +
    '<section class="sec"><div class="wrap"><div class="seo-text"><h2>Овощи, фрукты и сухофрукты с доставкой по Москве</h2><p>«Фруктовый Дом» с ' + ORG.since + ' года продаёт овощи, фрукты, зелень, сухофрукты, орехи и замороженные ягоды в розницу и оптом. Цены в каталоге обновляются автоматически из нашего прайса: розничная цена — от 1 кг, оптовая включается сама при покупке мешком или от порога.</p><p>Доставляем на следующий день по Москве (бесплатно от 30 000 ₽) и Московской области (бесплатно от 50 000 ₽). Для ресторанов, кафе, магазинов и компаний — счёт, УПД и ЭДО, с НДС и без НДС.</p></div></div></section>';
  return layout({ path: '/', kind: 'home', tab: 'home', title: 'Овощи, фрукты, сухофрукты и орехи с доставкой по Москве — розница и опт | Фруктовый Дом',
    desc: 'Овощи, фрукты, зелень, сухофрукты, орехи и заморозка с доставкой по Москве и МО на следующий день. Розница от 1 кг и оптовые цены, счёт и УПД для компаний.',
    ld: [ORG_LD, { '@context': 'https://schema.org', '@type': 'WebSite', url: SITE + '/', name: 'Фруктовый Дом', inLanguage: 'ru' }], body }, cat);
}

function pageCatalog(cat) {
  const items = cat.items, cr = crumbs([{ n: 'Каталог', u: '/catalog' }]);
  let i = 0;
  const body = '<section class="sec pg" id="catalog"><div class="wrap">' + cr.html + '<div class="sh"><h1>Каталог продуктов</h1>' + buySeg() + '</div>' + live(cat) +
    catTiles(items) + toolbar(items, '') +
    usedCats(items).map(c => { const its = items.filter(p => p.c === c.name); return '<h2 class="grp" id="' + c.slug + '"><a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a><small>' + its.length + ' ' + S.pl(its.length, ['позиция', 'позиции', 'позиций']) + '</small></h2><div class="grid">' + its.map(p => card(p, i++)).join('') + '</div>'; }).join('') +
    '<div class="empty" id="nores" hidden>Ничего не нашлось. Попробуйте другое слово или позвоните ' + ORG.phone + '</div></div></section>';
  return layout({ path: '/catalog', kind: 'catalog', tab: 'catalog', title: 'Каталог: овощи, фрукты, сухофрукты и орехи с ценами | Фруктовый Дом',
    desc: 'Каталог с актуальными ценами: ' + items.length + ' позиций — овощи, зелень, фрукты, сухофрукты, орехи, заморозка. Розница и опт, доставка по Москве и МО на следующий день.', ld: [cr.ld], body }, cat);
}

function pageCategory(cat, c) {
  const items = cat.items, its = items.filter(p => p.c === c.name), cr = crumbs([{ n: 'Каталог', u: '/catalog' }, { n: c.name, u: '/catalog/' + c.slug }]);
  const min = Math.min.apply(null, its.map(p => p.p));
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: c.name, numberOfItems: its.length, itemListElement: its.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(url(p)), name: p.n })) };
  const body = '<section class="sec pg" id="catalog"><div class="wrap">' + cr.html + '<div class="sh"><h1>' + esc(c.name) + ' с доставкой по Москве</h1>' + buySeg() + '</div>' +
    '<p class="intro">' + its.length + ' ' + S.pl(its.length, ['позиция', 'позиции', 'позиций']) + ' от ' + money(min) + ' за кг. Розница от 1 кг, оптовая цена — мешком или от порога. Доставка по Москве и области на следующий день.</p>' +
    toolbar(items, c.slug) + grid(its) + '<div class="empty" id="nores" hidden>Ничего не нашлось</div>' +
    '<div class="seo-text"><h2>' + esc(cap(c.gen)) + ' в розницу и оптом</h2><p>«Фруктовый Дом» работает с ' + ORG.since + ' года и продаёт ' + c.gen + ' ресторанам, кафе, столовым, магазинам и частным покупателям. Цены на сайте обновляются автоматически из нашего прайса — не нужно запрашивать коммерческое предложение.</p>' +
    '<p>Доставляем на следующий день по Москве (бесплатно от 30 000 ₽) и Московской области (бесплатно от 50 000 ₽). Работаем с НДС и без НДС, выставляем счёт и УПД, поддерживаем ЭДО. Весовой товар взвешиваем при сборке и считаем по фактическому весу.</p></div></div></section>';
  return layout({ path: '/catalog/' + c.slug, kind: 'category', tab: 'catalog', title: c.name + ' — купить с доставкой по Москве, цены от ' + money(min) + '/кг | Фруктовый Дом',
    desc: c.name + ' с доставкой по Москве и МО на следующий день: ' + its.length + ' позиций от ' + money(min) + '/кг. Розница и опт, счёт и УПД для компаний.', ld: [cr.ld, ld], body }, cat);
}

function pageProduct(cat, p) {
  const c = catOf(p.c), cr = crumbs([{ n: 'Каталог', u: '/catalog' }, { n: c.name, u: '/catalog/' + c.slug }, { n: p.n, u: url(p) }]);
  const rel = cat.items.filter(x => x.c === p.c && x.slug !== p.slug).slice(0, 8);
  const text = productText(p), png = pngOf(p);
  const valid = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const unitCode = p.u === 'кг' ? 'KGM' : 'H87';
  const offer = (price, name) => ({ '@type': 'Offer', name, url: abs(url(p)), priceCurrency: 'RUB', price: price.toFixed(2), priceValidUntil: valid, availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': SITE + '/#org' }, priceSpecification: { '@type': 'UnitPriceSpecification', price: price.toFixed(2), priceCurrency: 'RUB', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode } } });
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.n, description: text, category: c.name, url: abs(url(p)), sku: p.slug,
    brand: { '@type': 'Brand', name: 'Фруктовый Дом' }, image: png,
    offers: p.pk ? { '@type': 'AggregateOffer', priceCurrency: 'RUB', lowPrice: p.p.toFixed(2), highPrice: p.pk.toFixed(2), offerCount: 2, offers: [offer(p.p, 'Опт: ' + (INSTR[p.pack] || p.pack) + ' или от ' + fmt(p.th) + ' кг'), offer(p.pk, 'На развес')] } : offer(p.p) };
  const rows = [['Категория', '<a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>']];
  if (p.pk) rows.push(['На развес', money(p.pk) + ' за кг'], ['Оптом', money(p.p) + ' за кг'], ['Упаковка', esc(cap(p.pack)) + ' ~' + fmt(p.step) + ' кг'], ['Оптовая цена', 'мешком или от ' + fmt(p.th) + ' кг']);
  else rows.push(['Цена', money(p.p) + ' за ' + esc(p.u)]);
  rows.push(['Продажа', p.w ? 'на вес, сумма после взвешивания' : 'по ' + esc(p.u)], ['Доставка', 'по Москве и МО на следующий день'], ['Документы', 'чек; для компаний — счёт, УПД, ЭДО']);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html +
    '<div class="prod" data-slug="' + esc(p.slug) + '"><div class="pimg" style="--bgc:' + bg(p.c) + '"><img class="art" src="' + esc(imgOf(p)) + '" alt="' + esc(p.n) + '" width="800" height="600">' +
    (p.pk ? '<span class="bdg g">Опт от ' + fmt(p.th) + ' кг</span>' : '') + '<button type="button" class="fav" data-fav="' + esc(p.slug) + '" aria-label="В избранное">' + I.heart + '</button></div>' +
    '<div class="pbuy"><div class="eyebrow">' + esc(c.name) + '</div><h1>' + esc(p.n) + '</h1><div class="pm">' + esc(subOf(p)) + '</div>' +
    '<div class="dyn">' + S.dyn(p, 0, 'kg', true) + '</div>' +
    (p.w ? '<div class="pnote">Весовой товар: взвешиваем при сборке, сумма — по фактическому весу.</div>' : '') +
    '<ul class="perks"><li>Доставка завтра при заказе до 20:00</li><li>Бесплатно от 30 000 ₽ по Москве, от 50 000 ₽ по области</li><li>Без регистрации — или счёт с НДС для компании</li></ul>' +
    '<div class="pcall">Есть вопрос? <a href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + ORG.phone + '</a></div></div></div>' +
    '<div class="pinfo"><div><h2>Описание</h2><p>' + esc(text) + '</p></div><div><h2>Характеристики</h2><dl class="spec">' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl></div></div>' +
    (rel.length ? '<h2 class="grp">Ещё в категории «' + esc(c.name) + '»<small><a class="more" href="/catalog/' + c.slug + '">Все ' + I.arrow + '</a></small></h2>' + grid(rel) : '') + '</div></section>';
  return layout({ path: url(p), kind: 'product', tab: 'catalog', ogType: 'product', title: productTitle(p), desc: productDesc(p), img: png, ld: [cr.ld, ld], body }, cat);
}

function pageDelivery(cat) {
  const cr = crumbs([{ n: 'Доставка и оплата', u: '/dostavka-i-oplata' }]);
  const body = '<section class="sec pg" id="terms"><div class="wrap">' + cr.html + '<h1>Доставка и оплата</h1><p class="intro">Доставляем по Москве и Московской области на следующий день после заказа. Продаём частным покупателям, компаниям и ИП.</p>' + termsBlock() +
    '<div class="seo-text"><h2>Как проходит заказ</h2><p>1. Соберите корзину на сайте и отправьте заказ — без НДС без регистрации или со счётом с НДС на компанию.</p><p>2. Менеджер позвонит, подтвердит состав и время доставки и пришлёт ссылку на оплату или счёт.</p><p>3. Собираем и взвешиваем заказ, присылаем точную сумму. Сборка заказов со счётом начинается после поступления оплаты.</p><p>4. Привозим на следующий день с документами: счёт, УПД (по ЭДО или на бумаге).</p>' +
    '<h2>Где следить за заказом</h2><p>Войдите в <a href="/account">личный кабинет</a> по почте, указанной в заказе, — там видно статус, сумму, оплату и историю всех заказов, можно повторить прошлый заказ в один клик.</p></div></div></section>' + stepsBlock();
  return layout({ path: '/dostavka-i-oplata', tab: 'delivery', title: 'Доставка и оплата — продукты с доставкой по Москве и МО | Фруктовый Дом', desc: 'Доставка продуктов по Москве и МО на следующий день: бесплатно от 30 000 ₽ по Москве и от 50 000 ₽ по МО. Оплата картой, СБП или по счёту с НДС и без НДС.', ld: [cr.ld], body }, cat);
}

function pageContacts(cat) {
  const cr = crumbs([{ n: 'Контакты', u: '/kontakty' }]);
  const map = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Москва, ' + ORG.street);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html + '<h1>Контакты</h1>' +
    '<div class="terms"><div class="term rv"><h3><i>' + I.phone + '</i>Связь</h3><dl><dt>Телефон</dt><dd><a href="tel:' + ORG.phoneHref + '" data-goal="phone_click">' + ORG.phone + '</a></dd><dt>Телефон</dt><dd><a href="tel:+79264791499" data-goal="phone_click">' + ORG.phone2 + '</a></dd><dt>Почта</dt><dd><a href="mailto:' + ORG.email + '" data-goal="email_click">' + ORG.email + '</a></dd><dt>Мессенджер</dt><dd>MAX</dd><dt>Режим работы</dt><dd>' + esc(ORG.hours) + '</dd></dl></div>' +
    '<div class="term rv d1"><h3><i>' + I.pin.replace('width="22" height="22"', 'width="22" height="22"') + '</i>Склад и самовывоз</h3><p>' + esc(ORG.addr) + ', ' + ORG.zip + '</p><p><a class="btns" href="' + map + '" target="_blank" rel="noopener">Открыть на Яндекс Картах</a></p><h3 style="margin-top:22px">Реквизиты</h3><p>' + ORG.legal + '<br>ОГРНИП ' + ORG.ogrn + '<br>Торговая марка «Фруктовый Дом»</p></div></div></div></section>' + helpBlock();
  return layout({ path: '/kontakty', title: 'Контакты — Фруктовый Дом, овощи, фрукты и сухофрукты в Москве', desc: 'Телефон, почта, адрес склада и реквизиты «Фруктовый Дом». ' + ORG.addr + '. ' + ORG.hours + '.', ld: [cr.ld, ORG_LD], body }, cat);
}

function page404(cat) {
  const body = '<section class="sec pg"><div class="wrap"><h1>Страница не найдена</h1><p class="intro">Возможно, товар переименован или убран из каталога.</p><p style="margin-bottom:20px"><a class="btnp" href="/catalog">Перейти в каталог</a></p>' + catTiles(cat.items) + '</div></section>';
  return layout({ path: '/404', noindex: true, title: 'Страница не найдена | Фруктовый Дом', desc: 'Страница не найдена', body }, cat);
}

function sitemap(cat) {
  const day = new Date().toISOString().slice(0, 10);
  const u = (loc, pr, fr, img) => '<url><loc>' + abs(loc) + '</loc><lastmod>' + day + '</lastmod><changefreq>' + fr + '</changefreq><priority>' + pr + '</priority>' + (img ? '<image:image><image:loc>' + esc(img) + '</image:loc></image:image>' : '') + '</url>';
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + u('/', '1.0', 'daily') + u('/catalog', '0.9', 'daily') +
    usedCats(cat.items).map(c => u('/catalog/' + c.slug, '0.8', 'daily')).join('') + cat.items.map(p => u(url(p), '0.7', 'daily', pngOf(p))).join('') + u('/dostavka-i-oplata', '0.5', 'monthly') + u('/kontakty', '0.5', 'monthly') + '</urlset>';
}
const robots = () => 'User-agent: *\nDisallow: /api/\nDisallow: /1c\nDisallow: /pdf\nDisallow: /admin\nDisallow: /account\nDisallow: /*?*q=\nDisallow: /*?*find=\nDisallow: /*?*fav=\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&opt /\n\nSitemap: ' + SITE + '/sitemap.xml\n';

/* ---------- товарные фиды для рекламы ----------
   /feed/yandex.yml — Яндекс Директ (товарная кампания / галерея) и Яндекс Бизнес; формат YML.
   /feed/google.xml — Google Merchant Center (Покупки, Performance Max). Цена — розничная за 1 кг/шт (её платит покупатель 1 кг). */
const xe = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const retail = p => p.pk || p.p;
const shortDesc = p => productText(p).slice(0, 2900);
function feedYandex(cat) {
  const cats = usedCats(cat.items), d = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<yml_catalog date="' + d + '"><shop><name>Фруктовый Дом</name><company>' + xe(ORG.legal) + '</company><url>' + SITE + '/</url><currencies><currency id="RUR" rate="1"/></currencies>' +
    '<categories>' + cats.map((c, i) => '<category id="' + (i + 1) + '">' + xe(c.name) + '</category>').join('') + '</categories>' +
    '<delivery-options><option cost="690" days="1" order-before="20"/></delivery-options><pickup-options><option cost="0" days="1"/></pickup-options><offers>' +
    cat.items.map(p => {
      const ci = cats.findIndex(c => c.name === p.c) + 1;
      return '<offer id="' + xe(p.slug.replace(/[^a-z0-9]/g, '').slice(0, 20) || 'p') + '" available="true"><url>' + abs(url(p)) + '</url><price>' + retail(p).toFixed(2) + '</price>' +
        '<currencyId>RUR</currencyId><categoryId>' + ci + '</categoryId><picture>' + xe(pngOf(p)) + '</picture><delivery>true</delivery><pickup>true</pickup>' +
        '<name>' + xe(p.n) + '</name><vendor>Фруктовый Дом</vendor><description>' + xe(shortDesc(p)) + '</description>' +
        '<sales_notes>' + xe(p.pk ? 'Цена за 1 кг на развес; ' + (INSTR[p.pack] || p.pack) + ' и от ' + fmt(p.th) + ' кг — ' + money(p.p) + '/кг' : 'Цена за 1 ' + p.u + '; доставка завтра') + '</sales_notes>' +
        '<param name="Единица" unit="">' + xe(p.u) + '</param>' + (p.pk ? '<param name="Оптовая цена, ₽/кг">' + p.p.toFixed(2) + '</param>' : '') + '</offer>';
    }).join('') + '</offers></shop></yml_catalog>';
}
function feedGoogle(cat) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Фруктовый Дом</title><link>' + SITE + '/</link><description>Овощи, фрукты, сухофрукты и орехи с доставкой по Москве</description>' +
    cat.items.map(p => '<item><g:id>' + xe(p.slug) + '</g:id><g:title>' + xe(p.n) + '</g:title><g:description>' + xe(shortDesc(p)) + '</g:description><g:link>' + abs(url(p)) + '</g:link><g:image_link>' + xe(pngOf(p)) + '</g:image_link>' +
      '<g:availability>in_stock</g:availability><g:condition>new</g:condition><g:price>' + retail(p).toFixed(2) + ' RUB</g:price><g:brand>Фруктовый Дом</g:brand><g:identifier_exists>no</g:identifier_exists>' +
      '<g:product_type>' + xe(p.c) + '</g:product_type>' + (p.u === 'кг' ? '<g:unit_pricing_measure>1kg</g:unit_pricing_measure><g:unit_pricing_base_measure>1kg</g:unit_pricing_base_measure>' : '') +
      '<g:shipping><g:country>RU</g:country><g:region>Moscow</g:region><g:price>690 RUB</g:price></g:shipping><g:custom_label_0>' + xe(p.pk ? 'опт' : 'розница') + '</g:custom_label_0></item>').join('') + '</channel></rss>';
}

module.exports = { pageHome, pageCatalog, pageCategory, pageProduct, pageDelivery, pageContacts, page404, sitemap, robots, feedYandex, feedGoogle, layout, crumbs, url, SITE, ORG, I, bg, imgOf, pngOf, esc };
