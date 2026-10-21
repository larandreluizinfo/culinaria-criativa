// ===== CULINÁRIA CRIATIVA =====
const AVATARS = ["👨‍🍳","👩‍🍳","🧑‍🍳","👵","🧓","🤠","🦸","🧙","🐱","🐶","🦊","🐼"];
const THEMES = [
  {n:"🍝 Massa Italiana", d:"Capriche no molho e no queijo!"},
  {n:"🍫 Sobremesa de Chocolate", d:"Quanto mais achocolatado, melhor!"},
  {n:"🥗 Lanche Saudável", d:"Leve, colorido e nutritivo."},
  {n:"🌽 Festa Junina", d:"Milho, amendoim e arraiá!"},
  {n:"🍣 Sushi Criativo", d:"Invente um sushi maluco e gostoso."},
  {n:"🌱 Prato Vegano", d:"Sem nada de origem animal!"},
  {n:"🥞 Café da Manhã", d:"Para começar o dia feliz."},
  {n:"🍕 Pizza Maluca", d:"Sabores que ninguém imaginou!"},
  {n:"🌮 Taco Mexicano", d:"Picante e divertido."},
  {n:"🎂 Bolo de Aniversário", d:"O mais festivo vence!"},
  {n:"🍲 Sopa Aconchegante", d:"Quentinha para o coração."},
  {n:"🍔 Hambúrguer Gourmet", d:"Alto, suculento e criativo."},
];
const TIMES = [30,45,60,90,120];

// Ingredientes "físicos" espalhados pela cozinha
const KITCHEN_SOURCES = [
  {id:'geladeira', label:'Geladeira', icon:'🧊', items:['🍅','🧀','🥛','🥚','🍓','🥬','🥕','🍋']},
  {id:'armario',   label:'Armário',   icon:'🚪', items:['🍝','🍚','🥔','🍄','🧄','🧅','🫘','🥑']},
  {id:'temperos',  label:'Temperos',  icon:'🧂', items:['🌶️','🫒','🧂','🍯','🍫']},
  {id:'cesto',     label:'Cesto',     icon:'🧺', items:['🍖','🍗','🥓','🐟','🍤','🌽','🥦','🍌','🍕']},
];
const INGREDIENTS = KITCHEN_SOURCES.flatMap(s=>s.items);
const ING_NAMES = {
  '🍅':'Tomate','🧀':'Queijo','🍖':'Carne','🍗':'Frango','🥓':'Bacon','🐟':'Peixe','🍤':'Camarão',
  '🥚':'Ovo','🍚':'Arroz','🍝':'Macarrão','🥔':'Batata','🥕':'Cenoura','🥦':'Brócolis','🌽':'Milho',
  '🍄':'Cogumelo','🧄':'Alho','🧅':'Cebola','🫘':'Feijão','🥑':'Abacate','🍋':'Limão','🍓':'Morango',
  '🍌':'Banana','🍫':'Chocolate','🍯':'Mel','🥛':'Leite','🌶️':'Pimenta','🫒':'Azeitona','🧂':'Sal',
  '🍕':'Pizza','🥬':'Alface'
};
const PREP_LABEL = {
  panela:'🔥 Salteado na panela',
  liquidificador:'🥤 Batido no liquidificador',
  prato:'🍽️ Montado no prato'
};
function safePrep(p){ return p && PREP_LABEL[p] ? p : null; }

let players = []; // {name, avatar}
let theme = null, totalTime = 0, timeLeft = 0, timerId = null, turnEndAt = 0;
let cookIndex = 0, dishes = [], selectedIngs = new Set();
let votes = [], voteDishIdx = 0, voterQueue = [], currentVote = 0;
let _localCookRowHTML = null;
let kitchenPrep = null, kitchenLocked = false, panPct = -13.5, panDrag = null;
let _hintTimer = null;
const PAN_MIN = -54.55; // limite do panorama (cenário com 220% da largura)
const KITCHEN_HINT = 'Arraste para olhar em volta • clique na geladeira, no armário e nos utensílios';

