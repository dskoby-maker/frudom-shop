/* Проверка магазина: каталог из «Витрины», заказ без НДС, заказ со счётом, ПК и телефон.
   Сначала node test/server.js, потом node test/check.js. Должно быть «ошибок: 0». */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch(),errs=[],fail=[];
 for(const [w,h,name] of [[1280,900,'ПК'],[390,844,'телефон']]){
  const p=await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push(name+': '+e.message));
  await p.route('**/fonts.googleapis.com/**',r=>r.abort());
  await p.goto('http://localhost:8790/tilda');
  await p.waitForSelector('.p[data-id="1"]',{timeout:15000});
  const names=await p.$$eval('.p .pn',x=>x.map(e=>e.textContent));
  if(names.includes('Скрытый товар')||names.includes('Без цены'))fail.push(name+': показан скрытый товар или товар без цены');
  await p.click('.p[data-id="1"] .add');await p.click('.p[data-id="2"] .add');await p.waitForTimeout(400);
  await p.evaluate(()=>scrollTo(0,1500));await p.waitForTimeout(300);
  if(await p.$eval('#hd',e=>Math.round(e.getBoundingClientRect().top))!==0)fail.push(name+': шапка не прилипает');
  await p.evaluate(()=>openCart());await p.waitForTimeout(600);
  await p.click('#pay');await p.waitForTimeout(500);
  await p.fill('#g_phone','+7 999 111-22-33');await p.fill('#g_addr','Москва, Тестовая 1');
  await p.click('#g_send');await p.waitForSelector('.center h3',{timeout:10000});
  console.log(name,'без НДС:',await p.textContent('.center h3'));
  await p.click('.center .bsec');await p.waitForTimeout(400);
  const kid=await p.$eval('.p:has(.pn:text-is("Кешью"))',e=>e.dataset.id);
  await p.click(`.p[data-id="${kid}"] .add`);await p.waitForTimeout(400);
  for(let i=0;i<4;i++){await p.click(`.p[data-id="${kid}"] .qty button:last-child`);await p.waitForTimeout(150)}
  await p.evaluate(()=>openCart());await p.waitForTimeout(500);
  await p.click('#who button[data-v="nds"]');await p.waitForTimeout(200);
  await p.click('#pay');await p.waitForSelector('#c_inn');
  await p.fill('#c_inn','7701234567');await p.fill('#c_name','ООО Тест');await p.fill('#c_email','buh@test.ru');await p.fill('#c_phone','+7 900 000-00-00');await p.fill('#c_daddr','Москва, Склад 5');
  await p.click('.mf .bprimary');await p.waitForSelector('.ord',{timeout:10000});
  console.log(name,'с НДС:',(await p.textContent('.ord')).replace(/\s+/g,' ').trim());
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw!==w)fail.push(name+': горизонтальная прокрутка '+sw);
 }
 const d=await (await fetch('http://localhost:8790/dump')).json(),rows=(d.sheets['Заказы с сайта']||[]).slice(1);
 rows.forEach(r=>{console.log('заказ',r[0],r[2],'сайт',r[18],'сервер',r[19]);if(r[18]!==r[19])fail.push('сумма сайта и сервера не совпала в заказе '+r[0])});
 if(rows.length!==4)fail.push('ожидалось 4 заказа, записано '+rows.length);
 if(d.mail.length!==4)fail.push('ожидалось 4 письма, отправлено '+d.mail.length);
 console.log('ошибок:',errs.length+fail.length,errs.concat(fail));await b.close();
})();
