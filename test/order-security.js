/* Проверка защиты заказов (этап 1 ТЗ). Без браузера, на тестовой таблице — настоящих заказов и писем нет.
   Запуск: node test/order-security.js → в конце «ошибок: 0». Сам поднимает тестовую таблицу (порт 8790) и сайт (порт 3005). */
const { spawn } = require('child_process'), path = require('path');
const ROOT = path.join(__dirname, '..'), procs = [], fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const run = (f, env) => { const p = spawn('node', [f], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: 'ignore' }); procs.push(p); return p; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const GAS = 'http://localhost:8790/api', SITE = 'http://localhost:3005';
const gas = order => fetch(GAS, { method: 'POST', body: JSON.stringify({ action: 'shopOrder', order }) }).then(r => r.json());
const dump = () => fetch('http://localhost:8790/dump').then(r => r.json());
const rows = async () => ((await dump()).sheets['Заказы с сайта'] || []).slice(1).filter(r => r && r.length);
const base = (items, extra) => Object.assign({ who: 'nonds', zone: 'msk', phone: '+7 999 000-00-00', addr: 'Москва, Тестовая 1', items }, extra || {});

(async () => {
  run('test/server.js'); run('server.js', { PORT: 3005, GS_URL: GAS });
  for (let i = 0; i < 40; i++) { try { await fetch('http://localhost:8790/dump'); await fetch(SITE + '/health'); break; } catch (e) { await wait(250); } }

  /* 1. Обычный заказ: сумма считается сервером */
  let r = await gas(base([{ n: 'Морковь', qty: 3, mode: 'kg' }], { total: 3 * 64 + 690 }));
  ok(r.ok && r.total === 882 && r.goods === 192 && r.fee === 690, '1. обычный заказ: ' + JSON.stringify(r));

  /* 2. Подмена цены, НДС, доставки, суммы — игнорируются */
  let n0 = (await rows()).length;
  r = await gas(base([{ n: 'Кешью', qty: 2, mode: 'kg', price: 1 }], { goods: 2, fee: 0, vat: 0 }));
  ok(r.ok && r.goods === 2380 && r.fee === 690, '2. подмена цены принята: ' + JSON.stringify(r));
  let last = (await rows()).pop();
  ok(last && last[15] === '2380' && last[19] === '3070', '2. в таблицу записана не серверная сумма: ' + JSON.stringify(last && last.slice(15, 20)));

  /* 3. Неизвестный и скрытый товар — отказ, строки в таблице нет */
  n0 = (await rows()).length;
  r = await gas(base([{ n: 'Золото', qty: 1, mode: 'kg', price: 1 }]));
  ok(!r.ok && r.code === 'unknown_item', '3. неизвестный товар принят: ' + JSON.stringify(r));
  r = await gas(base([{ n: 'Скрытый товар', qty: 1 }]));
  ok(!r.ok && r.code === 'unknown_item', '3. скрытый товар принят: ' + JSON.stringify(r));
  r = await gas(base([{ n: 'Без цены', qty: 1 }]));
  ok(!r.ok && r.code === 'unknown_item', '3. товар без цены принят: ' + JSON.stringify(r));
  ok((await rows()).length === n0, '3. отказной заказ попал в таблицу');

  /* 4. Неверные количества */
  for (const q of [-1, 0, 'abc', 1e9, null, '5000.5']) {
    r = await gas(base([{ n: 'Морковь', qty: q, mode: 'kg' }]));
    ok(!r.ok && r.code === 'bad_qty', '4. количество ' + JSON.stringify(q) + ' принято: ' + JSON.stringify(r));
  }
  /* мешок у товара без мешка; не целое число мешков */
  r = await gas(base([{ n: 'Морковь', qty: 25, mode: 'pack' }]));
  ok(!r.ok, '4. мешок у моркови принят');
  r = await gas(base([{ n: 'Картофель', qty: 30, mode: 'pack' }]));
  ok(!r.ok && r.code === 'bad_qty', '4. 1,2 мешка картофеля принято: ' + JSON.stringify(r));
  r = await gas(base([{ n: 'Картофель', qty: 50, mode: 'pack' }]));
  ok(r.ok && r.goods === 3197.5, '4. 2 мешка картофеля посчитаны неверно: ' + JSON.stringify(r));

  /* 5. Порог опта: 10 + 10 кг одной строкой = 20 кг → оптовая цена 63,95 */
  r = await gas(base([{ n: 'Картофель', qty: 10, mode: 'kg' }, { n: 'Картофель', qty: 10, mode: 'kg' }]));
  ok(r.ok && r.goods === 1279, '5. повтор строки/порог опта: ' + JSON.stringify(r));
  r = await gas(base([{ n: 'Картофель', qty: 19, mode: 'kg' }]));
  ok(r.ok && r.goods === 1336.65, '5. ниже порога — поштучная цена 70,35: ' + JSON.stringify(r));

  /* 6. Копейки: 0,33 кг × 64 ₽ = 21,12 ₽ (без ошибок дробей) */
  r = await gas(base([{ n: 'Морковь', qty: 0.33, mode: 'kg' }]));
  ok(r.ok && r.goods === 21.12, '6. копейки: ' + JSON.stringify(r));

  /* 7. Неверная зона / тип заказа */
  r = await gas(base([{ n: 'Морковь', qty: 1 }], { zone: 'spb' })); ok(!r.ok, '7. зона spb принята');
  r = await gas(base([{ n: 'Морковь', qty: 1 }], { who: 'free' })); ok(!r.ok, '7. тип free принят');

  /* 8. Сумма у покупателя не совпала (цены изменились) — заказ не создаётся, приходит новая сумма */
  n0 = (await rows()).length;
  r = await gas(base([{ n: 'Морковь', qty: 3 }], { total: 500 }));
  ok(!r.ok && r.code === 'prices_changed' && r.total === 882, '8. расхождение суммы: ' + JSON.stringify(r));
  ok((await rows()).length === n0, '8. заказ с устаревшей суммой попал в таблицу');

  /* 9. Повтор того же заказа (двойной клик, повтор запроса, параллельно) — один номер, одна строка */
  n0 = (await rows()).length;
  const o9 = base([{ n: 'Морковь', qty: 2 }], { key: 'test-key-12345' });
  const [a, b, c] = await Promise.all([gas(o9), gas(o9), gas(o9)]);
  const d = await gas(o9);
  ok(a.ok && a.no === b.no && b.no === c.no && c.no === d.no, '9. повтор дал разные номера: ' + [a.no, b.no, c.no, d.no]);
  ok((await rows()).length === n0 + 1, '9. повтор создал лишние строки');

  /* 10. Формулы в таблице: «=HYPERLINK…» в имени и комментарии сохраняются как текст */
  r = await gas(base([{ n: 'Морковь', qty: 1 }], { name: '=HYPERLINK("http://evil")', comment: '+1+1', key: 'formula-key-1' }));
  last = (await rows()).pop();
  ok(r.ok && last[4].startsWith("'=") && last[8].startsWith("'+"), '10. формула не обезврежена: ' + JSON.stringify(last && [last[4], last[8]]));
  ok(last[5].startsWith("'+7"), '10. телефон не защищён от формулы');

  /* 11. Заказ со счётом: ИНН, email, минимальная сумма */
  const co = { name: 'ООО Тест', inn: '7701234567', email: 'buh@test.ru', daddr: 'Москва' };
  r = await gas(base([{ n: 'Морковь', qty: 1 }], { who: 'nds', company: co })); ok(!r.ok && r.code === 'min_sum', '11. счёт меньше 5000 ₽ принят');
  r = await gas(base([{ n: 'Кешью', qty: 5 }], { who: 'nds', company: Object.assign({}, co, { inn: '123' }) })); ok(!r.ok, '11. неверный ИНН принят');
  r = await gas(base([{ n: 'Кешью', qty: 5 }], { who: 'nds', company: co, total: 7304 }));
  ok(r.ok && r.total === 7304 && r.vat === 664, '11. заказ со счётом: ' + JSON.stringify(r));

  /* 12. Сайт (server.js): лишние поля не доходят до таблицы, неверный запрос, адрес из X-Forwarded-For не обходит лимит */
  const site = (body, h) => fetch(SITE + '/api/order', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body }).then(async x => ({ s: x.status, j: await x.json().catch(() => ({})) }));
  let s = await site(JSON.stringify({ order: base([{ n: 'Кешью', qty: 1, price: 1 }], { goods: 1, vat: 0, fee: 0, key: 'site-key-0001' }) }));
  ok(s.s === 200 && s.j.ok && s.j.goods === 1190, '12. сайт: цена из браузера дошла: ' + JSON.stringify(s));
  last = (await rows()).pop();
  ok(!/"price":1[,}]/.test(last[20]) && last[18] === '', '12. сайт: в таблицу попало «итого» из браузера или чужая цена');
  s = await site('не json'); ok(s.s === 400, '12. сайт: неверный JSON → ' + s.s);
  s = await fetch(SITE + '/api/order', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }); ok(s.status === 415, '12. сайт: не JSON-тип → ' + s.status);
  let limited = false;
  for (let i = 0; i < 14; i++) { const x = await site(JSON.stringify({ order: { items: [] } }), { 'x-forwarded-for': '10.0.0.' + i }); if (x.s === 429) limited = true; }
  ok(limited, '12. подменой X-Forwarded-For можно обойти лимит заказов');

  procs.forEach(p => p.kill());
  console.log('ошибок:', fail.length, fail);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1); });
