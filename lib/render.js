/* Шаблоны страниц сайта. Всё содержимое (товары, цены, тексты) пишется прямо в HTML — поисковики видят его сразу. */
const S = require('../public/shared.js');
const { CATS, catOf } = require('./data.js');
const { esc, money, fmt, cap } = S;

const SITE = (process.env.SITE_URL || 'https://frudom.ru').replace(/\/$/, '');
const METRIKA = (process.env.METRIKA_ID || '').replace(/\D/g, '');
const ASSET_V = process.env.ASSET_V || String(Date.now()).slice(-8);
const ORG = {
  name: 'Фруктовый Дом', legal: 'ИП Скобёлкин Даниил Владимирович', ogrn: '324774600023327',
  phone: '+7 999 833-05-53', phoneHref: '+79998330553', phone2: '+7 926 479-14-99', email: 'info@frudom.ru',
  addr: 'г. Москва, ул. Мелитопольская, д. 1, к. 2, стр. 2', street: 'ул. Мелитопольская, д. 1, к. 2, стр. 2', zip: '117403',
  hours: 'Пн–Пт 9:00–18:00, Сб 9:00–17:00', since: 2016,
};
const INSTR = { 'мешок': 'мешками', 'ящик': 'ящиками', 'коробка': 'коробками', 'сетка': 'сетками', 'упаковка': 'упаковками' };

const IC = {
  veg: '<path d="M7 20c6 0 11-5 11-11V4h-5C7 4 4 9 4 14v6h3Z"/><path d="M4 20 14 10"/>',
  fruit: '<path d="M12 21c-4.5 0-8-3.4-8-8.2C4 8.6 6.6 6 9.4 6c1.2 0 2 .5 2.6.5S13.4 6 14.6 6C17.4 6 20 8.6 20 12.8 20 17.6 16.5 21 12 21Z"/><path d="M12 6c0-2 1.2-3.3 3-3.6"/>',
  herb: '<path d="M12 21V9"/><path d="M12 13c-4 0-6-3-6-7 4 0 6 3 6 7Z"/><path d="M12 11c4 0 6-3 6-7-4 0-6 3-6 7Z"/>',
  dry: '<circle cx="12" cy="12" r="7"/><path d="M8 10c2 1 6 1 8 0M8 14c2 1 6 1 8 0"/>',
  nut: '<path d="M12 3c4 0 7 3.5 7 8.5S16 21 12 21 5 16.5 5 11.5 8 3 12 3Z"/><path d="M12 3v18M8 8c1.5 1 6.5 1 8 0"/>',
  frz: '<path d="M12 2v20M3.5 7l17 10M3.5 17l17-10"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
};
const icon = c => '<svg viewBox="0 0 24 24" fill="none" stroke="#3d4a42" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[catOf(c).icon] + '</svg>';
const url = p => '/catalog/' + p.cs + '/' + p.slug;
const abs = u => SITE + u;
const perUnit = p => money(p.p) + '/' + p.u;

/* ---------- тексты для SEO ---------- */
function productText(p) {
  if (p.d) return p.d;
  const cat = catOf(p.c);
  const a = [p.n + ' оптом с доставкой по Москве и Московской области.'];
  if (p.pk) a.push('Продаём ' + (INSTR[p.pack] || p.pack) + ' около ' + fmt(p.step) + ' кг по оптовой цене ' + money(p.p) + ' за кг или на развес по ' + money(p.pk) + ' за кг. Оптовая цена включается автоматически от ' + fmt(p.th) + ' кг.');
  else a.push('Цена — ' + money(p.p) + ' за ' + p.u + '.');
  a.push('С ' + ORG.since + ' года поставляем ' + cat.gen + ' ресторанам, кафе, столовым, школам, больницам и другим государственным учреждениям.');
  if (p.w) a.push('Весовой товар взвешиваем при сборке, итоговая сумма — по фактическому весу.');
  a.push('Доставка на следующий день: по Москве бесплатно от 30 000 ₽, по области — от 50 000 ₽. Работаем с юрлицами и ИП: счёт, УПД, ЭДО, с НДС и без НДС.');
  return a.join(' ');
}
const productTitle = p => p.n + ' оптом — цена ' + perUnit(p) + ', доставка по Москве | Фруктовый Дом';
const productDesc = p => p.n + ' оптом с доставкой по Москве и МО на следующий день. Цена ' + perUnit(p) + (p.pk ? ' при покупке ' + (INSTR[p.pack] || p.pack) : '') + '. Для ресторанов, столовых и госучреждений. Счёт, УПД, НДС.';

