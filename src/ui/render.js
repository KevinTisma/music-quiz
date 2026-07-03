import { VIEWED_TIMELINE_KEY, WIN_SCORE } from '../config.js?v=active-room-start-v89';
import { cardId, esc, lockedCount, pendingCount, setText, timelineOf } from '../utils/helpers.js';
import { timelineWithProposal } from '../modes/timeline-mode.js';
import { readToken, validToken } from '../spotify/spotify-api.js?v=active-room-start-v89';
import { renderPlayerStrip } from './player-ui.js?v=active-room-start-v89';
import { refreshSavedPlaylistSelect } from './playlist-ui.js';
import { renderFinishedResultsScene } from './result-ui.js?v=active-room-start-v89';

export function createRenderer(ctx){
  const {
    els,
    uiState,
    getRoomData,
    getUserPlaylists,
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
    if(els.playerNameInput) els.playerNameInput.value = getPlayer().name;
    refreshPlaylistsFromRoom();
    applyGameModeClasses();
    renderTurn(); renderPlayers();
    if(getRoomData()?.game?.status === 'finished') renderFinishedResults();
    else if(isQuizGame()) renderPartyGame();
    else { renderCurrentCard(); renderActiveTimeline(); renderOwnTimeline(); }
    renderProfile(); renderBoards(); renderLobbySettings(); updateButtons(); handleAutoplay(); scheduleWrongRevealAdvance();
  }
  function isPartyGame(){
    return String(getRoomData()?.game?.mode || '').startsWith('party-');
  }
  function isQuizGame(){
    const mode = String(getRoomData()?.game?.mode || '');
    return mode.startsWith('party-') || mode.startsWith('quiz-');
  }
  function isPartyPresentation(){
    const game = getRoomData()?.game || {};
    const settings = getRoomData()?.settings || {};
    return game.partyModeEnabled === true || settings.partyModeEnabled === true || settings.gameMode === 'party';
  }
  function applyGameModeClasses(){
    const status = getRoomData()?.game?.status || 'lobby';
    document.body.classList.toggle('waitingMode', status !== 'playing' && status !== 'finished');
    document.body.classList.toggle('finishedMode', status === 'finished');
    document.body.classList.toggle('playingMode', status === 'playing');
    document.body.classList.toggle('partyMode', isQuizGame() && isPartyPresentation());
    document.body.classList.toggle('quizMode', isQuizGame());
  }
  function refreshPlaylistsFromRoom(){
    refreshSavedPlaylistSelect(els.savedPlaylistSelect, getUserPlaylists(), getRoomData());
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
    if(wr?.until){
      const ms = Number(wr.until) - Date.now();
      if(ms > 0){ uiState.wrongRevealTimeout = setTimeout(()=>render(), ms + 80); return; }
    }
    const deadline = Number(getRoomData()?.game?.answerDeadline || 0);
    if(deadline){
      const dms = deadline - Date.now();
      if(dms > 0){ uiState.wrongRevealTimeout = setTimeout(()=>render(), Math.min(1000, dms) + 40); }
    }
  }

  function renderTurn(){
    const game=getRoomData().game||{}, ap=activePlayer();
    if(game.status==='finished'){
      const w=getRoomData().players?.[game.winnerId]; setText(els.turnTitle,(w?.name||'En spelare')+' vann'); setText(els.turnSub,'Slutresultat och tidslinjer visas nedan.'); return;
    }
    if(game.status==='playing'){
      setText(els.turnTitle,'');
      setText(els.turnSub,'');
    }else{ setText(els.turnTitle,'Väntar på att spelet ska starta'); setText(els.turnSub,''); }
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
    const hostId = getRoomData()?.meta?.hostId || '';
    renderFinishedResultsScene({
      drawCardWrap:els.drawCardWrap,
      players:activePlayersFrom(getRoomData().players || {}),
      roomData:getRoomData(),
      coverForCard,
      playerRgb,
      isHost:hostId === getPlayer().id
    });
  }

  function renderPartyGame(){
    const data=getRoomData(), game=data.game||{}, card=game.currentCard, hostId=data?.meta?.hostId || '';
    const isHost = hostId === getPlayer().id;
    const answer = game.answers?.[getPlayer().id] || null;
    const quizType = normalizedQuizType(game.mode);
    const partyView = isPartyPresentation();
    const correctId = quizType === 'party-year' ? String(card?.year || '') : String(card?.ownerPlayerId || card?.ownerName || '');
    const title = quizType === 'party-year' ? '\u00c5rtals Quiz' : 'Vems l\u00e5t';
    setText(els.turnTitle, game.reveal && card ? 'R\u00e4tt svar: '+partyCorrectLabel(game, card) : title);
    setText(els.turnSub, partyView && isHost ? 'Hosten spelar musiken och styr n\u00e4sta steg.' : (answer ? 'Svar l\u00e5st.' : 'V\u00e4lj ditt svar.'));
    setText(els.activePlayerBanner, partyView && isHost ? 'Host-vy' : '');
    setText(els.roundPill, 'Runda '+(game.turnNumber || 1));
    if(els.activeTimeline) els.activeTimeline.innerHTML = '';
    if(els.ownTimeline) els.ownTimeline.innerHTML = '';
    if(!card){
      els.drawCardWrap.innerHTML=
        '<div class="partyPanel quizPanel quizEmptyPanel">' +
          '<h2>'+esc(title)+'</h2>' +
          '<p class="small">'+(isHost?'Starta rundan n\u00e4r alla \u00e4r redo.':'V\u00e4ntar p\u00e5 hosten.')+'</p>' +
          (isHost ? '<button class="primary quizHostAction" type="button" data-quiz-host-action="draw">Dra f\u00f6rsta l\u00e5ten</button>' : '') +
        '</div>';
      return;
    }
    const choices = Array.isArray(game.choices) ? game.choices : Object.values(game.choices || {});
    const answerPlayers = quizAnswerPlayers(data);
    const answered = answerPlayers.filter(p => !!game.answers?.[p.id]).length;
    const total = answerPlayers.length || 1;
    const timeText = quizTimeText(game);
    const progress = Math.max(0, Math.min(100, Math.round((answered / total) * 100)));
    if(partyView && isHost){
      els.drawCardWrap.innerHTML =
        '<div class="partyPanel quizPanel quizHostPanel">' +
          '<h2>'+esc(title)+'</h2>' +
          '<div class="quizCardMedia"><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/400?blur=2')+'" alt=""></div>'+(game.reveal?'<div class="trackTitle">'+esc(card.title)+'</div><div class="trackArtist">'+esc(card.artist)+'</div>':'')+'</div>' +
          '<div class="quizRoundStatus"><b>'+answered+'/'+total+'</b><span>svar inne</span>'+(timeText?'<small>'+esc(timeText)+'</small>':'')+'</div>' +
          '<div class="quizProgress"><span style="width:'+progress+'%"></span></div>' +
          (game.reveal ? '<p class="pill">Rätt svar: '+esc(partyCorrectLabel(game, card))+'</p>' : '') +
          partyResultMarkup(game, correctId, choices) +
          '<button class="primary quizHostAction" type="button" data-quiz-host-action="'+(game.reveal?'next':'reveal')+'">'+(game.reveal?'N\u00e4sta l\u00e5t':'Visa svar')+'</button>' +
        '</div>';
      return;
    }
    els.drawCardWrap.innerHTML =
      '<div class="partyPanel partyPlayerPanel quizPanel">' +
        '<div class="quizCardMedia"><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/400?blur=2')+'" alt=""></div><div class="trackTitle">'+esc(card.title)+'</div><div class="trackArtist">'+esc(card.artist)+'</div></div>' +
        '<h2>'+esc(title)+'</h2>' +
        (timeText && !game.reveal ? '<div class="quizTimerPill">'+esc(timeText)+'</div>' : '') +
        '<div class="partyChoices">' +
          choices.map(choice => {
            const selected = answer && String(answer.choiceId) === String(choice.id);
            const correct = game.reveal && String(choice.id) === correctId;
            const wrong = game.reveal && selected && !correct;
            return '<button class="partyChoice'+(selected?' selected':'')+(correct?' correct':'')+(wrong?' wrong':'')+'" type="button" data-party-choice="'+esc(choice.id)+'"'+(game.reveal?' disabled':'')+'>'+esc(choice.name)+'</button>';
          }).join('') +
        '</div>' +
        partyResultMarkup(game, correctId, choices) +
        (isHost ? '<button class="primary quizHostAction" type="button" data-quiz-host-action="'+(game.reveal?'next':'reveal')+'">'+(game.reveal?'N\u00e4sta l\u00e5t':'Visa svar')+'</button>' : '') +
      '</div>';
  }
  function normalizedQuizType(mode){
    return mode === 'quiz-year' ? 'party-year' : mode === 'quiz-owner' ? 'party-owner' : mode;
  }
  function quizAnswerPlayers(data=getRoomData()){
    const players = activePlayersFrom(data.players || {});
    const hostId = data?.meta?.hostId || '';
    const game = data?.game || {};
    const settings = data?.settings || {};
    const partyMasterMode = game.partyModeEnabled === true || settings.partyModeEnabled === true || settings.gameMode === 'party';
    return partyMasterMode ? players.filter(p => p.id !== hostId) : players;
  }
  function quizTimeText(game){
    if(game?.reveal) return '';
    const deadline = Number(game?.answerDeadline || 0);
    if(!deadline) return '';
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if(seconds >= 60) return Math.ceil(seconds / 60)+' min kvar';
    return seconds+' sek kvar';
  }
  function partyCorrectLabel(game, card){
    if(normalizedQuizType(game?.mode) === 'party-year') return String(card?.year || '');
    return card?.ownerName || 'Ok\u00e4nd spelare';
  }
  function partyResultMarkup(game, correctId, choices=[]){
    if(!game.reveal) return '';
    const answers = Object.values(game.answers || {});
    if(!answers.length) return '<p class="small">Inga svar kom in.</p>';
    const labelFor = id => choices.find(choice => String(choice.id) === String(id))?.name || id;
    return '<div class="partyResults">'+answers.map(answer => '<span class="pill '+(String(answer.choiceId)===correctId?'ok':'bad')+'"><b>'+esc(answer.playerName || 'Spelare')+'</b><small>'+esc(labelFor(answer.choiceId))+'</small></span>').join('')+'</div>';
  }

  function renderCurrentCard(){
    const card=currentCard();
    if(!card){
      els.drawCardWrap.innerHTML='<div class="deckBack"><div>Inget draget kort<br><span class="tiny">Aktiv spelare klickar Dra kort.</span></div></div>'; return;
    }
    const wrong = isWrongRevealActive();
    const canDrag=isMeActive() && !wrong;
    const div=document.createElement('div'); div.className='drawCard'+(wrong?'':' '+cardVisibilityClass())+(wrong?' wrongReveal':''); div.draggable=false; div.dataset.cardId=cardId(card);
    const yearText = wrong ? ('Fel placering - '+esc(card.year)) : 'ärtal dolt';
    const timeText = quizTimeText(getRoomData()?.game || {});
    div.innerHTML='<div><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/400?blur=2')+'" alt=""></div><div class="trackTitle">'+esc(card.title)+'</div><div class="trackArtist">'+esc(card.artist)+'</div>'+(timeText?'<div class="quizTimerPill">'+esc(timeText)+'</div>':'')+'</div><div><span class="yearHidden">'+yearText+'</span></div>';
    if(canDrag){ bindCardPointerDrag(div, card); }
    els.drawCardWrap.innerHTML=''; els.drawCardWrap.appendChild(div);
  }
  function renderActiveTimeline(){
    const ap=activePlayer()||{};
    const timeline=timelineOf(ap);
    const activeProposal=ap.activeProposal || null;
    const card=currentCard() || activeProposal?.card || null;
    const idx=proposedIndex() ?? (Number.isInteger(activeProposal?.index) ? activeProposal.index : null);
    setText(els.activePlayerBanner,'Aktiv Spelare: '+(ap.name||'Okänd spelare')); setText(els.roundPill,'Aktiv runda: '+pendingCount(ap)+' kort riskeras');
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
    if(!timeline.length && !card) els.activeTimeline.innerHTML='<p class="small">Tidslinjen är tom.</p>';
  }
  function makeDropSlot(index,selected,isEmptyTimeline){
    const slot=document.createElement('button'); slot.type='button'; slot.className='dropSlot'+(selected===index?' selected':'')+(isEmptyTimeline?' emptySlot':''); slot.title=isEmptyTimeline?'Placera första kortet här':'Placera här'; slot.dataset.index=index;
    slot.addEventListener('click',()=>setProposedIndex(index));
    slot.addEventListener('dragover',e=>{ if(isMeActive() && currentCard()){ e.preventDefault(); slot.classList.add('active'); }});
    slot.addEventListener('dragleave',()=>slot.classList.remove('active'));
    slot.addEventListener('drop',e=>{ e.preventDefault(); slot.classList.remove('active'); setProposedIndex(index); });
    return slot;
  }
  function makeTimelineCard(card){
    const div=document.createElement('div'); div.className='tlCard '+(card.status||'locked');
    const tag=card.status==='pending'?'Runda':card.status==='proposed'?'Nu':card.status==='wrong'?'Fel':'Låst';
    const year=card.status==='proposed'?'?':card.year;
    div.innerHTML='<span class="tlTag">'+tag+'</span><div><div class="cover"><img src="'+esc(coverForCard(card)||'https://picsum.photos/300?blur=2')+'" alt=""></div><div class="tlCardTitle trackTitle">'+esc(card.title)+'</div><div class="tlArtist trackArtist">'+esc(card.artist)+'</div></div><div class="tlYear yearHidden">'+esc(year)+'</div>';
    if(card.status==='proposed' && isMeActive() && currentCard() && !isWrongRevealActive()){
      div.title='Dra kortet igen för att placera om det';
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
    setText(els.ownTimelineTitle,title+' · '+lockedCount(viewed)+'/'+WIN_SCORE);
    els.ownTimeline.innerHTML='';
    if(!tl.length){ els.ownTimeline.innerHTML='<p class="tiny">'+(isMine?'Din':'Spelarens')+' tidslinje är tom. Första kortet kan läggas var som helst.</p>'; return; }
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
    if(els.playlistButtonSub){ setText(els.playlistButtonSub, 'Inställningar'); }
    if(els.profileButton){
      const me=getRoomData().players?.[getPlayer().id];
      els.profileButton.classList.toggle('active', getRoomData()?.game?.turnPlayerId===getPlayer().id);
      const avatarStyle = avatarUrl ? ' style="background-image:url('+esc(avatarUrl)+')"' : '';
      els.profileButton.innerHTML='<span class="cornerBlobText profileButtonText"><b>Spelare</b><small>Profil</small></span>';
    }
  }

  function renderBoards(){
    const players=activePlayersFrom(getRoomData().players || {}); els.playerBoards.innerHTML='';
    if(!players.length){ els.playerBoards.innerHTML='<p class="small">Inga spelare ännu.</p>'; return; }
    players.forEach(p=>{
      const board=document.createElement('div'); board.className='playerBoard'+(p.id===getRoomData()?.game?.turnPlayerId?' active':'');
      const tl=timelineOf(p);
      const preview = p.activeProposal?.card && Number.isInteger(p.activeProposal?.index) ? timelineWithProposal(tl,p.activeProposal.card,p.activeProposal.index) : tl;
      board.innerHTML='<div class="playerBoardHead"><h3>'+esc(p.name||'Spelare')+'</h3><span class="pill">'+lockedCount(p)+'/'+WIN_SCORE+' låsta · '+pendingCount(p)+' risk</span></div><div class="miniTimeline"></div>';
      const mt=board.querySelector('.miniTimeline');
      if(!preview.length) mt.innerHTML='<p class="tiny">Tom tidslinje</p>'; else preview.forEach(c=>mt.appendChild(makeTimelineCard(c)));
      els.playerBoards.appendChild(board);
    });
  }
  function renderLobbySettings(){
    const data = getRoomData() || {};
    const hostId = data?.meta?.hostId || '';
    const isHost = hostId === getPlayer().id;
    const gameStatus = data?.game?.status || 'lobby';
    const roomStatus = data?.meta?.status || gameStatus;
    const isLobby = roomStatus === 'lobby';
    const canEditHostSettings = isHost && isLobby;
    const canEditProfilePlaylists = isLobby;
    const settings = data.settings || {};
    const selectedMode = settings.gameMode === 'party' ? 'quiz' : (settings.gameMode || 'timeline');
    const selectedParty = settings.quizType || settings.partyMode || 'party-owner';
    const partyModeEnabled = settings.partyModeEnabled === true || settings.gameMode === 'party';
    const entries = Object.values(data.playlistMix || {}).sort((a,b)=>Number(a.addedAt || 0)-Number(b.addedAt || 0));
    document.body.classList.toggle('isHost', isHost);
    document.body.classList.toggle('isGuest', !isHost);
    if(els.lobbySettingsNotice){
      setText(els.lobbySettingsNotice, isHost ? 'V\u00e4lj spelinst\u00e4llningar och starta spelet.' : 'L\u00e4gg till en egen spellista eller v\u00e4nta p\u00e5 hosten.');
    }
    document.querySelectorAll('.modeButton[data-game-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.gameMode === selectedMode);
      button.disabled = !canEditHostSettings;
    });
    if(els.partyModeToggle){
      els.partyModeToggle.checked = partyModeEnabled;
      els.partyModeToggle.disabled = !canEditHostSettings || selectedMode !== 'quiz';
    }
    if(els.partyModeSelect){
      els.partyModeSelect.value = selectedParty;
      els.partyModeSelect.disabled = !canEditHostSettings || selectedMode !== 'quiz';
    }
    if(els.quizTimerSelect){
      els.quizTimerSelect.value = String(settings.gameTimerSeconds ?? settings.quizTimerSeconds ?? 0);
      els.quizTimerSelect.disabled = !canEditHostSettings;
    }
    if(els.quizSongLimitSelect){
      els.quizSongLimitSelect.value = String(settings.quizSongLimit ?? 'all');
      els.quizSongLimitSelect.disabled = !canEditHostSettings || selectedMode !== 'quiz';
    }
    if(els.selectedPlaylistList){
      if(!entries.length){
        els.selectedPlaylistList.innerHTML =
          '<div class="mixSummary"><b>Blandade spellistor</b><span class="pill">0 spellistor</span></div>' +
          '<p class="tiny">Inga spellistor tillagda \u00e4n.</p>';
      }else{
        const totalSongs = entries.reduce((sum, entry) => sum + Number(entry.songCount || (entry.songs ? Object.keys(entry.songs).length : 0) || 0), 0);
        els.selectedPlaylistList.innerHTML =
          '<div class="mixSummary"><b>Blandade spellistor</b><span class="pill">'+entries.length+' spellistor \u00b7 '+totalSongs+' l\u00e5tar</span></div>' +
          '<div class="mixPlaylistRows">' +
          entries.map(entry => {
            const songCount = Number(entry.songCount || (entry.songs ? Object.keys(entry.songs).length : 0) || 0);
            return '<div class="mixPlaylistRow"><span>'+esc(entry.name || 'Spellista')+'</span><small>'+esc(entry.playerName || 'Spelare')+' \u00b7 '+songCount+' l\u00e5tar</small></div>';
          }).join('') +
          '</div>';
      }
    }
    document.querySelectorAll('.hostOnlySetting input,.hostOnlySetting select,.hostOnlySetting button').forEach(control => {
      control.disabled = !canEditHostSettings;
    });
    document.querySelectorAll('.profilePlaylistSetting input,.profilePlaylistSetting select,.profilePlaylistSetting button:not(.hostOnlySetting)').forEach(control => {
      control.disabled = !canEditProfilePlaylists;
    });
  }
  function updateButtons(){
    const connected=!!getDb(), playing=getRoomData()?.game?.status==='playing', meActive=isMeActive(), hasCurrent=!!currentCard(), hasProposal=proposedIndex()!==null, me=getRoomData().players?.[getPlayer().id], wrong=isWrongRevealActive();
    const hostId = getRoomData()?.meta?.hostId || '';
    const isHost = hostId === getPlayer().id;
    const roomStatus = getRoomData()?.meta?.status || getRoomData()?.game?.status || 'lobby';
    const isLobby = roomStatus === 'lobby';
    if(isQuizGame()){
      const game = getRoomData()?.game || {};
      els.drawCardBtn.disabled=!connected || !isHost || getRoomData()?.game?.status==='finished' || (!!game.currentCard && !game.reveal);
      els.drawCardBtn.textContent=game.currentCard ? 'N\u00e4sta l\u00e5t' : 'Dra nytt kort';
      els.confirmPlacementBtn.disabled=!connected || !isHost || !game.currentCard || !!game.reveal;
      els.confirmPlacementBtn.textContent='Visa svar';
      els.lockInBtn.disabled=true;
      els.lockInBtn.textContent='L\u00e5s kort';
    }else{
      els.drawCardBtn.disabled=!meActive || hasCurrent || wrong || getRoomData()?.game?.status==='finished';
      els.drawCardBtn.textContent='Dra nytt kort';
      els.confirmPlacementBtn.disabled=!meActive || !hasCurrent || !hasProposal || wrong;
      els.confirmPlacementBtn.textContent='Godk\u00e4nn placering';
      els.lockInBtn.disabled=!meActive || hasCurrent || wrong || !pendingCount(me) || getRoomData()?.game?.status==='finished';
      els.lockInBtn.textContent='L\u00e5s kort';
    }
    if(els.playSpotifyBtn) els.playSpotifyBtn.disabled=!hasCurrent;
    els.startGameBtn.disabled=!connected || !isHost || !isLobby;
    if(els.utilityEndGameBtn) els.utilityEndGameBtn.disabled=!connected || !isHost || !['playing','finished'].includes(getRoomData()?.game?.status);
    if(els.utilityCloseLobbyBtn) els.utilityCloseLobbyBtn.disabled=!connected || !isHost;
    const canEditPlaylistMix = connected && isLobby;
    if(els.addPlaylistBtn) els.addPlaylistBtn.disabled=!canEditPlaylistMix || !els.savedPlaylistSelect?.value;
    if(els.savedPlaylistSelect) els.savedPlaylistSelect.disabled=!canEditPlaylistMix;
    if(getRoomData()?.game?.status==='playing'){ els.startGameBtn.textContent='Avsluta spel'; els.startGameBtn.className='danger'; }
    else { els.startGameBtn.textContent='Starta spel'; els.startGameBtn.className='primary'; }
  }




  return { render, renderProfile };
}


