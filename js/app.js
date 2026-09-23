const $ = (s) => document.querySelector(s);
const grid = $("#grid"), chipsEl = $("#chips"), ingInput = $("#ingInput");
const norm = (s) => (s||"").toLowerCase().trim();
const unorm = (s) => norm(s).replace(/ё/g,"е").replace(/[ъь]/g,"").replace(/\s+/g," ");
function stem(w){
  w=unorm(w);
  const suf=["ою","ею","ами","ями","ів","ев","ах","ях","у","ю","а","я","о","е","і","и"];
  for(const s of suf){ if(w.endsWith(s)&&w.length-s.length>=3){ return w.slice(0,-s.length); } }
  return w;
}
function fuzzyHay(hay, q){
  const H=unorm(hay);
  return unorm(q).split(" ").filter(Boolean).every(w=>H.includes(w));
}
const STAPLES = ["сіль","вода","олія","оливкова олія","чорний перець"];function staplesOn(){ const el=$("#staples"); return !el||el.checked; }
function isStaple(name){ return staplesOn()&&STAPLES.some(s=>ingMatch(name,s)); }
// synonym groups: different names, same product
const SYNONYMS = [
  ["курка","куряче філе","куряча грудка","стегно"],
  ["макарони","спагеті","локшина"],
  ["сир","сир твердий","кисломолочний сир","пармезан","фета","бринза","крем-сир","плавлений сир","моцарела"],
  ["гриби","печериці","гриби сушені","білі гриби"],
  ["ковбаса","ковбаса варена","копченості"],
  ["огірок","огірки","огірки мариновані"],
  ["помідор","помідори","помідори чері"],
  ["яйце","яйця"],
  ["цибуля","цибуля червона"],
  ["зелень","кріп","петрушка","зелена цибуля","рукола"],
  ["олія","оливкова олія"],
  ["рис","рис варений"],
  ["квасоля","нут"],
];
function canon(s){
  s=unorm(s);
  for(const g of SYNONYMS){
    if(g.some(v=>s===v||s.includes(v))) return g[0];
  }
  return s;
}
function bagEq(a, b){
  const wa=unorm(a).split(" ").filter(Boolean).sort().join(" ");
  const wb=unorm(b).split(" ").filter(Boolean).sort().join(" ");
  return wa&&wa===wb;
}
function ingMatch(a, b){
  a=norm(a); b=norm(b);
  if(a.includes(b)||b.includes(a)) return true;
  if(bagEq(a,b)) return true;
  const ca=canon(a), cb=canon(b);
  if(ca===cb) return true;
  if(ca.includes(cb)||cb.includes(ca)) return true;
  const sa=stem(ca), sb=stem(cb);
  return sa.length>2&&sb.length>2&&(sa.includes(sb)||sb.includes(sa));
}
// responsive image helper (Unsplash w= param)
function imgSet(url){
  if(!/images\.unsplash\.com/.test(url||"")) return null;
  return { srcset:`${url.replace("w=900","w=400")} 400w, ${url} 800w`, sizes:"(max-width:600px) 90vw, 320px" };
}
function imgAttr(url){
  const s=imgSet(url);
  return s?`srcset="${s.srcset}" sizes="${s.sizes}"`:"";
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function safeParse(key, fb){
  try { const v = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb)); return Array.isArray(v) ? v : fb; }
  catch { return fb; }
}
function debounce(fn, ms){
  let t=null;
  return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); };
}

const selected = new Set(safeParse("hol_ings", []));
const favs = new Set(safeParse("hol_favs", []));
const excluded = new Set(safeParse("hol_excl", []));
const hidden = new Set(safeParse("hol_hidden", []));
function saveHidden(){ try{localStorage.setItem("hol_hidden",JSON.stringify([...hidden]))}catch{} }
let shopList = safeParse("hol_shop", []).map(e=>typeof e==="string"?{n:e,a:""}:e);
const bought = new Set(safeParse("hol_bought", []));
function saveBought(){ try{localStorage.setItem("hol_bought",JSON.stringify([...bought]))}catch{} }
function saveShop(){ try{localStorage.setItem("hol_shop",JSON.stringify(shopList))}catch{} }
function shopGroups(){
  const groups=[], seen={};
  shopList.forEach(e=>{
    const g=e.from||"Інше";
    if(!(g in seen)){ seen[g]=groups.length; groups.push({from:g,items:[]}); }
    groups[seen[g]].items.push(e);
  });
  return groups;
}
function shopText(){
  return shopGroups().map(g=>`${g.from}:\n${g.items.map(e=>`- ${e.a?`${e.n} — ${e.a}`:e.n}`).join("\n")}`).join("\n\n");
}
function scaleAmount(a, portions){
  const m=String(a||"").match(/([\d.]+)\s*(.*)/);
  if(!m) return a||"";
  const num=Math.round(parseFloat(m[1])*(portions/2)*10)/10;
  return `${num} ${m[2]}`.trim();
}
let currentRecipe = null, portions = 2, timerSec = 600, timerId = null, timerLeft = 600, doneSteps = new Set(), cookIdx = 0;
let lastItems = [];
let onlyMine = false, onlySeason = false, onlyCooked = false;
// seasons: spring (Mar–May), summer (Jun–Aug), autumn (Sep–Nov), winter (Dec–Feb)
const SEASON_IDS = ["pumpkin-soup","pumpkin-porridge","mushroom-soup","mushroom-yushka","apple-pie","medovyk","uzvar","cottage-casserole","kysil","banosh"];
const WINTER_IDS = ["uzvar","kutia","holodets","medovyk","cheesecake-no-bake","syrnyky","roast-chicken","solyanka"];
const SPRING_IDS = ["green-borsch","okroshka","peking-salad","avocado-toast","berry-smoothie","beet-salad","buckwheat-bowl","tuna-bowl"];
const SUMMER_IDS = ["shashlyk","lyulya","gazpacho","beet-soup-cold","grill-veg","watermelon-feta","mint-lemonade","homemade-icecream","okroshka","cucumber-lemonade","berry-lemonade"];
function seasonEmoji(r){
  const m=new Date().getMonth();
  if((m===8||m===9||m===10)&&SEASON_IDS.includes(r.id)) return "🍂 сезон";
  if((m===11||m===0||m===1)&&WINTER_IDS.includes(r.id)) return "❄️ сезон";
  if((m===2||m===3||m===4)&&SPRING_IDS.includes(r.id)) return "🌷 сезон";
  if((m===5||m===6||m===7)&&SUMMER_IDS.includes(r.id)) return "☀️ сезон";
  return "";
}
function isSeason(r){ return !!seasonEmoji(r); }

// theme
function applyTheme(t){
  document.documentElement.dataset.theme=t;
  try{localStorage.setItem("hol_theme",t)}catch{}
  $("#themeToggle").textContent=t==="light"?"◑":"◐";
  const m=document.querySelector('meta[name="theme-color"]');
  if(m) m.setAttribute("content",t==="light"?"#faf4e8":"#0f0d0b");
}
applyTheme(document.documentElement.dataset.theme||"dark");
$("#themeToggle").onclick=()=>applyTheme(document.documentElement.dataset.theme==="light"?"dark":"light");

