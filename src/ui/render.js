import { VIEWED_TIMELINE_KEY, WIN_SCORE } from '../config.js';
import { cardId, esc, lockedCount, pendingCount, setText, timelineOf } from '../utils/helpers.js';
import { timelineWithProposal } from '../modes/timeline-mode.js';
import { readToken, validToken } from '../spotify/spotify-api.js';
import { renderPlayerStrip } from './player-ui.js';
import { refreshSavedPlaylistSelect } from './playlist-ui.js';
import { renderFinishedResultsScene } from './result-ui.js';

export function createRenderer(ctx){
  const {
    els,
    uiState,
    getRoomData,
    getPlayer,
    getDb,
    redirectUri,
    activePlayer,
    activePlayersFrom,
    cardVisibilityClass,
    coverForCard,
    currentCard,
    isMeActive,
    isWrongRevealActive,
    playCurrentSpotify,
    playerRgb,
    proposedIndex,
    setProposedIndex,
    spotifyProfileCache
  } = ctx;

  function render(){
    setText(els.redirectUriText, redirectUri());
    els.playerNameInput.value = getPlayer().name;
    refreshPlaylistsFromRoom();
    applyGameModeClasses();
    renderTurn(); renderPlayers();
    if(getRoomData()?.game?.status === 'finished') renderFinishedResults();
    else { renderCurrentCard(); renderActiveTimeline(); renderOwnTimeline(); }
    renderProfile(); renderBoards(); updateButtons(); handleAutoplay(); scheduleWrongRevealAdvance();
  }
  function applyGameModeClasses(){
    const status = getRoomData()?.game?.status || 'lobby';
    document.body.classList.toggle('waitingMode', status !== 'playing' && status !== 'finished');
    document.body.classList.toggle('finishedMode', status === 'finished');
    document.body.classList.toggle('playingMode', status === 'playing');
  }
  function refreshPlaylistsFromRoom(){
    refreshSavedPlaylistSelect(els.savedPlaylistSelect, getRoomData());
  }
  function handleAutoplay(){
    const card = currentCard();
    if(!card || isWrongRevealActive()) return;
    if(!els.autoPlaySpotifyToggle?.checked) return;
    const id = card.drawId || cardId(card);
    if(id === uiState.lastAutoplayCardId) return;
    uiState.lastAutoplayCardId = id;
    playCurrentSpotify(false);
  }
  function scheduleWrongRevealAdvance(){
    const wr = getRoomData()?.game?.wrongReveal;
    if(uiState.wrongRevealTimeout){ clearTimeout(uiState.wrongRevealTimeout); uiState.wrongRevealTimeout = null; }
    if(!wr || !wr.until) return;
    const ms = Number(wr.until) - Date.now();
    if(ms > 0){ uiState.wrongRevealTimeout = setTimeout(()=>render(), ms + 80); }
  }

  function renderTurn(){
    const game=getRoomData().game||{}, ap=activePlayer();
    if(game.status==='finished'){
      const w=getRoomData().players?.[game.winnerId]; setText(els.turnTitle,(w?.name||'En spelare')+' vann'); setText(els.turnSub,'Slutresultat och tidslinjer visas nedan.'); return;
    }
    if(game.status==='playing'){
      setText(els.turnTitle,'');
      setText(els.turnSub,'');
    }else{ setText(els.turnTitle,'VÃ¤ntar pÃ¥ att spelet ska starta'); setText(els.turnSub,''); }
  }
  function renderPlayers(){
    uiState.viewedTimelinePlayerId = renderPlayerStrip({
      playerStrip:els.playerStrip,
      players:activePlayersFrom(getRoomData().players || {}),
      roomData:getRoomData(),
      viewedTimelinePlayerId:uiState.viewedTimelinePlayerId,
      fallbackPlayerId:getPlayer().id,
      playerRgb,
      onSelectPlayer:(id)=>{ uiState.viewedTimelinePlayerId=id; renderPlayers(); renderOwnTimeline(); }
    });
  }

  function bindCardPointerDrag(cardEl, card){
    let offsetX=0,offsetY=0,dragging=false,lastX=0,rot=0,original={}, placeholder=null;
    function clearActiveSlots(){ document.querySelectorAll('.dropSlot').forEach(s=>s.classList.remove('active')); }
    function slotAt(x,y){
      const oldPointer = cardEl.style.pointerEvents;
      cardEl.style.pointerEvents = 'none';
      const el = document.elementFromPoint(x,y);
      cardEl.style.pointerEvents = oldPointer;
      const direct = el?.closest?.('.dropSlot');
      if(direct) return direct;
      const tl = els.activeTimeline;
      if(!tl) return null;
      const rect = tl.getBoundingClientRect();
      if(x < rect.left - 20 || x > rect.right + 20 || y < rect.top - 80 || y > rect.bottom + 80) return null;
      const slots = [...tl.querySelectorAll('.dropSlot')];
      if(!slots.length) return null;
      let best = slots[0], bestDist = Infinity;
      slots.forEach(slot => {
        const r = slot.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.abs(cx - x) + Math.abs(cy - y) * 0.35;
        if(d < bestDist){ bestDist = d; best = slot; }
      });
      return best;
    }
    cardEl.addEventListener('pointerdown', e=>{
      if(!isMeActive() || !currentCard() || isWrongRevealActive()) return;
      e.preventDefault();
      const rect=cardEl.getBoundingClientRect();
      offsetX=e.clientX-rect.left; offsetY=e.clientY-rect.top; lastX=e.clientX; rot=0;
      original={position:cardEl.style.position,left:cardEl.style.left,top:cardEl.style.top,width:cardEl.style.width,height:cardEl.style.height,zIndex:cardEl.style.zIndex,pointerEvents:cardEl.style.pointerEvents,transition:cardEl.style.transition,transform:cardEl.style.transform};
      placeholder=document.createElement('div');
      placeholder.className='dragStaticPlaceholder';
      placeholder.style.width=rect.width+'px';
      placeholder.style.height=rect.height+'px';
      placeholder.style.minWidth=rect.width+'px';
      placeholder.style.minHeight=rect.height+'px';
      cardEl.parentNode.insertBefore(placeholder, cardEl);
      cardEl.setPointerCapture?.(e.pointerId);
      cardEl.classList.add('dragging');
      cardEl.style.position='fixed';
      cardEl.style.left=rect.left+'px';
      cardEl.style.top=rect.top+'px';
      cardEl.style.width=rect.width+'px';
      cardEl.style.zIndex='9999';
      cardEl.style.transition='transform 90ms linear, box-shadow .12s ease';
      cardEl.style.setProperty('--drag-rot','0deg');
      uiState.dragCardId=cardId(card);
      document.body.classList.add('draggingTimelineCard');
      dragging=true;
    });
    cardEl.addEventListener('pointermove', e=>{
      if(!dragging) return;
      e.preventDefault();
      const dx=e.clientX-lastX; lastX=e.clientX;
      rot = Math.max(-6, Math.min(6, rot*0.72 + dx*0.18));
      cardEl.style.left=(e.clientX-offsetX)+'px';
      cardEl.style.top=(e.clientY-offsetY)+'px';
      cardEl.style.setProperty('--drag-rot', rot.toFixed(2)+'deg');
      clearActiveSlots();
      const slot=slotAt(e.clientX,e.clientY);
      if(slot){ slot.classList.add('active'); }
    });
    function end(e){
      if(!dragging) return;
      e.preventDefault();
      const slot=slotAt(e.clientX,e.clientY);
      if(slot && slot.dataset.index !== undefined){ setProposedIndex(Number(slot.dataset.index)); }
      clearActiveSlots();
      uiState.dragCardId=null; document.body.classList.remove('draggingTimelineCard'); dragging=false;
      cardEl.classList.remove('dragging');
      cardEl.style.removeProperty('--drag-rot');
      Object.assign(cardEl.style, original);
      if(placeholder){ placeholder.remove(); placeholder=null; }
    }
    cardEl.addEventListener('pointerup', end);
    cardEl.addEventListener('pointercancel', end);
  }


  function renderFinishedResults(){
    renderFinishedResultsScene({
      drawCardWrap:els.drawCardWrap,
      players:activePlayersFrom(getRoomData().players || {}),
      roomData:getRoomData(),
      coverForCard,
      playerRgb
    });
  }

  function renderCurrentCard(){
    const card=currentCard();
    if(!card){
      els.drawCardWrap.innerHTML='<div class="deckBack"><div>Inget draget kort<br><span class="tiny">Aktiv spelare klickar Dra kort.</span></div></div>'; return;
    }
    const wrong = isWrongRevealActive();
    const canDrag=isMeActive() && !wrong;
    const div=document.createElement('div'); div.className='drawCard'+(wrong?'':' '+cardVisibilityClass())+(wrong?' wrongReveal':''); div.draggable=false; div.dataset.cardId=cardId(card);
    const yearText = wrong ? ('Fel placering Â· '+esc(card.year)) : 'Ã…rtal dolt';
    div.innerHTML='<div><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/400?blur=2')+'" alt=""></div><div class="trackTitle">'+esc(card.title)+'</div><div class="trackArtist">'+esc(card.artist)+'</div></div><div><span class="yearHidden">'+yearText+'</span></div>';
    if(canDrag){ bindCardPointerDrag(div, card); }
    els.drawCardWrap.innerHTML=''; els.drawCardWrap.appendChild(div);
  }
  function renderActiveTimeline(){
    const ap=activePlayer()||{};
    const timeline=timelineOf(ap);
    const activeProposal=ap.activeProposal || null;
    const card=currentCard() || activeProposal?.card || null;
    const idx=proposedIndex() ?? (Number.isInteger(activeProposal?.index) ? activeProposal.index : null);
    setText(els.activePlayerBanner,'Aktiv Spelare: '+(ap.name||'OkÃ¤nd spelare')); setText(els.roundPill,'Aktiv runda: '+pendingCount(ap)+' kort riskeras');
    const area = els.activeTimeline?.closest?.('.activeTimelineArea');
    const activeRgb = playerRgb(ap.id);
    if(area) area.style.setProperty('--active-player-rgb', activeRgb);
    if(els.activePlayerBanner){
      els.activePlayerBanner.style.setProperty('--active-player-rgb', activeRgb);
      els.activePlayerBanner.style.setProperty('--active-player-text-rgb', '255,255,255');
    }
    els.activeTimeline.innerHTML='';
    const showFirstCardSlot = timeline.length === 0 && idx === null;
    for(let i=0;i<=timeline.length;i++){
      els.activeTimeline.appendChild(makeDropSlot(i,idx,showFirstCardSlot));
      const cardAt = timeline[i];
      if(cardAt) els.activeTimeline.appendChild(makeTimelineCard(cardAt));
    }
    if(card && idx!==null){
      const children=[...els.activeTimeline.children];
      const insertBeforeIndex=idx*2+1;
      const prop=makeTimelineCard({...card,status:'proposed'});
      els.activeTimeline.insertBefore(prop, children[insertBeforeIndex] || null);
    }
    if(!timeline.length && !card) els.activeTimeline.innerHTML='<p class="small">Tidslinjen Ã¤r tom.</p>';
  }
  function makeDropSlot(index,selected,isEmptyTimeline){
    const slot=document.createElement('button'); slot.type='button'; slot.className='dropSlot'+(selected===index?' selected':'')+(isEmptyTimeline?' emptySlot':''); slot.title=isEmptyTimeline?'Placera fÃ¶rsta kortet hÃ¤r':'Placera hÃ¤r'; slot.dataset.index=index;
    slot.addEventListener('click',()=>setProposedIndex(index));
    slot.addEventListener('dragover',e=>{ if(isMeActive() && currentCard()){ e.preventDefault(); slot.classList.add('active'); }});
    slot.addEventListener('dragleave',()=>slot.classList.remove('active'));
    slot.addEventListener('drop',e=>{ e.preventDefault(); slot.classList.remove('active'); setProposedIndex(index); });
    return slot;
  }
  function makeTimelineCard(card){
    const div=document.createElement('div'); div.className='tlCard '+(card.status||'locked');
    const tag=card.status==='pending'?'Runda':card.status==='proposed'?'Nu':card.status==='wrong'?'Fel':'LÃ¥st';
    const year=card.status==='proposed'?'?':card.year;
    div.innerHTML='<span class="tlTag">'+tag+'</span><div><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/300?blur=2')+'" alt=""></div><div class="tlCardTitle trackTitle">'+esc(card.title)+'</div><div class="tlArtist trackArtist">'+esc(card.artist)+'</div></div><div class="tlYear yearHidden">'+esc(year)+'</div>';
    if(card.status==='proposed' && isMeActive() && currentCard() && !isWrongRevealActive()){
      div.title='Dra kortet igen fÃ¶r att placera om det';
      bindCardPointerDrag(div, currentCard());
    }
    return div;
  }
  function renderOwnTimeline(){
    if(!els.ownTimeline) return;
    const players=getRoomData().players || {};
    const visiblePlayers = activePlayersFrom(players);
    if(!players[uiState.viewedTimelinePlayerId] || !visiblePlayers.some(p=>p.id===uiState.viewedTimelinePlayerId)) uiState.viewedTimelinePlayerId = players[getPlayer().id] ? getPlayer().id : (visiblePlayers[0]?.id || getPlayer().id);
    const viewed=players[uiState.viewedTimelinePlayerId] || {id:getPlayer().id,name:getPlayer().name,timeline:[]};
    const tl=timelineOf(viewed);
    const isMine=viewed.id===getPlayer().id;
    const title=(isMine?'Din tidslinje':((viewed.name||'Spelare')+'s tidslinje'));
    setText(els.ownTimelineTitle,title+' Â· '+lockedCount(viewed)+'/'+WIN_SCORE);
    els.ownTimeline.innerHTML='';
    if(!tl.length){ els.ownTimeline.innerHTML='<p class="tiny">'+(isMine?'Din':'Spelarens')+' tidslinje Ã¤r tom. FÃ¶rsta kortet kan lÃ¤ggas var som helst.</p>'; return; }
    tl.forEach(c=>els.ownTimeline.appendChild(makeTimelineCard(c)));
  }
  function renderProfile(){
    const token=readToken();
    const spotifyConnected = validToken(token);
    const cachedProfile = spotifyProfileCache();
    const avatarUrl = getPlayer().avatarUrl || cachedProfile?.avatarUrl || '';
    if(els.profileName) setText(els.profileName, getPlayer().name || 'Spelare');
    if(els.profileSub) setText(els.profileSub, spotifyConnected ? 'Spotify anslutet' : 'Spotify ej anslutet');
    if(els.spotifyLoginBtn) els.spotifyLoginBtn.style.display = spotifyConnected ? 'none' : '';
    if(els.spotifyLogoutBtn) els.spotifyLogoutBtn.style.display = spotifyConnected ? '' : 'none';
    if(els.playlistButtonSub){ setText(els.playlistButtonSub, 'InstÃ¤llningar'); }
    if(els.profileButton){
      const me=getRoomData().players?.[getPlayer().id];
      els.profileButton.classList.toggle('active', getRoomData()?.game?.turnPlayerId===getPlayer().id);
      const avatarStyle = avatarUrl ? ' style="background-image:url('+esc(avatarUrl)+')"' : '';
      els.profileButton.innerHTML='<span class="cornerBlobText profileButtonText"><b>Spelare</b><small>Profil</small></span>';
    }
  }

  function renderBoards(){
    const players=activePlayersFrom(getRoomData().players || {}); els.playerBoards.innerHTML='';
    if(!players.length){ els.playerBoards.innerHTML='<p class="small">Inga spelare Ã¤nnu.</p>'; return; }
    players.forEach(p=>{
      const board=document.createElement('div'); board.className='playerBoard'+(p.id===getRoomData()?.game?.turnPlayerId?' active':'');
      const tl=timelineOf(p);
      const preview = p.activeProposal?.card && Number.isInteger(p.activeProposal?.index) ? timelineWithProposal(tl,p.activeProposal.card,p.activeProposal.index) : tl;
      board.innerHTML='<div class="playerBoardHead"><h3>'+esc(p.name||'Spelare')+'</h3><span class="pill">'+lockedCount(p)+'/'+WIN_SCORE+' lÃ¥sta Â· '+pendingCount(p)+' risk</span></div><div class="miniTimeline"></div>';
      const mt=board.querySelector('.miniTimeline');
      if(!preview.length) mt.innerHTML='<p class="tiny">Tom tidslinje</p>'; else preview.forEach(c=>mt.appendChild(makeTimelineCard(c)));
      els.playerBoards.appendChild(board);
    });
  }
  function updateButtons(){
    const connected=!!getDb(), playing=getRoomData()?.game?.status==='playing', meActive=isMeActive(), hasCurrent=!!currentCard(), hasProposal=proposedIndex()!==null, me=getRoomData().players?.[getPlayer().id], wrong=isWrongRevealActive();
    const hostId = getRoomData()?.meta?.hostId || '';
    const isHost = hostId === getPlayer().id;
    els.drawCardBtn.disabled=!meActive || hasCurrent || wrong || getRoomData()?.game?.status==='finished';
    els.confirmPlacementBtn.disabled=!meActive || !hasCurrent || !hasProposal || wrong;
    els.lockInBtn.disabled=!meActive || hasCurrent || wrong || !pendingCount(me) || getRoomData()?.game?.status==='finished';
    if(els.playSpotifyBtn) els.playSpotifyBtn.disabled=!hasCurrent;
    els.startGameBtn.disabled=!connected || !isHost;
    if(getRoomData()?.game?.status==='playing'){ els.startGameBtn.textContent='Avsluta spel'; els.startGameBtn.className='danger'; }
    else { els.startGameBtn.textContent='Starta'; els.startGameBtn.className='primary'; }
  }




  return { render, renderProfile };
}


