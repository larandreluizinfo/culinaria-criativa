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
let onlinePlayers = []; // {id,name,avatar,connPeer?}
let onlineDishes = [];  // {id,name,avatar,dish,ings}
let onlineVotes = {};   // voterId -> {ownerId: stars}
let myDish = { dish: '', ings: [] };
let myOnlineStars = {}; // ownerId -> stars (meu voto)
let hostSelAvatar = '👨‍🍳', guestSelAvatar = '👩‍🍳';
let gamePhase = 'lobby'; // lobby | cook | vote | podium
let dishSubmitted = false;
let myVotesSent = false;
let connecting = false;
let hostTry = 3;
let guestClockBase = { left: 0, at: 0 };

const PEER_ERRORS = {
  'peer-unavailable': 'Sala não encontrada. Confira o código.',
  'network': 'Sem conexão. Verifique sua internet.',
  'server-error': 'Servidor de conexão indisponível. Tente de novo.',
  'unavailable-id': 'Esse código de sala já está em uso.',
  'browser-incompatible': 'Seu navegador não suporta o modo online.',
  'ssl-unavailable': 'Conexão segura indisponível nesta rede.'
};
function peerErrorMsg(type){ return PEER_ERRORS[type] || ('Erro de conexão (' + type + ').'); }

function goOnline(){
  MODE = 'online';
  setStatus('');
  showScreen('screen-online');
  buildAvatarPicker('hostAvatars', v => hostSelAvatar = v, hostSelAvatar);
  buildAvatarPicker('guestAvatars', v => guestSelAvatar = v, guestSelAvatar);
}
function buildAvatarPicker(elId, onPick, initial){
  const el = document.getElementById(elId); if(!el) return;
  el.innerHTML = '';
  AVATARS.forEach(a=>{
    const b = document.createElement('button');
    b.type='button'; b.className='avatar'+(a===initial?' sel':''); b.textContent=a;
    b.setAttribute('aria-label', `Personagem ${a}`);
    b.setAttribute('aria-pressed', a===initial ? 'true' : 'false');
    b.onclick=()=>{
      el.querySelectorAll('.avatar').forEach(x=>{ x.classList.remove('sel'); x.setAttribute('aria-pressed','false'); });
      b.classList.add('sel'); b.setAttribute('aria-pressed','true');
      onPick(a);
    };
    el.appendChild(b);
  });
  onPick(initial);
}
function setStatus(t){ const el = document.getElementById('onlineStatus'); if(el) el.textContent = t; }
function genCode(){ const L='ABCDEFGHJKMNPQRSTUVWXYZ'; let s=''; for(let i=0;i<4;i++) s+=L[Math.floor(Math.random()*L.length)]; return s; }
function peerIdFor(code){ return 'culinaria-criativa-' + code; }
function cleanupPeer(){
  const conns = Object.values(guestConns);
  guestConns = {};
  conns.forEach(c=>{ try{ c.close(); }catch(e){} });
  if(hostConn){ const c = hostConn; hostConn = null; try{ c.close(); }catch(e){} }
  if(peer){ const p = peer; peer = null; try{ p.destroy(); }catch(e){} }
}
function updateLobbyCount(){
  const el = document.getElementById('lobbyCount');
  if(el) el.textContent = `${onlinePlayers.length}/10 chefs na sala`;
}

