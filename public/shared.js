/* Общие правила цены и отрисовка блока «цена + кг/мешок + кнопка». Используется и сервером, и браузером. */
(function (root) {
  const fmt = n => String(+(+n).toFixed(2)).replace('.', ',');
  const money = n => { const v = Math.round(+n * 100) / 100; return v.toLocaleString('ru-RU', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' ₽'; };
  const pl = (n, w) => { n = Math.abs(n) % 100; const a = n % 10; return n > 10 && n < 20 ? w[2] : a === 1 ? w[0] : a > 1 && a < 5 ? w[1] : w[2]; };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* цена за кг: мешком — всегда опт; по кг — опт только от порога */
  const unit = (p, k, m) => (!p.pk || m === 'pack' || k >= p.th) ? p.p : p.pk;
  const step = (p, m) => (p.pk && m === 'pack') ? p.step : 1;
  const qtyLabel = (p, k, m) => {
    if (p.pk && m === 'pack') { const n = Math.round(k / p.step); return n + ' ' + pl(n, p.pn) + ' · ≈' + fmt(k) + ' кг'; }
    return fmt(k) + ' ' + p.u;
  };
  const CARTI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h2.6l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.6-7.3H6"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>';
  /* блок цены и покупки карточки; big — страница товара (с выбором «на развес / мешком») */
  function dyn(p, k, m, big) {
    m = m || 'kg'; k = k || 0;
    const up = unit(p, k, m), bulk = p.pk && up === p.p;
    let tier;
    if (p.pk) {
      if (m === 'pack') tier = '<div class="tier ok">' + esc(cap(p.pn[0])) + ' ≈ ' + money(p.p * p.step) + '</div>';
      else if (k >= p.th) tier = '<div class="tier ok">✓ Оптовая цена от ' + fmt(p.th) + ' кг</div>';
      else tier = '<div class="tier">от ' + fmt(p.th) + ' кг — ' + money(p.p) + '/кг</div>' + (k ? '<div class="tb"><i style="width:' + Math.min(100, k / p.th * 100) + '%"></i></div>' : '');
    } else tier = '<div class="tier mut">' + (p.w ? 'Сумма — по весу' : 'Цена от 1 ' + esc(p.u)) + '</div>';
    const ut = big && p.pk ? '<div class="ut' + (m === 'pack' ? ' r' : '') + '"><span class="pill"></span><button type="button" class="' + (m === 'kg' ? 'on' : '') + '" data-mode="kg">На развес</button>' +
      '<button type="button" class="' + (m === 'pack' ? 'on' : '') + '" data-mode="pack">' + esc(cap(p.pn[0])) + ' ~' + fmt(p.step) + ' кг</button></div>' : '';
    return '<div class="pr"><b>' + money(up) + '</b><span>/' + esc(p.u) + '</span>' + (bulk && m === 'pack' ? '<s class="old">' + money(p.pk) + '</s>' : '') + '</div>' + ut + tier +
      '<div class="act"><button type="button" class="add" data-add="1">' + CARTI + 'В корзину</button>' +
      '<div class="qty"><button type="button" data-q="-1" aria-label="Меньше">−</button><span class="qv">' + (k ? qtyLabel(p, k, m) : '') + '</span><button type="button" data-q="1" aria-label="Больше">+</button></div></div>';
  }
  const api = { fmt, money, pl, cap, esc, unit, step, qtyLabel, dyn, CARTI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FS = api;
})(typeof window !== 'undefined' ? window : this);