// ---- Utilidades ----
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}
function toast(msg){
  const el = document.getElementById('toast');
  if(!el){ alert(msg); return; }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 2600);
}
function randomIngredient(){ return INGREDIENTS[Math.floor(Math.random()*INGREDIENTS.length)]; }
function leaveGame(){ location.reload(); }
function goToSetup(){ showScreen('screen-setup'); renderPlayerForms(); }

// ---- Cozinha em primeira pessoa ----
function buildKitchenItems(){
  const map = {geladeira:'fridgeItems', armario:'cabinetItems', temperos:'temperosItems', cesto:'cestoItems'};
  KITCHEN_SOURCES.forEach(src=>{
    const box = document.getElementById(map[src.id]);
    if(!box) return;
    box.innerHTML = '';
    src.items.forEach(ing=>{
      const b = document.createElement('button');
      b.type='button'; b.className='k-item'; b.dataset.ing=ing;
      b.textContent = ing;
      b.title = ING_NAMES[ing] || ing;
      b.setAttribute('aria-label', `Pegar ${ING_NAMES[ing] || ing}`);
      b.setAttribute('aria-pressed','false');
      b.onclick = (e)=>{ e.stopPropagation(); takeIngredient(ing, b); };
      box.appendChild(b);
    });
  });
}
function takeIngredient(ing, btn){
  const res = toggleIng(ing);
  if(res==='full'){ toast('Máximo 6 ingredientes!'); return; }
  if(res==='added') flyIngredient(btn, ing);
  if(res!=='locked') syncIngredientUI();
}
function toggleIng(ing){
  if(kitchenLocked) return 'locked';
  if(selectedIngs.has(ing)){ selectedIngs.delete(ing); return 'removed'; }
  if(selectedIngs.size>=6) return 'full';
  selectedIngs.add(ing);
  return 'added';
}
function renderSimpleIngredientGrid(){
  const g = document.getElementById('ingredientGrid'); if(!g) return;
  g.innerHTML = '';
  INGREDIENTS.forEach(ing=>{
    const b = document.createElement('button'); b.type='button';
    b.className = 'ing' + (selectedIngs.has(ing) ? ' sel' : '');
    b.dataset.ing = ing;
    b.setAttribute('aria-pressed', selectedIngs.has(ing) ? 'true' : 'false');
    b.innerHTML = `<span class="e">${ing}</span>${ING_NAMES[ing] || 'escolher'}`;
    b.onclick = ()=>{
      const res = toggleIng(ing);
      if(res==='full'){ toast('Máximo 6 ingredientes!'); return; }
      if(res!=='locked') syncIngredientUI();
    };
    g.appendChild(b);
  });
}
function renderTray(){
  const tray = document.getElementById('tray'); if(!tray) return;
  const chosen = [...selectedIngs];
  tray.innerHTML = '';
  for(let i=0;i<6;i++){
    const ing = chosen[i];
    const b = document.createElement('button');
    b.type='button';
    b.className = 'k-slot' + (ing ? ' has' : '');
    if(ing){
      b.textContent = ing;
      b.title = `Remover ${ING_NAMES[ing] || ing}`;
      b.setAttribute('aria-label', b.title);
      b.onclick = ()=>{ if(toggleIng(ing)!=='locked') syncIngredientUI(); };
    } else {
      b.setAttribute('aria-hidden','true');
      b.tabIndex = -1;
    }
    tray.appendChild(b);
  }
}
function updateKitchenStations(){
  [['panela','pan','panItems'],['liquidificador','blender','blenderItems'],['prato','plates',null]].forEach(([key,id,itemsId])=>{
    const el = document.getElementById(id); if(!el) return;
    const active = kitchenPrep===key;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
    if(itemsId){
      const box = document.getElementById(itemsId);
      if(box) box.innerHTML = active ? [...selectedIngs].slice(0,4).map(i=>`<span>${i}</span>`).join('') : '';
    }
  });
  const badge = document.getElementById('prepBadge');
  if(badge){
    if(kitchenPrep){ badge.hidden = false; badge.textContent = PREP_LABEL[kitchenPrep]; }
    else { badge.hidden = true; badge.textContent = ''; }
  }
}
function syncIngredientUI(){
  document.querySelectorAll('.k-item[data-ing]').forEach(b=>{
    const on = selectedIngs.has(b.dataset.ing);
    b.classList.toggle('taken', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-disabled', on ? 'true' : 'false');
  });
  document.querySelectorAll('#ingredientGrid .ing[data-ing]').forEach(b=>{
    const on = selectedIngs.has(b.dataset.ing);
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const count = document.getElementById('ingCount'); if(count) count.textContent = `${selectedIngs.size}/6`;
  const tc = document.getElementById('trayCount'); if(tc) tc.textContent = `${selectedIngs.size}/6`;
  renderTray();
  updateKitchenStations();
}
function toggleKitchenDoor(which){
  const el = document.getElementById(which==='fridge' ? 'fridge' : 'cabinet'); if(!el) return;
  const open = el.dataset.open !== 'true';
  el.dataset.open = open ? 'true' : 'false';
  const door = el.querySelector('.k-door');
  if(door) door.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function showKitchenHint(text, autoHide){
  const el = document.getElementById('kitchenHint');
  if(!el) return;
  el.textContent = text;
  el.classList.remove('hide');
  clearTimeout(_hintTimer);
  if(autoHide) _hintTimer = setTimeout(()=>{ el.classList.add('hide'); }, 7000);
}
function setPrep(p){
  if(kitchenLocked) return;
  if(!selectedIngs.size){ toast('Escolha ingredientes primeiro!'); return; }
  kitchenPrep = kitchenPrep===p ? null : p;
  updateKitchenStations();
  showKitchenHint(kitchenPrep ? 'Boa! Agora dê um nome ao prato e finalize.' : KITCHEN_HINT, !kitchenPrep);
  if(kitchenPrep) toast(PREP_LABEL[kitchenPrep]);
}
function setKitchenLocked(locked){
  kitchenLocked = !!locked;
  const k = document.getElementById('kitchen');
  if(k) k.classList.toggle('locked', kitchenLocked);
  document.querySelectorAll('#ingredientGrid .ing').forEach(b=>{ b.disabled = kitchenLocked; });
}
function resetKitchenView(){
  kitchenPrep = null; kitchenLocked = false;
  const k = document.getElementById('kitchen');
  if(k) k.classList.remove('locked','dragging');
  document.querySelectorAll('.k-furniture[data-open]').forEach(f=>{ f.dataset.open = 'false'; });
  document.querySelectorAll('.k-door').forEach(d=>{ d.setAttribute('aria-expanded','false'); });
  document.querySelectorAll('#ingredientGrid .ing').forEach(b=>{ b.disabled = false; });
  showKitchenHint(KITCHEN_HINT, true);
  updateKitchenStations();
}
function toggleIngredientList(){
  const grid = document.getElementById('ingredientGrid');
  const label = document.getElementById('listLabel');
  const btn = document.getElementById('btnListMode');
  if(!grid) return;
  const show = grid.hasAttribute('hidden');
  if(show){
    grid.removeAttribute('hidden');
    if(label) label.removeAttribute('hidden');
    if(btn){ btn.setAttribute('aria-expanded','true'); btn.textContent = '🧾 Esconder lista'; }
  } else {
    grid.setAttribute('hidden','');
    if(label) label.setAttribute('hidden','');
    if(btn){ btn.setAttribute('aria-expanded','false'); btn.textContent = '🧾 Ver todos os ingredientes'; }
  }
}
function flyIngredient(fromEl, ing){
  if(!fromEl || !fromEl.getBoundingClientRect) return;
  const tray = document.getElementById('tray'); if(!tray) return;
  const a = fromEl.getBoundingClientRect(), t = tray.getBoundingClientRect();
  if(!a.width || !t.width) return;
  const g = document.createElement('span');
  g.className = 'k-fly'; g.textContent = ing;
  g.style.left = (a.left + a.width/2 - 16) + 'px';
  g.style.top = (a.top + a.height/2 - 16) + 'px';
  document.body.appendChild(g);
  requestAnimationFrame(()=>{
    g.style.transform = `translate(${(t.left+t.width/2)-(a.left+a.width/2)}px, ${(t.top+t.height/2)-(a.top+a.height/2)}px) scale(.6)`;
    g.style.opacity = '0';
  });
  setTimeout(()=>g.remove(), 500);
}
function applyPan(){
  const scene = document.getElementById('kitchenScene');
  if(scene) scene.style.transform = `translateX(${panPct}%)`;
}
function initKitchen(){
  buildKitchenItems();
  renderTray();
  const k = document.getElementById('kitchen'), scene = document.getElementById('kitchenScene');
  if(!k || !scene) return;
  applyPan();
  k.addEventListener('pointerdown', e=>{
    if((e.target.closest && (e.target.closest('button') || e.target.closest('.k-traybar')))) return;
    panDrag = {x:e.clientX, pan:panPct, w:scene.getBoundingClientRect().width || 1};
    if(k.setPointerCapture){ try{ k.setPointerCapture(e.pointerId); }catch(_){} }
    k.classList.add('dragging');
  });
  k.addEventListener('pointermove', e=>{
    if(!panDrag) return;
    const delta = (e.clientX - panDrag.x) / panDrag.w * 100;
    panPct = Math.max(PAN_MIN, Math.min(0, panDrag.pan + delta));
    applyPan();
  });
  const stop = ()=>{ panDrag = null; k.classList.remove('dragging'); };
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>k.addEventListener(ev, stop));
  k.addEventListener('keydown', e=>{
    if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
      panPct = Math.max(PAN_MIN, Math.min(0, panPct + (e.key==='ArrowLeft' ? 6 : -6)));
      applyPan(); e.preventDefault();
    }
  });
}

// ---- Setup ----
function renderPlayerForms(){
  const n = +document.getElementById('numPlayers').value;
  const box = document.getElementById('playerForms');
  box.innerHTML = "";
  for(let i=0;i<n;i++){
    const div = document.createElement('div');
    div.className = 'pform';
    div.innerHTML = `<b>Jogador ${i+1}</b>
      <input id="pname${i}" maxlength="14" placeholder="Nome (ex: Ana)" value="Chef ${i+1}">
      <div class="avatar-row" id="arow${i}"></div>`;
    box.appendChild(div);
    const row = div.querySelector(`#arow${i}`);
    AVATARS.forEach((a,ai)=>{
      const b = document.createElement('button');
      b.type='button'; b.className='avatar'+(ai===i%AVATARS.length?' sel':'');
      b.textContent=a; b.dataset.i=i; b.dataset.a=a;
      b.setAttribute('aria-label', `Personagem ${a}`);
      b.setAttribute('aria-pressed', ai===i%AVATARS.length ? 'true' : 'false');
      b.onclick=()=>{
        row.querySelectorAll('.avatar').forEach(x=>{ x.classList.remove('sel'); x.setAttribute('aria-pressed','false'); });
        b.classList.add('sel'); b.setAttribute('aria-pressed','true');
      };
      row.appendChild(b);
    });
  }
}
function confirmPlayers(){
  const n = +document.getElementById('numPlayers').value;
  players = [];
  for(let i=0;i<n;i++){
    const name = (document.getElementById(`pname${i}`).value||`Chef ${i+1}`).trim().slice(0,14);
    const sel = document.querySelector(`#arow${i} .avatar.sel`);
    const av = sel ? sel.dataset.a : AVATARS[i%AVATARS.length];
    players.push({name, avatar:av});
  }
  theme=null; totalTime=0; updateStartBtn();
  document.getElementById('themeSlot').textContent='❓';
  document.getElementById('timeSlot').textContent='❓';
  document.getElementById('themeDesc').textContent='';
  document.getElementById('timeDesc').textContent='';
  showScreen('screen-draw');
}

// ---- Sorteio ----
function roll(slotEl, items, final, cb){
  clearInterval(slotEl._iv);
  slotEl.classList.add('rolling');
  let k=0;
  slotEl._iv = setInterval(()=>{
    slotEl.textContent = items[Math.floor(Math.random()*items.length)];
    if(++k>12){ clearInterval(slotEl._iv); slotEl.classList.remove('rolling'); slotEl.textContent=final; cb&&cb(); }
  },90);
}
function drawTheme(){
  const t = THEMES[Math.floor(Math.random()*THEMES.length)];
  roll(document.getElementById('themeSlot'), THEMES.map(x=>x.n), t.n, ()=>{
    theme=t; document.getElementById('themeDesc').textContent=t.d; updateStartBtn();
  });
}
function drawTime(){
  const s = TIMES[Math.floor(Math.random()*TIMES.length)];
  roll(document.getElementById('timeSlot'), TIMES.map(x=>x+'s'), s+'s', ()=>{
    totalTime=s; document.getElementById('timeDesc').textContent = s+' segundos para cada prato!';
    updateStartBtn();
  });
}
function drawAll(){ drawTheme(); drawTime(); }
function updateStartBtn(){
  const b=document.getElementById('btnStartCooking');
  if(theme&&totalTime){ b.disabled=false; b.textContent=`🍳 Começar a Cozinhar! (${theme.n} • ${totalTime}s)`; }
  else { b.disabled=true; b.textContent='🔒 Sorteie tema e tempo'; }
}

// ---- Cozinhar (local: cada chef tem o tempo sorteado) ----
function startCooking(){
  MODE = 'local';
  // restaura os botões do modo local (o online troca esse trecho da tela)
  const row = document.getElementById('cookActions');
  if(!_localCookRowHTML) _localCookRowHTML = row.innerHTML;
  row.innerHTML = _localCookRowHTML;
  document.getElementById('dishName').disabled = false;
  cookIndex=0;
  dishes=players.map(p=>({...p,dish:"",ings:[],prep:null}));
  votes=[]; voteDishIdx=0; voterQueue=[]; currentVote=0;
  showScreen('screen-cook');
  document.getElementById('cookTheme').textContent = theme.n;
  startLocalTurn();
}
function startLocalTurn(){
  timeLeft = totalTime;
  renderCookTurn();
  startTimer();
}
function renderCookTurn(){
  const d = dishes[cookIndex];
  document.getElementById('cookTurn').textContent = `${cookIndex+1}/${dishes.length}`;
  document.getElementById('cookAvatar').textContent = d.avatar;
  document.getElementById('cookName').textContent = d.name;
  document.getElementById('dishName').value = d.dish||"";
  document.getElementById('dishName').disabled = false;
  selectedIngs = new Set(d.ings);
  resetKitchenView();
  renderSimpleIngredientGrid();
  syncIngredientUI();
  const q=document.getElementById('queue'); q.innerHTML="";
  dishes.forEach((x,i)=>{
    const c=document.createElement('span'); c.className='qchip'+(i<cookIndex?' done':'');
    c.textContent=`${x.avatar} ${x.name}${i<cookIndex?' ✅':i===cookIndex?' 👈':''}`;
    q.appendChild(c);
  });
}
function dishFallback(d){
  const word = (theme && theme.n.split(' ')[1]) || 'Prato';
  return `${word} do(a) ${d.name}`;
}
function finishDish(skip){
  const typed = (document.getElementById('dishName').value||'').trim();
  if(!skip && !typed){ toast('Dê um nome ao prato!'); document.getElementById('dishName').focus(); return; }
  const d = dishes[cookIndex];
  d.dish = typed || dishFallback(d);
  d.ings = [...selectedIngs].length ? [...selectedIngs] : [randomIngredient()];
  d.prep = kitchenPrep;
  advanceLocalCook();
}
function timeUpLocal(){
  const d = dishes[cookIndex];
  const typed = (document.getElementById('dishName').value||'').trim();
  d.dish = typed || `Prato Relâmpago de ${d.name}`;
  d.ings = [...selectedIngs].length ? [...selectedIngs] : [randomIngredient()];
  d.prep = kitchenPrep;
  toast(`⏰ O tempo de ${d.name} acabou!`);
  advanceLocalCook();
}
function advanceLocalCook(){
  clearInterval(timerId);
  cookIndex++;
  if(cookIndex>=dishes.length){ endCooking(); return; }
  startLocalTurn();
}
function startTimer(){
  clearInterval(timerId);
  turnEndAt = Date.now() + totalTime*1000;
  timeLeft = totalTime;
  updateTimerUI();
  timerId=setInterval(()=>{
    timeLeft = Math.max(0, Math.ceil((turnEndAt - Date.now())/1000));
    updateTimerUI();
    if(timeLeft<=0){ clearInterval(timerId); timeUpLocal(); }
  },200);
}
function updateTimerUI(){
  const total = Math.max(1, totalTime);
  const m=String(Math.floor(Math.max(0,timeLeft)/60)).padStart(2,'0');
  const s=String(Math.max(0,timeLeft)%60).padStart(2,'0');
  const el=document.getElementById('timer'); el.textContent=`⏱️ ${m}:${s}`;
  el.classList.toggle('low', timeLeft<=10);
  document.getElementById('progressBar').style.width=(100*Math.max(0,timeLeft)/total)+'%';
}
function endCooking(){ clearInterval(timerId); startVoting(); }

// ---- Avaliação ----
function startVoting(){
  MODE = 'local';
  const btn=document.getElementById('btnNextVote');
  btn.style.display=''; btn.disabled=false;
  btn.textContent='Confirmar voto →'; btn.onclick=nextVote;
  votes = dishes.map(()=>[]);
  voteDishIdx=0; showScreen('screen-vote'); setupVoteDish();
}
function setupVoteDish(){
  // votantes = todos exceto dono
  voterQueue = dishes.map((_,i)=>i).filter(i=>i!==voteDishIdx);
  nextVoter();
}
function nextVoter(){
  if(!voterQueue.length){ // próximo prato
    voteDishIdx++;
    if(voteDishIdx>=dishes.length){ showPodium(); return; }
    setupVoteDish(); return;
  }
  const voterIdx = voterQueue[0];
  const dish = dishes[voteDishIdx];
  const prep = dish.prep ? `<div class="prep-badge">${PREP_LABEL[dish.prep]}</div>` : '';
  currentVote = 0;
  document.getElementById('voteCard').innerHTML =
    `<div class="dish">${dish.avatar} “${dish.dish}”</div>
     <div>por <b>${dish.name}</b> • Tema ${theme.n}</div>
     <div class="ings">${dish.ings.join(' ')}</div>${prep}`;
  document.getElementById('voterLine').textContent = `🗳️ ${dishes[voterIdx].avatar} ${dishes[voterIdx].name}, sua nota:`;
  document.getElementById('voteProgress').textContent = `Prato ${voteDishIdx+1}/${dishes.length} • voto ${votes[voteDishIdx].length+1}/${dishes.length-1}`;
  renderStars();
}
function renderStars(){
  const r=document.getElementById('starsRow'); r.innerHTML="";
  for(let i=1;i<=5;i++){
    const s=document.createElement('span'); s.textContent='⭐';
    if(i<=currentVote) s.classList.add('lit');
    s.setAttribute('role','button');
    s.setAttribute('tabindex','0');
    s.setAttribute('aria-label', `${i} ${i===1?'estrela':'estrelas'}`);
    s.setAttribute('aria-pressed', i<=currentVote ? 'true' : 'false');
    s.onclick=()=>{ currentVote=i; renderStars(); };
    s.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); currentVote=i; renderStars(); } };
    r.appendChild(s);
  }
}
function nextVote(){
  if(currentVote===0){ toast('Escolha de 1 a 5 estrelas!'); return; }
  votes[voteDishIdx].push(currentVote);
  voterQueue.shift();
  nextVoter();
}
function handleVoteKeys(e){
  if(typeof MODE!=='undefined' && MODE==='online') return;
  const screen = document.getElementById('screen-vote');
  if(!screen || !screen.classList.contains('active')) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if(tag==='INPUT' || tag==='SELECT' || tag==='TEXTAREA') return;
  if(e.key>='1' && e.key<='5'){ currentVote=+e.key; renderStars(); }
  else if(e.key==='Enter' && tag!=='BUTTON'){ e.preventDefault(); nextVote(); }
}

