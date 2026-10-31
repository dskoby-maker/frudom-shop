/* Тестовый сервер магазина: настоящий server/Code.gs в Node, листы — в памяти.
   Запуск: node test/server.js  → http://localhost:8790/ (магазин), /tilda (как на Тильде), /dump (листы) */
const http=require('http'),fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.join(__dirname,'..'),sheets={},props={};
function mkSheet(name){const data=[];return {name,data,
  getLastRow:()=>{let n=data.length;while(n>0&&(!data[n-1]||data[n-1].every(v=>v===''||v==null)))n--;return n},setFrozenRows(){},
  getRange(r,c,nr,nc){return {setValues(v){for(let i=0;i<nr;i++){data[r-1+i]=data[r-1+i]||[];for(let j=0;j<nc;j++)data[r-1+i][c-1+j]=String(v[i][j])}return this},
    getDisplayValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push(((data[r-1+i]||[])[c-1+j])??'');o.push(row)}return o}}}}}
const v=mkSheet('Витрина');sheets['Витрина']=v;
v.data.push(['Название','Категория','Показывать','Порядок','ID','','','','Опт','Поштучно','Упаковка','Вес','Опт от','Весовой','НДС','Фото'],
 ['Картофель','Овощи','да','1','x','','63,95','','63,95','70,35','мешок','25','20','да','10',''],
 ['Морковь','Овощи','да','2','x','','64','','64','70,4','','','','да','10',''],
 ['Скрытый товар','Овощи','нет','3','x','','10','','10','11','','','','да','10',''],
 ['Без цены','Овощи','да','4','x','','','','','','','','','да','10',''],
 ['Кешью','Орехи и семена','да','5','x','','1190','','1190','1309','','','','нет','10','']);
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=mkSheet(n)),getName:()=>'Магазин'};
const ctx={SpreadsheetApp:{getActive:()=>ss},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({t,setMimeType(){return this}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
  Session:{getScriptTimeZone:()=>'Europe/Moscow',getEffectiveUser:()=>({getEmail:()=>'owner@test'})},
  MailApp:{sent:[],sendEmail(to,subj,body){this.sent.push({to,subj})},getRemainingDailyQuota:()=>100},
  Utilities:{formatDate:(d,tz,f)=>{const m=new Date(d.getTime()+3*3600000),p=n=>String(n).padStart(2,'0');
    return f.replace('yyyy',m.getUTCFullYear()).replace('MM',p(m.getUTCMonth()+1)).replace('dd',p(m.getUTCDate())).replace('HH',p(m.getUTCHours())).replace('mm',p(m.getUTCMinutes()))}},
  JSON,String,Math,Object,parseInt,parseFloat,Date,isNaN,Array};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'server/Code.gs'),'utf8'),ctx);
const TYPES={'.js':'text/javascript','.json':'application/json','.html':'text/html; charset=utf-8'};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/dump'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({sheets:Object.fromEntries(Object.entries(sheets).map(([k,s])=>[k,s.data])),mail:ctx.MailApp.sent}));return}
  if(u.pathname==='/tilda'){res.writeHead(200,{'content-type':TYPES['.html']});res.end('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>.t-rec{overflow:hidden}</style></head><body class=t-body><div id=allrecords><div class=t-rec><div class=t123><div id=fs-shop></div><script>window.SHOP_API="http://localhost:8790/api";window.SHOP_BASE_TEST="http://localhost:8790/";</script><script src="/embed.js"></script></div></div></div></body></html>');return}
  if(u.pathname==='/api'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{const o=req.method==='POST'?ctx.doPost({postData:{contents:b}}):ctx.doGet({parameter:Object.fromEntries(u.searchParams)});res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(o.t)});return}
  const f=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname.slice(1));
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));
}).listen(8790,()=>console.log('up :8790'));
