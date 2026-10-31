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
  /* блок цены и покупки; big — большой вариант для страницы товара */
  function dyn(p, k, m, big) {
    m = m || 'pack'; k = k || 0;
    const up = unit(p, k, m), bulk = p.pk && up === p.p;
    let opts = '';
    if (p.pk) {
      let tier;
      if (m === 'pack') tier = '<div class="tier ok">Оптовая цена · ' + p.pn[0] + ' ≈ ' + money(p.p * p.step) + '</div>';
      else if (k >= p.th) tier = '<div class="tier ok">✓ От ' + fmt(p.th) + ' кг — оптовая цена</div>';
      else tier = '<div class="tier">От ' + fmt(p.th) + ' кг — ' + money(p.p) + '/кг' + (k ? ' · ещё ' + fmt(p.th - k) + ' кг' : '') + '</div><div class="tb"><i style="width:' + Math.min(100, k / p.th * 100) + '%"></i></div>';
      opts = '<div class="opts"><div class="ut' + (m === 'pack' ? ' r' : '') + '"><span class="pill"></span>' +
        '<button type="button" class="' + (m === 'kg' ? 'on' : '') + '" data-mode="kg">По кг</button>' +
        '<button type="button" class="' + (m === 'pack' ? 'on' : '') + '" data-mode="pack">' + esc(cap(p.pn[0])) + ' ~' + fmt(p.step) + ' кг</button></div>' + tier + '</div>';
    }
    return '<div class="pr"><b>' + money(up) + '</b><span>/ ' + esc(p.u) + '</span>' + (bulk ? '<s class="old">' + money(p.pk) + '</s>' : '') + '</div>' + opts +
      '<div class="act' + (big ? ' big' : '') + '"><button type="button" class="add" data-add="1">' + (big ? 'Добавить в заказ' : 'В заказ') + '</button>' +
      '<div class="qty"><button type="button" data-q="-1" aria-label="Меньше">−</button><span class="qv">' + qtyLabel(p, k, m) + '</span><button type="button" data-q="1" aria-label="Больше">+</button></div></div>';
  }
  const api = { fmt, money, pl, cap, esc, unit, step, qtyLabel, dyn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FS = api;
})(typeof window !== 'undefined' ? window : this);
