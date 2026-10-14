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
const INGREDIENTS = ["🍅","🧀","🍖","🍗","🥓","🐟","🍤","🥚","🍚","🍝","🥔","🥕","🥦","🌽","🍄","🧄","🧅","🫘","🥑","🍋","🍓","🍌","🍫","🍯","🥛","🌶️","� olive","🧂","🍕","🥬"];
// fix olive emoji typo
INGREDIENTS[26] = "🫒";

let players = []; // {name, avatar}
let theme = null, totalTime = 0, timeLeft = 0, timerId = null;
let cookIndex = 0, dishes = [], selectedIngs = new Set();
let votes = [], voteDishIdx = 0, voterQueue = [], currentVote = 0;

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}
function goToSetup(){ showScreen('screen-setup'); renderPlayerForms(); }

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
      b.onclick=()=>{ row.querySelectorAll('.avatar').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); };
      row.appendChild(b);
    });
  }
}
function confirmPlayers(){
  const n = +document.getElementById('numPlayers').value;
  players = [];
  const usedAv = new Set();
  for(let i=0;i<n;i++){
    const name = (document.getElementById(`pname${i}`).value||`Chef ${i+1}`).trim().slice(0,14);
    const sel = document.querySelector(`#arow${i} .avatar.sel`);
    let av = sel ? sel.dataset.a : AVATARS[i%AVATARS.length];
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
  slotEl.classList.add('rolling');
  let k=0;
  const iv = setInterval(()=>{
    slotEl.textContent = items[Math.floor(Math.random()*items.length)];
    if(++k>12){ clearInterval(iv); slotEl.classList.remove('rolling'); slotEl.textContent=final; cb&&cb(); }
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
    totalTime=s; document.getElementById('timeDesc').textContent = s+' segundos para todos cozinharem!';
    updateStartBtn();
  });
}
function updateStartBtn(){
  const b=document.getElementById('btnStartCooking');
  if(theme&&totalTime){ b.disabled=false; b.textContent=`🍳 Começar a Cozinhar! (${theme.n} • ${totalTime}s)`; }
  else { b.disabled=true; b.textContent='🔒 Sorteie tema e tempo'; }
}

// ---- Cozinhar ----
let _localCookRowHTML = null;
function startCooking(){
  MODE = 'local';
  // restaura botões locais caso tenha jogado online antes
  const row = document.querySelector('#screen-cook .row');
  if(_localCookRowHTML) row.innerHTML = _localCookRowHTML;
  else _localCookRowHTML = row.innerHTML;
  cookIndex=0; dishes=players.map(p=>({...p,dish:"",ings:[]}));
  timeLeft=totalTime;
  showScreen('screen-cook');
  document.getElementById('cookTheme').textContent = theme.n;
  renderCookTurn(); startTimer();
}
function renderCookTurn(){
  const d = dishes[cookIndex];
  document.getElementById('cookTurn').textContent = `${cookIndex+1}/${dishes.length}`;
  document.getElementById('cookAvatar').textContent = d.avatar;
  document.getElementById('cookName').textContent = d.name;
  document.getElementById('dishName').value = d.dish||"";
  selectedIngs = new Set(d.ings);
  const g=document.getElementById('ingredientGrid'); g.innerHTML="";
  INGREDIENTS.forEach(ing=>{
    const b=document.createElement('button'); b.type='button';
    b.className='ing'+(selectedIngs.has(ing)?' sel':'');
    b.innerHTML=`<span class="e">${ing}</span>escolher`;
    b.onclick=()=>{
      if(selectedIngs.has(ing)) selectedIngs.delete(ing);
      else { if(selectedIngs.size>=6){ alert('Máximo 6 ingredientes!'); return; } selectedIngs.add(ing); }
      b.classList.toggle('sel'); document.getElementById('ingCount').textContent=`${selectedIngs.size}/6`;
    };
    g.appendChild(b);
  });
  document.getElementById('ingCount').textContent=`${selectedIngs.size}/6`;
  const q=document.getElementById('queue'); q.innerHTML="";
  dishes.forEach((x,i)=>{
    const c=document.createElement('span'); c.className='qchip'+(i<cookIndex?' done':'');
    c.textContent=`${x.avatar} ${x.name}${i<cookIndex?' ✅':i===cookIndex?' 👈':''}`;
    q.appendChild(c);
  });
}
function finishDish(skip){
  const name = document.getElementById('dishName').value.trim();
  if(!skip && !name){ alert('Dê um nome ao prato!'); return; }
  dishes[cookIndex].dish = skip ? (name||`${theme.n.split(' ')[1]||'Prato'} do(a) ${dishes[cookIndex].name}`) : name;
  dishes[cookIndex].ings = [...selectedIngs];
  cookIndex++;
  if(cookIndex>=dishes.length){ endCooking(); } else renderCookTurn();
}
function startTimer(){
  clearInterval(timerId);
  updateTimerUI();
  timerId=setInterval(()=>{
    timeLeft--; updateTimerUI();
    if(timeLeft<=0){ clearInterval(timerId); alert('⏰ Tempo esgotado! Vamos avaliar!'); autoFinish(); }
  },1000);
}
function updateTimerUI(){
  const m=String(Math.floor(Math.max(0,timeLeft)/60)).padStart(2,'0');
  const s=String(Math.max(0,timeLeft)%60).padStart(2,'0');
  const el=document.getElementById('timer'); el.textContent=`⏱️ ${m}:${s}`;
  el.classList.toggle('low', timeLeft<=10);
  document.getElementById('progressBar').style.width=(100*timeLeft/totalTime)+'%';
}
function autoFinish(){
  // finaliza prato atual e restantes com o que têm
  for(let i=cookIndex;i<dishes.length;i++){
    if(!dishes[i].dish) dishes[i].dish=`Prato Relâmpago de ${dishes[i].name}`;
    if(!dishes[i].ings.length) dishes[i].ings=[INGREDIENTS[Math.floor(Math.random()*INGREDIENTS.length)]];
  }
  endCooking();
}
function endCooking(){ clearInterval(timerId); startVoting(); }

// ---- Avaliação ----
function startVoting(){
  MODE = 'local';
  const btn=document.getElementById('btnNextVote');
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
  currentVote = 0;
  document.getElementById('voteCard').innerHTML =
    `<div class="dish">${dish.avatar} “${dish.dish}”</div>
     <div>por <b>${dish.name}</b> • Tema ${theme.n}</div>
     <div class="ings">${dish.ings.join(' ')}</div>`;
  document.getElementById('voterLine').textContent = `🗳️ ${dishes[voterIdx].avatar} ${dishes[voterIdx].name}, sua nota:`;
  document.getElementById('voteProgress').textContent = `Prato ${voteDishIdx+1}/${dishes.length} • voto ${votes[voteDishIdx].length+1}/${dishes.length-1}`;
  renderStars();
}
function renderStars(){
  const r=document.getElementById('starsRow'); r.innerHTML="";
  for(let i=1;i<=5;i++){
    const s=document.createElement('span'); s.textContent='⭐';
    if(i<=currentVote) s.classList.add('lit');
    s.onclick=()=>{ currentVote=i; renderStars(); };
    r.appendChild(s);
  }
}
function nextVote(){
  if(currentVote===0){ alert('Escolha de 1 a 5 estrelas!'); return; }
  votes[voteDishIdx].push(currentVote);
  voterQueue.shift();
  nextVoter();
}

// ---- Pódio ----
function avg(a){ return a.length? a.reduce((x,y)=>x+y,0)/a.length : 0; }
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
  fireConfetti();
}
function rematch(){ cookIndex=0; theme=null; totalTime=0; updateStartBtn(); showScreen('screen-draw'); }

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
renderPlayerForms();