// custom user recipes
function getCustom(){ try{const v=JSON.parse(localStorage.getItem("hol_custom")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function saveCustom(c){ try{localStorage.setItem("hol_custom",JSON.stringify(c))}catch{} }
function allRecipes(){ return [...window.RECIPES, ...getCustom()]; }
function findRecipe(id){ return allRecipes().find(x=>x.id===id); }
function isOwn(r){ return r&&String(r.id).startsWith("u-"); }
// marquee + counts
function refreshCounts(){
  const n=allRecipes().length, own=getCustom().length;
  $("#heroBadge").textContent=`✦ ${n} рецептів (${own} моїх) • українською • без реєстрації`;
  $("#marquee").innerHTML = Array(2).fill("БОРЩ ✦ СИРНИКИ ✦ ДЕРУНИ ✦ ВАРЕНИКИ ✦ ШАКШУКА ✦ ПАСТА ✦ ПЛОВ ✦ ШАРЛОТКА ✦ ЦЕЗАР ✦ РАМЕН ✦ МЕДОВИК ✦ БАНОШ ✦ СМУЗІ ✦ ").join("");
}
refreshCounts();

// popular shelf: emoji tiles with recipe counts
const ING_EMOJI = {
"курка":"🍗","куряче філе":"🍗","фарш":"🧆","свинина":"🥩","яловичина":"🥩","баранина":"🥩",
"ковбаса":"🌭","копченості":"🥓","сало":"🥓","печінка куряча":"🍖","оселедець":"🐟","тунець":"🐟",
"риба":"🐟","креветки":"🍤","яйця":"🥚","молоко":"🥛","кефір":"🥛","сметана":"🍶","сир":"🧀",
"вершкове масло":"🧈","йогурт":"🍦","фета":"🧀","бринза":"🧀","крем-сир":"🧀","плавлений сир":"🧀",
"картопля":"🥔","цибуля":"🧅","морква":"🥕","помідори":"🍅","огірок":"🥒","капуста":"🥬",
"буряк":"🟣","перець болгарський":"🫑","часник":"🧄","печериці":"🍄","гриби":"🍄","гарбуз":"🎃",
"кабачки":"🥒","баклажани":"🍆","кукурудза":"🌽","зелень":"🌿","кріп":"🌿","борошно":"🌾",
"рис":"🍚","гречка":"🥣","макарони":"🍝","локшина":"🍜","манка":"🥣","вівсянка":"🥣",
"пшоно":"🌾","перловка":"🌾","горох":"🫛","квасоля":"🫘","сочевиця":"🟠","нут":"🟡",
"яблука":"🍎","банан":"🍌","лимон":"🍋","авокадо":"🥑","ягоди":"🫐","вишня":"🍒",
"мед":"🍯","цукор":"🍬","ваніль":"🌸","кориця":"🪵","томатна паста":"🥫","майонез":"🫙",
"соєвий соус":"🫗","олія":"🫒","гірчиця":"🟡"
};
let popCounts=null;
function getPopCounts(){
  if(popCounts) return popCounts;
  popCounts={};
  const recipes=allRecipes();
  const names=[...new Set(recipes.flatMap(r=>r.ings.map(i=>i.n)))];
  const perName={};
  names.forEach(n=>{ perName[n]=recipes.filter(r=>r.ings.some(i=>i.n===n)).length; });
  (window.POPULAR||[]).forEach(p=>{
    popCounts[p]=names.filter(n=>ingMatch(n,p)).reduce((a,n)=>a+perName[n],0);
  });
  return popCounts;
}
function renderPopular(){
  const groups=window.POPULAR_GROUPS||[{t:"",items:window.POPULAR}];
  const counts=getPopCounts();
  $("#popularRow").innerHTML=groups.map(g=>
    `<div class="pop-group"><b>${esc(g.t)}</b><div class="pop-shelf">${g.items.map(p=>{
      const on=selected.has(p);
      return `<button data-p="${esc(p)}" class="tile${on?" on":""}"><i>${ING_EMOJI[p]||"🧺"}</i><span>${esc(p)}</span><small>${counts[p]||0} рец.</small>${on?"<em>✓</em>":""}</button>`;
    }).join("")}</div></div>`
  ).join("");
}
$("#popularRow").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  addIng(b.dataset.p);
});

// chips
function renderChips(){
  chipsEl.innerHTML=[...selected].map(s=>`<span class="chip">${esc(s)}<button data-x="${esc(s)}" aria-label="Прибрати">✕</button></span>`).join("");
  try { localStorage.setItem("hol_ings",JSON.stringify([...selected])); } catch {}
  renderPopular();
}
chipsEl.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  selected.delete(b.dataset.x); renderChips(); render();
});
function addIng(v){
  v=norm(v); if(!v) return;
  v=v.replace(/^[+\-*\s]+/,"");
  if(selected.has(v)) return;
  selected.add(v); ingInput.value=""; renderChips(); render();
  toast(`Додано: ${v}`);
}
$("#addBtn").onclick=()=>addIng(ingInput.value);
ingInput.addEventListener("keydown",e=>{ if(e.key==="Enter") addIng(ingInput.value); });
ingInput.addEventListener("input",()=>{
  const v=norm(ingInput.value); const box=$("#suggest");
  if(v.length<2){box.innerHTML="";return;}
  box.innerHTML=suggestHTML(suggestFor(v,selected));
});
$("#suggest").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(b) addIng(b.dataset.v||b.textContent);
});

// suggestions with recipe counts
function suggestFor(v, skip){
  const all=[...new Set(allRecipes().flatMap(r=>r.ings.map(i=>i.n)))];
  return all
    .filter(a=>fuzzyHay(a,v)&&![...skip].some(x=>ingMatch(a,x)))
    .map(a=>({n:a,c:allRecipes().filter(r=>r.ings.some(i=>ingMatch(i.n,a))).length}))
    .sort((x,y)=>y.c-x.c).slice(0,6);
}
function suggestHTML(list){
  return list.map(x=>`<button data-v="${esc(x.n)}">${esc(x.n)} <small>(${x.c})</small></button>`).join("");
}
// excluded ("Не хочу")
const exclInput=$("#exclInput");
function renderExcl(){
  $("#exclChips").innerHTML=[...excluded].map(s=>`<span class="chip">${esc(s)}<button data-e="${esc(s)}">✕</button></span>`).join("");
  try{localStorage.setItem("hol_excl",JSON.stringify([...excluded]))}catch{}
}
$("#exclChips").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  excluded.delete(b.dataset.e); renderExcl(); render();
});
function addExcl(v){ v=norm(v); if(!v) return; excluded.add(v); exclInput.value=""; $("#exclSuggest").innerHTML=""; renderExcl(); render(); }
exclInput.addEventListener("keydown",e=>{ if(e.key==="Enter") addExcl(exclInput.value); });
exclInput.addEventListener("input",()=>{
  const v=norm(exclInput.value), box=$("#exclSuggest");
  if(v.length<2){box.innerHTML="";return;}
  box.innerHTML=suggestHTML(suggestFor(v,excluded));
});
$("#exclSuggest").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(b) addExcl(b.dataset.v||b.textContent);
});
function isExcluded(recipe){
  const hay=(recipe.title+" "+recipe.ings.map(i=>i.n).join(" ")).toLowerCase();
  return [...excluded].some(x=>hay.includes(x));
}

// voice input
$("#voiceBtn").onclick=()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ toast("Браузер не підтримує голос"); return; }
  const rec=new SR(); rec.lang="uk-UA"; rec.interimResults=false;
  const btn=$("#voiceBtn"); btn.classList.add("listening");
  rec.onresult=(ev)=>{
    const text=ev.results[0][0].transcript;
    text.split(/[,і+та]+/i).map(s=>norm(s)).filter(s=>s.length>1).forEach(addIng);
  };
  rec.onend=()=>btn.classList.remove("listening");
  rec.onerror=()=>{btn.classList.remove("listening");toast("Не почув, спробуй ще");};
  try{rec.start();toast("Слухаю… кажи продукти")}catch{}
};

// matching
function score(recipe){
  if(selected.size===0) return {pct:0,have:0,miss:recipe.ings.map(i=>i.n)};
  let have=[],miss=[];
  recipe.ings.forEach(ing=>{
    const ok=isStaple(ing.n)||[...selected].some(s=>ingMatch(ing.n,s));
    (ok?have:miss).push(ing.n);
  });
  const pct=Math.round(have.length/recipe.ings.length*100);
  return {pct,have,miss};
}
function badge(pct){
  if(selected.size===0) return `<span class="match low">☆ рецепт</span>`;
  if(pct>=70) return `<span class="match high">● ${pct}% — готуй!</span>`;
  if(pct>=40) return `<span class="match mid">◐ ${pct}% — майже</span>`;
  return `<span class="match low">○ ${pct}%</span>`;
}
const DIET_EMOJI={"вегетаріанське":"🥬","веганське":"🌱","без лактози":"🚫🥛"};
function dietBadges(r){
  return (r.diet||[]).map(d=>`<span class="diet-tag">${DIET_EMOJI[d]||"•"} ${esc(d)}</span>`).join("");
}