// ---- Pódio ----
function avg(a){ return a.length? a.reduce((x,y)=>x+y,0)/a.length : 0; }
function renderPodiumActions(){
  const box = document.getElementById('podiumActions');
  if(!box) return;
  if(MODE==='online' && ROLE==='guest'){
    box.innerHTML = `<p class="muted">⏳ Aguardando o anfitrião iniciar a revanche...</p>
      <button class="btn ghost" onclick="leaveGame()">🚪 Sair</button>`;
  } else if(MODE==='online'){
    box.innerHTML = `<button class="btn primary" onclick="onlineRematch()">🍳 Revanche (mesmos jogadores)</button>
      <button class="btn ghost" onclick="leaveGame()">🚪 Sair</button>`;
  } else {
    box.innerHTML = `<button class="btn primary" onclick="rematch()">🍳 Revanche (mesmos jogadores)</button>
      <button class="btn ghost" onclick="location.reload()">🔄 Novo jogo</button>`;
  }
}
function showPodium(){
  showScreen('screen-podium');
  const ranked = dishes.map((d,i)=>({...d,media:avg(votes[i]),total:votes[i].reduce((x,y)=>x+y,0)}))
    .sort((a,b)=>b.media-a.media || b.total-a.total);
  document.getElementById('podiumTheme').textContent=`Tema: ${theme.n} • ${totalTime}s`;
  const medals=['🥇','🥈','🥉'];
  const pod=document.getElementById('podium'); pod.innerHTML="";
  const order=[1,0,2]; // visual 2-1-3
  order.forEach(idx=>{
    if(idx>=ranked.length) return;
    const p=ranked[idx];
    const d=document.createElement('div');
    d.className='place '+(idx===0?'p1':idx===1?'p2':'p3');
    d.innerHTML=`<span class="av">${p.avatar}</span>${medals[idx]||''}<br>${p.name}<br>“${p.dish}”<br>⭐ ${p.media.toFixed(1)}`;
    pod.appendChild(d);
  });
  const fr=document.getElementById('fullRank'); fr.innerHTML="<h3>Classificação geral</h3>";
  ranked.forEach((p,i)=>{
    const r=document.createElement('div'); r.className='rank-row';
    r.innerHTML=`<span>${i+1}º ${p.avatar} ${p.name} — “${p.dish}”</span><span>⭐ ${p.media.toFixed(1)}</span>`;
    fr.appendChild(r);
  });
  renderPodiumActions();
  fireConfetti();
}
function rematch(){
  clearInterval(timerId);
  cookIndex=0; dishes=[]; votes=[]; voteDishIdx=0; voterQueue=[]; currentVote=0;
  theme=null; totalTime=0;
  document.getElementById('themeSlot').textContent='❓';
  document.getElementById('timeSlot').textContent='❓';
  document.getElementById('themeDesc').textContent='';
  document.getElementById('timeDesc').textContent='';
  updateStartBtn();
  showScreen('screen-draw');
}

// confete simples
function fireConfetti(){
  const c=document.getElementById('confetti'), ctx=c.getContext('2d');
  c.width=innerWidth; c.height=innerHeight;
  const P=Array.from({length:150},()=>({x:Math.random()*c.width,y:-20-Math.random()*c.height*.5,r:4+Math.random()*5,c:`hsl(${Math.random()*360},90%,60%)`,v:2+Math.random()*3}));
  let f=0;
  (function anim(){
    ctx.clearRect(0,0,c.width,c.height);
    P.forEach(p=>{p.y+=p.v;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();});
    if(++f<220) requestAnimationFrame(anim); else ctx.clearRect(0,0,c.width,c.height);
  })();
}

// ---- Inicialização ----
renderPlayerForms();
initKitchen();
_localCookRowHTML = document.getElementById('cookActions').innerHTML;
document.addEventListener('keydown', handleVoteKeys);