/* ---------- куски разметки ---------- */
function card(p) {
  return '<div class="p" data-slug="' + esc(p.slug) + '">' +
    '<a class="ph" href="' + url(p) + '" style="background:' + catOf(p.c).bg + '" aria-label="' + esc(p.n) + '">' +
    (p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.n) + ' оптом" loading="lazy" width="400" height="300">' : icon(p.c)) +
    '<span class="lbl">' + esc(p.c) + '</span>' + (p.w ? '<span class="wtag">Весовой</span>' : '') + '</a>' +
    '<div class="pb"><div class="nm"><a class="pn" href="' + url(p) + '">' + esc(p.n) + '</a>' +
    '<div class="pm">' + (p.pk ? esc(cap(p.pack)) + ' ~' + fmt(p.step) + ' кг' : 'Цена за 1 ' + esc(p.u)) + '</div>' +
    (p.w ? '<div class="wnote">Точная сумма — после взвешивания</div>' : '') + '</div>' +
    '<div class="dyn">' + S.dyn(p, 0, 'pack') + '</div></div></div>';
}
const grid = items => '<div class="grid">' + items.map(card).join('') + '</div>';
function crumbs(list) {
  const html = '<nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a>' + list.map(c => ' <span>/</span> ' + (c.u ? '<a href="' + c.u + '">' + esc(c.n) + '</a>' : '<span aria-current="page">' + esc(c.n) + '</span>')).join('') + '</nav>';
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ n: 'Главная', u: '/' }].concat(list).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.n, item: abs(c.u || '') })) };
  return { html, ld };
}
function catTiles(items) {
  return '<div class="tiles">' + CATS.map(c => {
    const its = items.filter(p => p.c === c.name); if (!its.length) return '';
    const min = Math.min.apply(null, its.map(p => p.p));
    return '<a class="tile" href="/catalog/' + c.slug + '" style="background:' + c.bg + '"><span class="ti">' + icon(c.name) + '</span><b>' + esc(c.name) + '</b><span>' + its.length + ' ' + S.pl(its.length, ['позиция', 'позиции', 'позиций']) + ' · от ' + money(min) + '</span></a>';
  }).join('') + '</div>';
}
function catChips(items, cur) {
  return '<div class="cats">' + '<a class="cat' + (cur ? '' : ' on') + '" href="/catalog">Все</a>' + CATS.filter(c => items.some(p => p.c === c.name)).map(c => '<a class="cat' + (c.slug === cur ? ' on' : '') + '" href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>').join('') + '</div>';
}
const toolbar = (items, cur) => '<div class="catbar">' + catChips(items, cur) + '<div class="tools"><label class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Поиск по каталогу" aria-label="Поиск по каталогу"></label>' +
  '<div class="view"><button type="button" class="on" data-v="grid" title="Плитка" aria-label="Плитка"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg></button><button type="button" data-v="list" title="Прайс-лист" aria-label="Прайс-лист"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="3"/><rect x="3" y="10.5" width="18" height="3"/><rect x="3" y="17" width="18" height="3"/></svg></button></div></div></div>';

const ORG_LD = { '@context': 'https://schema.org', '@type': ['Organization', 'LocalBusiness'], '@id': SITE + '/#org', name: ORG.name, legalName: ORG.legal, url: SITE + '/',
  telephone: ORG.phone, email: ORG.email, foundingDate: String(ORG.since), image: SITE + '/assets/og.png', priceRange: '₽₽',
  address: { '@type': 'PostalAddress', streetAddress: ORG.street, addressLocality: 'Москва', postalCode: ORG.zip, addressCountry: 'RU' },
  areaServed: ['Москва', 'Московская область'],
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '17:00' }] };