function render(){
  const q=norm($("#q").value), cat=$("#cat").value, diet=$("#diet").value,
        mt=$("#maxTime").value, mk=$("#maxKcal").value, lv=$("#level").value, sort=$("#sort").value, onlyFav=$("#onlyFav").checked;
  const onlyPoss=$("#onlyPossible").checked;
  let items=allRecipes().map(r=>({...r,_s:score(r)}));
  if(hidden.size) items=items.filter(r=>!hidden.has(r.id));
  if(onlyFav) items=items.filter(r=>favs.has(r.id));
  if(onlyPoss) items=items.filter(r=>r._s.pct===100);
  if(onlyMine) items=items.filter(r=>isOwn(r));
  if(onlyCooked) items=items.filter(r=>getCooked().includes(r.id));
  if(onlySeason) items=items.filter(r=>isSeason(r));
  if(excluded.size) items=items.filter(r=>!isExcluded(r));
  if(q) items=items.filter(r=>fuzzyHay(r.title+" "+r.desc+" "+r.ings.map(i=>i.n).join(" "),q));
  if(cat) items=items.filter(r=>r.cat===cat);
  if(diet) items=items.filter(r=>r.diet.includes(diet));
  if(mt) items=items.filter(r=>r.time<=+mt);
  if(mk) items=items.filter(r=>r.kcal<=+mk);
  if(lv) items=items.filter(r=>r.level===lv);
  items.sort((a,b)=>{
    if(sort==="time") return a.time-b.time;
    if(sort==="kcal") return a.kcal-b.kcal;
    if(sort==="rate"){
      const ra=rateAvg(a.id), rb=rateAvg(b.id);
      return (rb?rb.avg:-1)-(ra?ra.avg:-1)||b._s.pct-a._s.pct;
    }
    if(sort==="missing") return a._s.miss.length-b._s.miss.length||b._s.pct-a._s.pct;
    if(selected.size===0) return 0;
    return b._s.pct-a._s.pct;
  });
  $("#statMatch").textContent=items.length;
  $("#statReady").textContent=items.filter(r=>r._s.pct===100).length;
  try{$("#statCooked").textContent=getCooked().length;}catch{}
  updateCatCounts();
  const avg=items.length?Math.round(items.reduce((a,r)=>a+r.time,0)/items.length):0;
  const avgEl=$("#statAvg"); if(avgEl&&avg) avgEl.textContent=`~${fmtDur(avg)}`;
  $("#favCount").textContent=favs.size;
  $("#listCount").textContent=shopList.length;
  const exclTxt=excluded.size?` • без: ${[...excluded].join(", ")}`:"";
  $("#activeHint").textContent=(selected.size?`Продукти: ${[...selected].join(", ")}`:"Додай продукти — відсортуємо за збігом")+exclTxt;
  const uh=$("#unhideBtn");
  if(uh) uh.hidden=hidden.size===0, uh.textContent=`Показати приховані (${hidden.size})`;
  $("#empty").hidden=items.length>0;
  lastItems=items;
  grid.innerHTML=items.map(r=>`
    <article class="card" data-id="${r.id}" tabindex="0" aria-label="${esc(r.title)}, ${fmtDur(r.time)}, ${r.kcal} ккал${selected.size?`, збіг ${r._s.pct}%`:""}">
      <div class="card-img">
        <img loading="lazy" decoding="async" src="${r.img}" ${imgAttr(r.img)} alt="${esc(r.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${r.id}/800/600'">
        ${badge(r._s.pct)}
        <button class="fav ${favs.has(r.id)?'on':''}" data-fav="${r.id}" aria-label="В улюблене">${favs.has(r.id)?'♥':'♡'}</button>
      </div>
      <div class="card-body">
        <h3>${hl(r.title,q)}</h3><p>${r.desc}</p>
        ${rateMini(r.id)}
        <div class="meta"><span class="t">⏱ ${fmtDur(r.time)}</span><span>${r.kcal} ккал</span><span>${r.level}</span><span>${r.cat}</span>${dietBadges(r)}${isOwn(r)?'<span class="own-tag">✎ моє</span>':""}${seasonEmoji(r)?`<span class="diet-tag">${seasonEmoji(r)}</span>`:""}</div>
        ${selected.size?`<div class="miss">${r._s.miss.length?`Докупити: <b>${r._s.miss.slice(0,3).join(", ")}${r._s.miss.length>3?"…":""}</b>`:"✅ Все є! Можна готувати"}</div>`:`<div class="miss">Натисни щоб відкрити рецепт →</div>`}
        <button class="linkbtn hide-btn" data-hide="${r.id}">не показувати</button>
      </div>
    </article>`).join("");
  requestAnimationFrame(()=>{
    document.querySelectorAll(".card").forEach((c,i)=>setTimeout(()=>c.classList.add("vis"),i*40));
  });
  attachTilt();
}
// subtle 3D tilt (desktop pointers only)
let tiltOn = window.matchMedia && window.matchMedia("(pointer:fine)").matches;
function attachTilt(){
  if(!tiltOn) return;
  document.querySelectorAll(".card").forEach(card=>{
    if(card.dataset.tilt) return; card.dataset.tilt="1";
    card.addEventListener("mousemove",e=>{
      const r=card.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      card.style.transform=`translateY(-6px) rotateX(${(-y*6).toFixed(2)}deg) rotateY(${(x*8).toFixed(2)}deg)`;
    });
    card.addEventListener("mouseleave",()=>{card.style.transform="";});
  });
}
// quick filter chips
$("#quickRow").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  const k=b.dataset.qf, on=b.classList.toggle("on");
  if(k==="fast15") $("#maxTime").value=on?"15":"";
  if(k==="fast30") $("#maxTime").value=on?"30":"";
  if(k==="veg"){ $("#diet").value=on?"вегетаріанське":""; }
  if(k==="possible"){ $("#onlyPossible").checked=on; }
  if(k==="soup"){ $("#cat").value=on?"перші страви":""; }
  if(k==="sweet"){ $("#cat").value=on?"десерти":""; }
  if(k==="season"){ onlySeason=on; }
  if(k==="mine"){ onlyMine=on; }
  if(k==="cooked"){ onlyCooked=on; }
  persistFilters(); render();
});
grid.addEventListener("click",e=>{
  const h=e.target.closest("[data-hide]");
  if(h){e.stopPropagation();hidden.add(h.dataset.hide);saveHidden();render();toast("Приховано — повернути можна нижче фільтрів");return;}
  const f=e.target.closest("[data-fav]");
  if(f){e.stopPropagation();toggleFav(f.dataset.fav);return;}
  const c=e.target.closest(".card"); if(c) openModal(c.dataset.id);
});
grid.addEventListener("keydown",e=>{
  if(e.key==="Enter"){ const c=e.target.closest(".card"); if(c) openModal(c.dataset.id); return; }
  if(["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"].includes(e.key)){
    const cards=[...grid.querySelectorAll(".card")];
    const i=cards.indexOf(e.target.closest(".card"));
    if(i<0) return;
    e.preventDefault();
    const n=(e.key==="ArrowRight"||e.key==="ArrowDown")?i+1:i-1;
    if(cards[n]) cards[n].focus();
  }
});
function hl(text,q){
  const safe=esc(text);
  if(!q||q.length<2) return safe;
  try{
    const i=safe.toLowerCase().indexOf(esc(q).toLowerCase());
    if(i<0) return safe;
    return safe.slice(0,i)+"<mark>"+safe.slice(i,i+q.length)+"</mark>"+safe.slice(i+q.length);
  }catch{return safe;}
}
// category counts
function updateCatCounts(){
  const q=norm($("#q").value), diet=$("#diet").value, mt=$("#maxTime").value, mk=$("#maxKcal").value, lv=$("#level").value;
  const base=allRecipes().filter(r=>
    (!q||(r.title+" "+r.desc).toLowerCase().includes(q))&&
    (!diet||r.diet.includes(diet))&&(!mt||r.time<=+mt)&&(!mk||r.kcal<=+mk)&&(!lv||r.level===lv)&&!isExcluded(r));
  const cats=["","сніданки","перші страви","основні","паста","салати","десерти"];
  const sel=$("#cat").value;
  $("#cat").innerHTML=cats.map(c=>{
    const n=c?base.filter(r=>r.cat===c).length:base.length;
    const label=c||"Всі категорії";
    return `<option value="${c}" ${c===sel?"selected":""}>${label} (${n})</option>`;
  }).join("");
}
function toggleFav(id){
  favs.has(id)?favs.delete(id):favs.add(id);
  try { localStorage.setItem("hol_favs",JSON.stringify([...favs])); } catch {}
  render();
}
["q","cat","diet","maxTime","maxKcal","level","sort","onlyFav","onlyPossible","staples"].forEach(id=>{
  const h=()=>{persistFilters();render();};
  $("#"+id).addEventListener("input",id==="q"?debounce(h,180):h);
});
$("#unhideBtn").onclick=()=>{ hidden.clear(); saveHidden(); render(); };
$("#clearAll").onclick=()=>{selected.clear();excluded.clear();onlyMine=false;onlySeason=false;onlyCooked=false;$("#q").value="";$("#cat").value="";$("#diet").value="";$("#maxTime").value="";$("#maxKcal").value="";$("#level").value="";$("#sort").value="match";$("#onlyFav").checked=false;$("#onlyPossible").checked=false;$("#staples").checked=true;document.querySelectorAll("#quickRow button").forEach(b=>b.classList.remove("on"));renderChips();renderExcl();persistFilters();render();};
$("#emptyReset").onclick=()=>$("#clearAll").click();
$("#emptyFast").onclick=()=>{ $("#clearAll").click(); $("#maxTime").value="30"; $("#sort").value="time"; persistFilters(); render(); document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"}); };
$("#emptyTop").onclick=()=>{ $("#clearAll").click(); $("#sort").value="rate"; persistFilters(); render(); document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"}); };
$("#emptySample").onclick=()=>{
  ["картопля","яйця","цибуля","морква","молоко"].forEach(s=>selected.add(s));
  excluded.clear(); onlyMine=false; onlySeason=false; onlyCooked=false;
  $("#q").value="";$("#cat").value="";$("#diet").value="";$("#maxTime").value="";$("#maxKcal").value="";$("#level").value="";$("#sort").value="match";
  $("#onlyFav").checked=false;$("#onlyPossible").checked=false;
  document.querySelectorAll("#quickRow button").forEach(b=>b.classList.remove("on"));
  renderChips();renderExcl();persistFilters();render();
  toast("Холодильник наповнено для прикладу");
  document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"});
};
// dish of the day (deterministic by date)
function dishOfDay(){
  const all=allRecipes().filter(r=>!hidden.has(r.id)); if(!all.length) return null;
  const now=new Date();
  const day=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/864e5);
  return all[day%all.length];
}
function renderDishDay(){
  const r=dishOfDay(), box=$("#dishDay"); if(!r||!box) return;
  box.dataset.id=r.id;
  box.innerHTML=`<img loading="lazy" decoding="async" src="${r.img}" ${imgAttr(r.img)} alt="" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${r.id}/200/200'"><div><small>РЕЦЕПТ ДНЯ</small><b>${esc(r.title)}</b></div><span style="margin-left:auto">→</span>`;
}
$("#dishDay").addEventListener("click",e=>{ const id=e.currentTarget.dataset.id; if(id) openModal(id); });
$("#dishDay").addEventListener("keydown",e=>{ if(e.key==="Enter"){ const id=e.currentTarget.dataset.id; if(id) openModal(id); } });
$("#favToggle").onclick=()=>{const c=$("#onlyFav");c.checked=!c.checked;render();document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"});};

$("#cookbookBtn").onclick=()=>{
  if(!lastItems.length){ toast("Немає рецептів під фільтри"); return; }
  const txt=lastItems.map((r,i)=>
    `${i+1}. ${r.title}\n${fmtDur(r.time)} • ${r.kcal} ккал • ${r.level} • ${r.cat}\n${r.desc}\n\nІнгредієнти:\n${r.ings.map(x=>`- ${x.n}: ${x.a}`).join("\n")}\n\nКроки:\n${r.steps.map((s,j)=>`${j+1}. ${s}`).join("\n")}`
  ).join("\n\n---\n\n");
  download("knyga-receptiv.txt",`HOLODYLNYK — кулінарна книга (${lastItems.length} рецептів)\n\n${txt}\n`);
  toast(`Книга збережена: ${lastItems.length}`);
};

// random (respects current filters)
$("#randomBtn").onclick=()=>{
  const pool=lastItems.length?lastItems:allRecipes();
  const r=pool[Math.floor(Math.random()*pool.length)];
  openModal(r.id); toast(pool===lastItems?`Шеф обрав з ${pool.length} під фільтри`:"Шеф обрав за тебе");
};
function download(name, text){
  try{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
    a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }catch{ toast("Не вдалось зберегти файл"); }
}

// modal
function openModal(id){
  const r=findRecipe(id); if(!r) return;
  currentRecipe=r; portions=2; doneSteps=new Set();
  const s=score(r);
  $("#mImg").src=r.img;
  const ims=imgSet(r.img);
  if(ims){ $("#mImg").setAttribute("srcset",ims.srcset); $("#mImg").setAttribute("sizes","(max-width:700px) 100vw, 900px"); }
  else $("#mImg").removeAttribute("srcset");
  $("#mImg").onerror=function(){this.removeAttribute("srcset");this.src=`https://picsum.photos/seed/${r.id}/1000/600`};
  $("#mTitle").textContent=r.title;
  $("#mMeta").textContent=`⏱ ${fmtDur(r.time)} • ${r.kcal} ккал • ${r.level} • ${r.cat}`;
  $("#mMatch").textContent=selected.size?(s.pct>=70?`✅ ${s.pct}% — майже все є!`:`◐ Збіг ${s.pct}% — докупи: ${s.miss.slice(0,4).join(", ")||"нічого"}`):`☆ Відкрий рецепт і готуй`;
  $("#mSideInfo").innerHTML=`<b>💡 Порада шефа</b><br>${tipFor(r)}<br><br><b>Дієта:</b> ${r.diet.join(", ")||"звичайна"}<br><b>Категорія:</b> ${r.cat}`;
  renderModalIngs(); renderSteps(); renderAutoTimers(); renderRateRow(); renderSimilar();
  pushRecent(r.id); syncModalFav();
  $("#customDel").hidden=!isOwn(r);
  $("#customEdit").hidden=!isOwn(r);
  document.title=`${r.title} — HOLODYLNYK`;
  try{history.replaceState(null,"",`#r-${r.id}`)}catch{}
  lastFocus=document.activeElement;
  $("#overlay").hidden=false; document.body.style.overflow="hidden";
  stopTimer(); timerLeft=timerSec; $("#timerStart").textContent="Старт"; resetTimerUI();
  $("#modalX").focus({preventScroll:true});
}
function syncModalFav(){
  const b=$("#modalFav"); if(!b||!currentRecipe) return;
  b.textContent=favs.has(currentRecipe.id)?"♥ В улюбленому":"♡ В улюблене";
}
$("#modalFav").onclick=()=>{ if(!currentRecipe) return; toggleFav(currentRecipe.id); syncModalFav(); };
$("#printBtn").onclick=()=>window.print();
$("#cookBtn").onclick=()=>openCook();
function recipeText(r){
  const s=score(r);
  return `${r.title}\n${r.time} хв • ${r.kcal} ккал • ${r.level}\n\nІнгредієнти:\n${r.ings.map(i=>`- ${i.n}: ${i.a}`).join("\n")}\n\nКроки:\n${r.steps.map((x,i)=>`${i+1}. ${x}`).join("\n")}\n\nЗбіг: ${s.pct}%${s.miss.length?" • докупити: "+s.miss.join(", "):""}`;
}
$("#copyRecipeBtn").onclick=async ()=>{
  if(!currentRecipe) return;
  try{ await navigator.clipboard.writeText(recipeText(currentRecipe)); toast("Рецепт скопійовано"); }
  catch{ toast("Не вдалось скопіювати"); }
};
$("#shareBtn").onclick=async ()=>{
  if(!currentRecipe) return;
  const data={title:currentRecipe.title,text:currentRecipe.desc,url:location.href.split("#")[0]+`#r-${currentRecipe.id}`};
  if(navigator.share){ try{await navigator.share(data);}catch{} }
  else{ try{await navigator.clipboard.writeText(`${data.title}\n${data.url}`);toast("Посилання скопійовано");}catch{toast("Не вдалось поділитись");} }
};
function renderAutoTimers(){
  const box=$("#autoTimers"); if(!box||!currentRecipe) return;
  const mins=[...new Set(currentRecipe.steps.flatMap(s=>[...s.matchAll(/(\d+)\s*хв/g)].map(m=>+m[1])))].sort((a,b)=>a-b).slice(0,5);
  box.innerHTML=mins.length?mins.map(m=>`<button data-m="${m}">⏱ ${m} хв</button>`).join(""):`<span style="color:var(--mut);font-size:13px">У кроках немає хвилин — використай таймер вище.</span>`;
}
$("#autoTimers").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  timerSec=(+b.dataset.m)*60; timerLeft=timerSec; stopTimer();
  document.querySelectorAll(".timer-row button[data-t]").forEach(x=>x.classList.remove("on"));
  $("#timerStart").textContent="Старт"; resetTimerUI(); toast(`Таймер: ${b.dataset.m} хв`);
});
function tipFor(r){
  const tips={
    "borsch":"Не кип'яти сильно — борщ любить малий вогонь. Оцет або лимон збереже колір буряка.",
    "pasta-carbonara":"Головне — зняти з вогню перед яйцями, інакше буде омлет замість крему.",
    "syrnyky":"Мокрий сир — ворог. Відтисни його, і сирники не попливуть.",
    "steak-home":"Дай м'ясу відпочити 5 хв — соки розподіляться і буде соковито."
  };
  if(tips[r.id]) return tips[r.id];
  const catTips={
    "сніданки":"Сніданок любить гарячу сковороду і холодну голову: підготуй все до ввімкнення плити.",
    "перші страви":"Прозорий бульйон — малий вогонь і знята піна. Сіль додавай наприкінці.",
    "основні":"Не переповнюй сковороду: м'ясо має смажитись, а не тушкуватись у власному соку.",
    "паста":"Вода від пасти — рідке золото: ложка соусу стане кремом.",
    "салати":"Салат соли перед самою подачею, інакше овочі пустять воду.",
    "десерти":"Точність — ввічливість королів: випічка любить ваги, а не «на око»."
  };
  return catTips[r.cat]||"Куштуй в процесі і доводь сіль/кислоту в кінці — це 80% смаку.";
}
function renderModalIngs(){
  $("#portionVal").textContent=portions;
  $("#mIngs").innerHTML=currentRecipe.ings.map(ing=>{
    const have=isStaple(ing.n)||[...selected].some(s=>ingMatch(ing.n,s));
    return `<li class="${have?'have':'miss-ing'}" data-n="${esc(ing.n)}" title="${have?'Є у твоїх продуктах':'Тисни щоб додати в мої продукти'}"><span><span class="dot">${have?'●':'○'}</span> ${esc(ing.n)}</span><b>${esc(scaleAmount(ing.a,portions))}</b></li>`;
  }).join("");
}
$("#mIngs").addEventListener("click",e=>{
  const li=e.target.closest("li.miss-ing"); if(!li||!currentRecipe) return;
  addIng(li.dataset.n); renderModalIngs();
});
$("#minus").onclick=()=>{if(portions>1)portions--;renderModalIngs();};
$("#plus").onclick=()=>{if(portions<12)portions++;renderModalIngs();};
function renderSteps(){
  $("#mSteps").innerHTML=currentRecipe.steps.map((s,i)=>`<li data-i="${i}" class="${doneSteps.has(i)?'done':''}">${s}</li>`).join("");
  updProg();
}
$("#mSteps").addEventListener("click",e=>{
  const li=e.target.closest("li"); if(!li) return;
  const i=+li.dataset.i; doneSteps.has(i)?doneSteps.delete(i):doneSteps.add(i);
  li.classList.toggle("done"); updProg();
});
function updProg(){
  const n=doneSteps.size, t=currentRecipe?currentRecipe.steps.length:1;
  $("#progBar").style.width=(n/t*100)+"%";
  $("#stepProg").textContent=`${n}/${t}`;
}
$("#modalX").onclick=closeModal;
$("#overlay").addEventListener("click",e=>{if(e.target.id==="overlay")closeModal();});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ closeCook(); closeModal(); closeDrawer(); $("#weekX").click(); $("#helpOverlay").hidden=true; closeAdd(); return; }
  if(e.key==="/"&&document.activeElement!==ingInput&&document.activeElement!==$("#q")&&!currentRecipe){ e.preventDefault(); ingInput.focus(); return; }
  if(!$("#cookOverlay").hidden){
    if(e.key==="ArrowRight"){ cookIdx++; renderCook(); }
    if(e.key==="ArrowLeft"){ cookIdx--; renderCook(); }
  }
  if(e.key==="Tab") trapTab(e);
  if(e.target.matches("input,select,textarea")) return;
  if(e.key==="?"){ $("#helpOverlay").hidden=false; return; }
});
// focus trap: Tab не виходить з верхнього відкритого вікна
function topOverlay(){
  if(!$("#addOverlay").hidden) return $("#addOverlay .modal");
  if(!$("#cookOverlay").hidden) return $("#cookOverlay");
  if(!$("#overlay").hidden) return $("#modal");
  if(!$("#weekOverlay").hidden) return $("#weekOverlay");
  if(!$("#drawerWrap").hidden) return document.querySelector(".drawer");
  return null;
}
function trapTab(e){
  const root=topOverlay(); if(!root) return;
  const f=[...root.querySelectorAll("button,input,select,[tabindex]")].filter(el=>!el.disabled&&el.offsetParent!==null);
  if(!f.length) return;
  const first=f[0], last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first.focus(); }
}
function closeModal(){
  const wasOpen=!$("#overlay").hidden;
  $("#overlay").hidden=true;document.body.style.overflow="";stopTimer();const b=$("#timerStart");if(b)b.textContent="Старт";
  if(wasOpen){ document.title="HOLODYLNYK — що приготувати з того, що є"; try{history.replaceState(null,"",location.pathname+location.search)}catch{} }
  if(lastFocus&&document.contains(lastFocus)){ try{lastFocus.focus({preventScroll:true})}catch{} }
  lastFocus=null;
}
let lastFocus=null;

