# Магазин «Фруктовый Дом» — frudom.ru

Отдельный проект, к генератору документов (frudom-docs) не относится.

| Что | Где |
|---|---|
| Страница магазина | `index.html` → https://dskoby-maker.github.io/frudom-shop/ |
| Подключение к Тильде | `embed.js` (одна строка в блоке HTML, см. ниже) |
| Сервер (Apps Script) | `server/Code.gs` → таблица «Магазин Фруктовый Дом» → Расширения → Apps Script |
| Запасной каталог | `catalog.json` (если таблица недоступна) |
| Проверка | `node test/server.js`, затем `node test/check.js` → «ошибок: 0» |

**Таблица «Магазин Фруктовый Дом»:** «Витрина» — товары и цены сайта; «Заказы с сайта» — заказы;
«Товары» — цены, которые формула IMPORTRANGE только читает из «Документы ФД».

**Блок для Тильды (T123 «HTML-код»):**
```
<div id="fs-shop"></div><script src="https://dskoby-maker.github.io/frudom-shop/embed.js"></script>
```
