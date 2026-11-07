/* Проверка нового дизайна тестовой страницы (index.html через embed.js, как на Тильде).
   Сначала node test/server.js, потом node test/design-check.js. В конце должно быть «ошибок: 0».
   Заказы в этой проверке НЕ отправляются (режим предпросмотра или перехват запроса). */
const {chromium}=require('playwright');
const URL='http://localhost:8790/tilda';
const fail=[],log=(...a)=>console.log(...a),ok=(c,m)=>{if(!c)fail.push(m)};
async function open(b,w,h,opt={}){
  const p=await b.newPage({viewport:{width:w,height:h||844},reducedMotion:opt.rm?'reduce':'no-preference'});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/fonts|logo\.png|ERR_FAILED|ERR_NAME|net::|status of 404|picsum/.test(m.text()))errs.push(m.text())});
  await p.route('**/fonts.googleapis.com/**',r=>r.abort());
  await p.route('**/frudom-shop/public/logo.png',r=>r.fulfill({path:'public/logo.png'}));
  await p.route('**/img/ok.png',r=>r.fulfill({path:'public/logo.png'}));
  await p.route('**/img/broken.png',r=>r.fulfill({status:404,body:''}));
  if(opt.api)await p.route('**/api?action=shopCatalog*',opt.api);
  if(opt.preview)await p.addInitScript(()=>{window.SHOP_PREVIEW=1});
  await p.goto(URL);
  p._errs=errs;return p;
}
const withImgs=async r=>{const res=await r.fetch();const j=await res.json();j.items[0].img='https://x.test/img/ok.png';if(j.items[1])j.items[1].img='https://x.test/img/broken.png';r.fulfill({response:res,json:j})};