// recent
function getRecent(){ try{const v=JSON.parse(localStorage.getItem("hol_recent")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function pushRecent(id){
  let r=getRecent().filter(x=>x!==id); r.unshift(id); r=r.slice(0,8);
  try{localStorage.setItem("hol_recent",JSON.stringify(r))}catch{}
  renderRecent();
}
function renderRecent(){
  const r=getRecent().map(id=>findRecipe(id)).filter(Boolean);
  const sec=$("#recentSection"); if(!r.length){sec.hidden=true;return;}
  sec.hidden=false;
  $("#recentRow").innerHTML=r.map(x=>`<div class="recent-item" data-id="${x.id}"><img loading="lazy" decoding="async" src="${x.img}" ${imgAttr(x.img)} alt="${esc(x.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${x.id}/400/200'"><span>${esc(x.title)}</span></div>`).join("");
}
$("#recentRow").addEventListener("click",e=>{ const c=e.target.closest("[data-id]"); if(c) openModal(c.dataset.id); });
$("#recentClear").onclick=()=>{ try{localStorage.setItem("hol_recent","[]")}catch{} renderRecent(); };

// week planner
let weekPlan=[];
function poolFiltered(){
  return allRecipes().filter(r=>!isExcluded(r))
    .filter(r=>!$("#cat").value||r.cat===$("#cat").value)
    .filter(r=>!$("#diet").value||r.diet.includes($("#diet").value))
    .filter(r=>!$("#level").value||r.level===$("#level").value);
}
function genWeek(){
  const pool=[...poolFiltered()]; if(!pool.length) return [];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const days=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"], out=[], usedCats=[];
  for(let d=0;d<7;d++){
    const pick=pool.find(r=>!usedCats.includes(r.cat))||pool[d%pool.length];
    usedCats.push(pick.cat); if(usedCats.length>3) usedCats.shift();
    out.push({day:days[d],...pick,_s:score(pick)});
  }
  return out;
}
function renderWeek(){
  $("#weekList").innerHTML=weekPlan.map(w=>`<li data-id="${w.id}"><img loading="lazy" decoding="async" src="${w.img}" ${imgAttr(w.img)} alt="" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${w.id}/200/200'"><div><b>${w.day} — ${esc(w.title)}</b><small>⏱ ${fmtDur(w.time)} • ${w.kcal} ккал • збіг ${w._s.pct}%</small></div><span>→</span></li>`).join("")||`<li><div><b>Немає рецептів під фільтри</b><small>Фільтри заважають — скинь їх</small></div><button class="btn ghost sm" id="weekClearFilters">Скинути</button></li>`;
  const all=[...new Set(weekPlan.flatMap(w=>score(w).miss))];
  const total=weekPlan.reduce((a,w)=>a+w.time,0);
  $("#weekSub").textContent=weekPlan.length?`${weekPlan.length} страв • разом ${fmtDur(total)} готування • докупити: ${all.length?all.join(", "):"нічого — все є"}`:"";
}
$("#weekBtn").onclick=()=>{ weekPlan=genWeek(); renderWeek(); renderPlans(); $("#weekOverlay").hidden=false; document.body.style.overflow="hidden"; };
$("#weekRegen").onclick=()=>{ weekPlan=genWeek(); renderWeek(); };
function pickCat(cat){
  const pool=poolFiltered().filter(r=>r.cat===cat);
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}
$("#dayBtn").onclick=()=>{
  const plan=[
    {day:"Сніданок",pick:pickCat("сніданки")},
    {day:"Обід",pick:pickCat("основні")||pickCat("паста")||pickCat("перші страви")},
    {day:"Вечеря",pick:pickCat("салати")||pickCat("десерти")||pickCat("основні")},
  ].filter(x=>x.pick).map(x=>({day:x.day,...x.pick,_s:score(x.pick)}));
  if(!plan.length){ toast("Немає рецептів під фільтри"); return; }
  weekPlan=plan; renderWeek();
};
function weekPort(){ return Math.min(12,Math.max(1,+($("#weekPortions")||{}).value||2)); }
function weekText(){
  return `Моє меню (HOLODYLNYK, ×${weekPort()} порцій):\n`+weekPlan.map(w=>`${w.day} — ${w.title} (${fmtDur(w.time)})`).join("\n");
}
$("#copyWeekBtn").onclick=async ()=>{
  if(!weekPlan.length){ toast("Спочатку згенеруй меню"); return; }
  try{ await navigator.clipboard.writeText(weekText()); toast("Меню скопійовано"); }
  catch{ toast("Не вдалось скопіювати"); }
};
$("#weekX").onclick=()=>{ $("#weekOverlay").hidden=true; if($("#overlay").hidden) document.body.style.overflow=""; };
$("#weekOverlay").addEventListener("click",e=>{ if(e.target.id==="weekOverlay") $("#weekX").click(); });
$("#weekList").addEventListener("click",e=>{
  if(e.target.closest("#weekClearFilters")){ $("#cat").value="";$("#diet").value="";$("#level").value="";excluded.clear();renderExcl();persistFilters();render();weekPlan=genWeek();renderWeek();return; }
  const li=e.target.closest("li[data-id]"); if(!li) return; $("#weekX").click(); openModal(li.dataset.id);
});
$("#weekToShop").onclick=()=>{
  let added=0;
  const fp=weekPort();
  weekPlan.flatMap(w=>score(w).miss.map(m=>({m,w}))).forEach(({m,w})=>{
    if(shopList.some(e=>e.n===m)) return;
    const ing=w.ings.find(i=>i.n===m);
    shopList.push({n:m,a:ing?scaleAmount(ing.a,fp):"",from:w.title}); added++;
  });
  saveShop();
  render(); renderDrawer(); toast(added?`У список: +${added} (×${fp} порцій)`:"Все вже в списку");
};

// ratings (local)
function getRates(){ try{const v=JSON.parse(localStorage.getItem("hol_rate")||"{}");return v&&typeof v==="object"?v:{}}catch{return{}} }
function rateAvg(id){ const r=getRates()[id]; if(!r||!r.count) return null; return {avg:r.sum/r.count,count:r.count,my:r.my||0}; }
function rateMini(id){
  const a=rateAvg(id); if(!a) return "";
  return `<div class="rate-mini">★ ${a.avg.toFixed(1)} (${a.count})</div>`;
}
function renderRateRow(){
  const box=$("#rateRow"); if(!box||!currentRecipe) return;
  const a=rateAvg(currentRecipe.id), my=a?a.my:0;
  box.innerHTML=[1,2,3,4,5].map(i=>`<button data-s="${i}" class="${i<=my?'lit':''}" aria-label="Оцінка ${i}">★</button>`).join("")+
    (a?`<span style="color:var(--mut);font-size:13px;margin-left:8px">${a.avg.toFixed(1)} • ${a.count}</span>`:`<span style="color:var(--mut);font-size:13px;margin-left:8px">Оціни першим</span>`);
}
$("#rateRow").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b||!currentRecipe) return;
  const v=+b.dataset.s, rates=getRates(), id=currentRecipe.id, prev=rates[id]||{sum:0,count:0,my:0};
  if(prev.my) prev.sum-=prev.my; else prev.count++;
  prev.sum+=v; prev.my=v; rates[id]=prev;
  try{localStorage.setItem("hol_rate",JSON.stringify(rates))}catch{}
  renderRateRow(); render();
});

