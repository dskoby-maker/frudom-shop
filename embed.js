/* Магазин «Фруктовый Дом» для Тильды.
   В блок HTML (T123) на странице вставляется:
   <div id="fs-shop"></div><script src="https://dskoby-maker.github.io/frudom-shop/embed.js"></script>
   Скрипт берёт свежую версию магазина с GitHub, поэтому в Тильде ничего менять не нужно. */
(function () {
  if (window.__fsShop) return; window.__fsShop = 1;
  var BASE = window.SHOP_BASE_TEST || "https://dskoby-maker.github.io/frudom-shop/";
  window.SHOP_BASE = BASE;
  var mount = document.getElementById("fs-shop");
  var msg = function (t) { if (mount) mount.innerHTML = '<div style="padding:80px 16px;text-align:center;font:15px/1.5 system-ui,sans-serif;color:#6d7570">' + t + '</div>'; };
  msg("Загружаем каталог…");
  fetch(BASE + "index.html?v=" + Date.now()).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (h) {
    var d = new DOMParser().parseFromString(h, "text/html");
    [].forEach.call(d.head.querySelectorAll("style,link[rel=stylesheet]"), function (n) { document.head.appendChild(n); });
    var code = [].map.call(d.body.querySelectorAll("script"), function (s) { return s.textContent; }).join("\n");
    [].forEach.call(d.body.querySelectorAll("script"), function (s) { s.remove(); });
    var box = document.createElement("div"); box.id = "fs-app"; box.innerHTML = d.body.innerHTML;
    if (mount) { mount.innerHTML = ""; mount.style.display = "none"; }
    document.body.appendChild(box);
    var sc = document.createElement("script"); sc.textContent = code; document.body.appendChild(sc);
  }).catch(function () { msg('Не удалось загрузить сайт. Обновите страницу или позвоните <a href="tel:+79998330553">+7 999 833-05-53</a>.'); });
})();
