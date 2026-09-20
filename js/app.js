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
function ingMatch(a, b){
  a=norm(a); b=norm(b);
  if(a.includes(b)||b.includes(a)) return true;
  const sa=stem(a), sb=stem(b);
  return sa.length>2&&sb.length>2&&(sa.includes(sb)||sb.includes(sa));
}
// responsive image helper (Unsplash w= param)
function srcSet(url){
  if(!/images\.unsplash\.com/.test(url||"")) return "";
  return `srcset="${url.replace("w=900","w=400")} 400w, ${url} 800w" sizes="(max-width:600px) 90vw, 320px"`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function safeParse(key, fb){
  try { const v = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb)); return Array.isArray(v) ? v : fb; }
  catch { return fb; }
}

const selected = new Set(safeParse("hol_ings", []));
const favs = new Set(safeParse("hol_favs", []));
const excluded = new Set(safeParse("hol_excl", []));
let shopList = safeParse("hol_shop", []).map(e=>typeof e==="string"?{n:e,a:""}:e);
function saveShop(){ try{localStorage.setItem("hol_shop",JSON.stringify(shopList))}catch{} }
function shopText(){ return shopList.map(e=>e.a?`${e.n} — ${e.a}`:e.n); }
function scaleAmount(a, portions){
  const m=String(a||"").match(/([\d.]+)\s*(.*)/);
  if(!m) return a||"";
  const num=Math.round(parseFloat(m[1])*(portions/2)*10)/10;
  return `${num} ${m[2]}`.trim();
}
let currentRecipe = null, portions = 2, timerSec = 600, timerId = null, timerLeft = 600, doneSteps = new Set(), cookIdx = 0;

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

// marquee + counts
function refreshCounts(){
  const n=window.RECIPES.length;
  $("#heroBadge").textContent=`✦ ${n} перевірені рецепти • українською • без реєстрації`;
  $("#marquee").innerHTML = Array(2).fill("БОРЩ ✦ СИРНИКИ ✦ ДЕРУНИ ✦ ВАРЕНИКИ ✦ ШАКШУКА ✦ ПАСТА ✦ ПЛОВ ✦ ШАРЛОТКА ✦ ЦЕЗАР ✦ РАМЕН ✦ МЕДОВИК ✦ БАНОШ ✦ СМУЗІ ✦ ").join("");
}
refreshCounts();

// popular
function renderPopular(){
  $("#popularRow").innerHTML = window.POPULAR.map(p=>
    `<button data-p="${p}" class="${selected.has(p)?'added':''}">+ ${p}</button>`).join("");
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
  const all=[...new Set(window.RECIPES.flatMap(r=>r.ings.map(i=>i.n)))];
  const m=all.filter(a=>fuzzyHay(a,v)&&!selected.has(a)).slice(0,6);
  box.innerHTML=m.map(x=>`<button>${x}</button>`).join("");
});
$("#suggest").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(b) addIng(b.textContent);
});

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
function addExcl(v){ v=norm(v); if(!v) return; excluded.add(v); exclInput.value=""; renderExcl(); render(); }
exclInput.addEventListener("keydown",e=>{ if(e.key==="Enter") addExcl(exclInput.value); });
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
    const ok=[...selected].some(s=>ingMatch(ing.n,s));
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