// cooked counter + history + confetti
function getCooked(){ try{const v=JSON.parse(localStorage.getItem("hol_cooked")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function getCookDates(){ try{const v=JSON.parse(localStorage.getItem("hol_cooked_dates")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function dayStr(d){ return d.toISOString().slice(0,10); }
function streak(days){
  const set=new Set(days); let s=0; const d=new Date();
  if(!set.has(dayStr(d))) d.setDate(d.getDate()-1);
  while(set.has(dayStr(d))){ s++; d.setDate(d.getDate()-1); }
  return s;
}
$("#cookedBtn").onclick=()=>{
  if(!currentRecipe) return;
  const c=getCooked(); c.push(currentRecipe.id);
  try{localStorage.setItem("hol_cooked",JSON.stringify(c))}catch{}
  const dt=getCookDates(); dt.push(dayStr(new Date()));
  try{localStorage.setItem("hol_cooked_dates",JSON.stringify(dt))}catch{}
  try{$("#statCooked").textContent=c.length;}catch{}
  renderKitchen();
  confetti(); toast("Так тримати! Записано у приготовані");
};
function renderKitchen(){
  const c=getCooked(), dt=getCookDates(), sec=$("#kitchenSection");
  if(!c.length){ sec.hidden=true; return; }
  sec.hidden=false;
  const freq={};
  c.forEach(id=>{freq[id]=(freq[id]||0)+1;});
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([id,n])=>{ const r=findRecipe(id); return r?`${esc(r.title)} ×${n}`:null; }).filter(Boolean).join(", ");
  $("#kitchenStats").innerHTML=
    `<div><b>${c.length}</b>приготовано страв</div>`+
    `<div><b>${streak(dt)}🔥</b>днів поспіль</div>`+
    `<div><b>${new Set(c).size}</b>різних рецептів</div>`+
    `<div><b>${favs.size}</b>в улюбленому</div>`+
    (top?`<div><b>Топ</b>${top}</div>`:"");
  const items=c.slice(-8).reverse().map((id,i)=>{
    const r=findRecipe(id); if(!r) return "";
    const d=dt[dt.length-1-i]||"";
    return `<div class="recent-item" data-id="${r.id}"><img loading="lazy" decoding="async" src="${r.img}" ${imgAttr(r.img)} alt="${esc(r.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${r.id}/400/200'"><span>${esc(r.title)}<br><span class="kitchen-date">${esc(d)}</span></span></div>`;
  }).join("");
  $("#kitchenList").innerHTML=items;
}
$("#kitchenList").addEventListener("click",e=>{ const c=e.target.closest("[data-id]"); if(c) openModal(c.dataset.id); });
$("#kitchenClear").onclick=()=>{ try{localStorage.setItem("hol_cooked","[]");localStorage.setItem("hol_cooked_dates","[]")}catch{} try{$("#statCooked").textContent=0}catch{} renderKitchen(); };
function confetti(){
  const em=["🎉","⭐","🔥","👏","😋"];
  for(let i=0;i<24;i++){
    const s=document.createElement("span"); s.className="confetti";
    s.textContent=em[i%em.length];
    s.style.left=(30+Math.random()*40)+"vw"; s.style.top="45vh";
    s.style.setProperty("--dx",(Math.random()*400-200)+"px");
    s.style.setProperty("--dy",(Math.random()*300-80)+"px");
    document.body.appendChild(s); setTimeout(()=>s.remove(),1100);
  }
}

// add-recipe form
let editingId=null, customPhoto="";
function resetPhoto(){ customPhoto=""; const p=$("#fPreview"); if(p){p.hidden=true;p.removeAttribute("src");} const f=$("#fPhoto"); if(f) f.value=""; }
function closeAdd(){ editingId=null; resetPhoto(); $("#addOverlay").hidden=true; if($("#overlay").hidden&&$("#cookOverlay").hidden) document.body.style.overflow=""; }
$("#fPhoto").addEventListener("change",e=>{
  const f=e.target.files[0]; if(!f) return;
  if(f.size>12*1024*1024){ toast("Файл завеликий (макс 12 МБ)"); return; }
  const url=URL.createObjectURL(f), img=new Image();
  img.onload=()=>{
    try{
      const max=900, k=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement("canvas");
      cv.width=Math.round(img.width*k); cv.height=Math.round(img.height*k);
      cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
      customPhoto=cv.toDataURL("image/jpeg",0.82);
      const p=$("#fPreview"); p.src=customPhoto; p.hidden=false;
      $("#fImg").value="";
      toast("Фото додано");
    }catch{ toast("Не вдалось прочитати фото"); }
    URL.revokeObjectURL(url);
  };
  img.onerror=()=>{ URL.revokeObjectURL(url); toast("Не вдалось прочитати фото"); };
  img.src=url;
});
$("#addRecipeBtn").onclick=()=>{ $("#addOverlay").hidden=false; document.body.style.overflow="hidden"; setTimeout(()=>$("#fTitle").focus(),50); };
$("#addX").onclick=closeAdd;
$("#fCancel").onclick=closeAdd;
$("#addOverlay").addEventListener("click",e=>{ if(e.target.id==="addOverlay") closeAdd(); });
$("#fSave").onclick=()=>{
  const title=$("#fTitle").value.trim();
  const ings=$("#fIngs").value.split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const parts=line.split(/[-–—:]/); const n=(parts.shift()||"").trim();
    return {n, a:parts.join("-").trim()};
  }).filter(x=>x.n);
  const steps=$("#fSteps").value.split("\n").map(s=>s.trim()).filter(Boolean);
  if(title.length<3){ toast("Дай назву від 3 літер"); $("#fTitle").focus(); return; }
  if(ings.length<2){ toast("Треба мінімум 2 інгредієнти"); $("#fIngs").focus(); return; }
  if(steps.length<2){ toast("Треба мінімум 2 кроки"); $("#fSteps").focus(); return; }
  const diet=[...document.querySelectorAll(".fDiet:checked")].map(x=>x.value);
  const imgUrl=$("#fImg").value.trim();
  const id=editingId||"u-"+Date.now().toString(36);
  const oldImg=editingId?(getCustom().find(x=>x.id===editingId)||{}).img:"";
  const rec={
    id, title, desc:$("#fDesc").value.trim()||"Мій власний рецепт.",
    img:/^https:\/\//.test(imgUrl)?imgUrl:(customPhoto||oldImg||`https://picsum.photos/seed/${id}/900/600`),
    time:Math.min(480,Math.max(5,+$("#fTime").value||30)),
    kcal:Math.min(2000,Math.max(10,+$("#fKcal").value||350)),
    level:$("#fLevel").value, cat:$("#fCat").value, diet, ings, steps
  };
  const c=getCustom();
  const ix=c.findIndex(x=>x.id===id);
  if(ix>=0) c[ix]=rec; else c.push(rec);
  saveCustom(c);
  ["fTitle","fDesc","fImg","fIngs","fSteps"].forEach(i=>$("#"+i).value="");
  document.querySelectorAll(".fDiet:checked").forEach(x=>x.checked=false);
  const wasEdit=!!editingId;
  closeAdd(); refreshCounts(); popCounts=null; render(); renderDishDay();
  toast(wasEdit?"Зміни збережено":"Рецепт збережено");
  openModal(id);
};
$("#customEdit").onclick=()=>{
  if(!currentRecipe||!isOwn(currentRecipe)) return;
  const r=currentRecipe;
  editingId=r.id;
  $("#fTitle").value=r.title; $("#fDesc").value=r.desc||"";
  $("#fTime").value=r.time; $("#fKcal").value=r.kcal;
  $("#fCat").value=r.cat; $("#fLevel").value=r.level;
  document.querySelectorAll(".fDiet").forEach(x=>x.checked=(r.diet||[]).includes(x.value));
  $("#fImg").value=/picsum\.photos\/seed/.test(r.img||"")?"":r.img;
  if(/^data:image/.test(r.img||"")){ const p=$("#fPreview"); p.src=r.img; p.hidden=false; customPhoto=r.img; }
  $("#fIngs").value=r.ings.map(i=>i.a?`${i.n} — ${i.a}`:i.n).join("\n");
  $("#fSteps").value=r.steps.join("\n");
  $("#addOverlay").hidden=false;
};
$("#customDel").onclick=()=>{
  if(!currentRecipe||!isOwn(currentRecipe)) return;
  if(!confirm(`Видалити «${currentRecipe.title}»?`)) return;
  saveCustom(getCustom().filter(x=>x.id!==currentRecipe.id));
  closeModal(); refreshCounts(); popCounts=null; render(); renderDishDay();
  toast("Видалено");
};

function renderSimilar(){
  const box=$("#similarRow"); if(!box||!currentRecipe) return;
  const sim=allRecipes()
    .filter(x=>x.id!==currentRecipe.id&&x.cat===currentRecipe.cat&&!isExcluded(x)&&!hidden.has(x.id))
    .map(x=>({...x,_s:score(x)}))
    .sort((a,b)=>b._s.pct-a._s.pct)
    .slice(0,3);
  box.innerHTML=sim.length?sim.map(x=>`<div class="recent-item" data-id="${x.id}"><img loading="lazy" decoding="async" src="${x.img}" ${imgAttr(x.img)} alt="${esc(x.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${x.id}/400/200'"><span>${esc(x.title)} • ${x._s.pct}%</span></div>`).join(""):`<span style="color:var(--mut);font-size:13px">Більше немає в цій категорії.</span>`;
}
$("#similarRow").addEventListener("click",e=>{
  const c=e.target.closest("[data-id]"); if(c) openModal(c.dataset.id);
});

// saved week plans
function getPlans(){ try{const v=JSON.parse(localStorage.getItem("hol_plans")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function savePlans(p){ try{localStorage.setItem("hol_plans",JSON.stringify(p))}catch{} }
function renderPlans(){
  const plans=getPlans(), box=$("#planList"); if(!box) return;
  box.innerHTML=plans.length?plans.map((p,i)=>`<div data-i="${i}">${esc(p.name)} <small>• ${p.items.length} страв</small><button data-d="${i}" aria-label="Видалити">✕</button></div>`).join(""):`<small style="color:var(--mut)">Збережених меню поки немає.</small>`;
}
$("#planSave").onclick=()=>{
  if(!weekPlan.length){ toast("Спочатку згенеруй меню"); return; }
  const plans=getPlans();
  const name=$("#planName").value.trim()||`Меню ${plans.length+1}`;
  plans.push({name, items:weekPlan.map(w=>({day:w.day,id:w.id}))});
  savePlans(plans); $("#planName").value=""; renderPlans();
  toast("Меню збережено");
};
$("#planList").addEventListener("click",e=>{
  const del=e.target.closest("[data-d]");
  if(del){ e.stopPropagation(); const plans=getPlans(); plans.splice(+del.dataset.d,1); savePlans(plans); renderPlans(); return; }
  const row=e.target.closest("[data-i]");
  if(!row) return;
  const p=getPlans()[+row.dataset.i]; if(!p) return;
  weekPlan=p.items.map(x=>{ const r=findRecipe(x.id); return r?{day:x.day,...r,_s:score(r)}:null; }).filter(Boolean);
  if(!weekPlan.length){ toast("Рецептів уже немає"); return; }
  renderWeek();
});

// cook mode
function openCook(){
  if(!currentRecipe) return;
  cookIdx=0; $("#cookOverlay").hidden=false; document.body.style.overflow="hidden";
  lockScreen(); renderCook();
}
function renderCook(){
  const steps=currentRecipe.steps, n=steps.length;
  cookIdx=Math.max(0,Math.min(cookIdx,n-1));
  $("#cookTitle").textContent=currentRecipe.title;
  $("#cookCount").textContent=`${cookIdx+1} / ${n}`;
  $("#cookStep").textContent=steps[cookIdx];
  $("#cookProg").style.width=((cookIdx+1)/n*100)+"%";
  $("#cookPrev").disabled=cookIdx===0;
}
function closeCook(){ stopSpeak(); releaseScreen(); renderSteps(); $("#cookOverlay").hidden=true; if($("#overlay").hidden) document.body.style.overflow=""; }
$("#cookPrev").onclick=()=>{stopSpeak();doneSteps.delete(cookIdx);cookIdx--;updProg();renderCook();};
$("#cookNext").onclick=()=>{stopSpeak(); if(!currentRecipe) return; doneSteps.add(cookIdx); if(cookIdx<currentRecipe.steps.length-1){cookIdx++;updProg();renderCook();} else { currentRecipe.steps.forEach((_,i)=>doneSteps.add(i)); updProg(); closeCook(); } };
$("#cookDone").onclick=()=>{ if(currentRecipe) currentRecipe.steps.forEach((_,i)=>doneSteps.add(i)); updProg(); closeCook(); toast("Смачного!"); };
$("#cookX").onclick=closeCook;
// wake lock: екран не гасне під час готування
let wakeLock=null;
async function lockScreen(){
  try{ if("wakeLock" in navigator) wakeLock=await navigator.wakeLock.request("screen"); }catch{}
}
function releaseScreen(){ try{ wakeLock?.release(); wakeLock=null; }catch{} }
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&!$("#cookOverlay").hidden) lockScreen();
});
// озвучка кроку
function stopSpeak(){ try{ speechSynthesis.cancel(); }catch{} }
$("#cookSpeak").onclick=()=>{
  if(!currentRecipe) return;
  try{
    stopSpeak();
    const u=new SpeechSynthesisUtterance(currentRecipe.steps[cookIdx]);
    u.lang="uk-UA"; u.rate=1;
    speechSynthesis.speak(u);
  }catch{ toast("Озвучка не підтримується"); }
};

// shopping list (with amounts × portions)
$("#toListBtn").onclick=()=>{
  if(!currentRecipe) return;
  const s=score(currentRecipe);
  let added=0;
  s.miss.forEach(m=>{
    if(shopList.some(e=>e.n===m)) return;
    const ing=currentRecipe.ings.find(i=>i.n===m);
    shopList.push({n:m,a:ing?scaleAmount(ing.a,portions):"",from:currentRecipe.title}); added++;
  });
  saveShop();
  render(); renderDrawer();
  toast(added?`Додано в список: ${added} (×${portions} порц.)`:"Все вже в списку ✓");
  openDrawer();
};
function renderDrawer(){
  $("#listCount").textContent=shopList.length;
  if(!shopList.length){ $("#drawerList").innerHTML=`<li style="opacity:.6">Порожньо. Відкрий рецепт → «Додати відсутнє»</li>`; return; }
  let html="";
  shopGroups().forEach(g=>{
    html+=`<li class="shop-head">${esc(g.from)}</li>`;
    g.items.forEach(e=>{
      const i=shopList.indexOf(e);
      html+=`<li class="${bought.has(e.n)?"done":""}" data-i="${i}"><span>${esc(e.a?`${e.n} — ${e.a}`:e.n)}</span><button data-d="${i}" aria-label="Прибрати">✕</button></li>`;
    });
  });
  $("#drawerList").innerHTML=html;
}
$("#drawerList").addEventListener("click",e=>{
  const b=e.target.closest("[data-d]");
  if(b){
    const gone=shopList.splice(+b.dataset.d,1)[0];
    if(gone) bought.delete(gone.n);
    saveShop(); saveBought();
    renderDrawer(); render();
    return;
  }
  const li=e.target.closest("li[data-i]");
  if(li){
    const n=shopList[+li.dataset.i].n;
    bought.has(n)?bought.delete(n):bought.add(n);
    saveBought(); renderDrawer();
  }
});
function openDrawer(){$("#drawerWrap").hidden=false;renderDrawer();}
function closeDrawer(){$("#drawerWrap").hidden=true;}
$("#listToggle").onclick=openDrawer;
$("#drawerX").onclick=closeDrawer;
$("#drawerBg").onclick=closeDrawer;
$("#clearList").onclick=()=>{shopList=[];bought.clear();saveShop();saveBought();renderDrawer();render();};
$("#copyList").onclick=async ()=>{
  const text="Список покупок (HOLODYLNYK):\n\n"+shopText();
  try { await navigator.clipboard.writeText(text); toast("Скопійовано в буфер"); }
  catch { toast("Не вдалось скопіювати"); }
};
$("#dlList").onclick=()=>{
  if(!shopList.length){ toast("Список порожній"); return; }
  download("spysok-pokupok.txt","Список покупок (HOLODYLNYK):\n\n"+shopText()+"\n");
  toast("Файл збережено");
};
$("#dlWeek").onclick=()=>{
  if(!weekPlan.length){ toast("Спочатку згенеруй меню"); return; }
  const all=[...new Set(weekPlan.flatMap(w=>score(w).miss))];
  download("menu-tyzhden.txt",`${weekText()}\n\nДокупити:\n- ${all.join("\n- ")||"нічого"}\n`);
  toast("Файл збережено");
};
$("#shareTg").onclick=()=>{
  const text=encodeURIComponent("Мій список покупок (HOLODYLNYK):\n\n"+shopText());
  window.open(`https://t.me/share/url?url=&text=${text}`,"_blank");
};

// timer
function fmtT(s){return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}
function fmtDur(m){
  m=Math.round(m);
  if(m<60) return `${m} хв`;
  const h=Math.floor(m/60), r=m%60;
  return r?`${h} год ${r} хв`:`${h} год`;
}
function resetTimerUI(){$("#timerDigits").textContent=fmtT(timerLeft);}
document.querySelectorAll(".timer-row button[data-t]").forEach(b=>{
  b.onclick=()=>{document.querySelectorAll(".timer-row button[data-t]").forEach(x=>x.classList.remove("on"));b.classList.add("on");timerSec=+b.dataset.t*60;timerLeft=timerSec;stopTimer();resetTimerUI();};
});
function baseTitle(){
  return currentRecipe&&!$("#overlay").hidden?`${currentRecipe.title} — HOLODYLNYK`:"HOLODYLNYK — що приготувати з того, що є";
}
$("#timerStart").onclick=function(){
  if(timerId){stopTimer();this.textContent="Старт";document.title=baseTitle();return;}
  if(timerLeft<=0) timerLeft=timerSec;
  this.textContent="Пауза";
  timerId=setInterval(()=>{
    timerLeft--;
    if(timerLeft<=0){timerLeft=0;resetTimerUI();stopTimer();$("#timerStart").textContent="Старт";document.title=baseTitle();toast("Час вийшов!");beep();return;}
    resetTimerUI();
    document.title=`⏱ ${fmtT(timerLeft)} — ${currentRecipe?currentRecipe.title:"таймер"}`;
  },1000);
};
$("#timerReset").onclick=()=>{stopTimer();timerLeft=timerSec;$("#timerStart").textContent="Старт";resetTimerUI();document.title=baseTitle();};
function stopTimer(){clearInterval(timerId);timerId=null;}
function beep(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
    const ctx=new Ctx(); const o=ctx.createOscillator(); const g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value=880; o.type="sine";
    g.gain.setValueAtTime(0.2,ctx.currentTime); o.start();
    o.stop(ctx.currentTime+0.5); o.onended=()=>ctx.close();
  }catch{}
}

// tilt + nav shadow + scrolltop
document.addEventListener("scroll",()=>{
  $("#nav").style.filter=window.scrollY>10?"drop-shadow(0 10px 30px rgba(0,0,0,.5))":"none";
  $("#scrollTop").classList.toggle("show",window.scrollY>700);
},{passive:true});
$("#scrollTop").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});
window.addEventListener("offline",()=>{ $("#netDot").classList.add("off"); toast("Офлайн — показуємо збережене"); });
window.addEventListener("online",()=>{ $("#netDot").classList.remove("off"); toast("Знову онлайн"); });
if(!navigator.onLine) $("#netDot").classList.add("off");
// PWA install
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredPrompt=e; $("#installBtn").hidden=false;
});
$("#installBtn").onclick=async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt=null; $("#installBtn").hidden=true;
};