// ---------- CRIAR SALA (host) ----------
function createRoom(){
  if(connecting) return;
  myName = (document.getElementById('hostName').value || 'Anfitrião').trim().slice(0,14);
  myAvatar = hostSelAvatar; ROLE='host'; MODE='online';
  cleanupPeer();
  connecting = true;
  gamePhase = 'lobby';
  onlinePlayers = []; onlineDishes = []; onlineVotes = {};
  theme = null; totalTime = 0;
  roomCode = genCode();
  hostTry = 3;
  openHostPeer();
}
function openHostPeer(){
  setStatus('Criando sala ' + roomCode + '...');
  peer = new Peer(peerIdFor(roomCode));
  peer.on('open', ()=>{
    connecting = false; hostTry = 3;
    onlinePlayers = [{id:myId, name:myName, avatar:myAvatar}];
    onlineDishes = []; onlineVotes = {}; myOnlineStars = {}; myDish = {dish:'',ings:[]};
    theme = null; totalTime = 0; gamePhase = 'lobby';
    showScreen('screen-lobby');
    renderLobby();
    setStatus('');
  });
  peer.on('connection', conn=>{
    conn.on('data', d=>hostOnData(conn, d));
    conn.on('open', ()=>{ guestConns[conn.peer]=conn; });
    conn.on('close', ()=>{
      if(!guestConns[conn.peer]) return; // conexão já tratada/encerrada
      delete guestConns[conn.peer];
      const gone = onlinePlayers.find(p=>p.connPeer===conn.peer);
      onlinePlayers = onlinePlayers.filter(p=>p.connPeer!==conn.peer);
      if(gone) hostPlayerLeft(gone);
    });
  });
  peer.on('disconnected', ()=>{ try{ peer.reconnect(); }catch(e){} });
  peer.on('error', e=>{
    // código já em uso: sorteia outro e tenta de novo
    if(e.type==='unavailable-id' && hostTry>1){
      hostTry--;
      const old = peer; peer = null;
      try{ old.destroy(); }catch(_){}
      roomCode = genCode();
      openHostPeer();
      return;
    }
    connecting = false;
    setStatus(peerErrorMsg(e.type));
  });
}
function hostPlayerLeft(gone){
  toast(`👋 ${gone.name} saiu da sala.`);
  hostBroadcast({t:'left', name:gone.name});
  hostBroadcastLobby();
  if(gamePhase==='cook' || gamePhase==='vote'){
    if(onlinePlayers.length<2){
      clearInterval(timerId);
      gamePhase='lobby';
      showScreen('screen-lobby');
      renderLobby();
      toast('😢 Faltou gente! Convide mais chefs para jogar.');
      return;
    }
  }
  if(gamePhase==='cook'){
    onlineDishes = onlineDishes.filter(d=>onlinePlayers.some(p=>p.id===d.id));
    hostBroadcast({t:'count', n:onlineDishes.length, total:onlinePlayers.length});
    if(onlineDishes.length>=onlinePlayers.length) hostFinishCooking();
  } else if(gamePhase==='vote'){
    delete onlineVotes[gone.id];
    hostBroadcast({t:'votecount', n:Object.keys(onlineVotes).length, total:onlinePlayers.length});
    if(Object.keys(onlineVotes).length>=onlinePlayers.length) hostFinishVoting();
  }
}
function hostOnData(conn, d){
  if(d.t==='join'){
    if(gamePhase!=='lobby'){
      try{ conn.send({t:'error', msg:'A partida já começou. Peça outra sala.'}); }catch(e){}
      setTimeout(()=>{ try{ conn.close(); }catch(e){} }, 500);
      return;
    }
    if(onlinePlayers.length>=10){
      try{ conn.send({t:'error', msg:'Sala cheia (10 jogadores)!'}); }catch(e){}
      setTimeout(()=>{ try{ conn.close(); }catch(e){} }, 500);
      return;
    }
    onlinePlayers = onlinePlayers.filter(p=>p.id!==d.id && p.connPeer!==conn.peer);
    onlinePlayers.push({
      id: String(d.id||conn.peer).slice(0,20),
      name: String(d.name||'Chef').trim().slice(0,14) || 'Chef',
      avatar: d.avatar || '🧑‍🍳',
      connPeer: conn.peer
    });
    guestConns[conn.peer]=conn;
    hostBroadcastLobby();
    return;
  }
  if(gamePhase==='cook' && d.t==='dish'){
    const pl = onlinePlayers.find(p=>p.id===d.id) || {name:'?', avatar:'🍳'};
    const rec = {
      id:d.id, name:pl.name, avatar:pl.avatar,
      dish:String(d.dish||'Prato misterioso').slice(0,40),
      ings: Array.isArray(d.ings) ? d.ings.slice(0,6) : []
    };
    const i = onlineDishes.findIndex(x=>x.id===d.id);
    if(i>=0) onlineDishes[i]=rec; else onlineDishes.push(rec);
    hostBroadcast({t:'count', n:onlineDishes.length, total:onlinePlayers.length});
    if(onlineDishes.length>=onlinePlayers.length) hostFinishCooking();
    return;
  }
  if(gamePhase==='vote' && d.t==='votes'){
    const clean = {};
    if(d.votes && typeof d.votes==='object'){
      Object.entries(d.votes).forEach(([owner,stars])=>{
        const s = +stars;
        if(s>=1 && s<=5) clean[owner] = s;
      });
    }
    onlineVotes[d.voterId] = clean;
    hostBroadcast({t:'votecount', n:Object.keys(onlineVotes).length, total:onlinePlayers.length});
    if(Object.keys(onlineVotes).length>=onlinePlayers.length) hostFinishVoting();
  }
}
function hostBroadcast(msg){
  Object.values(guestConns).forEach(c=>{
    try{ if(c.open) c.send(msg); }catch(e){}
  });
}
function hostBroadcastLobby(){
  const clean = onlinePlayers.map(({id,name,avatar})=>({id,name,avatar}));
  hostBroadcast({t:'lobby', players:clean, code:roomCode, theme, totalTime});
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
  document.getElementById('themeSlotOnline').textContent = theme ? theme.n : '❓';
  document.getElementById('themeDescOnline').textContent = theme ? theme.d : '';
  document.getElementById('timeSlotOnline').textContent = totalTime ? totalTime+'s' : '❓';
  document.getElementById('timeDescOnline').textContent = totalTime ? totalTime+' segundos para cada prato!' : '';
  updateLobbyCount();
}
function hostDrawAll(){
  theme = THEMES[Math.floor(Math.random()*THEMES.length)];
  totalTime = TIMES[Math.floor(Math.random()*TIMES.length)];
  onlineDishes = []; onlineVotes = {};
  myOnlineStars = {}; myVotesSent = false; dishSubmitted = false; myDish = {dish:'',ings:[]};
  gamePhase = 'lobby';
  hostBroadcast({t:'draw', theme, totalTime});
  hostBroadcastLobby();
  renderLobby();
  const b=document.getElementById('btnStartOnline');
  b.disabled=false; b.textContent=`🍳 Começar! (${theme.n} • ${totalTime}s)`;
}
function hostStartGame(){
  if(onlinePlayers.length<2){ toast('Chame mais amigos! Mínimo 2 jogadores.'); return; }
  if(!theme||!totalTime){ toast('Sorteie antes!'); return; }
  onlineDishes=[]; onlineVotes={}; myOnlineStars={}; myVotesSent=false;
  dishSubmitted=false; myDish={dish:'',ings:[]};
  gamePhase='cook';
  hostBroadcast({t:'start', theme, totalTime});
  startCookingOnlineHost();
}
function hostFinishCooking(){
  if(gamePhase!=='cook') return;
  gamePhase='vote';
  clearInterval(timerId);
  // garante prato de todo mundo que ficou na sala
  onlinePlayers.forEach(p=>{
    if(!onlineDishes.find(d=>d.id===p.id)) onlineDishes.push({id:p.id,name:p.name,avatar:p.avatar,dish:`Prato Relâmpago de ${p.name}`,ings:['🍕']});
  });
  hostBroadcast({t:'dishes', dishes:onlineDishes, theme});
  startVotingOnline(onlineDishes);
}
function hostFinishVoting(){
  if(gamePhase!=='vote') return;
  gamePhase='podium';
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
  }).sort((a,b)=>b.media-a.media || (a.name>b.name?1:-1));
  hostBroadcast({t:'podium', ranked, theme, totalTime});
  showPodiumOnline(ranked);
}
function onlineRematch(){
  if(ROLE!=='host') return;
  if(gamePhase!=='podium') return;
  onlineDishes=[]; onlineVotes={}; myOnlineStars={}; myVotesSent=false;
  dishSubmitted=false; myDish={dish:'',ings:[]};
  theme=null; totalTime=0;
  hostDrawAll();
  showScreen('screen-lobby');
  renderLobby();
  toast('🎲 Novo tema e tempo sorteados!');
}