/* ---------- общий каркас ---------- */
function layout(o, cat) {
  const lds = [].concat(o.ld || []).map(x => '<script type="application/ld+json">' + JSON.stringify(x).replace(/</g, '\\u003c') + '</script>').join('');
  const canon = abs(o.path);
  const shop = { items: cat.items, metrika: METRIKA, updated: cat.updated };
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(o.title) + '</title><meta name="description" content="' + esc(o.desc) + '">' +
    (o.noindex ? '<meta name="robots" content="noindex, follow">' : '<link rel="canonical" href="' + canon + '">') +
    '<meta property="og:type" content="' + (o.ogType || 'website') + '"><meta property="og:site_name" content="Фруктовый Дом"><meta property="og:locale" content="ru_RU">' +
    '<meta property="og:title" content="' + esc(o.ogTitle || o.title) + '"><meta property="og:description" content="' + esc(o.desc) + '"><meta property="og:url" content="' + canon + '">' +
    '<meta property="og:image" content="' + esc(o.img || SITE + '/assets/og.png') + '"><meta name="theme-color" content="#1d5c3a">' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="/assets/site.css?v=' + ASSET_V + '">' + lds + metrikaTag() + '</head><body class="pg-' + (o.kind || 'page') + '">' +
    header(cat.items) + '<main id="main">' + o.body + '</main>' + footer(cat.items) + drawer() +
    '<script>window.__SHOP=' + JSON.stringify(shop).replace(/</g, '\\u003c') + '</script>' +
    '<script src="/assets/shared.js?v=' + ASSET_V + '" defer></script><script src="/assets/site.js?v=' + ASSET_V + '" defer></script></body></html>';
}
function metrikaTag() {
  if (!METRIKA) return '';
  return '<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");' +
    'ym(' + METRIKA + ',"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});</script>' +
    '<noscript><div><img src="https://mc.yandex.ru/watch/' + METRIKA + '" style="position:absolute;left:-9999px" alt=""></div></noscript>';
}
function header(items) {
  return '<div class="topbar"><div class="wrap"><span class="live"><span class="dot"></span>Цены из прайса, обновляются автоматически</span>' +
    '<span>Заказ до 20:00 — доставка завтра<span class="sep">|</span>Москва и Московская область</span></div></div>' +
    '<header id="hd"><div class="wrap"><a href="/" class="logo" aria-label="Фруктовый Дом — на главную"><span class="mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true">' + IC.fruit + '</svg></span><span class="t">Фруктовый Дом<small>Поставки для бизнеса</small></span></a>' +
    '<nav class="main" aria-label="Главное меню"><a href="/catalog">Каталог</a><a href="/#clients">Заказчики</a><a href="/dostavka-i-oplata">Доставка и оплата</a><a href="/kontakty">Контакты</a></nav>' +
    '<div class="hd-r"><a class="phone" href="tel:' + ORG.phoneHref + '">' + ORG.phone + '</a>' +
    '<button type="button" class="lk" data-open="lk" aria-label="Кабинет компании"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V4h8v3M3 12h18"/></svg><span>Кабинет компании</span></button>' +
    '<button type="button" class="cartbtn" data-open="cart" aria-label="Корзина"><span id="ctotal">0 ₽</span><span class="cnt" id="ccount">0</span></button>' +
    '<button type="button" class="burger" data-open="menu" aria-label="Меню"><span></span><span></span><span></span></button></div></div>' +
    '<div class="mnav" id="mnav"><a href="/catalog">Весь каталог</a>' + CATS.filter(c => items.some(p => p.c === c.name)).map(c => '<a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>').join('') +
    '<a href="/dostavka-i-oplata">Доставка и оплата</a><a href="/kontakty">Контакты</a><a href="tel:' + ORG.phoneHref + '">' + ORG.phone + '</a></div></header>';
}
function footer(items) {
  return '<footer id="contacts"><div class="wrap"><div><b>Фруктовый Дом</b>Поставки овощей, фруктов, зелени, сухофруктов, орехов и заморозки для бизнеса и государственных учреждений Москвы и Московской области с ' + ORG.since + ' года.' +
    '<div class="req">' + ORG.legal + ' · ОГРНИП ' + ORG.ogrn + '</div></div>' +
    '<div><b>Каталог</b>' + CATS.filter(c => items.some(p => p.c === c.name)).map(c => '<a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>').join('<br>') + '</div>' +
    '<div><b>Связь</b><a href="tel:' + ORG.phoneHref + '">' + ORG.phone + '</a><br><a href="mailto:' + ORG.email + '">' + ORG.email + '</a><br>Мессенджер MAX<br><a href="/kontakty">Контакты и реквизиты</a></div>' +
    '<div><b>Склад</b>' + esc(ORG.addr) + '<br>' + esc(ORG.hours) + '<br><a href="/dostavka-i-oplata">Доставка и оплата</a></div></div></footer>';
}
function drawer() {
  return '<div class="ov" id="ov"></div><aside class="drawer" id="drawer" aria-label="Корзина"><div class="dh"><h3>Заказ</h3><button type="button" class="x" data-close="cart" aria-label="Закрыть"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
    '<div class="db"><div class="seg" id="who"><span class="pill"></span><button type="button" class="on" data-v="nonds">Без НДС</button><button type="button" data-v="nds">С НДС</button></div><div class="hint" id="whoHint"></div>' +
    '<div class="seg" id="zone"><span class="pill"></span><button type="button" class="on" data-v="msk">Москва</button><button type="button" data-v="mo">Московская обл.</button></div><div id="items"></div><div id="sum"></div></div>' +
    '<div class="df"><button type="button" id="pay">Оформить заказ</button></div></aside><div class="mov" id="mov"><div class="modal" id="modal" role="dialog" aria-modal="true"></div></div><div class="toast" id="toast" role="status"></div>';
}

