/* Рисунки товаров (SVG). Общие для сервера и браузера: ART.forItem(товар), ART.forCat(категория), ART.hero.*(), fileItem — отдельный файл с градиентами. */
(function(root){
const ART=(()=>{
 const DEFS=`<defs>
 <radialGradient id="fsHi" cx=".34" cy=".28" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".45" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <radialGradient id="fsSh" cx=".42" cy=".36" r=".72"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></radialGradient>
 <linearGradient id="fsWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b57a43"/><stop offset=".55" stop-color="#93592b"/><stop offset="1" stop-color="#6b3d1b"/></linearGradient>
 <linearGradient id="fsWoodIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3317"/><stop offset="1" stop-color="#8a5529"/></linearGradient>
 <linearGradient id="fsCer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fb"/><stop offset="1" stop-color="#c9d7e2"/></linearGradient>
 <linearGradient id="fsLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fbf55"/><stop offset="1" stop-color="#2f6f2a"/></linearGradient>
 <filter id="fsBl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>`;
 const g3=(tag,a,c)=>`<${tag} ${a} fill="${c}"/><${tag} ${a} fill="url(#fsSh)"/><${tag} ${a} fill="url(#fsHi)"/>`;
 const T=(x,y,r,s,inner)=>`<g transform="translate(${x} ${y}) rotate(${r||0}) scale(${s||1})">${inner}</g>`;
 const shadow=(x,y,rx,ry,o)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#3a2a10" opacity="${o||.18}" filter="url(#fsBl)"/>`;
 const leaf=(x,y,r,s,c)=>T(x,y,r,s,`<path d="M0 0C8-10 26-12 38-2 26 8 8 8 0 0Z" fill="${c||"url(#fsLeaf)"}"/><path d="M2 0C14-2 26-2 36-2" stroke="#2c5e22" stroke-width="1.1" fill="none" opacity=".55"/>`);
 /* --- детали --- */
 const P={
  ball:(c)=>g3("circle",'r="26"',c),
  apricot:(c="#f2952c")=>g3("ellipse",'rx="27" ry="23"',c)+`<path d="M-4-20C-9-6-8 8-2 20" stroke="#b9561a" stroke-width="2" fill="none" opacity=".45"/><path d="M8-14c6 4 8 12 4 20" stroke="#ffd08a" stroke-width="2.4" fill="none" opacity=".5"/>`,
  raisin:(c="#4a2433")=>g3("ellipse",'rx="16" ry="12"',c)+`<path d="M-9-3c5 3 13 2 17-2M-8 4c6 2 12 1 16-2" stroke="#000" stroke-opacity=".28" stroke-width="1.4" fill="none"/>`,
  prune:(c="#2a1824")=>g3("ellipse",'rx="25" ry="20"',c)+`<path d="M-12-6c8 5 18 4 24-2" stroke="#000" stroke-opacity=".35" stroke-width="2" fill="none"/><ellipse cx="-6" cy="-9" rx="7" ry="3" fill="#fff" opacity=".35"/>`,
  date:(c="#6d2c14")=>g3("ellipse",'rx="31" ry="15"',c)+`<path d="M-22-2c10 4 30 4 42-1M-18 6c10 2 24 2 32-1" stroke="#000" stroke-opacity=".3" stroke-width="1.6" fill="none"/><ellipse cx="-6" cy="-7" rx="12" ry="3" fill="#fff" opacity=".3"/>`,
  fig:(c="#6b3b46")=>g3("path",'d="M0-28C6-20 24-8 24 8 24 22 12 28 0 28-12 28-24 22-24 8-24-8-6-20 0-28Z"',c)+`<path d="M0-28v-6" stroke="#6b5a2a" stroke-width="3" stroke-linecap="round"/>`,
  mango:(c="#f4a12b")=>g3("rect",'x="-30" y="-10" width="60" height="20" rx="9"',c)+`<path d="M-24 0h48" stroke="#c46b0c" stroke-width="1.6" opacity=".4"/>`,
  oslice:(c="#ef8a1f")=>`<circle r="24" fill="${c}"/><circle r="20" fill="#f9b84b"/>`+[0,45,90,135].map(a=>`<path d="M0 0L${(19*Math.cos(a*Math.PI/180)).toFixed(1)} ${(19*Math.sin(a*Math.PI/180)).toFixed(1)}M0 0L${(-19*Math.cos(a*Math.PI/180)).toFixed(1)} ${(-19*Math.sin(a*Math.PI/180)).toFixed(1)}" stroke="#fde3a8" stroke-width="2.2"/>`).join("")+`<circle r="24" fill="url(#fsHi)"/>`,
  rosehip:(c="#c4321e")=>g3("ellipse",'rx="13" ry="18"',c)+`<path d="M0 18l-4 6M0 18l4 6M0 18v7" stroke="#3a1a10" stroke-width="2"/>`,
  walnut:(c="#c08a4e")=>g3("path",'d="M-26 2C-28-16-12-26 0-24 14-26 28-16 26 2 24 20 10 26 0 24-12 26-26 20-26 2Z"',c)+`<path d="M0-22C-4-10 4-2 0 8S-2 20 0 24M-16-12c4 6 10 6 12 2M-18 8c6-2 10 2 12 8M16-12c-4 6-10 6-12 2M18 8c-6-2-10 2-12 8M-22-2c4 2 8 0 10-4M22-2c-4 2-8 0-10-4" stroke="#7e4f22" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>`,
  almond:(c="#b8763f")=>g3("path",'d="M0-30C18-18 20 14 0 28-20 14-18-18 0-30Z"',c)+`<path d="M-6-18c-2 10-2 26 2 38M6-16c2 10 2 22-2 32M0-24v46" stroke="#7a4518" stroke-width="1.3" fill="none" opacity=".5"/>`,
  cashew:(c="#ecd3a3")=>g3("path",'d="M-26-6C-22-28 12-30 24-14 32-2 26 14 14 20 10 8 2-2-10 0-18 2-22 8-26-6Z"',c),
  hazel:(c="#a2602d")=>g3("circle",'r="22"',c)+`<path d="M-18-10C-10-22 10-22 18-10 10-14-10-14-18-10Z" fill="#d9a873"/><circle cx="0" cy="18" r="3" fill="#6e3a14" opacity=".6"/>`,
  peanut:(c="#d8a86c")=>g3("path",'d="M-24-4C-26-14-14-18-6-12-2-10 2-10 6-12 14-18 26-14 24-4 22 6 10 10 4 6 0 4 0 4-4 6-10 10-22 6-24-4Z"',c),
  seed:(c="#7d8f6a")=>g3("ellipse",'rx="11" ry="6"',c),
  potato:(c="#c9a26b")=>g3("ellipse",'rx="31" ry="22"',c)+`<circle cx="-12" cy="-4" r="1.8" fill="#7a5a2c"/><circle cx="8" cy="6" r="1.6" fill="#7a5a2c"/><circle cx="16" cy="-8" r="1.5" fill="#7a5a2c"/>`,
  sweet:(c="#a9473a")=>g3("path",'d="M-34 2C-30-14 20-18 32-4 36 4 30 12 18 14-4 18-36 16-34 2Z"',c),
  carrot:(c="#f07a1a")=>`<path d="M-4-30C-14-44-20-44-22-40M2-30C2-46 6-50 10-50M6-28C14-40 22-40 24-36" stroke="#3f8a2e" stroke-width="4" fill="none" stroke-linecap="round"/>`+g3("path",'d="M-11-30C-4-33 4-33 11-30 12-24 10-16 6 0L1 34C0 37-1 37-2 34L-8 0C-12-16-13-24-11-30Z"',c)+`<path d="M-8-14h7M2-4h6M-5 8h5M1 18h4" stroke="#b44f08" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`,
  onion:(c="#c98a3c")=>g3("path",'d="M0-32C4-24 28-16 28 4 28 22 16 30 0 30-16 30-28 22-28 4-28-16-4-24 0-32Z"',c)+`<path d="M0-28C-10-14-12 14-2 30M0-28C10-14 12 14 2 30M0-30C-20-12-22 18-10 28M0-30C20-12 22 18 10 28" stroke="#000" stroke-opacity=".16" stroke-width="1.4" fill="none"/>`,
  garlic:(c="#f2ece0")=>g3("path",'d="M0-30C4-22 26-14 26 4 26 20 14 28 0 28-14 28-26 20-26 4-26-14-4-22 0-30Z"',c)+`<path d="M0-26C-10-10-10 14-4 28M0-26C10-10 10 14 4 28M-14-14C-22 0-18 18-12 26M14-14C22 0 18 18 12 26" stroke="#b9a98a" stroke-width="1.3" fill="none"/>`,
  beet:(c="#7b1d3a")=>`<path d="M-4-22C-6-30-10-34-14-36M2-22C2-30 3-34 4-38M6-20C10-28 14-30 18-31" stroke="#a3244a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`+leaf(-14,-36,-140,.55)+leaf(4,-38,-95,.5)+leaf(18,-31,-40,.5)+g3("circle",'r="24"',c)+`<path d="M0 24C2 32 0 38-3 42" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  cabbage:(c="#b8d888")=>g3("circle",'r="32"',c)+`<path d="M-28-6C-14-20 6-24 26-12M-30 8C-16-6 10-8 30 4M-22 20C-8 10 10 10 24 20M0-32C-6-10-6 12 0 32" stroke="#000" stroke-opacity=".12" stroke-width="1.6" fill="none"/>`,
  cucumber:(c="#3f7a2c")=>g3("rect",'x="-38" y="-11" width="76" height="22" rx="11"',c)+[-26,-14,-2,10,22].map((x,i)=>`<circle cx="${x}" cy="${i%2?-3:4}" r="1.4" fill="#cfe8a8" opacity=".8"/>`).join(""),
  zucchini:(c="#6f9a3c")=>g3("rect",'x="-40" y="-12" width="80" height="24" rx="12"',c)+`<path d="M-30-4h56M-28 4h50" stroke="#d6e9a6" stroke-width="1.2" opacity=".6"/><rect x="36" y="-5" width="10" height="10" rx="3" fill="#7a8f3a"/>`,
  eggplant:(c="#4a1f52")=>g3("path",'d="M-34 4C-34-10-22-14-8-12 6-10 14-18 26-14 36-10 38 6 26 14 10 24-34 22-34 4Z"',c)+`<path d="M22-16C28-24 36-24 40-20 34-18 32-12 30-8 26-10 22-12 22-16Z" fill="#4c7a2c"/>`,
  tomato:(c="#e2392b")=>g3("ellipse",'rx="26" ry="23"',c)+`<path d="M0-22l4-6 2 7 8-3-5 6 8 2-9 2 2 7-6-5-4 6-1-7-8 2 6-5-7-3 8-1z" fill="#3f8a2e"/>`,
  pepper:(c="#d92c25")=>g3("path",'d="M-26-12C-30 10-22 30-8 30-2 30 0 26 0 26S4 30 10 30C24 30 30 10 26-12 22-26-22-26-26-12Z"',c)+`<path d="M0-22C0-28 4-32 10-32" stroke="#3f7a2a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M-6-18C-14-6-14 14-8 26M6-18C14-6 14 14 8 26" stroke="#000" stroke-opacity=".14" stroke-width="2" fill="none"/>`,
  pumpkin:(c="#e88a2b")=>[-18,18,-8,8,0].map((x,i)=>g3("ellipse",`cx="${x}" rx="${i<2?16:15}" ry="24"`,c)).join("")+`<path d="M0-22C0-30 4-34 8-34" stroke="#5f6f2a" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  radish:(c="#d9304f")=>g3("circle",'r="17"',c)+`<path d="M0 16C0 26-2 32-6 36" stroke="#f3eaea" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-2-16C-6-28-10-32-14-34M2-16C4-28 8-32 12-34" stroke="#3f8a2e" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  daikon:(c="#f1ede4")=>g3("path",'d="M-10-34C-4-36 4-36 10-34 12-20 10 0 6 18L1 38C0 40-1 40-2 38L-6 18C-10 0-12-20-10-34Z"',c)+`<path d="M-4-34C-8-44-14-48-18-48M4-34C6-46 10-50 14-50" stroke="#5e9a3a" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  celroot:(c="#d6c69e")=>g3("path",'d="M-24-4C-26-18-12-26 0-24 14-26 28-16 24 0 26 16 12 26 0 24-14 26-28 14-24-4Z"',c)+`<path d="M-10 22l-4 8M6 22l3 8M-2 24v8" stroke="#a08a5a" stroke-width="2"/><path d="M-4-24C-6-34-4-40 0-42M4-24C8-32 12-36 16-36" stroke="#5e9a3a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  stalk:(c="#8cbf5a")=>[-12,-4,4,12].map((x,i)=>g3("rect",`x="${x-4}" y="-34" width="8" height="66" rx="4"`,i%2?c:"#a6cf72")).join("")+`<path d="M-12-34c-6-8-4-14 2-14M12-34c6-8 4-14-2-14M0-34c0-8 2-12 6-14" stroke="#4f8f2e" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  mushroom:(c="#efe6d6")=>`<rect x="-8" y="-4" width="16" height="26" rx="7" fill="#f5efe4"/><rect x="-8" y="-4" width="16" height="26" rx="7" fill="url(#fsSh)"/>`+g3("path",'d="M-28 2C-28-18-14-26 0-26 14-26 28-18 28 2Z"',c),
  apple:(c="#d63a2f")=>g3("path",'d="M0-18C10-26 28-22 28-2 28 16 16 28 6 26 2 25-2 25-6 26-16 28-28 16-28-2-28-22-10-26 0-18Z"',c)+`<path d="M0-18C0-26 2-30 6-32" stroke="#5a3a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`+leaf(4,-26,-30,.5),
  pear:(c="#c9cf4a")=>g3("path",'d="M0-30C8-30 10-18 12-10 22-2 26 8 24 16 20 28 8 30 0 30-8 30-20 28-24 16-26 8-22-2-12-10-10-18-8-30 0-30Z"',c)+`<path d="M0-30c0-6 2-9 5-11" stroke="#5a3a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  banana:(c="#f2cd3a")=>`<path d="M-36-8C-20 18 20 22 38-2" stroke="#e0b422" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M-36-8C-20 18 20 22 38-2" stroke="#f6dc5c" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M-36-8C-20 18 20 22 38-2" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(0 -3)"/><circle cx="-37" cy="-9" r="3.5" fill="#4a3a1a"/><circle cx="39" cy="-3" r="3" fill="#6a5a2a"/>`,
  citrus:(c="#f2891e")=>g3("circle",'r="25"',c)+[[-10,-8],[6,-12],[12,4],[-4,10],[-14,6],[2,-2],[14,-6]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1" fill="#000" opacity=".12"/>`).join(""),
  lemon:(c="#f4d33a")=>g3("path",'d="M-30 0C-26-16-12-22 0-22 12-22 26-16 30 0 26 16 12 22 0 22-12 22-26 16-30 0Z"',c)+`<circle cx="-31" cy="0" r="3" fill="#d9b51e"/><circle cx="31" cy="0" r="3" fill="#d9b51e"/>`,
  kiwi:(c="#8a6a3a")=>g3("ellipse",'rx="26" ry="22"',c)+`<g transform="translate(18 10)"><circle r="18" fill="#7a5a30"/><circle r="16" fill="#8fbf3a"/><circle r="6" fill="#f2f0c8"/>`+[...Array(10)].map((_,i)=>`<circle cx="${(9.5*Math.cos(i*.628)).toFixed(1)}" cy="${(9.5*Math.sin(i*.628)).toFixed(1)}" r="1.1" fill="#2a2a1a"/>`).join("")+`</g>`,
  avocado:(c="#3e5a24")=>g3("path",'d="M0-30C10-30 14-16 18-6 24 6 22 26 0 28-22 26-24 6-18-6-14-16-10-30 0-30Z"',c)+`<g transform="translate(22 8) rotate(12)"><path d="M0-24C8-24 11-12 14-4 19 6 17 22 0 23-17 22-19 6-14-4-11-12-8-24 0-24Z" fill="#2f4a1c"/><path d="M0-21C7-21 9-11 12-3 16 6 14 19 0 20-14 19-16 6-12-3-9-11-7-21 0-21Z" fill="#d7e48a"/><circle cy="5" r="8" fill="#8a5a2a"/><circle cx="-2" cy="3" r="3" fill="#fff" opacity=".3"/></g>`,
  pineapple:(c="#e3a63a")=>`<path d="M0-26C-4-40-12-46-16-48M0-26C0-42 2-50 4-54M0-26C6-40 14-44 18-46M0-28C-8-36-14-36-20-34M0-28C8-36 14-36 20-34" stroke="#4f8f2e" stroke-width="5" fill="none" stroke-linecap="round"/>`+g3("ellipse",'cy="6" rx="22" ry="30"',c)+`<path d="M-20-6l20 26 18-22M-18 14l18-26 18 24M-12 30 6 6M-14-16l26 30" stroke="#a8641a" stroke-width="1.6" fill="none" opacity=".6"/>`,
  grapes:(c="#9cbf47")=>[[-12,-14],[0,-16],[12,-14],[-18,-2],[-6,-4],[6,-4],[18,-2],[-12,8],[0,8],[12,8],[-6,19],[6,19],[0,29]].map(([x,y])=>g3("circle",`cx="${x}" cy="${y}" r="8"`,c)).join("")+`<path d="M0-24C0-30 4-34 8-36" stroke="#6a4a1a" stroke-width="3" fill="none" stroke-linecap="round"/>`+leaf(4,-30,-20,.45),
  pomegranate:(c="#b8263a")=>g3("circle",'r="25"',c)+`<path d="M-7-24l-3-8 6 3 4-6 4 6 6-3-3 8z" fill="#8e1a2a"/>`,
  feijoa:(c="#5e8a3a")=>g3("ellipse",'rx="18" ry="26"',c)+`<path d="M-4-26l4-5 4 5" stroke="#3a4a1a" stroke-width="2" fill="none"/>`,
  berry:(c="#3b4a8a")=>g3("circle",'r="11"',c)+`<path d="M-3-9l3-3 3 3" stroke="#000" stroke-opacity=".3" stroke-width="1.3" fill="none"/>`,
  cranb:(c="#c21f2c")=>g3("ellipse",'rx="10" ry="9"',c),
  raspb:(c="#c93a5b")=>[[-6,-6],[6,-6],[-9,4],[0,2],[9,4],[-4,12],[4,12]].map(([x,y])=>g3("circle",`cx="${x}" cy="${y}" r="6"`,c)).join(""),
  bkberry:(c="#2a1630")=>[[-6,-6],[6,-6],[-9,4],[0,2],[9,4],[-4,12],[4,12]].map(([x,y])=>g3("circle",`cx="${x}" cy="${y}" r="6"`,c)).join(""),
  strawb:(c="#e0302f")=>g3("path",'d="M0 26C-14 18-24 2-22-10-20-20-8-22 0-18 8-22 20-20 22-10 24 2 14 18 0 26Z"',c)+[[-10,-8],[0,-6],[10,-8],[-12,4],[-2,6],[8,4],[-4,16],[4,14]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.3" ry="2" fill="#ffe28a"/>`).join("")+`<path d="M0-18-8-26l6 2 2-8 2 8 6-2z" fill="#3f8a2e"/>`,
  sbuck:(c="#f29a1c")=>g3("ellipse",'rx="9" ry="11"',c),
  currant:(c="#d22a2a")=>g3("circle",'r="9"',c)+`<circle cx="0" cy="-8" r="1.3" fill="#3a1a10"/>`,
  cherry:(c="#7a1022")=>g3("circle",'r="14"',c)+`<path d="M-3-13c-4-3-4-6-4-6" stroke="#3a1a10" stroke-width="1.5" fill="none"/>`,
  herbs:(c="#4f9a3a")=>{let s=`<path d="M-4 40C-6 10-18-12-26-26M0 40C0 6-2-18 0-34M4 40C6 10 16-12 26-24" stroke="#5f8f2e" stroke-width="3" fill="none" stroke-linecap="round"/>`;
   [[-26,-26,-30],[-20,-14,-60],[-14,-2,-40],[0,-34,-90],[2,-20,-70],[-2,-6,-110],[26,-24,-150],[20,-12,-120],[14,0,-140],[-10,-30,-70],[12,-30,-110]].forEach(([x,y,r])=>{s+=T(x,y,r,.42,`<path d="M0 0C8-10 26-12 38-2 26 8 8 8 0 0Z" fill="${c}"/><path d="M0 0C8-10 26-12 38-2 26 8 8 8 0 0Z" fill="url(#fsHi)"/>`)});
   return s+`<rect x="-9" y="22" width="18" height="7" rx="2" fill="#c7a46a"/>`},
  dill:(c="#5a9a3a")=>{let s=`<path d="M-4 40C-6 10-16-12-22-28M0 40C0 6 0-18 0-36M4 40C6 10 14-12 22-28" stroke="#5f8f2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
   [[-22,-28],[0,-36],[22,-28],[-12,-10],[10,-12],[-2,-20]].forEach(([x,y])=>{for(let a=0;a<12;a++){const r=a*0.52,l=10+(a%3)*3;s+=`<path d="M${x} ${y}l${(l*Math.cos(r)).toFixed(1)} ${(l*Math.sin(r)).toFixed(1)}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`}});
   return s+`<rect x="-9" y="22" width="18" height="7" rx="2" fill="#c7a46a"/>`},
  scal:(c="#4f9a3a")=>[-10,-4,2,8].map((x,i)=>`<path d="M${x} 36C${x} 6 ${x+(i-1.5)*6}-20 ${x+(i-1.5)*10}-40" stroke="${i%2?c:"#6fb24a"}" stroke-width="6" fill="none" stroke-linecap="round"/>`).join("")+`<path d="M-12 30h22" stroke="#f3efe2" stroke-width="12" stroke-linecap="round"/>`,
  lettuce:(c="#7fbf4a")=>[0,60,120,180,240,300].map(a=>T(0,0,a,1,g3("ellipse",'cx="12" rx="20" ry="16"',c))).join("")+g3("circle",'r="16"',"#b8de7a")+`<path d="M-30 0H30M0-30V30" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>`,
  basil:(c="#3f8f34")=>[[-14,-10,-30],[12,-12,30],[-16,10,-10],[14,8,15],[0,-22,0],[0,0,5]].map(([x,y,r])=>T(x,y,r,1,g3("ellipse",'rx="12" ry="17"',c)+`<path d="M0-14V14" stroke="#1f5a1a" stroke-width="1" opacity=".5"/>`)).join(""),
 };
 /* --- раскладки --- */
 const mound=(fn,s,opt)=>{opt=opt||{};let out="";const rows=opt.rows||4,base=opt.base||5,w=opt.w||110,yb=opt.y||96,dy=opt.dy||13;
  const order=[];for(let r=0;r<rows;r++)order.push(r);
  order.reverse().forEach(r=>{const n=Math.max(1,base-r),y=yb-r*dy;for(let i=0;i<n;i++){const x=100+(n==1?0:(i/(n-1)-.5)*w*(n/base));const rot=((i*37+r*53)%60)-30;out+=T(x.toFixed(1),y,rot,s*(1-r*.03),fn(i,r))}});
  return out};
 const bowl=(inner,cer)=>`${shadow(100,138,74,9,.28)}<ellipse cx="100" cy="92" rx="72" ry="17" fill="${cer?"#9fb4c4":"url(#fsWoodIn)"}"/>${inner}<path d="M28 92C30 126 60 142 100 142S170 126 172 92C150 104 50 104 28 92Z" fill="${cer?"url(#fsCer)":"url(#fsWood)"}"/><path d="M28 92C50 104 150 104 172 92" stroke="${cer?"#fff":"#c99560"}" stroke-width="2" fill="none" opacity=".7"/><path d="M44 110C60 128 86 134 100 134" stroke="#fff" stroke-opacity=".18" stroke-width="5" fill="none" stroke-linecap="round"/>`;
 const fresh=(inner,y)=>shadow(100,y||128,70,9)+inner;
 const five=(fn,s)=>[[70,74,-14],[130,74,12],[100,62,0],[82,100,8],[120,100,-10]].map(([x,y,r],i)=>T(x,y,r,s||1,fn(i))).join("");
 const three=(fn,s)=>[[66,92,-18],[134,92,16],[100,82,0]].map(([x,y,r],i)=>T(x,y,r,s||1,fn(i))).join("");
 const frost=()=>[[60,70],[84,58],[118,62],[140,76],[100,74],[74,86],[128,88],[96,90]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.2" fill="#fff" opacity=".85"/>`).join("")+`<g stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9" transform="translate(150 40)"><path d="M0-10V10M-9-5 9 5M-9 5 9-5"/></g><g stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8" transform="translate(48 46) scale(.7)"><path d="M0-10V10M-9-5 9 5M-9 5 9-5"/></g>`;
 const R={
  /* сухофрукты и орехи — в деревянной миске */
  apricot:()=>bowl(mound(()=>P.apricot(),.62,{rows:4,base:5,w:118,y:94,dy:12})),
  raisin:c=>()=>bowl(mound(()=>P.raisin(c),.8,{rows:5,base:7,w:120,y:96,dy:8})),
  prune:()=>bowl(mound(()=>P.prune(),.62,{rows:4,base:5,w:118,y:94,dy:12})),
  date:()=>bowl(mound(()=>P.date(),.55,{rows:4,base:4,w:110,y:94,dy:11})),
  fig:()=>bowl(mound(()=>P.fig(),.6,{rows:3,base:4,w:110,y:94,dy:14})),
  mango:()=>bowl(mound(()=>P.mango(),.62,{rows:4,base:4,w:100,y:94,dy:10})),
  oslice:()=>bowl(mound(()=>P.oslice(),.62,{rows:3,base:5,w:118,y:94,dy:14})),
  mix:()=>bowl(mound((i,r)=>[P.apricot,P.prune,P.raisin,P.fig,P.date][(i+r)%5](),.52,{rows:4,base:6,w:120,y:96,dy:11})),
  rosehip:()=>bowl(mound(()=>P.rosehip(),.6,{rows:4,base:7,w:120,y:96,dy:10})),
  walnut:()=>bowl(mound(()=>P.walnut(),.58,{rows:4,base:5,w:118,y:94,dy:12})),
  almond:()=>bowl(mound(()=>P.almond(),.45,{rows:4,base:7,w:120,y:96,dy:10})),
  cashew:()=>bowl(mound(()=>P.cashew(),.5,{rows:4,base:6,w:120,y:96,dy:10})),
  hazel:()=>bowl(mound(()=>P.hazel(),.55,{rows:4,base:6,w:120,y:96,dy:11})),
  peanut:()=>bowl(mound(()=>P.peanut(),.45,{rows:4,base:6,w:120,y:96,dy:10})),
  seed:c=>()=>bowl(mound(()=>P.seed(c),.62,{rows:6,base:10,w:124,y:98,dy:6})),
  /* свежие */
  potato:()=>fresh(five(()=>P.potato())),
  sweet:()=>fresh(three(()=>P.sweet(),.9)),
  carrot:()=>fresh([[78,82,-26],[122,82,24],[100,74,0]].map(([x,y,r])=>T(x,y,r,1.05,P.carrot())).join("")),
  onion:c=>()=>fresh(five(()=>P.onion(c),.85)),
  garlic:()=>fresh(three(()=>P.garlic(),1.05)),
  beet:()=>fresh(three(()=>P.beet(),1)),
  cabbage:c=>()=>fresh(T(100,82,0,1.45,P.cabbage(c))),
  cucumber:()=>fresh([[100,64,-10],[96,84,6],[104,104,-4]].map(([x,y,r])=>T(x,y,r,1,P.cucumber())).join("")),
  zucchini:c=>()=>fresh([[100,70,-8],[100,98,6]].map(([x,y,r])=>T(x,y,r,1.05,P.zucchini(c))).join("")),
  eggplant:()=>fresh([[96,72,-12],[104,100,8]].map(([x,y,r])=>T(x,y,r,1.1,P.eggplant())).join("")),
  tomato:()=>fresh(five(()=>P.tomato(),.95)),
  cherry:()=>fresh(mound(()=>P.tomato(),.42,{rows:3,base:6,w:120,y:110,dy:14})),
  vine:()=>fresh(`<path d="M30 40C70 50 120 46 170 36" stroke="#4a7a2a" stroke-width="3.5" fill="none"/>`+[[44,64],[66,76],[92,72],[118,80],[144,68],[80,98],[110,104],[136,96]].map(([x,y])=>`<path d="M${x} ${y-10}L${x} 44" stroke="#4a7a2a" stroke-width="2"/>`+T(x,y,0,.5,P.tomato())).join("")),
  pepper:c=>()=>fresh(three(()=>P.pepper(c),1.05)),
  pumpkin:()=>fresh(T(100,86,0,1.6,P.pumpkin())),
  radish:()=>fresh(five(()=>P.radish(),.95)),
  daikon:()=>fresh([[86,80,-30],[114,80,26]].map(([x,y,r])=>T(x,y,r,1,P.daikon())).join("")),
  celroot:()=>fresh(T(100,86,0,1.5,P.celroot())),
  stalk:()=>fresh(T(100,80,-10,1.3,P.stalk())),
  mushroom:()=>fresh(five(()=>P.mushroom(),.85)),
  herbs:c=>()=>fresh(T(100,78,-8,1.25,P.herbs(c)),124),
  dill:()=>fresh(T(100,80,-6,1.25,P.dill()),124),
  scal:()=>fresh(T(100,82,-20,1.3,P.scal()),124),
  lettuce:c=>()=>fresh(T(100,82,0,1.45,P.lettuce(c))),
  basil:()=>fresh(T(100,80,0,1.4,P.basil())),
  apple:c=>()=>fresh(three(()=>P.apple(c),1.1)),
  pear:()=>fresh(three(()=>P.pear(),1.05)),
  banana:()=>fresh([[100,70,-6],[100,86,2],[100,102,8]].map(([x,y,r])=>T(x,y,r,1.25,P.banana())).join("")),
  citrus:(c,s)=>()=>fresh(five(()=>P.citrus(c),s||1)),
  lemon:()=>fresh(three(()=>P.lemon(),1)),
  kiwi:()=>fresh(T(82,82,0,1.2,P.kiwi())+T(130,96,0,.9,g3("ellipse",'rx="26" ry="22"',"#8a6a3a"))),
  avocado:()=>fresh(T(86,80,-10,1.25,P.avocado())),
  pineapple:()=>fresh(T(100,88,6,1.5,P.pineapple())),
  grapes:c=>()=>fresh(T(100,80,-8,1.6,P.grapes(c))),
  pomegranate:()=>fresh(three(()=>P.pomegranate(),1.1)),
  feijoa:()=>fresh(five(()=>P.feijoa(),.9)),
  blueberry:()=>bowl(mound(()=>P.berry(),.85,{rows:5,base:8,w:122,y:96,dy:8}),1),
  strawb:()=>fresh(five(()=>P.strawb(),.95)),
  /* заморозка — в керамической миске с инеем */
  frz:(fn,c,s,o)=>()=>bowl(mound(()=>P[fn](c),s,o||{rows:5,base:8,w:122,y:96,dy:8}),1)+frost(),
 };
 const veg=()=>fresh(T(64,86,-10,.95,P.tomato())+T(100,64,0,1,P.carrot())+T(140,84,8,1,P.pepper("#f2b51e"))+T(104,104,-6,1,P.cucumber()));
 const fruit=()=>fresh(T(140,94,0,.9,P.banana())+T(70,86,0,1.05,P.apple("#d63a2f"))+T(116,74,0,1,P.citrus("#f2891e"))+T(96,104,0,.95,P.pear()));
 const CAT={"Овощи":veg,"Фрукты и ягоды":fruit,"Зелень":R.herbs("#4f9a3a"),"Сухофрукты":R.apricot,"Орехи и семена":R.walnut,"Заморозка":R.frz("raspb","#c93a5b",.95,{rows:4,base:6,w:120,y:96,dy:10})};
 const MAP=[
  [/картоф/,R.potato],[/батат/,R.sweet],[/морков/,R.carrot],[/лук красн/,R.onion("#8e2c4f")],[/лук зел/,R.scal],[/лук/,R.onion("#c98a3c")],[/чеснок/,R.garlic],[/свёкл|свекл/,R.beet],
  [/капуста красн/,R.cabbage("#7a3a7e")],[/капуста пекин/,R.lettuce("#d8eba0")],[/капуста савой/,R.cabbage("#8fbf5a")],[/капуст/,R.cabbage("#c2de94")],
  [/огур/,R.cucumber],[/цукини/,R.zucchini("#3f7a2c")],[/кабач/,R.zucchini("#a8c56a")],[/баклаж/,R.eggplant],[/черри на ветке/,R.vine],[/черри/,R.cherry],[/томат|помидор/,R.tomato],
  [/перец.*жёлт|перец.*желт/,R.pepper("#f2b51e")],[/перец/,R.pepper("#d92c25")],[/тыкв.*семеч|семеч.*тыкв/,R.seed("#6f8a4a")],[/тыкв/,R.pumpkin],[/редис/,R.radish],[/дайкон/,R.daikon],
  [/сельдерей кор/,R.celroot],[/сельдер/,R.stalk],[/шампин|гриб/,R.mushroom],
  [/укроп/,R.dill],[/петруш/,R.herbs("#3f8f34")],[/кинза/,R.herbs("#5aa83f")],[/базилик/,R.basil],[/розмарин|тимьян/,R.herbs("#5f7f4a")],[/шпинат/,R.basil],[/руккол/,R.herbs("#4a8a34")],[/салат/,R.lettuce("#8fca52")],
  [/яблок/,R.apple("#d63a2f")],[/груш/,R.pear],[/банан/,R.banana],[/апельсин суш/,R.oslice],[/апельсин/,R.citrus("#f2891e")],[/мандарин/,R.citrus("#f7941d",.85)],[/лимон/,R.lemon],[/грейпф/,R.citrus("#f0a66a",1.05)],
  [/киви/,R.kiwi],[/авокадо/,R.avocado],[/ананас/,R.pineapple],[/виноград/,R.grapes("#9cbf47")],[/гранат/,R.pomegranate],[/фейхоа/,R.feijoa],[/голубик/,R.blueberry],
  [/клубник.*замор/,R.frz("strawb","#e0302f",.55,{rows:3,base:5,w:118,y:94,dy:12})],[/клубник/,R.strawb],
  [/брусник/,R.frz("cranb","#b3233a",.85)],[/вишн/,R.frz("cherry","#7a1022",.65,{rows:4,base:6,w:120,y:96,dy:10})],[/ежевик/,R.frz("bkberry","#2a1630",.7,{rows:4,base:6,w:120,y:96,dy:10})],
  [/клюкв/,R.frz("cranb","#c21f2c",.85)],[/малин/,R.frz("raspb","#c93a5b",.7,{rows:4,base:6,w:120,y:96,dy:10})],[/облепих/,R.frz("sbuck","#f29a1c",.8)],
  [/смородина крас/,R.frz("currant","#d22a2a",.85)],[/смородин/,R.frz("currant","#231b30",.85)],[/черник/,R.frz("berry","#2b2f5a",.8)],
  [/изюм.*(золот|светл)/,R.raisin("#c9922e")],[/изюм/,R.raisin("#4a2433")],[/кураг/,R.apricot],[/чернослив/,R.prune],[/финик/,R.date],[/инжир/,R.fig],[/манго/,R.mango],[/компот/,R.mix],[/шиповник/,R.rosehip],
  [/грецк/,R.walnut],[/миндал/,R.almond],[/кешью/,R.cashew],[/фундук/,R.hazel],[/арахис/,R.peanut],[/подсолн/,R.seed("#4a4f4a")],[/семеч|семен/,R.seed("#6f8a4a")],
 ];
 let own=false;
 const svg=(b,vb)=>`<svg ${own?'xmlns="http://www.w3.org/2000/svg" ':''}class="art" viewBox="${vb||"0 0 200 150"}" aria-hidden="true">${own?DEFS:""}${b}</svg>`;
 const alone=(fn)=>{own=true;try{return fn()}finally{own=false}};
 const cache={};
 function forItem(p){const k=(own?'#':'')+p.n;if(cache[k])return cache[k];const n=p.n.toLowerCase();let f=null;for(const [re,fn] of MAP)if(re.test(n)){f=fn;break}
  if(!f)f=CAT[p.c]||R.apricot;return cache[k]=svg(f())}
 const forCat=c=>svg((CAT[c]||R.apricot)());
 const sub=(f,x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})">${f()}</g>`;
 const lv=(x,y,r,s)=>leaf(x,y,r,s);
 const hero={
  hero1:()=>svg(lv(250,40,-40,1.6)+lv(300,70,-10,1.3)+lv(150,30,-150,1.2)+sub(R.almond,175,8,1.05)+sub(R.walnut,250,92,1.05)+sub(R.apricot,40,70,1.35)+sub(R.cashew,200,170,.9),"0 0 460 320"),
  hero2:()=>svg(lv(110,40,-120,1.3)+lv(320,40,-30,1.4)+sub(()=>fresh(T(100,82,0,1.45,P.cabbage("#c2de94"))),210,30,1.1)+sub(()=>fresh(three(()=>P.tomato(),1)),70,110,1.2)+sub(R.carrot,240,140,1.05)+sub(R.pepper("#f2b51e"),150,170,.9),"0 0 460 320"),
  hero3:()=>svg(`<g transform="translate(250 30) rotate(8)"><rect width="150" height="190" rx="14" fill="#fff"/><rect x="18" y="22" width="80" height="12" rx="6" fill="#2a6c39"/><rect x="18" y="50" width="114" height="8" rx="4" fill="#e8e1d2"/><rect x="18" y="68" width="96" height="8" rx="4" fill="#e8e1d2"/><rect x="18" y="86" width="108" height="8" rx="4" fill="#e8e1d2"/><rect x="18" y="104" width="70" height="8" rx="4" fill="#e8e1d2"/><rect x="18" y="140" width="56" height="26" rx="8" fill="#e9f2e4"/><text x="27" y="158" font-family="Onest,sans-serif" font-weight="800" font-size="13" fill="#1f5a2e">УПД</text><circle cx="118" cy="153" r="16" fill="#e5872b"/><path d="m110 153 6 6 10-11" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`+lv(80,40,-140,1.3)+sub(R.date,30,110,1.2)+sub(R.fig,190,170,.95),"0 0 460 320"),
 };
 return {forItem,forCat,hero,DEFS,fileItem:p=>alone(()=>forItem(p)),fileCat:c=>alone(()=>forCat(c)),fileHero:k=>alone(()=>hero[k]())};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ART;else root.ART=ART;
})(typeof window!=='undefined'?window:this);
