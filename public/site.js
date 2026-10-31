/* Корзина и заказы. Корзина общая для всех страниц (хранится в браузере). */
(function () {
  const SH = window.__SHOP || { items: [] }, F = window.FS, $ = id => document.getElementById(id);
  const P = {}; SH.items.forEach(p => P[p.slug] = p);
  const ld = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const goal = (g, params) => { try { if (SH.metrika && window.ym) ym(+SH.metrika, 'reachGoal', g, params); } catch (e) {} };
  let cart = ld('fs_cart') || {}, mode = ld('fs_mode') || {}, who = ld('fs_who') || 'nonds', zone = ld('fs_zone') || 'msk';
  let profile = ld('fs_company'), orders = ld('fs_orders') || [], pending = false;
  Object.keys(cart).forEach(s => { if (!P[s] || !(cart[s] > 0)) delete cart[s]; });   // товар убрали из каталога
  const save = () => { sv('fs_cart', cart); sv('fs_mode', mode); };
  const md = s => mode[s] || 'pack';
  const { money: f, esc, fmt, unit } = F;

  /* ---------- карточки и блок покупки ---------- */
  function paint(slug, drop) {
    const p = P[slug]; if (!p) return;
    document.querySelectorAll('[data-slug="' + slug + '"]').forEach(el => {
      const k = cart[slug] || 0, d = el.querySelector('.dyn'); if (!d) return;
      d.innerHTML = F.dyn(p, k, md(slug), el.classList.contains('prod'));
      el.classList.toggle('inc', k > 0);
      if (drop) { const b = d.querySelector('.pr'); b && b.classList.add('drop'); }
    });
  }
  function ch(slug, dlt) {
    const p = P[slug], m = md(slug), k0 = cart[slug] || 0, st = F.step(p, m);
    let k1 = (p.pk && m === 'kg') ? k0 + dlt : (Math.round(k0 / st) + dlt) * st;
    k1 = Math.max(0, +k1.toFixed(2));
    if (k1) cart[slug] = k1; else delete cart[slug];
    if (!k0 && k1) goal('add_to_cart', { item: p.n });
    save(); paint(slug, k0 > 0 && unit(p, k1, m) < unit(p, k0, m)); renderCart(true);
  }
  function setMode(slug, m) {
    const p = P[slug], k0 = cart[slug] || 0, u0 = unit(p, k0, md(slug));
    mode[slug] = m;
    if (k0 && m === 'pack') cart[slug] = Math.max(1, Math.round(k0 / p.step)) * p.step;
    document.querySelectorAll('[data-slug="' + slug + '"] .ut').forEach(u => { u.classList.toggle('r', m === 'pack'); u.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); });
    save(); setTimeout(() => { paint(slug, unit(p, cart[slug] || 0, m) < u0); renderCart(); }, 300);
  }
  function toBulk(slug) { cart[slug] = P[slug].th; save(); paint(slug, true); renderCart(); }

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
      return '<div class="ci" data-slug="' + s + '"><a class="ic" href="/catalog/' + p.cs + '/' + p.slug + '" style="background:#eef1ec"><span>' + esc(p.n[0]) + '</span></a><div class="tx"><b>' + esc(p.n) + '</b>' + (p.w ? '≈ ' : '') + F.qtyLabel(p, k, m) + ' × ' + f(up) + (p.pk && up === p.p ? '<em class="opt">ОПТ</em>' : '') + tip +
        '<div class="cq"><button type="button" data-q="-1" aria-label="Меньше">−</button><button type="button" data-q="1" aria-label="Больше">+</button></div></div><div class="sm">' + (p.w ? '≈ ' : '') + f(k * up) + '</div></div>';
    }).join('') : '<div class="empty">Добавьте товары из <a href="/catalog">каталога</a></div>';
    $('whoHint').textContent = who === 'nds' ? 'Счёт с НДС пришлём на почту компании' : 'Без регистрации · менеджер подтвердит заказ и пришлёт ссылку на оплату';
    $('sum').innerHTML = ids.length ? '<div class="sum"><div class="row"><span>Товары</span><b>' + a + f(t.sum) + '</b></div><div class="row"><span>Доставка · ' + (zone === 'msk' ? 'Москва' : 'МО') + '</span><b>' + (t.fee ? f(t.fee) : 'Бесплатно') + '</b></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, t.sum / t.thr * 100) + '%"></i></div><div class="hint">' + (t.fee ? 'До бесплатной доставки — ' + f(t.thr - t.sum) : 'Бесплатная доставка') + '</div>' +
      (who === 'nds' ? '<div class="row" style="margin-top:8px"><span>НДС 10%</span><b>' + a + f(t.vat) + '</b></div>' : '') +
      '<div class="tot"><span>Итого' + (who === 'nds' ? ' с НДС' : '') + '</span><b>' + a + f(t.total) + '</b></div>' + (t.sum < t.min ? '<div class="err">Минимальная сумма заказа со счётом — ' + f(t.min) + '</div>' : '') + '</div>' +
      (t.hasW ? '<div class="note">В заказе весовой товар. ' + (who === 'nds' ? 'Счёт выставим по ориентировочной сумме, УПД — по фактическому весу после сборки.' : 'Точную сумму посчитаем после взвешивания и пришлём ссылку на оплату.') + '</div>' : '') : '';
    $('pay').textContent = who === 'nds' ? (profile ? 'Заказать со счётом' : 'Указать компанию и заказать') : 'Оформить заказ';
    $('pay').disabled = !ids.length || t.sum < t.min;
    $('ctotal').textContent = f(t.sum); const c = $('ccount'); c.textContent = ids.length;
    if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  }
  function seg(id, get, set) {
    const s = $(id), bs = s.querySelectorAll('button');
    const draw = () => bs.forEach((b, i) => { b.classList.toggle('on', b.dataset.v === get()); if (b.dataset.v === get()) s.classList.toggle('r', i === 1); });
    bs.forEach(b => b.addEventListener('click', () => { set(b.dataset.v); draw(); renderCart(); }));
    draw();
  }
  const openCart = () => { $('ov').classList.add('on'); $('drawer').classList.add('on'); };
  const closeCart = () => { $('ov').classList.remove('on'); $('drawer').classList.remove('on'); };

  /* ---------- окна ---------- */
  const XI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const OK = '<svg class="ok-ic" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29"/><path d="M20 33l8 8 16-17"/></svg>';
  const showModal = h => { $('modal').innerHTML = h; $('mov').classList.add('on'); };
  const closeModal = () => { $('mov').classList.remove('on'); pending = false; };
  function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3500); }
  const deliv = () => { const d = new Date(); d.setDate(d.getDate() + (d.getHours() < 20 ? 1 : 2)); return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }); };
  const today = () => new Date().toLocaleDateString('ru-RU');
  const val = id => ($(id) && $(id).value || '').trim();
  const head = (t, s) => '<div class="mh"><div><h3>' + t + '</h3><small>' + s + '</small></div><button type="button" class="x" data-close="modal" aria-label="Закрыть">' + XI + '</button></div>';
  const fld = (id, label, v, ph, extra) => '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + (extra || '') + '></div>';

  function openGuest() {
    const t = totals(), d = ld('fs_guest') || {};
    showModal(head('Оформление заказа', 'Без НДС · без регистрации') + '<div class="mb">' + fld('g_name', 'Имя', d.name, 'Как к вам обращаться', ' autocomplete="name"') +
      '<div class="two">' + fld('g_phone', 'Телефон *', d.phone, '+7', ' inputmode="tel" autocomplete="tel"') + fld('g_email', 'Email', d.email, 'необязательно', ' autocomplete="email"') + '</div>' +
      fld('g_addr', 'Адрес доставки *', d.addr, 'Город, улица, дом, подъезд', ' autocomplete="street-address"') + fld('g_comment', 'Комментарий', '', 'Удобное время, этаж, как найти вход') +
      '<input id="g_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px" aria-hidden="true">' +
      '<div class="tot"><span>Сумма заказа</span><b>' + (t.hasW ? '≈ ' : '') + f(t.total) + '</b></div><div class="note">Менеджер позвонит, подтвердит заказ и пришлёт ссылку на оплату картой или СБП.' + (t.hasW ? ' Весовой товар считаем по фактическому весу после сборки.' : '') + '</div>' +
      '<p class="hint" style="margin-top:10px">Нажимая «Отправить заказ», вы соглашаетесь на обработку персональных данных для выполнения заказа.</p></div>' +
      '<div class="mf"><button type="button" class="bprimary" id="g_send">Отправить заказ</button></div>');
  }
  function guestSend() {
    const o = { name: val('g_name'), phone: val('g_phone'), email: val('g_email'), addr: val('g_addr'), comment: val('g_comment'), hp: val('g_hp') };
    if (o.phone.replace(/\D/g, '').length < 10) { toast('Укажите телефон, чтобы мы могли подтвердить заказ'); $('g_phone').focus(); return; }
    if (!o.addr) { toast('Укажите адрес доставки'); $('g_addr').focus(); return; }
    sv('fs_guest', { name: o.name, phone: o.phone, email: o.email, addr: o.addr });
    sendOrder(Object.assign(o, { who: 'nonds' }), $('g_send'), r => {
      goal('order_sent', { order_price: r.total, type: 'nonds' }); clearCart();
      showModal('<div class="mb center" style="padding:36px 28px">' + OK + '<h3>Заказ № ' + r.no + ' принят</h3><p>Сумма: <b>' + f(r.total) + '</b>' + (r.fee ? ' (с доставкой)' : '') + '.</p><p>Менеджер позвонит на ' + esc(o.phone) + ' и пришлёт ссылку на оплату.</p>' +
        '<p class="hint" style="margin-top:10px">Ориентировочная доставка — ' + deliv() + '</p><button type="button" class="bsec" style="margin-top:18px" data-close="modal">Вернуться в каталог</button></div>');
    });
  }
  function orderItems() { return Object.keys(cart).map(s => { const p = P[s], k = cart[s], m = md(s); return { n: p.n, qty: +k.toFixed(2), mode: p.pk ? m : 'kg', price: unit(p, k, m) }; }); }
  function sendOrder(o, btn, ok) {
    const t = totals(), txt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
    fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: Object.assign(o, { zone, items: orderItems(), goods: t.sum, fee: t.fee, vat: t.vat, total: t.total }) }) })
      .then(r => r.json()).then(r => { if (!r.ok) throw new Error(r.error || 'ошибка'); ok(r); })
      .catch(e => toast('Не удалось отправить заказ (' + (e.message || 'нет связи') + '). Позвоните +7 999 833-05-53'))
      .finally(() => { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = txt; } });
  }
  function clearCart() { const was = Object.keys(cart); cart = {}; save(); was.forEach(s => paint(s)); renderCart(); }

  function openLK(tab) {
    if (!profile) tab = 'company'; tab = tab || 'orders';
    showModal(head('Кабинет компании', profile ? esc(profile.name) + ' · ИНН ' + esc(profile.inn) : 'Данные компании для счетов с НДС') +
      '<div class="tabs"><button type="button" class="' + (tab === 'orders' ? 'on' : '') + '" data-lk="orders">Заказы и счета</button><button type="button" class="' + (tab === 'company' ? 'on' : '') + '" data-lk="company">Компания</button></div>' + (tab === 'company' ? companyHTML() : ordersHTML()));
  }
  function companyHTML() {
    const v = k => profile ? profile[k] : '';
    return '<div class="mb">' + (pending ? '<div class="note" style="margin:0 0 16px">Чтобы получить счёт с НДС, укажите компанию один раз — в следующий раз заказ оформится в один клик.</div>' : '') +
      fld('c_inn', 'ИНН', v('inn'), '10 или 12 цифр', ' inputmode="numeric"') + fld('c_name', 'Название', v('name'), 'ООО «…» или ИП …', ' autocomplete="organization"') +
      '<div class="two">' + fld('c_kpp', 'КПП', v('kpp'), '') + fld('c_ogrn', 'ОГРН', v('ogrn'), '') + '</div>' + fld('c_addr', 'Юридический адрес', v('addr'), '') +
      '<div class="sect">Куда отправлять счета и как связаться</div><div class="two">' + fld('c_email', 'Email для счетов', v('email'), 'buh@company.ru', ' autocomplete="email"') + fld('c_phone', 'Телефон', v('phone'), '+7', ' inputmode="tel"') + '</div>' +
      fld('c_daddr', 'Адрес доставки', v('daddr'), 'Куда везти заказы') + '</div><div class="mf"><button type="button" class="bprimary" id="c_save">' + (pending ? 'Сохранить и отправить заказ' : 'Сохранить') + '</button></div>';
  }
  function saveCompany() {
    if (!/^\d{10}(\d{2})?$/.test(val('c_inn'))) return toast('ИНН — 10 цифр для компании или 12 для ИП');
    if (!val('c_name')) return toast('Укажите название компании');
    if (val('c_phone').replace(/\D/g, '').length < 10) return toast('Укажите телефон для связи');
    if (!/.+@.+\..+/.test(val('c_email'))) return toast('Укажите email, куда прислать счёт');
    if (!val('c_daddr')) return toast('Укажите адрес доставки');
    profile = { inn: val('c_inn'), name: val('c_name'), kpp: val('c_kpp'), ogrn: val('c_ogrn'), addr: val('c_addr'), email: val('c_email'), phone: val('c_phone'), daddr: val('c_daddr') };
    sv('fs_company', profile); renderCart();
    if (pending) { pending = false; createInvoice(); } else { openLK('orders'); toast('Данные компании сохранены'); }
  }
  function createInvoice() {
    if (!Object.keys(cart).length) return openLK('orders');
    const t = totals(), n = Object.keys(cart).length;
    toast('Отправляем заказ…');
    sendOrder({ who: 'nds', phone: profile.phone, email: profile.email, addr: profile.daddr, company: profile }, null, r => {
      goal('order_sent', { order_price: r.total, type: 'nds' });
      orders.unshift({ no: r.no, date: today(), total: r.total, vat: r.vat, hasW: t.hasW, items: n }); sv('fs_orders', orders.slice(0, 30));
      clearCart(); openLK('orders'); toast('Заказ № ' + r.no + ' принят. Счёт пришлём на ' + profile.email);
    });
  }
  function ordersHTML() {
    return '<div class="mb">' + (orders.length ? orders.map(o => '<div class="ord"><div class="inv" style="border:0;margin:0;padding:0"><div class="pdf">№</div><div class="tx"><b>Заказ № ' + o.no + ' от ' + o.date + '</b>' + o.items + ' поз. · ' + (o.hasW ? '≈ ' : '') + f(o.total) + ', в т.ч. НДС ' + f(o.vat) + '</div><span class="stt">Счёт придёт на почту</span></div></div>').join('')
      : '<div class="empty">Заказов пока нет.<br>Соберите корзину и выберите «С НДС».</div>') +
      '<p class="hint" style="margin-top:6px">Счёт с НДС пришлём на ' + esc(profile && profile.email || 'вашу почту') + '. Сборка начинается после поступления оплаты, УПД — по фактическому весу.</p></div>';
  }

  /* ---------- клики ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-open], [data-close]'); if (!t) return;
    const host = t.closest('[data-slug]'), slug = host && host.dataset.slug;
    if (t.dataset.add && slug) return ch(slug, 1);
    if (t.dataset.q && slug) return ch(slug, +t.dataset.q);
    if (t.dataset.mode && slug) return setMode(slug, t.dataset.mode);
    if (t.dataset.bulk) return toBulk(t.dataset.bulk);
    if (t.dataset.lk) return openLK(t.dataset.lk);
    const o = t.dataset.open, c = t.dataset.close;
    if (o === 'cart') return openCart();
    if (o === 'lk') return openLK();
    if (o === 'menu') { $('mnav').classList.toggle('open'); t.classList.toggle('on'); return; }
    if (c === 'cart') return closeCart();
    if (c === 'modal') return closeModal();
    if (t.id === 'pay') { if (!Object.keys(cart).length) return; closeCart(); setTimeout(() => { if (who === 'nonds') openGuest(); else if (!profile) { pending = true; openLK('company'); } else createInvoice(); }, 250); return; }
    if (t.id === 'g_send') return guestSend();
    if (t.id === 'c_save') return saveCompany();
  });
  $('ov').addEventListener('click', closeCart);
  $('mov').addEventListener('click', e => { if (e.target.id === 'mov') closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeCart(); } });
  addEventListener('scroll', () => $('hd').classList.toggle('sc', scrollY > 20), { passive: true });

  /* поиск и вид каталога */
  const q = $('q');
  if (q) q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase();
    document.querySelectorAll('main .grid .p').forEach(c => { c.hidden = !!s && !c.querySelector('.pn').textContent.toLowerCase().includes(s); });
    document.querySelectorAll('main .grp').forEach(h => { const g = h.nextElementSibling; h.hidden = g && ![...g.children].some(c => !c.hidden); });
  });
  document.querySelectorAll('.view button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.view button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('main .grid').forEach(g => g.classList.toggle('list', b.dataset.v === 'list'));
  }));

  /* плавное появление и счётчики */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('in'); e.target.querySelectorAll('[data-count]').forEach(countUp); io.unobserve(e.target); }), { threshold: .12 }) : null;
  document.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = 1;
    const to = +el.dataset.count, suf = el.dataset.suf || '', from = to > 1000 ? to - 10 : 0, t0 = performance.now(), d = 1400;
    (function step(t) { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e) + suf; if (k < 1) requestAnimationFrame(step); })(t0);
  }

  seg('who', () => who, v => { who = v; sv('fs_who', v); });
  seg('zone', () => zone, v => { zone = v; sv('fs_zone', v); });
  Object.keys(cart).forEach(s => paint(s));
  renderCart();
  window.__fsDebug = { cart: () => cart, totals };
})();