// backup / restore / wipe
const HOL_KEYS=["hol_ings","hol_excl","hol_favs","hol_shop","hol_bought","hol_recent","hol_cooked","hol_cooked_dates","hol_rate","hol_theme","hol_filters","hol_seen","hol_custom","hol_hidden","hol_plans"];
$("#backupBtn").onclick=()=>{
  const data={};
  HOL_KEYS.forEach(k=>{ try{data[k]=JSON.parse(localStorage.getItem(k)??"null")}catch{data[k]=null} });
  download("holodylnyk-backup.json",JSON.stringify(data,null,2));
  toast("Бекап збережено");
};
$("#restoreInput").addEventListener("change",e=>{
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const data=JSON.parse(rd.result);
      if(!data||typeof data!=="object") throw 0;
      HOL_KEYS.forEach(k=>{ if(k in data) localStorage.setItem(k,JSON.stringify(data[k])); });
      toast("Відновлено — перезавантажую"); setTimeout(()=>location.reload(),900);
    }catch{ toast("Битий файл бекапу"); }
  };
  rd.readAsText(f); e.target.value="";
});
$("#wipeBtn").onclick=()=>{
  if(!confirm("Стерти всі мої дані (продукти, улюблене, історія)?")) return;
  HOL_KEYS.forEach(k=>{ try{localStorage.removeItem(k)}catch{} });
  location.reload();
};
// self-test даних
function checkRecipe(r, tag, bad, ids, cats, diets){
  if(!r.id||ids.has(r.id)) bad.push(`${tag} дубль/пустий id`);
  ids.add(r.id);
  ["title","desc","img","time","kcal","level","cat"].forEach(f=>{ if(!r[f]) bad.push(`${tag}${r.id}: пусте ${f}`); });
  if(!cats.has(r.cat)) bad.push(`${tag}${r.id}: погана категорія ${r.cat}`);
  (r.diet||[]).forEach(d=>{ if(!diets.has(d)) bad.push(`${tag}${r.id}: погана дієта ${d}`); });
  if(!Array.isArray(r.ings)||r.ings.length<2) bad.push(`${tag}${r.id}: мало інгредієнтів`);
  if(!Array.isArray(r.steps)||r.steps.length<2) bad.push(`${tag}${r.id}: мало кроків`);
  if(!(r.time>0)||!(r.kcal>0)) bad.push(`${tag}${r.id}: час/ккал`);
  if(!/^https:\/\//.test(r.img||"")) bad.push(`${tag}${r.id}: не https картинка`);
}
$("#selfTestBtn").onclick=()=>{
  const bad=[];
  const ids=new Set(), cats=new Set(["сніданки","перші страви","основні","паста","салати","десерти"]);
  const diets=new Set(["вегетаріанське","веганське","без лактози"]);
  window.RECIPES.forEach((r,i)=>checkRecipe(r,`#${i} `,bad,ids,cats,diets));
  getCustom().forEach((r,i)=>checkRecipe(r,"моє ",bad,ids,cats,diets));
  const total=window.RECIPES.length+getCustom().length;
  toast(bad.length?`Знайдено проблем: ${bad.length} (${bad[0]})`:`Все чисто: ${total} рецептів OK`);
};

function toast(msg){
  const t=document.createElement("div");t.className="toast";t.textContent=msg;
  $("#toasts").appendChild(t);setTimeout(()=>t.remove(),2600);
}

// persist filters
const FKEY="hol_filters";
function persistFilters(){
  try{localStorage.setItem(FKEY,JSON.stringify({
    q:$("#q").value,cat:$("#cat").value,diet:$("#diet").value,
    maxTime:$("#maxTime").value,maxKcal:$("#maxKcal").value,level:$("#level").value,sort:$("#sort").value,
    onlyFav:$("#onlyFav").checked,onlyPossible:$("#onlyPossible").checked,
    staples:$("#staples").checked}));}catch{}
}
try{
  const f=JSON.parse(localStorage.getItem(FKEY)||"{}");
  if(f.q)$("#q").value=f.q; if(f.cat)$("#cat").value=f.cat;
  if(f.diet)$("#diet").value=f.diet; if(f.maxTime)$("#maxTime").value=f.maxTime;
  if(f.maxKcal)$("#maxKcal").value=f.maxKcal; if(f.level)$("#level").value=f.level; if(f.sort)$("#sort").value=f.sort;
  if(f.onlyFav)$("#onlyFav").checked=true; if(f.onlyPossible)$("#onlyPossible").checked=true;
  if(f.staples===false)$("#staples").checked=false;
}catch{}
["q","cat","diet","maxTime","sort"].forEach(id=>{
  $("#"+id).addEventListener("change",persistFilters);
});

// instant updates: version check with one-click refresh
const APP_VERSION = 25;
let updateShown = false;
async function checkUpdate(){
  try{
    const r=await fetch("version.json?t="+Date.now(),{cache:"no-store"});
    if(!r.ok) return;
    const {v}=await r.json();
    if(v&&v!==APP_VERSION&&!updateShown) showUpdateBar(v);
  }catch{}
}
function showUpdateBar(v){
  updateShown=true;
  const bar=document.createElement("div");
  bar.className="updatebar";
  bar.innerHTML=`<span>Вийшла v${v} — оновити зараз?</span>`;
  const btn=document.createElement("button");
  btn.textContent="Оновити";
  btn.onclick=applyUpdate;
  bar.appendChild(btn);
  document.body.appendChild(bar);
}
async function applyUpdate(){
  try{
    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
  }catch{}
  location.reload();
}
// PWA service worker + update notice
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("sw.js").then(reg=>{
      try{ reg.update(); }catch{}
      reg.onupdatefound=()=>{
        const w=reg.installing;
        if(!w) return;
        w.onstatechange=()=>{
          if(w.state==="installed"&&navigator.serviceWorker.controller){
            toast("Вийшло оновлення — перезавантаж сторінку");
          }
        };
      };
    }).catch(()=>{});
  });
}
setTimeout(checkUpdate,4000);
setInterval(checkUpdate,15*60*1000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) checkUpdate(); });

