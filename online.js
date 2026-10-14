// ===== MODO ONLINE (PeerJS, sem servidor próprio) =====
// Um jogador é o ANFITRIÃO (host). Os outros entram com o código de 4 letras.
// Todos precisam de internet. Funciona com até 10 jogadores.
let MODE = 'local'; // 'local' | 'online'
let ROLE = null;    // 'host' | 'guest'
let peer = null, hostConn = null;
let guestConns = {}; // host: peerId -> conn
let myId = 'p' + Math.random().toString(36).slice(2, 9);
let myName = '', myAvatar = '👨‍🍳';
let roomCode = '';
let onlinePlayers = []; // {id,name,avatar}
let onlineDishes = [];  // {id,name,avatar,dish,ings}
let onlineVotes = {};   // ownerId -> [stars]
let myDish = { dish: '', ings: [] };
let myOnlineStars = {}; // ownerId -> stars (meu voto)
let hostSelAvatar = '👨‍🍳', guestSelAvatar = '👩‍🍳';

function goOnline(){
  MODE = 'online';
  showScreen('screen-online');
  buildAvatarPicker('hostAvatars', v => hostSelAvatar = v, hostSelAvatar);
  buildAvatarPicker('guestAvatars', v => guestSelAvatar = v, guestSelAvatar);
}
function buildAvatarPicker(elId, onPick, initial){
  const el = document.getElementById(elId); if(!el) return;
  el.innerHTML = '';
  let sel = initial;
  AVATARS.forEach(a=>{
    const b = document.createElement('button');
    b.type='button'; b.className='avatar'+(a===sel?' sel':''); b.textContent=a;
    b.onclick=()=>{ el.querySelectorAll('.avatar').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); onPick(a); };
    el.appendChild(b);
  });
  onPick(sel);
}
function setStatus(t){ document.getElementById('onlineStatus').textContent = t; }
function genCode(){ const L='ABCDEFGHJKMNPQRSTUVWXYZ'; let s=''; for(let i=0;i<4;i++) s+=L[Math.floor(Math.random()*L.length)]; return s; }
function peerIdFor(code){ return 'culinaria-criativa-' + code; }