// ---------- ENTRAR (guest) ----------
function joinRoom(){
  if(connecting) return;
  myName = (document.getElementById('guestName').value || 'Convidado').trim().slice(0,14);
  myAvatar = guestSelAvatar;
  roomCode = (document.getElementById('roomCodeInput').value || '').trim().toUpperCase();
  if(roomCode.length!==4){ setStatus('Digite o código de 4 letras.'); document.getElementById('roomCodeInput').focus(); return; }
  ROLE='guest'; MODE='online'; gamePhase='lobby';
  cleanupPeer();
  connecting = true;
  setStatus('Entrando na sala ' + roomCode + '...');
  peer = new Peer(); // id aleatório
  peer.on('open', ()=>{
    const conn = peer.connect(peerIdFor(roomCode), {reliable:true});
    hostConn = conn;
    conn.on('open', ()=>{
      connecting = false;
      setStatus('Conectado! Entrando...');
      try{ conn.send({t:'join', id:myId, name:myName, avatar:myAvatar}); }catch(e){}
    });
    conn.on('data', guestOnData);
    conn.on('close', ()=>{
      if(hostConn!==conn) return;
      connecting = false;
      if(MODE!=='online') return;
      toast('O anfitrião encerrou a sala.');
      setTimeout(()=>{ if(MODE==='online' && ROLE==='guest'){ showScreen('screen-online'); setStatus('Sala encerrada.'); } }, 1200);
    });
    conn.on('error', ()=>{ connecting=false; setStatus('Erro de conexão. Tente de novo.'); });
  });
  peer.on('error', e=>{
    connecting = false;
    setStatus(peerErrorMsg(e.type) + ' Confira o código e tente de novo.');
  });
  // não deixa a tela travada em "Entrando..." para sempre
  setTimeout(()=>{
    if(connecting){ connecting=false; setStatus('Não deu para conectar. Confira o código e tente de novo.'); }
  }, 15000);
}
function guestOnData(d){
  if(d.t==='error'){ toast(d.msg); return; }
  if(d.t==='lobby'){
    onlinePlayers = d.players || [];
    roomCode = d.code || roomCode;
    if(d.theme) theme = d.theme;
    if(d.totalTime) totalTime = d.totalTime;
    // durante a partida só atualiza os dados, sem puxar o jogador para o lobby
    if(gamePhase==='lobby') showScreen('screen-lobby');
    renderLobbyGuest();
    return;
  }
  if(d.t==='draw'){
    theme = d.theme; totalTime = d.totalTime; gamePhase='lobby';
    showScreen('screen-lobby');
    renderLobbyGuest();
    return;
  }
  if(d.t==='start'){
    theme=d.theme; totalTime=d.totalTime;
    onlineDishes=[]; onlineVotes={}; myOnlineStars={}; myVotesSent=false;
    dishSubmitted=false; myDish={dish:'',ings:[]};
    startCookingOnlineGuest();
    return;
  }
  if(d.t==='count'){ const q=document.getElementById('queue'); if(q) q.innerHTML=`<span class="qchip">🍳 ${d.n}/${d.total} pratos prontos...</span>`; return; }
  if(d.t==='tick'){ timeLeft = d.left; guestClockBase={left:d.left, at:Date.now()}; updateTimerUI(); return; }
  if(d.t==='timeup'){ toast('⏰ Tempo esgotado!'); clearInterval(timerId); submitDishOnline(true); return; }
  if(d.t==='left'){ toast(`👋 ${d.name} saiu da sala.`); return; }
  if(d.t==='dishes'){ onlineDishes=d.dishes; theme=d.theme; startVotingOnline(d.dishes); return; }
  if(d.t==='votecount'){ document.getElementById('voteProgress').textContent = `🗳️ ${d.n}/${d.total} votaram...`; return; }
  if(d.t==='podium'){ showPodiumOnline(d.ranked); }
}
function renderLobbyGuest(){
  document.getElementById('lobbyCode').textContent = roomCode;
  document.getElementById('lobbyPlayers').innerHTML = onlinePlayers.map(p=>`<span class="qchip ${p.id===myId?'done':''}">${p.avatar} ${p.name}${p.id===myId?' (você)':''}</span>`).join('');
  document.getElementById('btnDrawOnline').style.display='none';
  document.getElementById('btnStartOnline').style.display='none';
  document.getElementById('lobbyWait').style.display='';
  const showDraw = !!(theme||totalTime);
  document.getElementById('lobbyDraw').style.display = showDraw ? 'grid' : 'none';
  document.getElementById('themeSlotOnline').textContent = theme ? theme.n : '❓';
  document.getElementById('themeDescOnline').textContent = theme ? theme.d : '';
  document.getElementById('timeSlotOnline').textContent = totalTime ? totalTime+'s' : '❓';
  document.getElementById('timeDescOnline').textContent = totalTime ? totalTime+' segundos para cada prato!' : '';
  updateLobbyCount();
}