/* ---------- страницы ---------- */
const CLIENTS = [['223-ФЗ', 'МГУ им. М.В. Ломоносова', 'Комбинат питания и столовые диетического питания'], ['44-ФЗ', 'НМИЦ гематологии Минздрава России', 'Бакалея, сухофрукты, орехи'],
  ['44-ФЗ', 'НИИР им. В.А. Насоновой', 'Бакалея и сухофрукты'], ['ДОГОВОР', 'Большой Московский цирк', 'Овощи, фрукты, сухофрукты и орехи'],
  ['44-ФЗ', 'Колледж КИГМ № 23', 'Поставки по заявкам до 2027 года'], ['ДОГОВОР', 'Девелопмент Звенигород', 'Свежая продукция, документооборот через ЭДО']];
const clientsBlock = () => '<section class="sec dark" id="clients"><div class="wrap"><div class="sec-h"><div><div class="eyebrow rv">Портфолио</div><h2 class="h rv d1">Нам доверяют государственные заказчики</h2></div><p class="rv d2">Действующие контракты и договоры поставки. Информация о госконтрактах открыта в ЕИС закупок.</p></div>' +
  '<div class="cl-grid">' + CLIENTS.map((c, i) => '<div class="cl rv d' + (i % 3) + '"><span class="law">' + c[0] + '</span><b>' + c[1] + '</b><span>' + c[2] + '</span></div>').join('') + '</div>' +
  '<div class="stats"><div class="st rv"><b data-count="' + ORG.since + '">' + ORG.since + '</b><span>год основания</span></div><div class="st rv d1"><b data-count="6" data-suf="+">6+</b><span>госзаказчиков</span></div><div class="st rv d2"><b>24 ч</b><span>от заказа до доставки</span></div><div class="st rv d3"><b data-count="7" data-suf=" дн">7 дн</b><span>отсрочка постоянным клиентам</span></div></div></div></section>';
const stepsBlock = () => '<section class="sec"><div class="wrap"><div class="sec-h"><div><div class="eyebrow rv">Как это работает</div><h2 class="h rv d1">Заказ в несколько кликов</h2></div><p class="rv d2">Соберите корзину и отправьте заказ — менеджер подтвердит его и пришлёт ссылку на оплату или счёт.</p></div>' +
  '<div class="proc"><div class="ps rv"><span class="num">01</span><b>Корзина</b><span>Цены в каталоге актуальные — не нужно запрашивать прайс</span></div><div class="ps rv d1"><span class="num">02</span><b>Подтверждение</b><span>Без НДС — ссылка на оплату картой или СБП. С НДС — счёт на почту компании</span></div>' +
  '<div class="ps rv d2"><span class="num">03</span><b>Сборка и взвешивание</b><span>Фиксируем точный вес, сумма — по факту</span></div><div class="ps rv d3"><span class="num">04</span><b>Доставка</b><span>На следующий день с документами: счёт, УПД, ЭДО</span></div></div></div></section>';