// ---------- CRIAR SALA (host) ----------
function createRoom(){
  myName = (document.getElementById('hostName').value || 'Anfitrião').trim().slice(0,14);
  myAvatar = hostSelAvatar; ROLE='host'; MODE='online';
  roomCode = genCode();
  setStatus('Criando sala ' + roomCode + '...');
  peer = new Peer(peerIdFor(roomCode));
  peer.on('open', ()=>{
    onlinePlayers = [{id:myId, name:myName, avatar:myAvatar}];
    showScreen('screen-lobby');
    renderLobby();
    setStatus('');
  });
  peer.on('connection', conn=>{
    conn.on('data', d=>hostOnData(conn, d));
    conn.on('open', ()=>{ guestConns[conn.peer]=conn; });
    conn.on('close', ()=>{ delete guestConns[conn.peer]; onlinePlayers = onlinePlayers.filter(p=>p.connPeer!==conn.peer); hostBroadcastLobby(); });
  });
  peer.on('error', e=> setStatus('Erro: ' + e.type + '. Tente outro código ou recarregue.'));
}
function hostOnData(conn, d){
  if(d.t==='join'){
    if(onlinePlayers.length>=10){ conn.send({t:'error', msg:'Sala cheia (10 jogadores)!'}); return; }
    // remove duplicado
    onlinePlayers = onlinePlayers.filter(p=>p.id!==d.id);
    onlinePlayers.push({id:d.id, name:d.name, avatar:d.avatar, connPeer:conn.peer});
    guestConns[conn.peer]=conn;
    hostBroadcastLobby();
  }
  if(d.t==='dish'){
    const i = onlineDishes.findIndex(x=>x.id===d.id);
    const pl = onlinePlayers.find(p=>p.id===d.id) || {name:'?', avatar:'🍳'};
    const rec = {id:d.id, name:pl.name, avatar:pl.avatar, dish:d.dish, ings:d.ings};
    if(i>=0) onlineDishes[i]=rec; else onlineDishes.push(rec);
    hostBroadcast({t:'count', n:onlineDishes.length, total:onlinePlayers.length});
    if(onlineDishes.length>=onlinePlayers.length) hostFinishCooking();
  }
  if(d.t==='votes'){
    onlineVotes[d.voterId] = d.votes; // {ownerId:stars}
    hostBroadcast({t:'votecount', n:Object.keys(onlineVotes).length, total:onlinePlayers.length});
    if(Object.keys(onlineVotes).length>=onlinePlayers.length) hostFinishVoting();
  }
}
function hostBroadcast(msg){ Object.values(guestConns).forEach(c=>{ try{ c.open && c.send(msg); }catch(e){} }); }
function hostBroadcastLobby(){
  const clean = onlinePlayers.map(({id,name,avatar})=>({id,name,avatar}));
  hostBroadcast({t:'lobby', players:clean, code:roomCode});
  renderLobby();
}
function renderLobby(){
  document.getElementById('lobbyCode').textContent = roomCode;
  const box = document.getElementById('lobbyPlayers');
  box.innerHTML = onlinePlayers.map(p=>`<span class="qchip ${p.id===myId?'done':''}">${p.avatar} ${p.name}${p.id===myId?' (você)':''}</span>`).join('');
  const isHost = ROLE==='host';
  document.getElementById('btnDrawOnline').style.display = isHost?'':'none';
  document.getElementById('btnStartOnline').style.display = isHost?'':'none';
  document.getElementById('lobbyWait').style.display = isHost?'none':'';
  document.getElementById('lobbyDraw').style.display = (theme||totalTime)?'grid':'none';
  if(theme) { document.getElementById('themeSlotOnline').textContent = theme.n; document.getElementById('themeDescOnline').textContent = theme.d; }
  if(totalTime) { document.getElementById('timeSlotOnline').textContent = totalTime+'s'; document.getElementById('timeDescOnline').textContent = totalTime+' segundos para todos cozinharem!'; }
}
function hostDrawAll(){
  theme = THEMES[Math.floor(Math.random()*THEMES.length)];
  totalTime = TIMES[Math.floor(Math.random()*TIMES.length)];
  onlineDishes = []; onlineVotes = {};
  hostBroadcast({t:'draw', theme, totalTime});
  renderLobby();
  const b=document.getElementById('btnStartOnline');
  b.disabled=false; b.textContent=`🍳 Começar! (${theme.n} • ${totalTime}s)`;
}
function hostStartGame(){
  if(onlinePlayers.length<2){ alert('Chame mais amigos! Mínimo 2 jogadores.'); return; }
  if(!theme||!totalTime){ alert('Sorteie antes!'); return; }
  onlineDishes=[]; onlineVotes={};
  hostBroadcast({t:'start', theme, totalTime});
  startCookingOnlineHost();
}
function hostFinishCooking(){
  clearInterval(timerId);
  // garante prato de todo mundo
  onlinePlayers.forEach(p=>{
    if(!onlineDishes.find(d=>d.id===p.id)) onlineDishes.push({id:p.id,name:p.name,avatar:p.avatar,dish:`Prato Relâmpago de ${p.name}`,ings:['🍕']});
  });
  hostBroadcast({t:'dishes', dishes:onlineDishes, theme});
  startVotingOnline(onlineDishes);
}
function hostFinishVoting(){
  // calcula médias
  const agg = {}; // ownerId -> [stars]
  onlinePlayers.forEach(p=>agg[p.id]=[]);
  Object.values(onlineVotes).forEach(vmap=>{
    Object.entries(vmap).forEach(([owner,stars])=>{ if(agg[owner]) agg[owner].push(stars); });
  });
  const ranked = onlinePlayers.map(p=>{
    const arr = agg[p.id]||[]; const m = arr.length? arr.reduce((a,b)=>a+b,0)/arr.length:0;
    const dish = (onlineDishes.find(d=>d.id===p.id)||{dish:'?',ings:[]});
    return {...p, dish:dish.dish, ings:dish.ings, media:m};
  }).sort((a,b)=>b.media-a.media);
  hostBroadcast({t:'podium', ranked, theme, totalTime});
  showPodiumOnline(ranked);
}