// SEO: JSON-LD ItemList
try{
  const ld={ "@context":"https://schema.org", "@type":"ItemList",
    itemListElement: allRecipes().map((r,i)=>({ "@type":"ListItem", position:i+1,
      item:{ "@type":"Recipe", name:r.title, description:r.desc, recipeCategory:r.cat,
        totalTime:`PT${r.time}M`, recipeYield:`${2} порції`,
        recipeIngredient:r.ings.map(x=>`${x.n} — ${x.a}`),
        recipeInstructions:r.steps.map(s=>({ "@type":"HowToStep", text:s })) }}))};
  const sc=document.createElement("script"); sc.type="application/ld+json"; sc.textContent=JSON.stringify(ld);
  document.head.appendChild(sc);
}catch{}

// deep link #r-id
function openDeep(){
  const m=(location.hash||"").match(/^#r-(.+)/);
  if(m&&findRecipe(m[1])) openModal(m[1]);
}
window.addEventListener("hashchange",openDeep);

$("#helpBtn").onclick=()=>{ $("#helpOverlay").hidden=false; };
$("#helpX").onclick=()=>{ $("#helpOverlay").hidden=true; };
$("#helpOverlay").addEventListener("click",e=>{ if(e.target.id==="helpOverlay") $("#helpOverlay").hidden=true; });

// first-visit hint
try{
  if(!localStorage.getItem("hol_seen")){
    setTimeout(()=>toast("Додай продукти — або тисни кубик удачі"),900);
    setTimeout(()=>{ if(!selected.size) toast("Підказка: поле «Не хочу» прибирає нелюбове"); },4200);
    localStorage.setItem("hol_seen","1");
  }
}catch{}

// init
renderChips();renderExcl();render();renderDrawer();renderRecent();renderKitchen();renderDishDay();openDeep();