const termsBlock = () => '<div class="terms"><div class="term"><h3>Доставка</h3><dl><dt>Москва</dt><dd>бесплатно от 30 000 ₽</dd><dt>Московская область</dt><dd>бесплатно от 50 000 ₽</dd><dt>Заказ меньше порога</dt><dd>690 ₽ Москва · 1 290 ₽ МО</dd><dt>Минимальный заказ со счётом</dt><dd>5 000 ₽</dd><dt>Срок</dt><dd>на следующий день</dd><dt>Самовывоз</dt><dd>Мелитопольская, 1к2с2</dd></dl></div>' +
  '<div class="term"><h3>Оплата и точный вес</h3><p>Весовой товар — например, мешок картофеля 25–30 кг — взвешиваем при сборке и присылаем итоговую сумму до отправки.</p><p><b>Без НДС:</b> оформление без регистрации. Менеджер подтвердит заказ и пришлёт ссылку на оплату картой или СБП по фактическому весу.</p><p><b>С НДС:</b> заполните данные компании один раз — счёт придёт на почту. Сборка начинается после поступления оплаты, УПД — по фактическому весу.</p><p>Постоянным клиентам — отсрочка платежа до 7 дней.</p></div></div>';

function pageHome(cat) {
  const items = cat.items, top = [];
  CATS.forEach(c => items.filter(p => p.c === c.name).slice(0, 2).forEach(p => top.push(p)));
  const tick = items.slice(0, 30).map(p => '<span><b>' + esc(p.n) + '</b><i>' + perUnit(p) + '</i></span>').join('');
  const body = '<section class="hero"><div class="wrap hero-grid"><div><div class="eyebrow rv">Поставщик продуктов питания · с ' + ORG.since + ' года</div>' +
    '<h1 class="h rv d1">Овощи, фрукты и сухофрукты оптом — <span>с доставкой завтра</span></h1>' +
    '<p class="lead rv d2">Поставляем овощи, фрукты, зелень, сухофрукты, орехи и заморозку ресторанам, столовым и государственным учреждениям Москвы и Московской области. Цены в каталоге актуальные — не нужно запрашивать прайс и согласовывать стоимость.</p>' +
    '<div class="cta rv d3"><a href="/catalog" class="btn btn-p">Открыть каталог <span class="arr">→</span></a><a href="#clients" class="btn btn-s">Наши заказчики</a></div></div>' +
    '<div class="facts rv d2"><div class="fact"><b data-count="10" data-suf="+">10+</b><span>лет на рынке поставок</span></div><div class="fact"><b>24 ч</b><span>от заказа до доставки</span></div><div class="fact"><b>44 / 223-ФЗ</b><span>исполняем госконтракты</span></div><div class="fact"><b>ЭДО</b><span>счёт, УПД, ТОРГ-12</span></div></div></div></section>' +
    '<div class="ticker" aria-hidden="true"><div class="tr">' + tick + tick + '</div></div>' +
    '<section class="sec"><div class="wrap"><div class="sec-h"><div><div class="eyebrow rv">Каталог</div><h2 class="h rv d1">Категории товаров</h2></div><p class="rv d2">' + items.length + ' позиций с актуальными ценами. Оптовая цена включается автоматически при покупке упаковкой.</p></div>' + catTiles(items) + '</div></section>' +
    '<section class="sec" style="padding-top:0"><div class="wrap"><div class="sec-h"><div><div class="eyebrow rv">Популярное</div><h2 class="h rv d1">Часто заказывают</h2></div><p class="rv d2"><a class="more" href="/catalog">Весь каталог →</a></p></div>' + grid(top) + '</div></section>' +
    stepsBlock() + clientsBlock() +
    '<section class="sec" id="terms"><div class="wrap"><div class="sec-h"><div><div class="eyebrow rv">Условия</div><h2 class="h rv d1">Доставка и оплата</h2></div></div>' + termsBlock() + '</div></section>';
  return layout({ path: '/', kind: 'home', title: 'Овощи, фрукты, сухофрукты и орехи оптом в Москве — поставщик для бизнеса | Фруктовый Дом',
    desc: 'Поставщик овощей, фруктов, зелени, сухофруктов, орехов и заморозки для ресторанов, столовых и госучреждений Москвы и МО. Актуальные цены, доставка на следующий день, НДС и без НДС.',
    ld: [ORG_LD, { '@context': 'https://schema.org', '@type': 'WebSite', url: SITE + '/', name: 'Фруктовый Дом', inLanguage: 'ru' }], body }, cat);
}

