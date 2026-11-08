/* Корзина, заказы, слайдер, меню и цели рекламы. Корзина общая для всех страниц (хранится в браузере). */
(function () {
  const SH = window.__SHOP || { items: [] }, F = window.FS, $ = id => document.getElementById(id);
  const P = {}; SH.items.forEach(p => P[p.slug] = p);
  const ld = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const QS = new URLSearchParams(location.search);

  /* ---------- реклама: цели Метрики, Google, электронная коммерция, метки перехода ---------- */
  const goal = (g, params) => {
    try { if (SH.metrika && window.ym) ym(+SH.metrika, 'reachGoal', g, params); } catch (e) {}
    try { if (window.gtag && (SH.ga || SH.gads)) gtag('event', g, params || {}); } catch (e) {}
  };
  const ecom = (action, list, extra) => { try { window.dataLayer = window.dataLayer || []; dataLayer.push({ ecommerce: Object.assign({ currencyCode: 'RUB' }, { [action]: Object.assign({ products: list }, extra || {}) }) }); } catch (e) {} };
  const prodOf = (p, k, m) => ({ id: p.slug, name: p.n, category: p.c, price: F.unit(p, k || 1, m || 'kg'), quantity: k || 1 });
  (function utm() {   /* откуда пришёл покупатель: запоминаем первый рекламный переход на 30 дней */
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'], got = {};
    keys.forEach(k => { const v = QS.get(k); if (v) got[k] = v.slice(0, 120); });
    const was = ld('fs_src');
    if (Object.keys(got).length && !(was && Date.now() - was.at < 30 * 864e5 && was.v.utm_source)) sv('fs_src', { at: Date.now(), v: got, ref: document.referrer.slice(0, 200) });
    else if (!was && document.referrer && !document.referrer.includes(location.host)) sv('fs_src', { at: Date.now(), v: {}, ref: document.referrer.slice(0, 200) });
  })();
  const srcStr = () => { const s = ld('fs_src'); if (!s) return ''; const v = s.v || {}; return (Object.keys(v).map(k => k + '=' + v[k]).join('&') + (s.ref ? ' ref=' + s.ref : '')).slice(0, 300); };

  let cart = ld('fs_cart') || {}, mode = ld('fs_mode') || {}, who = ld('fs_who') || 'nonds', zone = ld('fs_zone') || 'msk', buy = ld('fs_buy') || 'retail', favs = ld('fs_favs') || [];
  let profile = ld('fs_company'), me = null, pending = false;
  Object.keys(cart).forEach(s => { if (!P[s] || !(cart[s] > 0)) delete cart[s]; });   // товар убрали из каталога
  if (QS.get('opt')) buy = 'opt';
  const save = () => { sv('fs_cart', cart); sv('fs_mode', mode); };
  const md = s => mode[s] || (buy === 'opt' ? 'pack' : 'kg');
  const { money: f, esc, fmt, unit } = F;
  const pl = F.pl;

  /* ---------- карточки и блок покупки ---------- */
  function paint(slug, drop) {
    const p = P[slug]; if (!p) return;
    document.querySelectorAll('[data-slug="' + slug + '"]').forEach(el => {
      const k = cart[slug] || 0, d = el.querySelector('.dyn'); if (!d) return;
      const big = el.classList.contains('prod'), now = k > 0, was = el.classList.contains('inc');
      const html = F.dyn(p, k, md(slug), big);
      if (was !== now && !big) {        /* кнопка «В корзину» плавно превращается в «− 1 кг +» */
        el.classList.toggle('inc', now); const qv = d.querySelector('.qv'); if (qv && now) qv.textContent = F.qtyLabel(p, k, md(slug));
        clearTimeout(el._t); el._t = setTimeout(() => { d.innerHTML = html; }, 360);
      } else { d.innerHTML = html; el.classList.toggle('inc', now); }
      if (drop) { const b = d.querySelector('.pr'); b && b.classList.add('drop'); }
    });
  }
  function ch(slug, dlt, btn) {
    const p = P[slug], m = md(slug), k0 = cart[slug] || 0, st = F.step(p, m);
    if (p.pk && !mode[slug]) mode[slug] = m;
    let k1 = (!p.pk || m === 'kg') ? k0 + dlt * st : (Math.round(k0 / st) + dlt) * st;
    k1 = Math.max(0, +k1.toFixed(2));
    if (k1) cart[slug] = k1; else { delete cart[slug]; delete mode[slug]; }
    if (!k0 && k1) { goal('add_to_cart', { item: p.n }); ecom('add', [prodOf(p, k1, m)]); if (btn) fly(btn.closest('[data-slug]')); }
    if (k0 && !k1) ecom('remove', [prodOf(p, k0, m)]);
    save(); paint(slug, k0 > 0 && unit(p, k1, m) < unit(p, k0, m)); renderCart(true);
  }
  function setMode(slug, m) {
    const p = P[slug], k0 = cart[slug] || 0, u0 = unit(p, k0, md(slug));
    mode[slug] = m;
    if (k0 && m === 'pack') cart[slug] = Math.max(1, Math.round(k0 / p.step)) * p.step;
    document.querySelectorAll('[data-slug="' + slug + '"] .ut').forEach(u => { u.classList.toggle('r', m === 'pack'); u.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); });
    save(); setTimeout(() => { paint(slug, unit(p, cart[slug] || 0, m) < u0); renderCart(); }, 300);
  }
  function setBuy(v, quiet) {
    buy = v; sv('fs_buy', v);
    const s = $('buy'); if (s) { s.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); pillTo(s); }
    for (const id in cart) { const p = P[id]; if (!p || !p.pk) continue; mode[id] = v === 'opt' ? 'pack' : 'kg'; if (v === 'opt') cart[id] = Math.max(1, Math.round(cart[id] / p.step)) * p.step; }
    for (const id in mode) if (!cart[id]) delete mode[id];
    save(); document.querySelectorAll('[data-slug]').forEach(el => { const p = P[el.dataset.slug]; if (p && p.pk) paint(p.slug, !quiet && v === 'opt'); });
    renderCart(); tabs();
  }
  function pillTo(s) { const b = s.querySelector('button.on'), pill = s.querySelector('.pill'); if (!b || !pill) return; pill.style.width = b.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (b.offsetLeft - 4) + 'px)'; }
  function toBulk(slug) { mode[slug] = 'kg'; cart[slug] = P[slug].th; save(); paint(slug, true); renderCart(); }
  function fly(card) {
    try {
      if (!card || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const src = card.querySelector('.ph,.pimg'), im = src && src.querySelector('img'); if (!im) return;
      const fc = $('fcart'), tgt = (fc.classList.contains('on') ? fc : $('cartBtn')).getBoundingClientRect(), r = src.getBoundingClientRect();
      const s = Math.min(r.width, r.height) * .6, el = document.createElement('div');
      el.className = 'fly'; el.style.cssText = 'left:' + (r.left + r.width / 2 - s / 2) + 'px;top:' + (r.top + r.height / 2 - s / 2) + 'px;width:' + s + 'px;height:' + s + 'px;background:' + getComputedStyle(src).getPropertyValue('--bgc');
      const c = im.cloneNode(); c.style.cssText = 'width:100%;height:100%;object-fit:contain'; el.appendChild(c); document.body.appendChild(el);
      const dx = tgt.left + tgt.width / 2 - (r.left + r.width / 2), dy = tgt.top + tgt.height / 2 - (r.top + r.height / 2);
      el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx * .5 + 'px,' + (dy * .5 - 80) + 'px) scale(.6)', opacity: 1, offset: .5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.12)', opacity: .3 }], { duration: 750, easing: 'cubic-bezier(.5,0,.6,1)' }).onfinish = () => el.remove();
    } catch (e) {}
  }

  /* ---------- избранное ---------- */
  function paintFav() { document.querySelectorAll('[data-fav]').forEach(b => b.classList.toggle('on', favs.includes(b.dataset.fav))); }
  function fav(slug) { const i = favs.indexOf(slug); if (i < 0) { favs.push(slug); toast('Добавлено в избранное'); } else favs.splice(i, 1); sv('fs_favs', favs); paintFav(); if (QS.get('fav')) filter(); }

  /* ---------- корзина ---------- */
  function totals() {
    let sum = 0, hasW = false;
    for (const s in cart) { const p = P[s], k = cart[s]; sum += k * unit(p, k, md(s)); if (p.w) hasW = true; }
    const thr = zone === 'msk' ? 30000 : 50000, fee = sum && sum < thr ? (zone === 'msk' ? 690 : 1290) : 0;
    const vat = who === 'nds' ? Math.round((sum + fee) * 0.10) : 0;
    return { sum, hasW, thr, fee, vat, total: sum + fee + vat, min: who === 'nds' ? 5000 : 0 };
  }
  function renderCart(bump) {
    const ids = Object.keys(cart), t = totals(), a = t.hasW ? '≈ ' : '';
    $('items').innerHTML = ids.length ? ids.map(s => {
      const p = P[s], k = cart[s], m = md(s), up = unit(p, k, m);
      const tip = (p.pk && m === 'kg' && k < p.th) ? '<button type="button" class="up" data-bulk="' + s + '">+ ' + fmt(p.th - k) + ' кг — и цена ' + f(p.p) + '/кг →</button>' : '';
      return '<div class="ci" data-slug="' + s + '"><a class="ic" href="/catalog/' + p.cs + '/' + p.slug + '" style="--bgc:' + ((SH.bg || {})[p.c] || '#f5f1e8') + '"><img src="' + esc(p.img) + '" alt="" loading="lazy"></a><div class="tx"><b>' + esc(p.n) + '</b>' + (p.w ? '≈ ' : '') + F.qtyLabel(p, k, m) + ' × ' + f(up) + (p.pk && up === p.p ? '<em class="opt">ОПТ</em>' : '') + tip +
        '<div class="cq"><button type="button" data-q="-1" aria-label="Меньше">−</button><button type="button" data-q="1" aria-label="Больше">+</button></div></div><div class="sm">' + (p.w ? '≈ ' : '') + f(k * up) + '</div></div>';
    }).join('') : '<div class="empty">Корзина пока пустая.<br>Добавьте товары из <a href="/catalog">каталога</a></div>';
    $('whoHint').textContent = who === 'nds' ? 'Счёт с НДС пришлём на почту компании' : 'Без регистрации · менеджер подтвердит заказ и пришлёт ссылку на оплату';
    $('sum').innerHTML = ids.length ? '<div class="sum"><div class="row"><span>Товары</span><b>' + a + f(t.sum) + '</b></div><div class="row"><span>Доставка · ' + (zone === 'msk' ? 'Москва' : 'МО') + '</span><b>' + (t.fee ? f(t.fee) : 'Бесплатно') + '</b></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, t.sum / t.thr * 100) + '%"></i></div><div class="hint">' + (t.fee ? 'До бесплатной доставки — ' + f(t.thr - t.sum) : 'Бесплатная доставка 🎉') + '</div>' +
      (who === 'nds' ? '<div class="row" style="margin-top:8px"><span>НДС 10%</span><b>' + a + f(t.vat) + '</b></div>' : '') +
      '<div class="tot"><span>Итого' + (who === 'nds' ? ' с НДС' : '') + '</span><b>' + a + f(t.total) + '</b></div>' + (t.sum < t.min ? '<div class="err">Минимальная сумма заказа со счётом — ' + f(t.min) + '</div>' : '') + '</div>' +
      (t.hasW ? '<div class="note">В заказе весовой товар. ' + (who === 'nds' ? 'Счёт выставим по ориентировочной сумме, УПД — по фактическому весу после сборки.' : 'Точную сумму посчитаем после взвешивания и пришлём ссылку на оплату.') + '</div>' : '') : '';
    $('pay').textContent = who === 'nds' ? (profile ? 'Заказать со счётом' : 'Указать компанию и заказать') : 'Оформить заказ';
    $('pay').disabled = !ids.length || t.sum < t.min;
    $('ctotal').textContent = f(t.sum); const c = $('ccount'); c.textContent = ids.length; c.classList.toggle('z', !ids.length);
    if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    $('fcN').textContent = ids.length + ' ' + pl(ids.length, ['позиция', 'позиции', 'позиций']) + (t.fee ? '' : ' · доставка бесплатно'); $('fcS').textContent = a + f(t.total);
    $('fcart').classList.toggle('on', ids.length > 0 && !$('drawer').classList.contains('on'));
  }
  function seg(id, get, set) {
    const s = $(id), bs = s.querySelectorAll('button');
    const draw = () => bs.forEach((b, i) => { b.classList.toggle('on', b.dataset.v === get()); if (b.dataset.v === get()) s.classList.toggle('r', i === 1); });
    bs.forEach(b => b.addEventListener('click', () => { set(b.dataset.v); draw(); renderCart(); }));
    draw(); return draw;
  }
  const ov = on => { $('ov').classList.toggle('on', on || $('drawer').classList.contains('on') || $('mnav').classList.contains('on')); };
  const openCart = () => { $('mnav').classList.remove('on'); $('drawer').classList.add('on'); ov(true); $('fcart').classList.remove('on'); goal('cart_open'); };
  const closeCart = () => { $('drawer').classList.remove('on'); ov(); renderCart(); };
  const openMenu = () => { $('mnav').classList.add('on'); ov(true); };
  const closeMenu = () => { $('mnav').classList.remove('on'); ov(); };

  /* ---------- окна ---------- */
  const XI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const OK = '<svg class="ok-ic" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29"/><path d="M20 33l8 8 16-17"/></svg>';
  const showModal = h => { $('modal').innerHTML = h; $('mov').classList.add('on'); };
  const closeModal = () => { $('mov').classList.remove('on'); pending = false; };
  function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3500); }
  const deliv = () => { const d = new Date(); d.setDate(d.getDate() + (d.getHours() < 20 ? 1 : 2)); return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }); };
  const val = id => ($(id) && $(id).value || '').trim();
  const head = (t, s) => '<div class="mh"><div><h3>' + t + '</h3><small>' + s + '</small></div><button type="button" class="x" data-close="modal" aria-label="Закрыть">' + XI + '</button></div>';
  const fld = (id, label, v, ph, extra) => '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + (extra || '') + '></div>';
  const accLine = () => me ? '<p class="hint" style="margin-top:10px">Заказ появится в <a href="/account">личном кабинете</a> (' + esc(me.email) + ').</p>' : '<p class="hint" style="margin-top:10px">Укажите email — тогда заказ будет виден в <a href="/account">личном кабинете</a>.</p>';

  function openGuest() {
    const t = totals(), d = Object.assign({}, ld('fs_guest') || {}, me ? { name: me.name || (ld('fs_guest') || {}).name, phone: me.phone || (ld('fs_guest') || {}).phone, email: me.email, addr: me.addr || (ld('fs_guest') || {}).addr } : {});
    goal('checkout_start', { type: 'nonds' }); ecom('checkout', Object.keys(cart).map(s => prodOf(P[s], cart[s], md(s))));
    showModal(head('Оформление заказа', 'Без НДС · ' + (me ? 'вы вошли как ' + esc(me.email) : 'без регистрации')) + '<div class="mb">' + fld('g_name', 'Имя', d.name, 'Как к вам обращаться', ' autocomplete="name"') +
      '<div class="two">' + fld('g_phone', 'Телефон *', d.phone, '+7', ' inputmode="tel" autocomplete="tel"') + fld('g_email', 'Email', d.email, 'для личного кабинета', ' inputmode="email" autocomplete="email"' + (me ? ' readonly' : '')) + '</div>' +
      fld('g_addr', 'Адрес доставки *', d.addr, 'Город, улица, дом, подъезд', ' autocomplete="street-address"') + fld('g_comment', 'Комментарий', '', 'Удобное время, этаж, как найти вход') +
      '<input id="g_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px" aria-hidden="true">' +
      '<div class="tot"><span>Сумма заказа</span><b>' + (t.hasW ? '≈ ' : '') + f(t.total) + '</b></div><div class="note">Менеджер позвонит, подтвердит заказ и пришлёт ссылку на оплату картой или СБП.' + (t.hasW ? ' Весовой товар считаем по фактическому весу после сборки.' : '') + '</div>' + accLine() +
      '<p class="hint" style="margin-top:6px">Нажимая «Отправить заказ», вы соглашаетесь на обработку персональных данных для выполнения заказа.</p></div>' +
      '<div class="mf"><button type="button" class="bprimary" id="g_send">Отправить заказ</button></div>');
  }
  function guestSend() {
    const o = { name: val('g_name'), phone: val('g_phone'), email: val('g_email'), addr: val('g_addr'), comment: val('g_comment'), hp: val('g_hp') };
    if (o.phone.replace(/\D/g, '').length < 10) { toast('Укажите телефон, чтобы мы могли подтвердить заказ'); $('g_phone').focus(); return; }
    if (!o.addr) { toast('Укажите адрес доставки'); $('g_addr').focus(); return; }
    if (o.email && !/.+@.+\..+/.test(o.email)) { toast('Проверьте email'); $('g_email').focus(); return; }
    sv('fs_guest', { name: o.name, phone: o.phone, email: o.email, addr: o.addr });
    sendOrder(Object.assign(o, { who: 'nonds' }), $('g_send'), r => {
      done(r, 'nonds');
      showModal('<div class="mb center" style="padding:36px 28px">' + OK + '<h3>Заказ № ' + r.no + ' принят</h3><p>Сумма: <b>' + f(r.total) + '</b>' + (r.fee ? ' (с доставкой)' : '') + '.</p><p>Менеджер позвонит на ' + esc(o.phone) + ' и пришлёт ссылку на оплату.</p>' +
        '<p class="hint" style="margin-top:10px">Ориентировочная доставка — ' + deliv() + '</p>' + (me || o.email ? '<p class="hint">Статус заказа — в <a href="/account">личном кабинете</a>.</p>' : '') + '<button type="button" class="bsec" style="margin-top:18px" data-close="modal">Вернуться в каталог</button></div>');
    });
  }
  function done(r, type) {
    const list = Object.keys(cart).map(s => prodOf(P[s], cart[s], md(s)));
    goal('order_sent', { order_price: r.total, currency: 'RUB', type });
    ecom('purchase', list, { actionField: { id: String(r.no), revenue: r.total } });
    try { if (window.gtag && SH.gads && SH.gadsLabel) gtag('event', 'conversion', { send_to: SH.gads + '/' + SH.gadsLabel, value: r.total, currency: 'RUB', transaction_id: String(r.no) }); } catch (e) {}
    try { if (window.gtag && SH.ga) gtag('event', 'purchase', { transaction_id: String(r.no), value: r.total, currency: 'RUB', items: list.map(x => ({ item_id: x.id, item_name: x.name, item_category: x.category, price: x.price, quantity: x.quantity })) }); } catch (e) {}
    clearCart();
  }
  function orderItems() { return Object.keys(cart).map(s => { const p = P[s], k = cart[s], m = md(s); return { n: p.n, qty: +k.toFixed(2), mode: p.pk ? m : 'kg' }; }); }
  function orderKey(sig) { try { const s = JSON.parse(sessionStorage.getItem('fs_okey') || 'null'); if (s && s.sig === sig) return s.k; } catch (e) {} const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('fs_okey', JSON.stringify({ sig, k })); } catch (e) {} return k; }
  function orderKeyDone() { try { sessionStorage.removeItem('fs_okey'); } catch (e) {} }
  function sendOrder(o, btn, ok) {
    if (sendOrder.busy) return;                               /* второе нажатие, пока идёт отправка, — не считаем */
    const t = totals(), txt = btn ? btn.textContent : '', items = orderItems();
    const key = orderKey(JSON.stringify([items, o.who, zone]));
    sendOrder.busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
    /* цену, доставку и НДС считает сервер; итог отправляем только для сверки */
    fetch('/api/order', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: Object.assign(o, { zone, items, total: t.total, key, src: srcStr() }) }) })
      .then(r => r.json()).then(r => {
        if (r.code === 'prices_changed') { toast('Цены обновились. Новая сумма — ' + f(r.total) + '. Страница обновится, проверьте заказ.'); setTimeout(() => location.reload(), 3000); return; }
        if (!r.ok) throw new Error(r.error || 'ошибка');
        orderKeyDone(); ok(r);
      })
      .catch(e => toast('Не удалось отправить заказ (' + (e.message || 'нет связи') + '). Позвоните +7 999 833-05-53'))
      .finally(() => { sendOrder.busy = false; if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = txt; } });
  }
  function clearCart() { const was = Object.keys(cart); cart = {}; mode = {}; save(); was.forEach(s => paint(s)); renderCart(); }

  /* компания для заказа с НДС: из личного кабинета (если вошли) или из браузера */
  function openCompany() {
    const v = k => profile ? profile[k] : '';
    showModal(head('Компания для счёта', 'Заполняется один раз') + '<div class="mb">' + (pending ? '<div class="note" style="margin:0 0 16px">Чтобы получить счёт с НДС, укажите компанию — в следующий раз заказ оформится в один клик.' + (me ? ' Данные сохранятся в личном кабинете.' : '') + '</div>' : '') +
      fld('c_inn', 'ИНН', v('inn'), '10 или 12 цифр', ' inputmode="numeric"') + fld('c_name', 'Название', v('name'), 'ООО «…» или ИП …', ' autocomplete="organization"') +
      '<div class="two">' + fld('c_kpp', 'КПП', v('kpp'), '') + fld('c_ogrn', 'ОГРН', v('ogrn'), '') + '</div>' + fld('c_addr', 'Юридический адрес', v('addr'), '') +
      '<div class="sect">Куда отправлять счета и как связаться</div><div class="two">' + fld('c_email', 'Email для счетов', v('email') || (me && me.email), 'buh@company.ru', ' inputmode="email" autocomplete="email"') + fld('c_phone', 'Телефон', v('phone') || (me && me.phone), '+7', ' inputmode="tel"') + '</div>' +
      fld('c_daddr', 'Адрес доставки', v('daddr') || (me && me.addr), 'Куда везти заказы') + '</div><div class="mf"><button type="button" class="bprimary" id="c_save">' + (pending ? 'Сохранить и отправить заказ' : 'Сохранить') + '</button></div>');
  }
  function saveCompany() {
    if (!/^\d{10}(\d{2})?$/.test(val('c_inn'))) return toast('ИНН — 10 цифр для компании или 12 для ИП');
    if (!val('c_name')) return toast('Укажите название компании');
    if (val('c_phone').replace(/\D/g, '').length < 10) return toast('Укажите телефон для связи');
    if (!/.+@.+\..+/.test(val('c_email'))) return toast('Укажите email, куда прислать счёт');
    if (!val('c_daddr')) return toast('Укажите адрес доставки');
    profile = { inn: val('c_inn'), name: val('c_name'), kpp: val('c_kpp'), ogrn: val('c_ogrn'), addr: val('c_addr'), email: val('c_email'), phone: val('c_phone'), daddr: val('c_daddr') };
    sv('fs_company', profile); renderCart();
    if (me) fetch('/api/me/company', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company: profile }) }).catch(() => {});
    if (pending) { pending = false; createInvoice(); } else { closeModal(); toast('Данные компании сохранены'); }
  }
  function createInvoice() {
    if (!Object.keys(cart).length) return;
    goal('checkout_start', { type: 'nds' });
    toast('Отправляем заказ…');
    sendOrder({ who: 'nds', phone: profile.phone, email: profile.email, addr: profile.daddr, company: profile }, null, r => {
      done(r, 'nds');
      showModal('<div class="mb center" style="padding:36px 28px">' + OK + '<h3 class="ord">Заказ № ' + r.no + ' принят</h3><p>Сумма: <b>' + f(r.total) + '</b>, в т.ч. НДС ' + f(r.vat) + '.</p><p>Счёт пришлём на ' + esc(profile.email) + '. Сборка начнётся после оплаты.</p>' +
        '<p class="hint" style="margin-top:10px">Статус, счёт и история — в <a href="/account">личном кабинете</a>.</p><button type="button" class="bsec" style="margin-top:18px" data-close="modal">Вернуться в каталог</button></div>');
    });
  }

  /* ---------- поиск и фильтры на странице каталога ---------- */
  function filter() {
    const q = $('q') ? $('q').value.trim().toLowerCase() : '', onlyFav = !!QS.get('fav');
    let shown = 0;
    document.querySelectorAll('main .grid .p').forEach(c => { const ok = (!q || c.querySelector('.pn').textContent.toLowerCase().includes(q)) && (!onlyFav || favs.includes(c.dataset.slug)); c.hidden = !ok; if (ok) shown++; });
    document.querySelectorAll('main .grp').forEach(h => { const g = h.nextElementSibling; h.hidden = !!g && ![...g.children].some(c => !c.hidden); });
    const nr = $('nores'); if (nr) { nr.hidden = shown > 0; if (onlyFav && !shown) nr.textContent = 'Нажмите ♥ на товаре, чтобы добавить его в избранное'; }
    if ($('sbox')) $('sbox').classList.toggle('has', !!q);
  }

  /* ---------- нижнее меню ---------- */
  function tabs() {
    const tb = $('tabbar'); if (!tb) return;
    const path = location.pathname, opt = buy === 'opt' && /^\/catalog/.test(path);
    tb.querySelectorAll('a').forEach(a => { const h = a.getAttribute('href'); let on = false;
      if (h === '/') on = path === '/'; else if (h === '/catalog?opt=1') on = opt; else if (h === '/catalog') on = /^\/catalog/.test(path) && !opt; else on = path.startsWith(h);
      a.classList.toggle('on', on); });
  }

  /* ---------- клики ---------- */
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goal]'); if (g) goal(g.dataset.goal);
    const fv = e.target.closest('[data-fav]'); if (fv) { e.preventDefault(); return fav(fv.dataset.fav); }
    const fd = e.target.closest('[data-find]'); if (fd && $('q')) { e.preventDefault(); $('q').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('q').focus({ preventScroll: true }), 400); return; }
    const rp = e.target.closest('[data-repeat]'); if (rp) { e.preventDefault(); return repeat(rp); }
    const t = e.target.closest('button, [data-open], [data-close]'); if (!t) return;
    const host = t.closest('[data-slug]'), slug = host && host.dataset.slug;
    if (t.dataset.add && slug) return ch(slug, 1, t);
    if (t.dataset.q && slug) return ch(slug, +t.dataset.q);
    if (t.dataset.mode && slug) return setMode(slug, t.dataset.mode);
    if (t.dataset.bulk) return toBulk(t.dataset.bulk);
    const o = t.dataset.open, c = t.dataset.close;
    if (o === 'cart') return openCart();
    if (o === 'menu') return openMenu();
    if (c === 'cart') return closeCart();
    if (c === 'menu') return closeMenu();
    if (c === 'modal') return closeModal();
    if (t.id === 'pay') { if (!Object.keys(cart).length) return; closeCart(); setTimeout(() => { if (who === 'nonds') openGuest(); else if (!profile) { pending = true; openCompany(); } else createInvoice(); }, 250); return; }
    if (t.id === 'g_send') return guestSend();
    if (t.id === 'c_save') return saveCompany();
  });
  $('ov').addEventListener('click', () => { closeCart(); closeMenu(); });
  $('mov').addEventListener('click', e => { if (e.target.id === 'mov') closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeCart(); closeMenu(); } });
  addEventListener('scroll', () => $('hd').classList.toggle('sc', scrollY > 20), { passive: true });
  if ($('q')) { $('q').addEventListener('input', filter); $('qclr').addEventListener('click', e => { e.preventDefault(); $('q').value = ''; filter(); $('q').focus(); }); }
  if ($('buy')) $('buy').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (b.dataset.v !== buy) { setBuy(b.dataset.v); if (b.dataset.v === 'opt') toast('Показаны оптовые цены'); } }));
  addEventListener('resize', () => $('buy') && pillTo($('buy')));

  /* повтор заказа из личного кабинета: товары, которые есть в каталоге, кладём в корзину */
  function repeat(btn) {
    let list = []; try { list = JSON.parse(btn.dataset.repeat || '[]'); } catch (e) {}
    const byName = {}; SH.items.forEach(p => byName[p.n] = p);
    let n = 0, miss = [];
    list.forEach(l => { const p = byName[l.n]; if (!p) { miss.push(l.n); return; } const m = p.pk ? (l.mode === 'pack' ? 'pack' : 'kg') : 'kg'; mode[p.slug] = m; cart[p.slug] = +((cart[p.slug] || 0) + l.qty).toFixed(2); n++; });
    save(); renderCart(true); Object.keys(cart).forEach(s => paint(s));
    if (n) { goal('repeat_order'); openCart(); }
    toast(n ? 'В корзине: ' + n + ' ' + pl(n, ['позиция', 'позиции', 'позиций']) + (miss.length ? '. Нет в каталоге: ' + miss.join(', ') : '') : 'Этих товаров сейчас нет в каталоге');
  }

  /* место доставки и срок */
  function setZone(v) { zone = v; sv('fs_zone', v); if ($('locName')) $('locName').textContent = v === 'msk' ? 'Москва' : 'Московская обл.'; if ($('locMenu')) $('locMenu').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.z === v)); }
  if ($('loc')) {
    $('loc').addEventListener('click', e => { e.stopPropagation(); const on = !$('locMenu').classList.contains('on'); $('locMenu').classList.toggle('on', on); $('loc').setAttribute('aria-expanded', on); });
    $('locMenu').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setZone(b.dataset.z); drawZone(); renderCart(); $('locMenu').classList.remove('on'); toast(b.dataset.z === 'msk' ? 'Доставка по Москве: бесплатно от 30 000 ₽' : 'Доставка по области: бесплатно от 50 000 ₽'); }));
    document.addEventListener('click', () => { $('locMenu').classList.remove('on'); $('loc').setAttribute('aria-expanded', false); });
    $('dlvTxt').textContent = new Date().getHours() >= 20 ? 'Доставка послезавтра' : 'Доставка завтра';
  }

  /* слайдер на главной */
  (function () {
    const tr = $('track'); if (!tr || !$('dots')) return;
    const sl = [...tr.children], dots = [...$('dots').children]; let i = 0, timer, hold = false;
    const set = n => { i = n; sl.forEach((s, j) => s.classList.toggle('on', j === n)); dots.forEach((d, j) => d.classList.toggle('on', j === n)); };
    const goTo = n => { tr.scrollTo({ left: tr.clientWidth * n, behavior: 'smooth' }); set(n); };
    const auto = () => { clearInterval(timer); timer = setInterval(() => { if (!hold && !document.hidden) goTo((i + 1) % sl.length); }, 5500); };
    let raf; tr.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const n = Math.round(tr.scrollLeft / tr.clientWidth); if (n !== i) set(n); }); }, { passive: true });
    dots.forEach((d, j) => d.addEventListener('click', () => { goTo(j); auto(); }));
    tr.addEventListener('pointerdown', () => hold = true); tr.addEventListener('pointerup', () => { hold = false; auto(); }); tr.addEventListener('touchend', () => { hold = false; auto(); }, { passive: true });
    $('slider').addEventListener('mouseenter', () => hold = true); $('slider').addEventListener('mouseleave', () => hold = false);
    addEventListener('resize', () => tr.scrollLeft = tr.clientWidth * i); auto();
  })();

  /* плавное появление */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('in'); io.unobserve(e.target); }), { threshold: .12 }) : null;
  document.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  /* кто вошёл в личный кабинет (для заполнения заказа) */
  fetch('/api/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(r => {
    if (!r || !r.ok || !r.me) return; me = r.me;
    if (me.company && me.company.inn) { profile = me.company; sv('fs_company', profile); renderCart(); }
    const a = $('accBtn'); if (a) { a.insertAdjacentHTML('beforeend', '<span class="acc-dot"></span>'); a.title = 'Личный кабинет · ' + me.email; }
  }).catch(() => {});

  const drawWho = seg('who', () => who, v => { who = v; sv('fs_who', v); });
  const drawZone = seg('zone', () => zone, v => { setZone(v); });
  setZone(zone);
  if (buy === 'opt') setBuy('opt', true); else if ($('buy')) pillTo($('buy'));
  if (document.fonts && $('buy')) document.fonts.ready.then(() => pillTo($('buy')));
  Object.keys(cart).forEach(s => paint(s));
  paintFav(); renderCart(); tabs();
  if (QS.get('fav') || QS.get('find')) { filter(); if (QS.get('find') && $('q')) setTimeout(() => $('q').focus(), 300); }
  /* просмотр товара — для товарной рекламы */
  const prod = document.querySelector('.prod[data-slug]'); if (prod && P[prod.dataset.slug]) ecom('detail', [prodOf(P[prod.dataset.slug])]);
  window.__fsDebug = { cart: () => cart, totals, drawWho };
})();