// ---------- COZINHAR ONLINE (cada um no seu aparelho) ----------
function startCookingOnlineHost(){ startCookingOnlineCommon(); startTimerOnlineHost(); }
function startCookingOnlineGuest(){ startCookingOnlineCommon(); startGuestClock(); }
function startCookingOnlineCommon(){
  gamePhase='cook';
  dishSubmitted=false; myVotesSent=false;
  timeLeft = totalTime; myDish={dish:'',ings:[]};
  showScreen('screen-cook');
  document.getElementById('cookTheme').textContent = theme.n;
  document.getElementById('cookTurn').textContent = 'online';
  document.getElementById('cookAvatar').textContent = myAvatar;
  document.getElementById('cookName').textContent = myName + ' (você)';
  const nameEl = document.getElementById('dishName');
  nameEl.value=''; nameEl.disabled=false;
  selectedIngs = new Set();
  const g=document.getElementById('ingredientGrid'); g.innerHTML='';
  INGREDIENTS.forEach(ing=>{
    const b=document.createElement('button'); b.type='button'; b.className='ing';
    b.setAttribute('aria-pressed','false');
    b.innerHTML=`<span class="e">${ing}</span>escolher`;
    b.onclick=()=>{
      if(selectedIngs.has(ing)) selectedIngs.delete(ing);
      else { if(selectedIngs.size>=6){ toast('Máximo 6 ingredientes!'); return; } selectedIngs.add(ing); }
      b.classList.toggle('sel');
      b.setAttribute('aria-pressed', selectedIngs.has(ing)?'true':'false');
      document.getElementById('ingCount').textContent=`${selectedIngs.size}/6`;
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
function setCookLocked(locked){
  const nameEl = document.getElementById('dishName');
  if(nameEl) nameEl.disabled = locked;
  document.querySelectorAll('#ingredientGrid .ing').forEach(b=>{ b.disabled = locked; });
  const btn = document.querySelector('#screen-cook .row .btn');
  if(btn){ btn.disabled = locked; btn.textContent = locked ? '✅ Prato enviado' : '✅ Enviar meu prato'; }
}
function startTimerOnlineHost(){
  clearInterval(timerId);
  const endAt = Date.now() + totalTime*1000;
  timeLeft = totalTime;
  let sent = -1;
  updateTimerUI();
  timerId=setInterval(()=>{
    timeLeft = Math.max(0, Math.ceil((endAt-Date.now())/1000));
    updateTimerUI();
    if(timeLeft!==sent){ sent=timeLeft; hostBroadcast({t:'tick', left:timeLeft}); }
    if(timeLeft<=0){
      clearInterval(timerId);
      hostBroadcast({t:'timeup'});
      submitDishOnline(true);
      setTimeout(()=>{ if(gamePhase==='cook') hostFinishCooking(); }, 1500);
    }
  },250);
}
function startGuestClock(){
  clearInterval(timerId);
  guestClockBase = { left: timeLeft, at: Date.now() };
  timerId = setInterval(()=>{
    const elapsed = (Date.now()-guestClockBase.at)/1000;
    timeLeft = Math.max(0, Math.ceil(guestClockBase.left - elapsed));
    updateTimerUI();
  },250);
}
function submitDishOnline(auto){
  if(dishSubmitted) return;
  const name = (document.getElementById('dishName')?.value || '').trim();
  if(!auto && !name){ toast('Dê um nome ao prato!'); document.getElementById('dishName').focus(); return; }
  dishSubmitted = true;
  myDish = { dish: name || `Prato de ${myName}`, ings: [...selectedIngs].length? [...selectedIngs] : [randomIngredient()] };
  if(ROLE==='host'){
    const i = onlineDishes.findIndex(x=>x.id===myId);
    const rec={id:myId,name:myName,avatar:myAvatar,...myDish};
    if(i>=0) onlineDishes[i]=rec; else onlineDishes.push(rec);
    document.getElementById('queue').innerHTML=`<span class="qchip done">✅ Prato enviado! (${onlineDishes.length}/${onlinePlayers.length})</span>`;
    if(onlineDishes.length>=onlinePlayers.length) hostFinishCooking();
  } else {
    try{ hostConn.send({t:'dish', id:myId, ...myDish}); }catch(e){}
    document.getElementById('queue').innerHTML=`<span class="qchip done">✅ Prato enviado! Aguardando outros...</span>`;
  }
  setCookLocked(true);
}

// ---------- VOTAR ONLINE ----------
function startVotingOnline(dishesList){
  gamePhase='vote';
  clearInterval(timerId);
  onlineDishes = dishesList; myOnlineStars={}; currentVote=0; myVotesSent=false;
  showScreen('screen-vote');
  const others = dishesList.filter(d=>d.id!==myId);
  const btn=document.getElementById('btnNextVote');
  document.getElementById('starsRow').innerHTML='';
  document.getElementById('voteProgress').textContent='';
  if(!others.length){
    document.getElementById('voteCard').innerHTML='<p>Só você na sala? Convide mais chefs!</p>';
    document.getElementById('voterLine').textContent='';
    btn.style.display='none';
    btn.onclick=null;
    return;
  }
  let html = `<p>Dê <b>1 a 5 estrelas</b> para cada prato (menos o seu):</p>`;
  others.forEach(d=>{
    html += `<div class="vote-card" data-owner="${d.id}">
      <div class="dish">${d.avatar} “${d.dish}”</div>
      <div>por <b>${d.name}</b></div><div class="ings">${(d.ings||[]).join(' ')}</div>
      <div class="stars mini" data-mini="${d.id}">
        ${[1,2,3,4,5].map(i=>`<span data-v="${i}" data-o="${d.id}" role="button" tabindex="0" aria-label="${i} ${i===1?'estrela':'estrelas'}" aria-pressed="false">⭐</span>`).join('')}
      </div></div>`;
  });
  document.getElementById('voteCard').innerHTML = html;
  document.getElementById('voterLine').textContent = `🗳️ ${myAvatar} ${myName} votando...`;
  btn.style.display=''; btn.disabled=false;
  document.querySelectorAll('#voteCard .stars.mini span').forEach(s=>{
    s.style.filter='grayscale(1)';
    const choose=()=>{
      const o=s.dataset.o, v=+s.dataset.v;
      myOnlineStars[o]=v;
      document.querySelectorAll(`[data-mini="${o}"] span`).forEach(x=>{
        const on = (+x.dataset.v<=v);
        x.style.filter = on?'none':'grayscale(1)';
        x.setAttribute('aria-pressed', on?'true':'false');
      });
    };
    s.onclick=choose;
    s.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); choose(); } };
  });
  btn.textContent='Enviar meus votos →';
  btn.onclick=submitVotesOnline;
}
function submitVotesOnline(){
  if(myVotesSent){ toast('Você já votou!'); return; }
  const others = onlineDishes.filter(d=>d.id!==myId);
  for(const o of others){ if(!myOnlineStars[o.id]){ toast(`Faltou avaliar “${o.dish}”!`); return; } }
  myVotesSent = true;
  const btn=document.getElementById('btnNextVote');
  if(btn){ btn.disabled=true; btn.textContent='✅ Votos enviados'; }
  if(ROLE==='host'){
    onlineVotes[myId]= {...myOnlineStars};
    if(Object.keys(onlineVotes).length>=onlinePlayers.length) hostFinishVoting();
    else document.getElementById('voteProgress').textContent=`✅ Voto enviado! Aguardando outros... (${Object.keys(onlineVotes).length}/${onlinePlayers.length})`;
  } else {
    try{ hostConn.send({t:'votes', voterId:myId, votes:{...myOnlineStars}}); }catch(e){}
    document.getElementById('voteProgress').textContent='✅ Voto enviado! Aguardando outros...';
  }
}

// ---------- PÓDIO ONLINE ----------
function showPodiumOnline(ranked){
  MODE='online'; gamePhase='podium';
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
  renderPodiumActions();
  fireConfetti();
}

// ---------- ENTRADA DE DADOS ----------
(function initOnlineInputs(){
  const hostName = document.getElementById('hostName');
  const guestName = document.getElementById('guestName');
  const codeInput = document.getElementById('roomCodeInput');
  if(hostName) hostName.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); createRoom(); } });
  if(guestName) guestName.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); joinRoom(); } });
  if(codeInput){
    codeInput.addEventListener('input', ()=>{
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4);
    });
    codeInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); joinRoom(); } });
  }
})();