function pageCatalog(cat) {
  const items = cat.items, cr = crumbs([{ n: 'Каталог', u: '/catalog' }]);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html + '<h1 class="h">Каталог продуктов оптом</h1><p class="intro">Овощи, фрукты, зелень, сухофрукты, орехи и заморозка с доставкой по Москве и Московской области. Цены обновляются автоматически.</p>' +
    catTiles(items) + toolbar(items, '') + CATS.map(c => { const its = items.filter(p => p.c === c.name); return its.length ? '<h2 class="grp h" id="' + c.slug + '"><a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a></h2>' + grid(its) : ''; }).join('') + '</div></section>';
  return layout({ path: '/catalog', kind: 'catalog', title: 'Каталог: овощи, фрукты, сухофрукты и орехи оптом с ценами | Фруктовый Дом',
    desc: 'Каталог продуктов оптом с актуальными ценами: ' + items.length + ' позиций — овощи, зелень, фрукты, сухофрукты, орехи, заморозка. Доставка по Москве и МО на следующий день.', ld: [cr.ld], body }, cat);
}

function pageCategory(cat, c) {
  const items = cat.items, its = items.filter(p => p.c === c.name), cr = crumbs([{ n: 'Каталог', u: '/catalog' }, { n: c.name, u: '/catalog/' + c.slug }]);
  const min = Math.min.apply(null, its.map(p => p.p));
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: c.h1, numberOfItems: its.length, itemListElement: its.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(url(p)), name: p.n })) };
  const body = '<section class="sec pg"><div class="wrap">' + cr.html + '<h1 class="h">' + esc(c.h1) + ' в Москве</h1>' +
    '<p class="intro">' + its.length + ' ' + S.pl(its.length, ['позиция', 'позиции', 'позиций']) + ' от ' + money(min) + ' за кг. Поставляем ' + c.gen + ' ресторанам, столовым и госучреждениям Москвы и области, доставка на следующий день.</p>' +
    toolbar(items, c.slug) + grid(its) +
    '<div class="seo-text"><h2 class="h">' + esc(cap(c.gen)) + ' оптом с доставкой</h2><p>«Фруктовый Дом» работает с ' + ORG.since + ' года и поставляет ' + c.gen + ' предприятиям общественного питания, школам, больницам и другим государственным заказчикам по 44-ФЗ и 223-ФЗ. Цены на сайте обновляются автоматически из нашего прайса — не нужно запрашивать коммерческое предложение.</p>' +
    '<p>Доставляем на следующий день по Москве (бесплатно от 30 000 ₽) и Московской области (бесплатно от 50 000 ₽). Работаем с НДС и без НДС, выставляем счёт и УПД, поддерживаем ЭДО. Весовой товар взвешиваем при сборке и считаем по фактическому весу.</p></div></div></section>';
  return layout({ path: '/catalog/' + c.slug, kind: 'category', title: c.h1 + ' в Москве — цены от ' + money(min) + '/кг, доставка | Фруктовый Дом',
    desc: c.h1 + ' с доставкой по Москве и МО на следующий день: ' + its.length + ' позиций от ' + money(min) + '/кг. Для ресторанов, столовых и госучреждений. Счёт, УПД, НДС.', ld: [cr.ld, ld], body }, cat);
}