// ---------- ENTRAR (guest) ----------
function joinRoom(){
  myName = (document.getElementById('guestName').value || 'Convidado').trim().slice(0,14);
  myAvatar = guestSelAvatar;
  roomCode = (document.getElementById('roomCodeInput').value || '').trim().toUpperCase();
  if(roomCode.length!==4){ setStatus('Digite o código de 4 letras.'); return; }
  ROLE='guest'; MODE='online';
  setStatus('Entrando na sala ' + roomCode + '...');
  peer = new Peer(); // id aleatório
  peer.on('open', ()=>{
    hostConn = peer.connect(peerIdFor(roomCode), {reliable:true});
    hostConn.on('open', ()=> hostConn.send({t:'join', id:myId, name:myName, avatar:myAvatar}));
    hostConn.on('data', guestOnData);
    hostConn.on('error', ()=> setStatus('Erro de conexão.'));
  });
  peer.on('error', e=> setStatus('Não achei a sala. Confira o código e tente de novo. ('+e.type+')'));
}
function guestOnData(d){
  if(d.t==='error'){ alert(d.msg); return; }
  if(d.t==='lobby'){ onlinePlayers = d.players; roomCode = d.code; showScreen('screen-lobby'); renderLobbyGuest(d); }
  if(d.t==='draw'){ theme=d.theme; totalTime=d.totalTime; if(document.getElementById('screen-lobby').classList.contains('active')) renderLobbyGuest({players:onlinePlayers}); }
  if(d.t==='start'){ theme=d.theme; totalTime=d.totalTime; onlineDishes=[]; onlineVotes={}; startCookingOnlineGuest(); }
  if(d.t==='count'){ const q=document.getElementById('queue'); if(q) q.innerHTML=`<span class="qchip">🍳 ${d.n}/${d.total} pratos prontos...</span>`; }
  if(d.t==='tick'){ timeLeft=d.left; updateTimerUI(); }
  if(d.t==='timeup'){ alert('⏰ Tempo esgotado!'); submitDishOnline(true); }
  if(d.t==='dishes'){ onlineDishes=d.dishes; theme=d.theme; startVotingOnline(d.dishes); }
  if(d.t==='votecount'){ document.getElementById('voteProgress').textContent = `🗳️ ${d.n}/${d.total} votaram...`; }
  if(d.t==='podium'){ showPodiumOnline(d.ranked); }
}
function renderLobbyGuest(d){
  if(d.players) onlinePlayers = d.players;
  document.getElementById('lobbyCode').textContent = roomCode;
  document.getElementById('lobbyPlayers').innerHTML = onlinePlayers.map(p=>`<span class="qchip ${p.id===myId?'done':''}">${p.avatar} ${p.name}${p.id===myId?' (você)':''}</span>`).join('');
  document.getElementById('btnDrawOnline').style.display='none';
  document.getElementById('btnStartOnline').style.display='none';
  document.getElementById('lobbyWait').style.display='';
  if(theme||totalTime){
    document.getElementById('lobbyDraw').style.display='grid';
    if(theme){ document.getElementById('themeSlotOnline').textContent=theme.n; document.getElementById('themeDescOnline').textContent=theme.d; }
    if(totalTime){ document.getElementById('timeSlotOnline').textContent=totalTime+'s'; }
  }
}

// ---------- COZINHAR ONLINE (cada um no seu aparelho) ----------
function startCookingOnlineHost(){ startCookingOnlineCommon(); startTimerOnlineHost(); }
function startCookingOnlineGuest(){ startCookingOnlineCommon(); }
function startCookingOnlineCommon(){
  timeLeft = totalTime; myDish={dish:'',ings:[]};
  showScreen('screen-cook');
  document.getElementById('cookTheme').textContent = theme.n;
  document.getElementById('cookTurn').textContent = 'online';
  document.getElementById('cookAvatar').textContent = myAvatar;
  document.getElementById('cookName').textContent = myName + ' (você)';
  document.getElementById('dishName').value='';
  selectedIngs = new Set();
  const g=document.getElementById('ingredientGrid'); g.innerHTML='';
  INGREDIENTS.forEach(ing=>{
    const b=document.createElement('button'); b.type='button'; b.className='ing';
    b.innerHTML=`<span class="e">${ing}</span>escolher`;
    b.onclick=()=>{
      if(selectedIngs.has(ing)) selectedIngs.delete(ing);
      else { if(selectedIngs.size>=6){ alert('Máximo 6 ingredientes!'); return; } selectedIngs.add(ing); }
      b.classList.toggle('sel'); document.getElementById('ingCount').textContent=`${selectedIngs.size}/6`;
    };
    g.appendChild(b);
  });
  document.getElementById('ingCount').textContent='0/6';
  document.getElementById('queue').innerHTML = `<span class="qchip">🌐 ${onlinePlayers.length} chefs cozinhando juntos...</span>`;
  // troca botões para modo online
  const row = document.querySelector('#screen-cook .row');
  row.innerHTML = `<button class="btn primary big" onclick="submitDishOnline(false)">✅ Enviar meu prato</button>`;
  updateTimerUI();
}
function startTimerOnlineHost(){
  clearInterval(timerId);
  updateTimerUI();
  timerId=setInterval(()=>{
    timeLeft--; updateTimerUI();
    hostBroadcast({t:'tick', left:timeLeft});
    if(timeLeft<=0){
      clearInterval(timerId);
      hostBroadcast({t:'timeup'});
      // host também envia o próprio prato se ainda não enviou
      submitDishOnline(true);
      setTimeout(()=>{ if(onlineDishes.length<onlinePlayers.length) hostFinishCooking(); }, 1500);
    }
  },1000);
}
function submitDishOnline(auto){
  const name = (document.getElementById('dishName')?.value || '').trim();
  if(!auto && !name){ alert('Dê um nome ao prato!'); return; }
  myDish = { dish: name || `Prato de ${myName}`, ings: [...selectedIngs].length? [...selectedIngs] : ['🍕'] };
  if(ROLE==='host'){
    const i = onlineDishes.findIndex(x=>x.id===myId);
    const rec={id:myId,name:myName,avatar:myAvatar,...myDish};
    if(i>=0) onlineDishes[i]=rec; else onlineDishes.push(rec);
    document.getElementById('queue').innerHTML=`<span class="qchip done">✅ Prato enviado! Aguardando outros... (${onlineDishes.length}/${onlinePlayers.length})</span>`;
    if(onlineDishes.length>=onlinePlayers.length) hostFinishCooking();
  } else {
    hostConn.send({t:'dish', id:myId, ...myDish});
    document.getElementById('queue').innerHTML=`<span class="qchip done">✅ Prato enviado! Aguardando outros...</span>`;
  }
}