(async()=>{
  const b=await chromium.launch();

  // 1. Ширины: нет прокрутки вбок, карточки 2 в ряд на телефоне, шапка в одну строку
  for(const w of [320,360,375,390,430,768,1024,1280,1440]){
    const p=await open(b,w,900);
    await p.waitForSelector('.p[data-id="1"]');await p.waitForTimeout(300);
    const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cols:getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length,hd:document.getElementById('hd').getBoundingClientRect().height,small:[...document.querySelectorAll('.add,.qty button,.cat,.ib,.cartbtn,.bn a,.bn button,.pm-seg button')].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<36)).length}));
    ok(r.sw===w,`${w}px: прокрутка вбок ${r.sw}`);
    if(w<=430)ok(r.cols===2,`${w}px: в ряд ${r.cols} карточки, нужно 2`);
    if(w>=1024)ok(r.cols>=4,`${w}px: в ряд только ${r.cols}`);
    ok(r.hd<=72,`${w}px: шапка в две строки (${Math.round(r.hd)} px)`);
    ok(r.small===0,`${w}px: ${r.small} кнопок ниже 36 px`);
    ok(!p._errs.length,`${w}px: ошибки на странице ${p._errs.join('; ')}`);
    log(w,'px:',JSON.stringify(r));
    await p.close();
  }

  // 2. Меню: открытие, Esc, клик мимо, выбор ссылки, фокус внутри
  {
    const p=await open(b,390);await p.waitForSelector('.p[data-id="1"]');
    const st=()=>p.evaluate(()=>({on:document.getElementById('menu').classList.contains('on'),lock:document.body.classList.contains('lock'),exp:document.getElementById('menuBtn').getAttribute('aria-expanded')}));
    await p.click('#menuBtn');await p.waitForTimeout(400);
    let s=await st();ok(s.on&&s.lock&&s.exp==='true','меню не открылось');
    ok(await p.evaluate(()=>document.getElementById('menu').contains(document.activeElement)),'фокус не в меню');
    for(let i=0;i<10;i++)await p.keyboard.press('Tab');
    ok(await p.evaluate(()=>document.getElementById('menu').contains(document.activeElement)),'Tab уводит фокус из меню');
    await p.keyboard.press('Escape');await p.waitForTimeout(400);s=await st();
    ok(!s.on&&!s.lock&&s.exp==='false','Esc не закрыл меню');
    ok(await p.evaluate(()=>document.activeElement.id)==='menuBtn','после закрытия фокус не вернулся на кнопку меню');
    await p.click('#menuBtn');await p.waitForTimeout(400);await p.mouse.click(20,400);await p.waitForTimeout(400);
    ok(!(await st()).on,'клик мимо не закрыл меню');
    await p.click('#menuBtn');await p.waitForTimeout(400);await p.click('#menu nav a[href="#terms"]');await p.waitForTimeout(900);
    ok(!(await st()).on,'выбор ссылки не закрыл меню');
    ok(await p.evaluate(()=>Math.abs(document.getElementById('terms').getBoundingClientRect().top)<200),'ссылка меню не перешла к разделу');
    ok(!p._errs.length,'меню: ошибки '+p._errs.join('; '));
    log('меню: ок');await p.close();
  }

  // 3. Поиск, очистка, пустой результат, фильтры, розница/опт не сбрасывают фильтр и корзину
  {
    const p=await open(b,390);await p.waitForSelector('.p[data-id="1"]');
    const n=()=>p.$$eval('#grid .p',x=>x.length);
    const all=await n();
    await p.fill('#q','кеш');await p.waitForTimeout(250);ok(await n()===1,'поиск «кеш» не нашёл 1 товар');
    await p.fill('#q','КАРТОФЕЛЬ');await p.waitForTimeout(250);ok(await n()===1,'поиск без учёта регистра не работает');
    await p.fill('#q','абвгд');await p.waitForTimeout(250);ok(await p.$('#grid .empty')!==null,'нет пустого состояния');
    await p.click('#grid .empty .btn');await p.waitForTimeout(200);ok(await n()===all,'«Показать весь каталог» не сбросил поиск');
    await p.fill('#q','морк');await p.waitForTimeout(250);await p.click('#qclr');await p.waitForTimeout(200);
    ok(await n()===all&&await p.inputValue('#q')==='','крестик не очистил поиск');
    await p.click('.cat[data-c="Овощи"]');await p.waitForTimeout(200);const veg=await n();ok(veg<all&&veg>0,'фильтр «Овощи» не работает');
    await p.click('.p[data-id="2"] .add');await p.waitForTimeout(350);
    await p.click('#pmSeg [data-v="opt"]');await p.waitForTimeout(250);
    ok(await n()===veg,'переключение «Опт» сбросило фильтр');
    ok(await p.$eval('#ccount',e=>e.textContent)==='1','переключение «Опт» сбросило корзину');
    ok(await p.$eval('.cat.on',e=>e.dataset.c)==='Овощи','активная категория сбросилась');
    // у картофеля в опте — оптовая цена и условие, в рознице — розничная
    const optPrice=await p.$eval('.p[data-id="1"] .pr b',e=>e.textContent);
    await p.click('#pmSeg [data-v="retail"]');await p.waitForTimeout(250);
    const retPrice=await p.$eval('.p[data-id="1"] .pr b',e=>e.textContent);
    ok(optPrice!==retPrice,`у картофеля цена одинаковая в опте и рознице (${optPrice})`);
    log('поиск/фильтры/опт: ок',optPrice,retPrice);
    ok(!p._errs.length,'поиск: ошибки '+p._errs.join('; '));await p.close();
  }

  // 4. Корзина: двойное касание, быстрые нажатия, удаление, итог = сумма строк
  {
    const p=await open(b,390,844,{preview:true});await p.waitForSelector('.p[data-id="1"]');
    const kid=await p.$eval('.p:has(.pn:text-is("Кешью"))',e=>e.dataset.id);
    await p.dblclick(`.p[data-id="${kid}"] .add`);await p.waitForTimeout(400);
    ok(await p.$eval(`.p[data-id="${kid}"] .qv`,e=>e.textContent.trim())==='1 кг','двойное касание добавило больше 1 кг');
    for(let i=0;i<6;i++)await p.click(`.p[data-id="${kid}"] .qty button:last-child`,{delay:0});
    await p.waitForTimeout(300);
    ok(await p.$eval(`.p[data-id="${kid}"] .qv`,e=>e.textContent.trim())==='7 кг','6 быстрых «+» дали не 7 кг');
    for(let i=0;i<7;i++)await p.click(`.p[data-id="${kid}"] .qty button:first-child`);
    await p.waitForTimeout(400);
    ok(!(await p.$eval(`.p[data-id="${kid}"]`,e=>e.classList.contains('inc'))),'после «−» до нуля товар остался в корзине');
    await p.click('.p[data-id="1"] .add');await p.click('.p[data-id="2"] .add');await p.waitForTimeout(400);
    await p.click('.bn button');await p.waitForTimeout(500);
    ok(await p.evaluate(()=>document.getElementById('drawer').classList.contains('on')),'корзина не открылась из нижнего меню');
    const t=await p.evaluate(()=>{const n=s=>+s.replace(/[^\d,]/g,'').replace(',','.');const rows=[...document.querySelectorAll('#items .ci .sm')].map(e=>n(e.firstChild.textContent));const r=[...document.querySelectorAll('#sum .row b')].map(e=>e.textContent);return {rows,goods:n(r[0]),fee:/Бесплатно/.test(r[1])?0:n(r[1]),tot:n(document.querySelector('#sum .tot b').textContent)}});
    ok(Math.abs(t.rows.reduce((a,x)=>a+x,0)-t.goods)<=1,'сумма строк ≠ «Товары» '+JSON.stringify(t));
    ok(Math.abs(t.goods+t.fee-t.tot)<=1,'«Итого» ≠ товары + доставка '+JSON.stringify(t));
    await p.click('#items .ci .rm');await p.waitForTimeout(300);
    ok(await p.$$eval('#items .ci',x=>x.length)===1,'«Удалить» не убрал строку');
    ok(await p.$eval('#ccount',e=>e.textContent)==='1','счётчик не обновился после удаления');
    // предпросмотр: заказ не уходит
    let sent=0;p.on('request',r=>{if(r.method()==='POST')sent++});
    await p.click('#pay');await p.waitForTimeout(400);
    await p.fill('#g_phone','+7 999 000-00-00');await p.fill('#g_addr','Тест');
    await p.click('#g_send');await p.click('#g_send').catch(()=>{});await p.waitForTimeout(600);
    ok(sent===0,'в режиме предпросмотра заказ отправился');
    ok(/предпросмотр/i.test(await p.$eval('#toast',e=>e.textContent)),'нет сообщения о предпросмотре');
    log('корзина: ок',JSON.stringify(t));
    ok(!p._errs.length,'корзина: ошибки '+p._errs.join('; '));await p.close();
  }

  // 5. Двойная отправка заказа: два быстрых нажатия = один запрос (запрос перехватываем, в таблицу не пишем)
  {
    const p=await open(b,1280,900);await p.waitForSelector('.p[data-id="1"]');
    let posts=0;await p.route('**/api',r=>{if(r.request().method()==='POST'){posts++;setTimeout(()=>r.fulfill({json:{ok:true,no:9999,total:100,fee:0,vat:0}}),600)}else r.continue()});
    await p.click('.p[data-id="2"] .add');await p.waitForTimeout(350);
    await p.evaluate(()=>openCart());await p.waitForTimeout(400);await p.click('#pay');await p.waitForTimeout(400);
    await p.fill('#g_phone','+7 999 000-00-00');await p.fill('#g_addr','Тест');
    await p.evaluate(()=>{const b=document.getElementById('g_send');b.click();b.click();b.click()});
    await p.waitForSelector('.center h3',{timeout:5000});
    ok(posts===1,`быстрые нажатия «Отправить» дали ${posts} запроса`);
    log('двойная отправка: запросов',posts);await p.close();
  }

  // 6. Медленная сеть, ошибка таблицы → запасной каталог, всё упало → понятная ошибка; фото и битые фото
  {
    const p=await open(b,390,844,{api:async r=>{await new Promise(x=>setTimeout(x,1500));await withImgs(r)}});
    await p.waitForTimeout(400);
    ok(await p.$$eval('#grid .sk',x=>x.length)>0,'нет заглушек во время загрузки');
    await p.waitForSelector('.p[data-id="1"]',{timeout:8000});await p.waitForTimeout(600);
    ok(await p.$('.p[data-id="1"] .ph img')!==null,'фото товара не показано');
    ok(await p.$('.p[data-id="2"] .ph img')===null&&await p.$('.p[data-id="2"] .ph svg')!==null,'битое фото не заменилось заглушкой');
    log('медленная сеть и фото: ок');await p.close();
    const p2=await open(b,390,844,{api:r=>r.fulfill({status:500,body:'err'})});
    await p2.waitForSelector('.p[data-id="1"]',{timeout:8000});log('ошибка таблицы → запасной каталог: ок');await p2.close();
    const p3=await open(b,390,844,{api:r=>r.fulfill({status:500,body:'err'})});
    await p3.route('**/catalog.json*',r=>r.fulfill({status:500,body:''}));
    await p3.reload();await p3.waitForTimeout(1500);
    ok(/Не удалось загрузить/.test(await p3.$eval('#grid',e=>e.textContent)),'нет сообщения, когда каталог не загрузился');
    await p3.close();
  }

  // 7. Клавиатура и «меньше движения»
  {
    const p=await open(b,1280,900,{rm:true});await p.waitForSelector('.p[data-id="1"]');
    const d=await p.evaluate(()=>getComputedStyle(document.querySelector('.drawer')).transitionDuration);
    ok(/^0s/.test(d),'«меньше движения» не отключает анимацию: '+d);
    await p.focus('.p[data-id="2"] .add');await p.keyboard.press('Enter');await p.waitForTimeout(200);
    ok(await p.$eval('#ccount',e=>e.textContent)==='1','Enter на «В корзину» не сработал');
    const fv=await p.evaluate(()=>{const b=document.querySelector('.cat');b.focus();return getComputedStyle(b).outlineStyle});
    log('клавиатура: ок, рамка фокуса',fv);
    ok(!p._errs.length,'клавиатура: ошибки '+p._errs.join('; '));await p.close();
  }

  await b.close();
  console.log('ошибок:',fail.length,fail);
  process.exit(fail.length?1:0);
})();