function pageProduct(cat, p) {
  const c = catOf(p.c), cr = crumbs([{ n: 'Каталог', u: '/catalog' }, { n: c.name, u: '/catalog/' + c.slug }, { n: p.n, u: url(p) }]);
  const rel = cat.items.filter(x => x.c === p.c && x.slug !== p.slug).slice(0, 4);
  const text = productText(p);
  const valid = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.n, description: text, category: c.name, url: abs(url(p)), sku: p.slug,
    brand: { '@type': 'Brand', name: 'Фруктовый Дом' }, image: p.img || SITE + '/assets/og.png',
    offers: { '@type': 'Offer', url: abs(url(p)), priceCurrency: 'RUB', price: p.p.toFixed(2), priceValidUntil: valid, availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': SITE + '/#org' }, priceSpecification: { '@type': 'UnitPriceSpecification', price: p.p.toFixed(2), priceCurrency: 'RUB', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: p.u === 'кг' ? 'KGM' : 'H87' } } } };
  const rows = [['Категория', '<a href="/catalog/' + c.slug + '">' + esc(c.name) + '</a>'], ['Цена', money(p.p) + ' за ' + esc(p.u) + (p.pk ? ' (' + esc(INSTR[p.pack] || p.pack) + ')' : '')]];
  if (p.pk) rows.push(['Цена на развес', money(p.pk) + ' за кг'], ['Упаковка', esc(cap(p.pack)) + ' ~' + fmt(p.step) + ' кг'], ['Оптовая цена', 'от ' + fmt(p.th) + ' кг']);
  rows.push(['Продажа', p.w ? 'на вес, точная сумма после взвешивания' : 'по ' + esc(p.u)], ['Доставка', 'по Москве и МО на следующий день'], ['Документы', 'счёт, УПД, ЭДО; с НДС ' + (p.vat || 10) + '% и без НДС']);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html +
    '<div class="prod" data-slug="' + esc(p.slug) + '"><div class="pimg" style="background:' + c.bg + '">' + (p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.n) + ' оптом" width="800" height="600">' : icon(p.c)) + (p.w ? '<span class="wtag">Весовой</span>' : '') + '</div>' +
    '<div class="pbuy"><div class="eyebrow">' + esc(c.name) + '</div><h1 class="h">' + esc(p.n) + ' оптом</h1>' +
    '<div class="pm">' + (p.pk ? esc(cap(p.pack)) + ' ~' + fmt(p.step) + ' кг · на развес от 1 кг' : 'Цена за 1 ' + esc(p.u)) + '</div>' +
    '<div class="dyn">' + S.dyn(p, 0, 'pack', true) + '</div>' +
    (p.w ? '<div class="note">Весовой товар: взвешиваем при сборке, сумма — по фактическому весу.</div>' : '') +
    '<ul class="perks"><li>Доставка завтра при заказе до 20:00</li><li>Бесплатно от 30 000 ₽ по Москве, от 50 000 ₽ по МО</li><li>Счёт с НДС или оплата картой без регистрации</li></ul></div></div>' +
    '<div class="pinfo"><div><h2 class="h">Описание</h2><p>' + esc(text) + '</p></div><div><h2 class="h">Характеристики</h2><dl class="spec">' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl></div></div>' +
    (rel.length ? '<h2 class="grp h">Другие товары категории «' + esc(c.name) + '»</h2>' + grid(rel) : '') + '</div></section>';
  return layout({ path: url(p), kind: 'product', ogType: 'product', title: productTitle(p), desc: productDesc(p), img: p.img, ld: [cr.ld, ld], body }, cat);
}