function render(){
  const q=norm($("#q").value), cat=$("#cat").value, diet=$("#diet").value,
        mt=$("#maxTime").value, sort=$("#sort").value, onlyFav=$("#onlyFav").checked;
  const onlyPoss=$("#onlyPossible").checked;
  let items=window.RECIPES.map(r=>({...r,_s:score(r)}));
  if(onlyFav) items=items.filter(r=>favs.has(r.id));
  if(onlyPoss) items=items.filter(r=>r._s.pct===100);
  if(excluded.size) items=items.filter(r=>!isExcluded(r));
  if(q) items=items.filter(r=>fuzzyHay(r.title+" "+r.desc+" "+r.ings.map(i=>i.n).join(" "),q));
  if(cat) items=items.filter(r=>r.cat===cat);
  if(diet) items=items.filter(r=>r.diet.includes(diet));
  if(mt) items=items.filter(r=>r.time<=+mt);
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
  const avgEl=$("#statAvg"); if(avgEl&&avg) avgEl.textContent=`~${avg} хв`;
  $("#favCount").textContent=favs.size;
  $("#listCount").textContent=shopList.length;
  const exclTxt=excluded.size?` • без: ${[...excluded].join(", ")}`:"";
  $("#activeHint").textContent=(selected.size?`Продукти: ${[...selected].join(", ")}`:"Додай продукти — відсортуємо за збігом")+exclTxt;
  $("#empty").hidden=items.length>0;
  grid.innerHTML=items.map(r=>`
    <article class="card" data-id="${r.id}" tabindex="0" aria-label="${esc(r.title)}">
      <div class="card-img">
        <img loading="lazy" decoding="async" src="${r.img}" ${srcSet(r.img)} alt="${esc(r.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${r.id}/800/600'">
        ${badge(r._s.pct)}
        <button class="fav ${favs.has(r.id)?'on':''}" data-fav="${r.id}" aria-label="В улюблене">${favs.has(r.id)?'♥':'♡'}</button>
      </div>
      <div class="card-body">
        <h3>${hl(r.title,q)}</h3><p>${r.desc}</p>
        ${rateMini(r.id)}
        <div class="meta"><span class="t">⏱ ${r.time} хв</span><span>${r.kcal} ккал</span><span>${r.level}</span><span>${r.cat}</span></div>
        ${selected.size?`<div class="miss">${r._s.miss.length?`Докупити: <b>${r._s.miss.slice(0,3).join(", ")}${r._s.miss.length>3?"…":""}</b>`:"✅ Все є! Можна готувати"}</div>`:`<div class="miss">Натисни щоб відкрити рецепт →</div>`}
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
  persistFilters(); render();
});
grid.addEventListener("click",e=>{
  const f=e.target.closest("[data-fav]");
  if(f){e.stopPropagation();toggleFav(f.dataset.fav);return;}
  const c=e.target.closest(".card"); if(c) openModal(c.dataset.id);
});
grid.addEventListener("keydown",e=>{
  if(e.key==="Enter"){ const c=e.target.closest(".card"); if(c) openModal(c.dataset.id); }
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
  const q=norm($("#q").value), diet=$("#diet").value, mt=$("#maxTime").value;
  const base=window.RECIPES.filter(r=>
    (!q||(r.title+" "+r.desc).toLowerCase().includes(q))&&
    (!diet||r.diet.includes(diet))&&(!mt||r.time<=+mt)&&!isExcluded(r));
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
["q","cat","diet","maxTime","sort","onlyFav","onlyPossible"].forEach(id=>{
  $("#"+id).addEventListener("input",()=>{persistFilters();render();});
});
$("#clearAll").onclick=()=>{selected.clear();excluded.clear();$("#q").value="";$("#cat").value="";$("#diet").value="";$("#maxTime").value="";$("#sort").value="match";$("#onlyFav").checked=false;$("#onlyPossible").checked=false;document.querySelectorAll("#quickRow button").forEach(b=>b.classList.remove("on"));renderChips();renderExcl();persistFilters();render();};
$("#emptyReset").onclick=()=>$("#clearAll").click();
$("#emptyFast").onclick=()=>{ $("#clearAll").click(); $("#maxTime").value="30"; $("#sort").value="time"; persistFilters(); render(); document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"}); };
$("#emptyTop").onclick=()=>{ $("#clearAll").click(); $("#sort").value="rate"; persistFilters(); render(); document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"}); };
$("#favToggle").onclick=()=>{const c=$("#onlyFav");c.checked=!c.checked;render();document.querySelector("#grid-section").scrollIntoView({behavior:"smooth"});};

// random
$("#randomBtn").onclick=()=>{
  const pool=window.RECIPES; const r=pool[Math.floor(Math.random()*pool.length)];
  openModal(r.id); toast("Шеф обрав за тебе 🎲");
};

// modal
function openModal(id){
  const r=window.RECIPES.find(x=>x.id===id); if(!r) return;
  currentRecipe=r; portions=2; doneSteps=new Set();
  const s=score(r);
  $("#mImg").src=r.img;
  const ss=srcSet(r.img); if(ss){ $("#mImg").setAttribute("srcset",ss.match(/srcset="([^"]+)"/)[1]); $("#mImg").setAttribute("sizes","(max-width:700px) 100vw, 900px"); }
  else $("#mImg").removeAttribute("srcset");
  $("#mImg").onerror=function(){this.removeAttribute("srcset");this.src=`https://picsum.photos/seed/${r.id}/1000/600`};
  $("#mTitle").textContent=r.title;
  $("#mMeta").textContent=`⏱ ${r.time} хв • ${r.kcal} ккал • ${r.level} • ${r.cat}`;
  $("#mMatch").textContent=selected.size?(s.pct>=70?`✅ ${s.pct}% — майже все є!`:`◐ Збіг ${s.pct}% — докупи: ${s.miss.slice(0,4).join(", ")||"нічого"}`):`☆ Відкрий рецепт і готуй`;
  $("#mSideInfo").innerHTML=`<b>💡 Порада шефа</b><br>${tipFor(r)}<br><br><b>Дієта:</b> ${r.diet.join(", ")||"звичайна"}<br><b>Категорія:</b> ${r.cat}`;
  renderModalIngs(); renderSteps(); renderAutoTimers(); renderRateRow();
  pushRecent(r.id); syncModalFav();
  document.title=`${r.title} — HOLODYLNYK`;
  try{history.replaceState(null,"",`#r-${r.id}`)}catch{}
  $("#overlay").hidden=false; document.body.style.overflow="hidden";
  stopTimer(); timerLeft=timerSec; $("#timerStart").textContent="Старт"; resetTimerUI();
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
  return tips[r.id]||"Куштуй в процесі і доводь сіль/кислоту в кінці — це 80% смаку.";
}
function renderModalIngs(){
  $("#portionVal").textContent=portions;
  $("#mIngs").innerHTML=currentRecipe.ings.map(ing=>{
    const have=[...selected].some(s=>ingMatch(ing.n,s));
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
  if(e.key==="Escape"){ closeCook(); closeModal(); closeDrawer(); $("#weekX").click(); $("#helpOverlay").hidden=true; return; }
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
}

// recent
function getRecent(){ try{const v=JSON.parse(localStorage.getItem("hol_recent")||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
function pushRecent(id){
  let r=getRecent().filter(x=>x!==id); r.unshift(id); r=r.slice(0,8);
  try{localStorage.setItem("hol_recent",JSON.stringify(r))}catch{}
  renderRecent();
}
function renderRecent(){
  const r=getRecent().map(id=>window.RECIPES.find(x=>x.id===id)).filter(Boolean);
  const sec=$("#recentSection"); if(!r.length){sec.hidden=true;return;}
  sec.hidden=false;
  $("#recentRow").innerHTML=r.map(x=>`<div class="recent-item" data-id="${x.id}"><img loading="lazy" decoding="async" src="${x.img}" ${srcSet(x.img)} alt="${esc(x.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${x.id}/400/200'"><span>${esc(x.title)}</span></div>`).join("");
}
$("#recentRow").addEventListener("click",e=>{ const c=e.target.closest("[data-id]"); if(c) openModal(c.dataset.id); });
$("#recentClear").onclick=()=>{ try{localStorage.setItem("hol_recent","[]")}catch{} renderRecent(); };

// week planner
let weekPlan=[];
function poolFiltered(){
  return window.RECIPES.filter(r=>!isExcluded(r))
    .filter(r=>!$("#cat").value||r.cat===$("#cat").value)
    .filter(r=>!$("#diet").value||r.diet.includes($("#diet").value));
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
  $("#weekList").innerHTML=weekPlan.map(w=>`<li data-id="${w.id}"><img loading="lazy" decoding="async" src="${w.img}" ${srcSet(w.img)} alt="" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${w.id}/200/200'"><div><b>${w.day} — ${esc(w.title)}</b><small>⏱ ${w.time} хв • ${w.kcal} ккал • збіг ${w._s.pct}%</small></div><span>→</span></li>`).join("")||`<li>Немає рецептів під фільтри — скинь їх.</li>`;
  const all=[...new Set(weekPlan.flatMap(w=>score(w).miss))];
  $("#weekSub").textContent=weekPlan.length?`7 страв • разом докупити: ${all.length?all.join(", "):"нічого — все є"}`:"";
}
$("#weekBtn").onclick=()=>{ weekPlan=genWeek(); renderWeek(); $("#weekOverlay").hidden=false; document.body.style.overflow="hidden"; };
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
function weekText(){
  return weekPlan.map(w=>`${w.day} — ${w.title} (${w.time} хв)`).join("\n");
}
$("#copyWeekBtn").onclick=async ()=>{
  if(!weekPlan.length){ toast("Спочатку згенеруй меню"); return; }
  try{ await navigator.clipboard.writeText("Моє меню (HOLODYLNYK):\n"+weekText()); toast("Меню скопійовано"); }
  catch{ toast("Не вдалось скопіювати"); }
};
$("#weekX").onclick=()=>{ $("#weekOverlay").hidden=true; if($("#overlay").hidden) document.body.style.overflow=""; };
$("#weekOverlay").addEventListener("click",e=>{ if(e.target.id==="weekOverlay") $("#weekX").click(); });
$("#weekList").addEventListener("click",e=>{ const li=e.target.closest("li[data-id]"); if(!li) return; $("#weekX").click(); openModal(li.dataset.id); });
$("#weekToShop").onclick=()=>{
  let added=0;
  weekPlan.flatMap(w=>score(w).miss).forEach(m=>{
    if(shopList.some(e=>e.n===m)) return;
    const src=weekPlan.map(w=>w).find(w=>w.ings.some(i=>i.n===m));
    const ing=src?src.ings.find(i=>i.n===m):null;
    shopList.push({n:m,a:ing?ing.a:""}); added++;
  });
  saveShop();
  render(); renderDrawer(); toast(added?`У список: +${added}`:"Все вже в списку");
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
  $("#kitchenStats").innerHTML=
    `<div><b>${c.length}</b>приготовано страв</div>`+
    `<div><b>${streak(dt)}🔥</b>днів поспіль</div>`+
    `<div><b>${new Set(c).size}</b>різних рецептів</div>`+
    `<div><b>${favs.size}</b>в улюбленому</div>`;
  const items=c.slice(-8).reverse().map((id,i)=>{
    const r=window.RECIPES.find(x=>x.id===id); if(!r) return "";
    const d=dt[dt.length-1-i]||"";
    return `<div class="recent-item" data-id="${r.id}"><img loading="lazy" decoding="async" src="${r.img}" ${srcSet(r.img)} alt="${esc(r.title)}" onerror="this.removeAttribute('srcset');this.src='https://picsum.photos/seed/${r.id}/400/200'"><span>${esc(r.title)}<br><span class="kitchen-date">${esc(d)}</span></span></div>`;
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

// cook mode
function openCook(){
  if(!currentRecipe) return;
  cookIdx=0; $("#cookOverlay").hidden=false; document.body.style.overflow="hidden";
  renderCook();
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
function closeCook(){ $("#cookOverlay").hidden=true; if($("#overlay").hidden) document.body.style.overflow=""; }
$("#cookPrev").onclick=()=>{cookIdx--;renderCook();};
$("#cookNext").onclick=()=>{ if(cookIdx<currentRecipe.steps.length-1){cookIdx++;renderCook();} else closeCook(); };
$("#cookDone").onclick=()=>{ closeCook(); toast("Смачного!"); };
$("#cookX").onclick=closeCook;

// shopping list (with amounts × portions)
$("#toListBtn").onclick=()=>{
  if(!currentRecipe) return;
  const s=score(currentRecipe);
  let added=0;
  s.miss.forEach(m=>{
    if(shopList.some(e=>e.n===m)) return;
    const ing=currentRecipe.ings.find(i=>i.n===m);
    shopList.push({n:m,a:ing?scaleAmount(ing.a,portions):""}); added++;
  });
  saveShop();
  render(); renderDrawer();
  toast(added?`Додано в список: ${added} (×${portions} порц.)`:"Все вже в списку ✓");
  openDrawer();
};
function renderDrawer(){
  $("#listCount").textContent=shopList.length;
  $("#drawerList").innerHTML=shopList.length?shopList.map((e,i)=>`<li>${esc(e.a?`${e.n} — ${e.a}`:e.n)}<button data-d="${i}">✕</button></li>`).join(""):`<li style="opacity:.6">Порожньо. Відкрий рецепт → «Додати відсутнє»</li>`;
}
$("#drawerList").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  shopList.splice(+b.dataset.d,1);
  saveShop();
  renderDrawer(); render();
});
function openDrawer(){$("#drawerWrap").hidden=false;renderDrawer();}
function closeDrawer(){$("#drawerWrap").hidden=true;}
$("#listToggle").onclick=openDrawer;
$("#drawerX").onclick=closeDrawer;
$("#drawerBg").onclick=closeDrawer;
$("#clearList").onclick=()=>{shopList=[];saveShop();renderDrawer();render();};
$("#copyList").onclick=async ()=>{
  const text="Список покупок:\n- "+shopText().join("\n- ");
  try { await navigator.clipboard.writeText(text); toast("Скопійовано в буфер"); }
  catch { toast("Не вдалось скопіювати"); }
};
$("#shareTg").onclick=()=>{
  const text=encodeURIComponent("Мій список покупок (HOLODYLNYK):\n- "+shopText().join("\n- "));
  window.open(`https://t.me/share/url?url=&text=${text}`,"_blank");
};

// timer
function fmtT(s){return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}
function resetTimerUI(){$("#timerDigits").textContent=fmtT(timerLeft);}
document.querySelectorAll(".timer-row button[data-t]").forEach(b=>{
  b.onclick=()=>{document.querySelectorAll(".timer-row button[data-t]").forEach(x=>x.classList.remove("on"));b.classList.add("on");timerSec=+b.dataset.t*60;timerLeft=timerSec;stopTimer();resetTimerUI();};
});
$("#timerStart").onclick=function(){
  if(timerId){stopTimer();this.textContent="Старт";return;}
  if(timerLeft<=0) timerLeft=timerSec;
  this.textContent="Пауза";
  timerId=setInterval(()=>{
    timerLeft--;
    if(timerLeft<=0){timerLeft=0;resetTimerUI();stopTimer();$("#timerStart").textContent="Старт";toast("Час вийшов!");beep();return;}
    resetTimerUI();
  },1000);
};
$("#timerReset").onclick=()=>{stopTimer();timerLeft=timerSec;$("#timerStart").textContent="Старт";resetTimerUI();};
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
window.addEventListener("offline",()=>toast("Офлайн — показуємо збережене"));
window.addEventListener("online",()=>toast("Знову онлайн"));

// self-test даних
$("#selfTestBtn").onclick=()=>{
  const bad=[];
  const ids=new Set(), cats=new Set(["сніданки","перші страви","основні","паста","салати","десерти"]);
  const diets=new Set(["вегетаріанське","веганське","без лактози"]);
  window.RECIPES.forEach((r,i)=>{
    if(!r.id||ids.has(r.id)) bad.push(`#${i} дубль/пустий id`);
    ids.add(r.id);
    ["title","desc","img","time","kcal","level","cat"].forEach(f=>{ if(!r[f]) bad.push(`${r.id}: пусте ${f}`); });
    if(!cats.has(r.cat)) bad.push(`${r.id}: погана категорія ${r.cat}`);
    (r.diet||[]).forEach(d=>{ if(!diets.has(d)) bad.push(`${r.id}: погана дієта ${d}`); });
    if(!Array.isArray(r.ings)||r.ings.length<2) bad.push(`${r.id}: мало інгредієнтів`);
    if(!Array.isArray(r.steps)||r.steps.length<2) bad.push(`${r.id}: мало кроків`);
    if(!(r.time>0)||!(r.kcal>0)) bad.push(`${r.id}: час/ккал`);
    if(!/^https:\/\//.test(r.img)) bad.push(`${r.id}: не https картинка`);
  });
  toast(bad.length?`Знайдено проблем: ${bad.length} (${bad[0]})`:`Все чисто: ${ids.size} рецептів OK`);
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
    maxTime:$("#maxTime").value,sort:$("#sort").value,
    onlyFav:$("#onlyFav").checked,onlyPossible:$("#onlyPossible").checked}));}catch{}
}
try{
  const f=JSON.parse(localStorage.getItem(FKEY)||"{}");
  if(f.q)$("#q").value=f.q; if(f.cat)$("#cat").value=f.cat;
  if(f.diet)$("#diet").value=f.diet; if(f.maxTime)$("#maxTime").value=f.maxTime;
  if(f.sort)$("#sort").value=f.sort;
  if(f.onlyFav)$("#onlyFav").checked=true; if(f.onlyPossible)$("#onlyPossible").checked=true;
}catch{}
["q","cat","diet","maxTime","sort"].forEach(id=>{
  $("#"+id).addEventListener("change",persistFilters);
});

// PWA service worker
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}

// SEO: JSON-LD ItemList
try{
  const ld={ "@context":"https://schema.org", "@type":"ItemList",
    itemListElement: window.RECIPES.map((r,i)=>({ "@type":"ListItem", position:i+1,
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
  if(m&&window.RECIPES.some(r=>r.id===m[1])) openModal(m[1]);
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
renderChips();renderExcl();render();renderDrawer();renderRecent();renderKitchen();openDeep();