// ---------- VOTAR ONLINE ----------
function startVotingOnline(dishesList){
  onlineDishes = dishesList; myOnlineStars={}; currentVote=0;
  showScreen('screen-vote');
  const others = dishesList.filter(d=>d.id!==myId);
  if(!others.length){ document.getElementById('voteCard').innerHTML='Só você na sala?'; return; }
  let html = `<p>Dê <b>1 a 5 estrelas</b> para cada prato (menos o seu):</p>`;
  others.forEach(d=>{
    html += `<div class="vote-card" data-owner="${d.id}">
      <div class="dish">${d.avatar} “${d.dish}”</div>
      <div>por <b>${d.name}</b></div><div class="ings">${(d.ings||[]).join(' ')}</div>
      <div class="stars mini" data-mini="${d.id}">
        ${[1,2,3,4,5].map(i=>`<span data-v="${i}" data-o="${d.id}">⭐</span>`).join('')}
      </div></div>`;
  });
  document.getElementById('voteCard').innerHTML = html;
  document.getElementById('voterLine').textContent = `🗳️ ${myAvatar} ${myName} votando...`;
  document.getElementById('voteProgress').textContent = '';
  document.querySelectorAll('#voteCard .stars.mini span').forEach(s=>{
    s.style.filter='grayscale(1)';
    s.onclick=()=>{
      const o=s.dataset.o, v=+s.dataset.v;
      myOnlineStars[o]=v;
      document.querySelectorAll(`[data-mini="${o}"] span`).forEach(x=>{
        x.style.filter = (+x.dataset.v<=v)?'none':'grayscale(1)';
      });
    };
  });
  document.getElementById('starsRow').innerHTML='';
  const btn=document.getElementById('btnNextVote');
  btn.textContent='Enviar meus votos →';
  btn.onclick=submitVotesOnline;
}
function submitVotesOnline(){
  const others = onlineDishes.filter(d=>d.id!==myId);
  for(const o of others){ if(!myOnlineStars[o.id]){ alert(`Faltou avaliar “${o.dish}”!`); return; } }
  if(ROLE==='host'){
    onlineVotes[myId]= {...myOnlineStars};
    if(Object.keys(onlineVotes).length>=onlinePlayers.length) hostFinishVoting();
    else document.getElementById('voteProgress').textContent=`✅ Voto enviado! Aguardando outros... (${Object.keys(onlineVotes).length}/${onlinePlayers.length})`;
  } else {
    hostConn.send({t:'votes', voterId:myId, votes:{...myOnlineStars}});
    document.getElementById('voteProgress').textContent='✅ Voto enviado! Aguardando outros...';
  }
}

// ---------- PÓDIO ONLINE ----------
function showPodiumOnline(ranked){
  showScreen('screen-podium');
  document.getElementById('podiumTheme').textContent=`Tema: ${(theme&&theme.n)||''} • Online com ${ranked.length} chefs`;
  const medals=['🥇','🥈','🥉'];
  const pod=document.getElementById('podium'); pod.innerHTML='';
  [1,0,2].forEach(idx=>{
    if(idx>=ranked.length) return;
    const p=ranked[idx];
    const d=document.createElement('div');
    d.className='place '+(idx===0?'p1':idx===1?'p2':'p3');
    d.innerHTML=`<span class="av">${p.avatar}</span>${medals[idx]||''}<br>${p.name}${p.id===myId?' (você)':''}<br>“${p.dish}”<br>⭐ ${(p.media||0).toFixed(1)}`;
    pod.appendChild(d);
  });
  const fr=document.getElementById('fullRank'); fr.innerHTML='<h3>Classificação geral</h3>';
  ranked.forEach((p,i)=>{
    const r=document.createElement('div'); r.className='rank-row';
    r.innerHTML=`<span>${i+1}º ${p.avatar} ${p.name} — “${p.dish}”</span><span>⭐ ${(p.media||0).toFixed(1)}</span>`;
    fr.appendChild(r);
  });
  fireConfetti();
}