function pageDelivery(cat) {
  const cr = crumbs([{ n: 'Доставка и оплата', u: '/dostavka-i-oplata' }]);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html + '<h1 class="h">Доставка и оплата</h1><p class="intro">Доставляем по Москве и Московской области на следующий день после заказа. Работаем с юрлицами, ИП и частными покупателями.</p>' + termsBlock() +
    '<div class="seo-text"><h2 class="h">Как проходит заказ</h2><p>1. Соберите корзину на сайте и отправьте заказ — без НДС без регистрации или со счётом с НДС на компанию.</p><p>2. Менеджер позвонит, подтвердит состав и время доставки и пришлёт ссылку на оплату или счёт.</p><p>3. Собираем и взвешиваем заказ, присылаем точную сумму. Сборка заказов со счётом начинается после поступления оплаты.</p><p>4. Привозим на следующий день с документами: счёт, УПД (по ЭДО или на бумаге).</p>' +
    '<h2 class="h">Госзаказчикам</h2><p>Исполняем контракты по 44-ФЗ и 223-ФЗ: поставки по заявкам, документ о приёмке в ЕИС, работа с казначейскими счетами. Для госконтрактов — без НДС.</p></div></div></section>';
  return layout({ path: '/dostavka-i-oplata', title: 'Доставка и оплата — продукты оптом по Москве и МО | Фруктовый Дом', desc: 'Доставка продуктов по Москве и МО на следующий день: бесплатно от 30 000 ₽ по Москве и от 50 000 ₽ по МО. Оплата картой, СБП или по счёту с НДС и без НДС.', ld: [cr.ld], body }, cat);
}

function pageContacts(cat) {
  const cr = crumbs([{ n: 'Контакты', u: '/kontakty' }]);
  const map = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Москва, ' + ORG.street);
  const body = '<section class="sec pg"><div class="wrap">' + cr.html + '<h1 class="h">Контакты</h1>' +
    '<div class="terms"><div class="term"><h3>Связь</h3><dl><dt>Телефон</dt><dd><a href="tel:' + ORG.phoneHref + '">' + ORG.phone + '</a></dd><dt>Телефон</dt><dd><a href="tel:+79264791499">' + ORG.phone2 + '</a></dd><dt>Почта</dt><dd><a href="mailto:' + ORG.email + '">' + ORG.email + '</a></dd><dt>Мессенджер</dt><dd>MAX</dd><dt>Режим работы</dt><dd>' + esc(ORG.hours) + '</dd></dl></div>' +
    '<div class="term"><h3>Склад и самовывоз</h3><p>' + esc(ORG.addr) + ', ' + ORG.zip + '</p><p><a class="btn btn-s" href="' + map + '" target="_blank" rel="noopener">Открыть на Яндекс Картах</a></p><h3 style="margin-top:22px">Реквизиты</h3><p>' + ORG.legal + '<br>ОГРНИП ' + ORG.ogrn + '<br>Торговая марка «Фруктовый Дом»</p></div></div></div></section>';
  return layout({ path: '/kontakty', title: 'Контакты — Фруктовый Дом, поставщик продуктов в Москве', desc: 'Телефон, почта, адрес склада и реквизиты «Фруктовый Дом». ' + ORG.addr + '. ' + ORG.hours + '.', ld: [cr.ld, ORG_LD], body }, cat);
}

function page404(cat) {
  const body = '<section class="sec pg"><div class="wrap"><h1 class="h">Страница не найдена</h1><p class="intro">Возможно, товар переименован или убран из каталога.</p><p><a class="btn btn-p" href="/catalog">Перейти в каталог</a></p>' + catTiles(cat.items) + '</div></section>';
  return layout({ path: '/404', noindex: true, title: 'Страница не найдена | Фруктовый Дом', desc: 'Страница не найдена', body }, cat);
}

function sitemap(cat) {
  const day = new Date().toISOString().slice(0, 10);
  const u = (loc, pr, fr) => '<url><loc>' + abs(loc) + '</loc><lastmod>' + day + '</lastmod><changefreq>' + fr + '</changefreq><priority>' + pr + '</priority></url>';
  const cats = CATS.filter(c => cat.items.some(p => p.c === c.name));
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + u('/', '1.0', 'daily') + u('/catalog', '0.9', 'daily') +
    cats.map(c => u('/catalog/' + c.slug, '0.8', 'daily')).join('') + cat.items.map(p => u(url(p), '0.7', 'daily')).join('') + u('/dostavka-i-oplata', '0.5', 'monthly') + u('/kontakty', '0.5', 'monthly') + '</urlset>';
}
const robots = () => 'User-agent: *\nDisallow: /api/\nDisallow: /1c\nDisallow: /*?*q=\n\nSitemap: ' + SITE + '/sitemap.xml\n';

module.exports = { pageHome, pageCatalog, pageCategory, pageProduct, pageDelivery, pageContacts, page404, sitemap, robots, url, SITE };
