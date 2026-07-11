import { ACTIVE_PLAYER_WINDOW_MS, LS, PLAYER_PALETTES, ROOM_ID, VERSION, VIEWED_TIMELINE_KEY, WIN_SCORE } from './config.js?v=active-room-start-v109';
import { cardId, cleanKey, esc, getPlayerId, lockedCount, now, pendingCount, setText, shuffle, sortPlayers, status, timelineOf } from './utils/helpers.js';
import { getValidSpotifyToken, readToken, spotifyFetch, validToken } from './spotify/spotify-api.js?v=active-room-start-v109';
import { handleSpotifyCallback, loginSpotify } from './spotify/spotify-auth.js?v=active-room-start-v109';
import { isSortedByYear, timelineWithProposal } from './modes/timeline-mode.js';
import { normalizeTrack, playlistIdFromInput } from './spotify/spotify-playlists.js';
import { ensureFirebaseAuth, getFirebaseDatabase, serverTimestamp } from './firebase/firebase.js';
import { getRoomRef, getUserRef, normalizeRoomId, playerRoomPath } from './firebase/rooms.js';
import { createRenderer } from './ui/render.js?v=active-room-start-v109';

(() => {
  'use strict';


  let db = null, firebaseUser = null, firebaseReadyPromise = null, firebaseListenersStarted = false, roomData = {}, userPlaylists = {}, roomListenerRef = null, roomListenerCallback = null, userPlaylistsListenerRef = null, userPlaylistsListenerCallback = null, heartbeatTimer = null, presenceRef = null, migrationInProgress = false, lobbyCleanupTimer = null, gameDeadlineTimer = null, lobbyCleanupInProgress = false, closedRoomHandled = false, quizAutoRevealInProgress = false, playlistNoticeTimer = null;
  const LOBBY_MAX_AGE_MS = 4 * 60 * 60 * 1000;
  const LOBBY_INACTIVE_MS = 45 * 60 * 1000;
  const CLOSED_LOBBY_REMOVE_DELAY_MS = 1600;
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  const savedRoom = localStorage.getItem(LS.lobbyRoom);
  const initialRoom = String(urlRoom || savedRoom || '');
  let activeRoomId = normalizeRoomId(initialRoom.toUpperCase() === 'ACTIVE'  '' : initialRoom);
  let player = { id:getPlayerId(), name:localStorage.getItem(LS.playerName) || 'Spelare', avatarUrl:'' };
  try { const cachedSpotifyProfile = JSON.parse(localStorage.getItem(LS.spotifyProfile) || 'null'); if(cachedSpotifyProfile?.displayName){ player.name = cachedSpotifyProfile.displayName; } if(cachedSpotifyProfile?.avatarUrl){ player.avatarUrl = cachedSpotifyProfile.avatarUrl; } } catch {}
  const uiState = {
    dragCardId:null,
    lastAutoplayCardId:null,
    wrongRevealTimeout:null,
    viewedTimelinePlayerId:localStorage.getItem(VIEWED_TIMELINE_KEY) || player.id
  };

  const $ = id => document.getElementById(id);
  const els = {
    spotifyLoginBtn:$('spotifyLoginBtn'), spotifyLogoutBtn:$('spotifyLogoutBtn'), connectFirebaseBtn:$('connectFirebaseBtn'), resetRoomBtn:$('resetRoomBtn'), playerNameInput:$('playerNameInput'), saveNameBtn:$('saveNameBtn'), utilityEndGameBtn:$('utilityEndGameBtn'), autoPlaySpotifyToggle:$('autoPlaySpotifyToggle'), redirectUriText:$('redirectUriText'), connectionStatus:$('connectionStatus'), playlistInput:$('playlistInput'), playlistNameInput:$('playlistNameInput'), playlistOwnerSelect:$('playlistOwnerSelect'), playlistImportStatus:$('playlistImportStatus'), importPlaylistBtn:$('importPlaylistBtn'), createDemoBtn:$('createDemoBtn'), savedPlaylistSelect:$('savedPlaylistSelect'), playlistUpdateNotice:$('playlistUpdateNotice'), addPlaylistBtn:$('addPlaylistBtn'), selectedPlaylistList:$('selectedPlaylistList'), lobbySettingsNotice:$('lobbySettingsNotice'), partyModeToggle:$('partyModeToggle'), partyModeSelect:$('partyModeSelect'), quizTimerSelect:$('quizTimerSelect'), quizSongLimitSelect:$('quizSongLimitSelect'), timelineWinScoreSelect:$('timelineWinScoreSelect'), selectPlaylistBtn:$('selectPlaylistBtn'), refreshPlaylistsBtn:$('refreshPlaylistsBtn'), playlistStatus:$('playlistStatus'), startGameBtn:$('startGameBtn'), drawCardBtn:$('drawCardBtn'), lockInBtn:$('lockInBtn'), playSpotifyBtn:$('playSpotifyBtn'), confirmPlacementBtn:$('confirmPlacementBtn'), turnTitle:$('turnTitle'), turnSub:$('turnSub'), playerStrip:$('playerStrip'), drawCardWrap:$('drawCardWrap'), gameStatus:$('gameStatus'), activePlayerBanner:$('activePlayerBanner'), activeTimelineTitle:$('activeTimelineTitle'), roundPill:$('roundPill'), activeTimeline:$('activeTimeline'), playerBoards:$('playerBoards'), ownTimeline:$('ownTimeline'), ownTimelineTitle:$('ownTimelineTitle'), ownTimelineToggle:$('ownTimelineToggle'), profileButton:$('profileButton'), profileMenu:$('profileMenu'), profileName:$('profileName'), profileSub:$('profileSub'), playlistButton:$('playlistButton'), playlistMenu:$('playlistMenu'), utilityMenu:$('utilityMenu'), playlistButtonSub:$('playlistButtonSub'), utilityLobbyCode:$('utilityLobbyCode'), versionPill:$('versionPill'), showCoverToggle:$('showCoverToggle'), showArtistToggle:$('showArtistToggle'), showTitleToggle:$('showTitleToggle'), startScreen:$('startScreen'), startPlayerNameInput:$('startPlayerNameInput'), startSpotifyLoginBtn:$('startSpotifyLoginBtn'), testSpotifyBtn:$('testSpotifyBtn'), createLobbyBtn:$('createLobbyBtn'), joinLobbyBtn:$('joinLobbyBtn'), lobbyCodeInput:$('lobbyCodeInput'), startStatus:$('startStatus'), roomCodeText:$('roomCodeText'), leaveLobbyBtn:$('leaveLobbyBtn'), enterGameBtn:$('enterGameBtn'), shareLinkInput:$('shareLinkInput'), copyShareLinkBtn:$('copyShareLinkBtn'), hostStatusText:$('hostStatusText'), firebasePathText:$('firebasePathText'), lobbyPlayers:$('lobbyPlayers')
  };

  function redirectUri(){ return window.location.origin + window.location.pathname; }
  function isActivePlayer(p){
    if(!p?.id) return false;
    if(p.id === player.id) return true;
    const lastSeen = Number(p.lastSeen || 0);
    return p.online === true && lastSeen > Date.now() - ACTIVE_PLAYER_WINDOW_MS;
  }
  function activePlayersFrom(players){ return sortPlayers(players).filter(isActivePlayer).slice(0,5); }

  function playerRgb(id){
    const players = activePlayersFrom(roomData?.players || {});
    const idx = Math.max(0, players.findIndex(p=>p.id===id));
    return PLAYER_PALETTES[idx % PLAYER_PALETTES.length];
  }
  function invertRgb(rgb){
    const parts=String(rgb||'255,255,255').split(',').map(v=>Math.max(0,Math.min(255,255-Number(v||0))));
    return parts.join(',');
  }
  function isMeActive(){ return roomData?.game?.turnPlayerId === player.id && roomData?.game?.status === 'playing'; }
  function activePlayer(){ return roomData?.players?.[roomData?.game?.turnPlayerId] || null; }
  function currentCard(){ return roomData?.game?.currentCard || null; }
  function cardVisibility(){
    return roomData?.game?.cardVisibility || {cover:true,artist:true,title:true};
  }
  function cardVisibilityClass(){
    const v = cardVisibility();
    return (v.cover===false?' cardNoCover':'') + (v.artist===false?' cardNoArtist':'') + (v.title===false?' cardNoTitle':'');
  }
  function readVisibilityToggles(){
    return {cover:!!els.showCoverToggle?.checked, artist:!!els.showArtistToggle?.checked, title:!!els.showTitleToggle?.checked};
  }
  function selectedGameMode(){
    const mode = roomData?.settings?.gameMode || 'timeline';
    return mode === 'party'  'quiz' : mode;
  }
  function selectedQuizType(){
    return roomData?.settings?.quizType || roomData?.settings?.partyMode || els.partyModeSelect?.value || 'party-owner';
  }
  function isPartyModeEnabled(){
    const settings = roomData?.settings || {};
    return settings.partyModeEnabled === true || settings.gameMode === 'party';
  }
  function quizAnswerPlayers(data=roomData){
    const game = data.game || {};
    const answerPlayerIds = Array.isArray(game.answerPlayerIds) ? game.answerPlayerIds.filter(Boolean) : [];
    if(answerPlayerIds.length){
      return answerPlayerIds.map(id => data.players?.[id] || {id, name:'Spelare'});
    }
    const players = sortPlayers(data.players || {});
    const hostId = data.meta?.hostId || '';
    const partyMasterMode = game.partyModeEnabled === true || data.settings?.partyModeEnabled === true || data.settings?.gameMode === 'party';
    return partyMasterMode  players.filter(p => p.id !== hostId) : players;
  }
  function selectedGameTimerSeconds(){
    const value = Number(roomData?.settings?.gameTimerSeconds  roomData?.settings?.quizTimerSeconds  els.quizTimerSelect?.value  0);
    return [0,30,60,120].includes(value) ? value : 0;
  }
  function selectedQuizSongLimit(){
    const raw = roomData?.settings?.quizSongLimit ?? els.quizSongLimitSelect?.value ?? 'all';
    if(raw === 'all' || raw === 0 || raw === '0') return 0;
    const value = Number(raw);
    return [25,50,100].includes(value) ? value : 0;
  }
  function selectedTimelineWinScore(){
    const value = Number(roomData?.game?.winScore  roomData?.settings?.timelineWinScore  els.timelineWinScoreSelect?.value  WIN_SCORE);
    return [7,10,12,15,20].includes(value) ? value : WIN_SCORE;
  }
  function isQuizGame(){
    const mode = String(roomData?.game?.mode || '');
    return mode.startsWith('party-') || mode.startsWith('quiz-');
  }
  function partyQuestionFor(mode){
    return mode === 'party-year' || mode === 'quiz-year'  '\u00c5rtals Quiz' : 'Vems l\u00e5t';
  }
  function isWrongRevealActive(){
    const wr = roomData?.game?.wrongReveal;
    return !!(wr && Number(wr.until || 0) > Date.now());
  }
  function proposedIndex(){ const n = roomData?.game?.proposedIndex; return Number.isInteger(n) ? n : null; }
  function directCover(card){
    return card?.image || card?.coverUrl || card?.albumImage || card?.album?.images?.[0]?.url || card?.track?.album?.images?.[0]?.url || '';
  }
  function coverForCard(card){
    const direct = directCover(card);
    if(direct) return direct;

    const pools = [];
    const addPool = value => {
      if(!value) return;
      if(Array.isArray(value)) pools.push(...value);
      else if(typeof value === 'object') pools.push(...Object.values(value));
    };

    addPool(roomData?.songBank);
    const selectedId = roomData?.selectedPlaylistId;
    addPool(userPlaylists?.[selectedId]?.songs);
    addPool(userPlaylists?.[cleanKey(selectedId)]?.songs);

    const id = String(card?.id || '');
    const uri = String(card?.uri || '');
    const title = String(card?.title || '').toLowerCase();
    const artist = String(card?.artist || '').toLowerCase();
    const year = String(card?.year || '');

    const found = pools.find(s => {
      if(!s) return false;
      if(id && String(s.id || '') === id) return true;
      if(uri && String(s.uri || '') === uri) return true;
      const sameTitle = title && String(s.title || '').toLowerCase() === title;
      const sameYear = year && String(s.year || '') === year;
      const sameArtist = !artist || String(s.artist || '').toLowerCase() === artist;
      return sameTitle && sameYear && sameArtist;
    });

    return directCover(found);
  }


  function spotifyProfileCache(){
    try { return JSON.parse(localStorage.getItem(LS.spotifyProfile) || 'null'); } catch { return null; }
  }
  function currentUserId(){
    if(firebaseUser?.uid) return cleanKey(firebaseUser.uid);
    try {
      const uid = firebase?.auth?.()?.currentUser?.uid;
      if(uid) return cleanKey(uid);
    } catch {}
    const spotifyId = spotifyProfileCache()?.spotifyId;
    return cleanKey(spotifyId ? 'spotify_'+spotifyId : player.id);
  }
  function currentAuthUid(){
    return firebaseUser?.uid || '';
  }
  function isHostPlayer(){
    return roomData?.meta?.hostId === player.id;
  }
  function selectedPlaylistOwner(){
    const players = roomData?.players || {};
    const selectedId = isHostPlayer()  (els.playlistOwnerSelect?.value || player.id) : player.id;
    const owner = players[selectedId] || (selectedId === player.id  player : null) || {id:selectedId,name:'Spelare'};
    return {attributedPlayerId:owner.id || player.id, attributedPlayerName:owner.name || player.name || 'Spelare'};
  }
  function showPlaylistUpdateNotice(message, type='ok'){
    if(!els.playlistUpdateNotice) return;
    els.playlistUpdateNotice.textContent = message;
    els.playlistUpdateNotice.className = 'playlistUpdateNotice '+type;
    if(playlistNoticeTimer) clearTimeout(playlistNoticeTimer);
    playlistNoticeTimer = setTimeout(() => {
      if(els.playlistUpdateNotice){
        els.playlistUpdateNotice.textContent = '';
        els.playlistUpdateNotice.className = 'playlistUpdateNotice';
      }
    }, 4200);
  }
  function ensurePlaylistSettingsUi(){
    const importSection = els.importPlaylistBtn?.closest?.('.profilePlaylistSetting');
    if(importSection && !els.playlistOwnerSelect){
      const label = document.createElement('label');
      label.htmlFor = 'playlistOwnerSelect';
      label.className = 'hostAttributionControl';
      label.textContent = 'R?kna som spelare';
      const select = document.createElement('select');
      select.id = 'playlistOwnerSelect';
      select.className = 'hostAttributionControl';
      const before = importSection.querySelector('.tiny') || els.importPlaylistBtn;
      importSection.insertBefore(label, before);
      importSection.insertBefore(select, before);
      els.playlistOwnerSelect = select;
    }
    if(importSection && els.playlistStatus && els.importPlaylistBtn && els.playlistStatus.parentElement !== importSection){
      els.importPlaylistBtn.insertAdjacentElement('afterend', els.playlistStatus);
      els.playlistStatus.classList.add('inlinePlaylistStatus');
    }
    const pickerSection = els.savedPlaylistSelect?.closest?.('.playlistPickerSetting');
    if(pickerSection && !els.playlistUpdateNotice){
      const notice = document.createElement('p');
      notice.id = 'playlistUpdateNotice';
      notice.className = 'playlistUpdateNotice';
      notice.setAttribute('aria-live', 'polite');
      els.savedPlaylistSelect.closest('.playlistAddRow')?.insertAdjacentElement('afterend', notice);
      els.playlistUpdateNotice = notice;
    }
  }
  function applySpotifyProfile(profile){
    if(!profile) return false;
    const previousUserId = currentUserId();
    const displayName = (profile.display_name || profile.id || '').trim();
    const avatarUrl = profile.images?.[0]?.url || '';
    const cached = { displayName: displayName || 'Spotify-spelare', avatarUrl, spotifyId: profile.id || '', updatedAt: now() };
    localStorage.setItem(LS.spotifyProfile, JSON.stringify(cached));
    player.name = cached.displayName;
    player.avatarUrl = cached.avatarUrl;
    localStorage.setItem(LS.playerName, player.name);
    if(els.playerNameInput) els.playerNameInput.value = player.name;
    if(previousUserId !== currentUserId()) restartUserPlaylistsListener();
    return true;
  }
  async function syncSpotifyProfile(){
    if(!validToken(readToken())) return;
    try{
      const profile = await spotifyFetch('/me');
      if(applySpotifyProfile(profile)){
        if(activeRoomId) await upsertPlayer({name:player.name, avatarUrl:player.avatarUrl});
        renderProfile();
      }
    }catch(err){
      console.warn('[spotify-profile]', err);
    }
  }


  function startFirebaseListeners(){
    if(firebaseListenersStarted) return;
    firebaseListenersStarted = true;
    listenUserPlaylists();
    if(activeRoomId){
      setupPresence();
      listenRoom();
      upsertPlayer().catch(err=>console.warn('[player-upsert]',err));
    }
  }
  function connectFirebase(){
    if(!db) db = getFirebaseDatabase();
    if(!firebaseReadyPromise){
      firebaseReadyPromise = ensureFirebaseAuth().then(user => {
        firebaseUser = user;
        startFirebaseListeners();
        return user;
      }).catch(err => {
        status(els.connectionStatus,'Firebase Auth saknas: '+err.message,'bad');
        throw err;
      });
    }
    return db;
  }
  async function ensureFirebaseReady(){
    connectFirebase();
    firebaseUser = await firebaseReadyPromise;
    startFirebaseListeners();
    return db;
  }
  function setupPresence(){
    if(!db || !activeRoomId) return;
    if(presenceRef) presenceRef.onDisconnect().cancel().catch(()=>{});
    presenceRef = db.ref(playerRoomPath(player.id, activeRoomId));
    const ref = presenceRef;
    ref.onDisconnect().update({online:false,lastSeen:serverTimestamp()});
    if(heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if(db) ref.update({online:true,lastSeen:serverTimestamp()}).catch(()=>{});
    }, 30000);
  }
  function roomRef(path=''){ if(!db) connectFirebase(); return getRoomRef(db, path, activeRoomId); }
  function userRef(path=''){ if(!db) connectFirebase(); return getUserRef(db, currentUserId(), path); }
  function requireHost(message='Endast host kan göra detta.'){
    const hostId = roomData?.meta?.hostId || '';
    const hostUid = roomData?.meta?.hostUid || '';
    if(hostUid && hostUid === currentAuthUid()) return true;
    if(hostId === player.id) return true;
    status(els.gameStatus, message, 'bad');
    status(els.playlistStatus, message, 'bad');
    return false;
  }
  function roomActorUpdates(extra={}){
    return {'meta/updatedAt':serverTimestamp(),'meta/updatedBy':player.id,'meta/updatedByUid':currentAuthUid(),...extra};
  }
  async function updateRoomSettings(extra={}){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan \u00e4ndra spelinst\u00e4llningar.')) return;
    const updates = roomActorUpdates();
    Object.entries(extra).forEach(([key,value]) => { updates['settings/'+key] = value; });
    await roomRef().update(updates);
  }
  function stopPresence(){
    if(heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if(presenceRef){
      presenceRef.onDisconnect().cancel().catch(()=>{});
      presenceRef.update({online:false,lastSeen:serverTimestamp()}).catch(()=>{});
    }
    presenceRef = null;
  }
  function lastRoomActivityMs(data=roomData){
    const playerTimes = Object.values(data?.players || {}).map(p=>Number(p?.lastSeen || 0)).filter(Boolean);
    return Math.max(Number(data?.meta?.updatedAt || 0), Number(data?.meta?.createdAt || 0), ...playerTimes, 0);
  }
  function activeOnlinePlayers(data=roomData){
    return Object.values(data?.players || {}).filter(p => {
      const lastSeen = Number(p?.lastSeen || 0);
      return p?.online === true && (!lastSeen || lastSeen > Date.now() - ACTIVE_PLAYER_WINDOW_MS);
    });
  }
  async function closeRoomIfEmpty(roomId){
    if(!db || !roomId || roomId === ROOM_ID) return false;
    const ref = getRoomRef(db, '', roomId);
    const snap = await ref.get();
    if(!snap.exists()) return false;
    const data = snap.val() || {};
    if(data?.meta?.status === 'closed') return true;
    if(activeOnlinePlayers(data).length) return false;
    await ref.child('meta').update({status:'closed',closedAt:serverTimestamp(),closedBy:player.id,closedByUid:currentAuthUid(),closeReason:'empty',updatedAt:serverTimestamp(),updatedBy:player.id,updatedByUid:currentAuthUid()});
    setTimeout(()=>ref.remove().catch(err=>console.warn('[empty-lobby-remove]',err)), CLOSED_LOBBY_REMOVE_DELAY_MS);
    return true;
  }
  function scheduleLobbyExpiry(){
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    if(!roomData?.meta?.hostId || roomData?.meta?.status === 'closed') return;
    const createdAt = Number(roomData?.meta?.createdAt || 0);
    const lastActivity = lastRoomActivityMs();
    if(!createdAt && !lastActivity) return;
    const ageExpiresAt = createdAt  createdAt + LOBBY_MAX_AGE_MS : Infinity;
    const inactiveExpiresAt = lastActivity  lastActivity + LOBBY_INACTIVE_MS : Infinity;
    const expiresAt = Math.min(ageExpiresAt, inactiveExpiresAt);
    const ms = expiresAt - Date.now();
    if(ms <= 0){ closeLobby('timeout').catch(err=>console.warn('[lobby-timeout]',err)); return; }
    lobbyCleanupTimer = setTimeout(()=>closeLobby('timeout').catch(err=>console.warn('[lobby-timeout]',err)), Math.min(ms, 2147483647));
  }
  function scheduleGameDeadlineCheck(){
    if(gameDeadlineTimer){ clearTimeout(gameDeadlineTimer); gameDeadlineTimer = null; }
    const game = roomData?.game || {};
    if(roomData?.meta?.hostId !== player.id || game.status !== 'playing' || !game.currentCard || game.reveal || game.wrongReveal) return;
    const deadline = Number(game.answerDeadline || 0);
    if(!deadline) return;
    const ms = deadline - Date.now();
    gameDeadlineTimer = setTimeout(()=>{
      maybeAutoRevealQuiz().catch(err=>console.warn('[quiz-auto-reveal]', err));
      maybeAutoResolveTimeline().catch(err=>console.warn('[timeline-auto-timeout]', err));
    }, Math.max(0, ms + 80));
  }
  function handleClosedLobby(){
    if(closedRoomHandled) return;
    closedRoomHandled = true;
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    if(gameDeadlineTimer){ clearTimeout(gameDeadlineTimer); gameDeadlineTimer = null; }
    stopPresence();
    stopRoomListener();
    roomData = {};
    localStorage.removeItem(LS.startDone);
    localStorage.removeItem(LS.lobbyRoom);
    activeRoomId = ROOM_ID;
    syncRoomUrl();
    updateStartScreen();
    status(els.startStatus,'Lobbyn är avslutad. Skapa en ny lobby fär att spela igen.','warn');
  }
  function listenRoom(){
    if(!activeRoomId) return;
    if(roomListenerRef) return;
    roomListenerRef = roomRef();
    roomListenerCallback = snap => {
      if(!snap.exists()){
        roomData = {};
        if(activeRoomId !== ROOM_ID && localStorage.getItem(LS.startDone) === '1'){ handleClosedLobby(); return; }
        render();
        updateStartScreen();
        return;
      }
      roomData = snap.val() || {};
      if(roomData?.meta?.status === 'closed'){ handleClosedLobby(); return; }
      if(activeRoomId !== ROOM_ID && Object.keys(roomData?.players || {}).length && !activeOnlinePlayers().length){
        closeRoomIfEmpty(activeRoomId).catch(err=>console.warn('[empty-lobby]',err));
        return;
      }
      maybeAutoRevealQuiz().catch(err=>console.warn('[quiz-auto-reveal]', err));
      maybeAutoResolveTimeline().catch(err=>console.warn('[timeline-auto-timeout]', err));
      scheduleGameDeadlineCheck();
      closedRoomHandled = false;
      scheduleLobbyExpiry();
      migrateLegacyRoomPlaylists().catch(err=>console.warn('[playlist-migration]',err));
      render();
      updateStartScreen();
    };
    roomListenerRef.on('value', roomListenerCallback);
  }
  function listenUserPlaylists(){
    if(userPlaylistsListenerRef) return;
    userPlaylistsListenerRef = userRef('playlists');
    userPlaylistsListenerCallback = snap => { userPlaylists = snap.val() || {}; render(); };
    userPlaylistsListenerRef.on('value', userPlaylistsListenerCallback);
  }
  function stopUserPlaylistsListener(){
    if(userPlaylistsListenerRef && userPlaylistsListenerCallback) userPlaylistsListenerRef.off('value', userPlaylistsListenerCallback);
    userPlaylistsListenerRef = null;
    userPlaylistsListenerCallback = null;
    userPlaylists = {};
  }
  function restartUserPlaylistsListener(){
    stopUserPlaylistsListener();
    if(db) listenUserPlaylists();
  }
  function syncRoomUrl(){
    if(activeRoomId) localStorage.setItem(LS.lobbyRoom, activeRoomId);
    else localStorage.removeItem(LS.lobbyRoom);
    if(els.roomCodeText) setText(els.roomCodeText, activeRoomId || '-');
    if(els.utilityLobbyCode) setText(els.utilityLobbyCode, activeRoomId || 'Ingen lobby');
    if(els.versionPill) setText(els.versionPill, VERSION);
    if(els.shareLinkInput) els.shareLinkInput.value = shareLink();
    if(els.firebasePathText) setText(els.firebasePathText, activeRoomId ? 'rooms/'+activeRoomId : 'Ingen lobby');
    const url = new URL(window.location.href);
    if(activeRoomId) url.searchParams.set('room', activeRoomId);
    else url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  }
  function shareLink(){
    const url = new URL(window.location.href);
    if(activeRoomId) url.searchParams.set('room', activeRoomId);
    else url.searchParams.delete('room');
    return url.toString();
  }
  function stopRoomListener(){
    if(roomListenerRef && roomListenerCallback) roomListenerRef.off('value', roomListenerCallback);
    roomListenerRef = null;
    roomListenerCallback = null;
  }
  async function switchRoom(roomId, asHost=false){
    await ensureFirebaseReady();
    const nextRoomId = normalizeRoomId(roomId);
    if(db && activeRoomId && nextRoomId !== activeRoomId){
      db.ref(playerRoomPath(player.id, activeRoomId)).update({online:false,lastSeen:serverTimestamp()}).catch(()=>{});
    }
    activeRoomId = nextRoomId;
    closedRoomHandled = false;
    lobbyCleanupInProgress = false;
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    if(gameDeadlineTimer){ clearTimeout(gameDeadlineTimer); gameDeadlineTimer = null; }
    syncRoomUrl();
    roomData = {};
    stopRoomListener();
    if(db) setupPresence();
    listenRoom();
    restartUserPlaylistsListener();
    if(!asHost){
      upsertPlayer({ready:false}).catch(err => status(els.startStatus,'Kunde inte ansluta spelaren: '+err.message,'bad'));
      updateStartScreen();
      return;
    }
    const roomMeta = {
      hostId:player.id,
      hostUid:currentAuthUid(),
      code:activeRoomId,
      status:'lobby',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp(),
      updatedBy:player.id,
      updatedByUid:currentAuthUid()
    };
    roomRef('meta').update(roomMeta).catch(err => status(els.startStatus,'Kunde inte spara lobby: '+err.message,'bad'));
    upsertPlayer({ready:false}).catch(err => status(els.startStatus,'Kunde inte ansluta spelaren: '+err.message,'bad'));
    updateStartScreen();
  }
  function createLobbyCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    bytes.forEach(b => { code += chars[b % chars.length]; });
    return code;
  }
  async function createUniqueLobbyCode(){
    await ensureFirebaseReady();
    for(let i=0;i<8;i++){
      const code = createLobbyCode();
      const snap = await getRoomRef(db, 'meta', code).get();
      if(!snap.exists()) return code;
    }
    return createLobbyCode();
  }
  async function roomExists(roomId){
    await ensureFirebaseReady();
    const snap = await getRoomRef(db, 'meta', roomId).get();
    return snap.exists();
  }
  function updateStartScreen(){
    syncRoomUrl();
    if(els.startPlayerNameInput && els.startPlayerNameInput.value !== player.name) els.startPlayerNameInput.value = player.name;
    if(els.lobbyCodeInput) els.lobbyCodeInput.value = activeRoomId  activeRoomId : '';
    const spotifyConnected = validToken(readToken());
    if(els.startSpotifyLoginBtn){
      els.startSpotifyLoginBtn.disabled = spotifyConnected;
      els.startSpotifyLoginBtn.textContent = spotifyConnected ? 'Spotify anslutet' : 'Koppla Spotify';
      els.startSpotifyLoginBtn.className = spotifyConnected ? 'spotifyConnectedButton' : 'primary';
      els.startSpotifyLoginBtn.setAttribute('aria-disabled', spotifyConnected ? 'true' : 'false');
    }
    renderLobbySummary();
    const done = localStorage.getItem(LS.startDone) === '1';
    const hasActiveRoom = !!activeRoomId && activeRoomId !== ROOM_ID && roomData?.meta?.status !== 'closed';
    document.body.classList.toggle('hasActiveRoom', hasActiveRoom);
    document.body.classList.toggle('startOpen', !done);
    document.documentElement.classList.toggle('startOpen', !done);
    els.startScreen?.classList.toggle('hidden', done);
  }
  function renderLobbySummary(){
    syncRoomUrl();
    const players = activePlayersFrom(roomData?.players || {});
    const hostId = roomData?.meta?.hostId || '';
    const isHost = hostId === player.id;
    const hostName = roomData?.players?.[hostId]?.name || 'annan spelare';
    setText(els.hostStatusText, hostId ? (isHost ? 'Du är host' : 'Host: '+hostName) : 'Host saknas');
    if(!els.lobbyPlayers) return;
    if(!players.length){
      els.lobbyPlayers.innerHTML = '<p class="small">Inga spelare ännu.</p>';
      return;
    }
    els.lobbyPlayers.innerHTML = players.map(p => {
      const readyBadge = p.ready ? '<span class="pill readyPill">Redo</span>' : '<span class="pill waitingPill">Väntar</span>';
      const badges = readyBadge + (p.id === hostId ? '<span class="pill">Host</span>' : '') + (p.id === player.id ? '<span class="pill">Du</span>' : '');
      return '<div class="lobbyPlayer"><span class="lobbyPlayerName">'+esc(p.name || 'Spelare')+'</span><span class="lobbyPlayerBadges">'+badges+'</span></div>';
    }).join('');
  }
  async function savePlayerNameFromStart(){
    const input = els.startPlayerNameInput || els.playerNameInput;
    player.name = (input?.value || player.name || 'Spelare').slice(0,32);
    localStorage.setItem(LS.playerName, player.name);
    if(els.playerNameInput) els.playerNameInput.value = player.name;
    if(activeRoomId) upsertPlayer().catch(err => status(els.startStatus,'Kunde inte spara spelaren: '+err.message,'bad'));
  }
  async function testSpotifyConnection(){
    try{
      if(!validToken(readToken())) throw new Error('Koppla Spotify först.');
      const profile = await spotifyFetch('/me');
      applySpotifyProfile(profile);
      if(activeRoomId) await upsertPlayer({name:player.name, avatarUrl:player.avatarUrl});
      status(els.startStatus,'Spotify svarar som '+(player.name || 'spelare')+'.','ok');
      status(els.connectionStatus,'Spotify anslutet.','ok');
      renderProfile();
      updateStartScreen();
    }catch(err){
      status(els.startStatus,'Spotify-test misslyckades: '+err.message,'bad');
    }
  }
  async function upsertPlayer(extra={}){
    if(!activeRoomId) return;
    await ensureFirebaseReady();
    const name=(player.name || 'Spelare').slice(0,32);
    const existing = roomData?.players?.[player.id] || {};
    const hasReady = Object.prototype.hasOwnProperty.call(extra, 'ready');
    const nextReady = hasReady ? !!extra.ready : !!existing.ready;
    player.ready = nextReady;
    await roomRef('players/'+player.id).update({id:player.id,uid:currentAuthUid(),name,avatarUrl:player.avatarUrl||'',online:true,joinedAt:existing.joinedAt || serverTimestamp(),lastSeen:serverTimestamp(),timeline:timelineOf(existing),...extra,ready:nextReady});
    if(currentAuthUid()) await roomRef('memberUids/'+currentAuthUid()).set(true);
  }

  async function toggleReady(){
    await ensureFirebaseReady();
    const nextReady = !roomData?.players?.[player.id]?.ready;
    player.ready = nextReady;
    await roomRef('players/'+player.id).update({ready:nextReady,online:true,lastSeen:serverTimestamp()});
    status(els.playlistStatus, nextReady ? 'Du är redo.' : 'Du är inte redo längre.', nextReady ? 'ok' : 'warn');
  }

  async function importPlaylist(){
    const btn = els.importPlaylistBtn;
    try{
      const pid=playlistIdFromInput(els.playlistInput.value); if(!pid) throw new Error('Klistra in en Spotify-spellista först.');
      const appName=(els.playlistNameInput?.value || '').trim();
      if(!appName) throw new Error('Skriv ett namn fär spellistan i appen först.');
      const limit=50;
      let offset=0;
      let total=null;
      const songs=[];
      if(btn) btn.disabled = true;
      status(els.playlistStatus,'Importerar hela spellistan. Hämtar första 50 låtarna...', 'warn');
      // Spotify ändrade playlist-endpointen 2026: /tracks är borttagen i Development Mode.
      // Den nya endpointen är /items och själva låten ligger i item i stället fär track.
      while(total === null || offset < total){
        const path='/playlists/'+encodeURIComponent(pid)+'/items?limit='+limit+'&offset='+offset+'&fields=total,items(item(id,type,is_local,uri,name,duration_ms,external_urls.spotify,album(release_date,images),artists(name)))';
        const data=await spotifyFetch(path);
        const pageItems=Array.isArray(data.items) ? data.items : [];
        if(total === null) total = Number(data.total || pageItems.length || 0);
        const pageSongs=pageItems.map((it,i)=>normalizeTrack(it.item || it.track,offset+i)).filter(Boolean);
        songs.push(...pageSongs);
        offset += pageItems.length;
        status(els.playlistStatus,'Importerar '+Math.min(offset,total || offset)+'/'+(total || '?')+' poster från Spotify. '+songs.length+' låtar med årtal hittade...', 'warn');
        if(!pageItems.length) break;
      }
      if(!songs.length) throw new Error('Hittade inga låtar med årtal i spellistan.');
      await savePlaylist(pid,appName.slice(0,48),songs,'spotify',selectedPlaylistOwner());
      showPlaylistUpdateNotice('Spellistan är sparad och listan uppdateras.', 'ok');
      status(els.playlistStatus,'Sparade "'+appName.slice(0,48)+'" med '+songs.length+' låtar. Välj den i listan och tryck + fär att lägga till den i rummet.','ok');
    }catch(err){ console.error('[playlist-import]',err); status(els.playlistStatus,'Kunde inte importera: '+err.message,'bad'); }
    finally{ if(btn) btn.disabled = false; }
  }
  async function savePlaylist(pid,name,songs,source,owner=null){
    await ensureFirebaseReady();
    const id = cleanKey(pid);
    const ownerId = currentUserId();
    const ownerUid = currentAuthUid();
    const attributedPlayerId = owner?.attributedPlayerId || player.id;
    const attributedPlayerName = owner?.attributedPlayerName || player.name || 'Spelare';
    const ownedSongs = songs.map(song => ({...song, ownerPlayerId:attributedPlayerId, ownerName:attributedPlayerName, ownerPlaylistName:name}));
    const playlist = {id:pid,ownerId,ownerUid,createdByUid:ownerUid,createdByPlayerId:player.id,createdByName:player.name || 'Spelare',attributedPlayerId,attributedPlayerName,name,source:source||'manual',songCount:ownedSongs.length,importedAt:serverTimestamp(),updatedAt:serverTimestamp(),songs:ownedSongs};
    await userRef('playlists/'+id).set(playlist);
  }
  async function migrateLegacyRoomPlaylists(){
    if(migrationInProgress || !db || !roomData?.savedPlaylists) return;
    migrationInProgress = true;
    try{
      const updates = {};
      Object.entries(roomData.savedPlaylists || {}).forEach(([key,playlist]) => {
        const id = cleanKey(playlist?.id || key);
        updates['playlists/'+id] = {...playlist,id:playlist?.id || key,ownerId:currentUserId(),migratedFromRoom:activeRoomId,migratedAt:serverTimestamp(),updatedAt:serverTimestamp()};
      });
      if(Object.keys(updates).length) await userRef().update(updates);
      await roomRef().update(roomActorUpdates({savedPlaylists:null,songBanks:null}));
    }finally{
      migrationInProgress = false;
    }
  }
  async function createDemo(){
    const songs=[
      {id:'demo1',title:'Neon Nights',artist:'The Example Band',year:1984,uri:'spotify:track:demo1',image:'https://picsum.photos/400?random=11'},
      {id:'demo2',title:'Summer Static',artist:'Fake Radio',year:1997,uri:'spotify:track:demo2',image:'https://picsum.photos/400?random=12'},
      {id:'demo3',title:'Digital Hearts',artist:'Console Dreams',year:2012,uri:'spotify:track:demo3',image:'https://picsum.photos/400?random=13'}
    ];
    await savePlaylist('demo-3-songs','Demo-spellista med 3 låtar',songs,'demo',selectedPlaylistOwner());
    showPlaylistUpdateNotice('Demo-spellistan är sparad och listan uppdateras.', 'ok');
    status(els.playlistStatus,'Demo-spellista skapad. Välj den i listan och tryck + fär att lägga till den i rummet.','ok');
  }
  function playlistMixEntries(nextEntry=null){
    const entries = {...(roomData.playlistMix || {})};
    if(nextEntry) entries[nextEntry.key] = nextEntry.value;
    return entries;
  }
  function songsFromPlaylistMix(entries=roomData.playlistMix || {}){
    return Object.values(entries).flatMap(entry => {
      const songs = entry?.songs;
      const list = Array.isArray(songs) ? songs : Object.values(songs || {});
      return list.map(song => ({
        ...song,
        ownerPlayerId: song?.ownerPlayerId || entry.playerId || entry.ownerId || '',
        ownerName: song?.ownerName || entry.playerName || entry.name || 'Spelare',
        ownerPlaylistName: song?.ownerPlaylistName || entry.name || 'Spellista'
      }));
    });
  }
  async function syncRoomMix(entries, options={}){
    const writePlaylistMix = options.writePlaylistMix === true;
    const mixedSongs = songsFromPlaylistMix(entries);
    roomData = {
      ...roomData,
      playlistMix:entries,
      songBank:mixedSongs,
      selectedPlaylistId:mixedSongs.length ? 'mixed' : null,
      selectedPlaylist:mixedSongs.length  {id:'mixed',ownerId:'room',name:'Blandad spellista',source:'mixed',songCount:mixedSongs.length} : null
    };
    const baseUpdates = {
      songBank:mixedSongs.length  mixedSongs : null,
      selectedPlaylistId:mixedSongs.length ? 'mixed' : null,
      selectedPlaylist:mixedSongs.length  {id:'mixed',ownerId:'room',name:'Blandad spellista',source:'mixed',songCount:mixedSongs.length} : null
    };
    const updates = isHostPlayer() ? roomActorUpdates(baseUpdates) : baseUpdates;
    if(writePlaylistMix) updates.playlistMix = entries;
    await roomRef().update(updates);
  }
  async function savePlaylistToRoomMix(id, playlist, songs){
    const ownerId = currentUserId();
    const ownerUid = currentAuthUid();
    const attributedPlayerId = playlist.attributedPlayerId || player.id;
    const attributedPlayerName = playlist.attributedPlayerName || player.name || 'Spelare';
    const key = cleanKey(attributedPlayerId+'_'+ownerId+'_'+id);
    const ownedSongs = songs.map(song => ({...song, ownerPlayerId:song?.ownerPlayerId || attributedPlayerId, ownerName:song?.ownerName || attributedPlayerName, ownerPlaylistName:song?.ownerPlaylistName || playlist.name || id}));
    const entry = {
      id,
      ownerId,
      ownerUid,
      createdByUid:playlist.createdByUid || ownerUid,
      createdByPlayerId:playlist.createdByPlayerId || player.id,
      createdByName:playlist.createdByName || player.name || 'Spelare',
      playerId:attributedPlayerId,
      playerName:attributedPlayerName,
      attributedPlayerId,
      attributedPlayerName,
      name:playlist.name || id,
      source:playlist.source || 'manual',
      songCount:ownedSongs.length,
      songs:ownedSongs,
      addedAt:serverTimestamp()
    };
    await roomRef('playlistMix/'+key).set(entry);
    const entries = playlistMixEntries({key,value:entry});
    await syncRoomMix(entries);
    return {entries,mixedSongs:songsFromPlaylistMix(entries)};
  }
  async function removePlaylistFromMix(key){
    await ensureFirebaseReady();
    if(roomData?.game?.status === 'playing'){ status(els.playlistStatus,'Avsluta spelet innan du ?ndrar mixen.','warn'); return; }
    const clean = cleanKey(key || '');
    if(!clean || !roomData.playlistMix?.[clean]) return;
    const entry = roomData.playlistMix[clean] || {};
    const canRemove = isHostPlayer() || entry.ownerUid === currentAuthUid() || entry.createdByUid === currentAuthUid() || entry.playerId === player.id || entry.attributedPlayerId === player.id || entry.createdByPlayerId === player.id || entry.ownerId === currentUserId();
    if(!canRemove){ status(els.playlistStatus,'Du kan bara ta bort dina egna spellistor från mixen.','bad'); return; }
    const entries = {...(roomData.playlistMix || {})};
    delete entries[clean];
    await roomRef('playlistMix/'+clean).remove();
    await syncRoomMix(entries);
    showPlaylistUpdateNotice('Den blandade spellistan är uppdaterad.', 'ok');
    status(els.playlistStatus,'Spellistan togs bort från mixen.','ok');
  }
  async function refreshPlaylists(){
    await ensureFirebaseReady();
    await migrateLegacyRoomPlaylists();
    const snap=await userRef('playlists').get();
    const playlists=snap.val()||{};
    const current=els.savedPlaylistSelect.value;
    els.savedPlaylistSelect.innerHTML='';
    const keys=Object.keys(playlists);
    if(!keys.length){ els.savedPlaylistSelect.innerHTML='<option value="">Ingen spellista sparad ?n</option>'; return; }
    keys.forEach(k=>{ const p=playlists[k]; const opt=document.createElement('option'); opt.value=k; opt.textContent=(p.name||k)+' ('+(p.songCount || (p.songs?Object.keys(p.songs).length:0))+' låtar)'; els.savedPlaylistSelect.appendChild(opt); });
    if(current && playlists[current]) els.savedPlaylistSelect.value=current;
  }
  async function selectPlaylist(){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan välja spellista fär spelet.')) return;
    const id=els.savedPlaylistSelect.value; if(!id) return;
    const snap=await userRef('playlists/'+id+'/songs').get();
    let songs=snap.val(); if(!Array.isArray(songs)) songs=Object.values(songs||{});
    if(!songs.length) throw new Error('Spellistan saknar låtar.');
    const playlist = userPlaylists?.[id] || {};
    await roomRef().update(roomActorUpdates({selectedPlaylistId:id,selectedPlaylist:{id,ownerId:currentUserId(),ownerUid:currentAuthUid(),name:playlist.name||id,source:playlist.source||'manual',songCount:songs.length},songBank:songs}));
    status(els.playlistStatus,'Vald spellista anv?nds nu.','ok');
  }
  async function addPlaylistToMix(){
    await ensureFirebaseReady();
    try{
      const id=els.savedPlaylistSelect?.value;
      if(!id) throw new Error('Välj en spellista först.');
      const snap=await userRef('playlists/'+id).get();
      const playlist=snap.val() || userPlaylists?.[id] || {};
      let songs=playlist.songs;
      if(!Array.isArray(songs)) songs=Object.values(songs||{});
      if(!songs.length) throw new Error('Spellistan saknar låtar.');
      await savePlaylistToRoomMix(id, playlist, songs);
      showPlaylistUpdateNotice('Tillagd i blandade spellistan.', 'ok');
      status(els.playlistStatus,'Spellistan lades till i den blandade spellistan.','ok');
    }catch(err){
      status(els.playlistStatus,'Kunde inte lägga till spellista: '+err.message,'bad');
    }
  }

  function getSongs(){ const s=roomData.songBank; return Array.isArray(s)?s:Object.values(s||{}); }
  function normalizedQuizType(mode){
    return mode === 'quiz-year'  'party-year' : mode === 'quiz-owner'  'party-owner' : mode;
  }
  async function ensureHostPlaylistInOwnerMix(){
    if(normalizedQuizType(selectedQuizType()) !== 'party-owner') return;
    const id=els.savedPlaylistSelect?.value;
    if(!id) return;
    const entries = Object.values(roomData.playlistMix || {});
    if(entries.some(entry => entry?.id === id && entry?.playerId === player.id)) return;
    const snap=await userRef('playlists/'+id).get();
    const playlist=snap.val() || userPlaylists?.[id] || {};
    let songs=playlist.songs;
    if(!Array.isArray(songs)) songs=Object.values(songs||{});
    if(!songs.length) return;
    await savePlaylistToRoomMix(id, playlist, songs);
  }
  function partyDeckFromPlaylistMix(mode){
    mode = normalizedQuizType(mode);
    const entries = Object.values(roomData.playlistMix || {});
    if(entries.length){
      return entries.flatMap(entry => {
      const songs = Array.isArray(entry?.songs) ? entry.songs : Object.values(entry?.songs || {});
      return songs.map(song => ({
        ...song,
        ownerPlayerId:song?.ownerPlayerId || entry.playerId || entry.ownerId || '',
        ownerName:song?.ownerName || entry.playerName || entry.name || 'Spelare',
        ownerPlaylistName:song?.ownerPlaylistName || entry.name || 'Spellista'
      }));
    });
  }
    return getSongs().map(song => ({...song, ownerPlayerId:roomData?.meta?.hostId || player.id, ownerName:roomData?.players?.[roomData?.meta?.hostId]?.name || player.name || 'Spelare'}));
  }
  function canPlayerAnswerQuiz(data, playerId){
    return quizAnswerPlayers(data).some(p => p.id === playerId);
  }
  function partyChoicesFor(mode, deck, players){
    mode = normalizedQuizType(mode);
    if(mode === 'party-year'){
      const year = Number(deck[0]?.year || 2000);
      return shuffle([year, year - 1, year + 1, year - 5].filter((v,i,a)=>v && a.indexOf(v)===i)).map(v => ({id:String(v), name:String(v)}));
    }
    const fromDeck = [];
    deck.forEach(song => {
      const id = song.ownerPlayerId || song.ownerName;
      if(id && !fromDeck.some(choice => choice.id === id)) fromDeck.push({id, name:song.ownerName || 'Spelare'});
    });
    const active = players.map(p => ({id:p.id, name:p.name || 'Spelare'}));
    const choices = [...active];
    fromDeck.forEach(choice => {
      if(!choices.some(activeChoice => activeChoice.id === choice.id)) choices.push(choice);
    });
    return choices.slice(0,8);
  }
  async function songsFromSelectedPlaylist(){
    if(!requireHost('Endast host kan välja spellista fär spelet.')) return null;
    const id=els.savedPlaylistSelect?.value;
    if(!id) return null;
    const snap=await userRef('playlists/'+id+'/songs').get();
    let songs=snap.val();
    if(!Array.isArray(songs)) songs=Object.values(songs||{});
    if(!songs.length) return null;
    const playlist = userPlaylists?.[id] || {};
    await roomRef().update(roomActorUpdates({selectedPlaylistId:id,selectedPlaylist:{id,ownerId:currentUserId(),ownerUid:currentAuthUid(),name:playlist.name||id,source:playlist.source||'manual',songCount:songs.length},songBank:songs}));
    return songs;
  }
  async function startGame(){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan starta spelet.')) return;
    const gameMode = selectedGameMode();
    if(gameMode === 'quiz') await ensureHostPlaylistInOwnerMix().catch(err=>console.warn('[host-mix]',err));
    const hasPlaylistMix = Object.keys(roomData.playlistMix || {}).length > 0;
    const selectedSongs = hasPlaylistMix  null : await songsFromSelectedPlaylist().catch(err=>{ console.warn('[playlist-select]',err); return null; });
    const songs=selectedSongs || getSongs();
    if(gameMode === 'quiz' && !hasPlaylistMix && !songs.length){ status(els.gameStatus,'Välj eller skapa en spellista först.','bad'); return; }
    if(gameMode !== 'quiz' && !songs.length){ status(els.gameStatus,'Välj eller skapa en spellista först.','bad'); return; }
    const players=activePlayersFrom(roomData.players || {});
    if(!players.length){ await upsertPlayer(); }
    const playerSnapshot = (await roomRef('players').get()).val() || {};
    const allPlayers = gameMode === 'quiz'  sortPlayers(playerSnapshot).filter(p => p.id) : activePlayersFrom(playerSnapshot);
    if(gameMode === 'quiz'){
      await startQuizGame(allPlayers);
      return;
    }
    const deck=shuffle(songs).map((s,i)=>({...s,drawId:'d_'+i+'_'+cleanKey(cardId(s))}));
    const updates={};
    allPlayers.forEach(p=>{ updates['players/'+p.id+'/timeline']=[]; updates['players/'+p.id+'/ready']=false; updates['players/'+p.id+'/activeProposal']=null; });
    const firstPlayer = shuffle(allPlayers)[0] || {id:player.id,name:player.name};
    updates['meta/updatedAt']=serverTimestamp();
    updates['meta/updatedBy']=player.id;
    updates['meta/updatedByUid']=currentAuthUid();
    updates['meta/status']='playing';
    updates.game={status:'playing',startedAt:serverTimestamp(),turnPlayerId:firstPlayer.id,turnNumber:1,deck,discard:[],currentCard:null,proposedIndex:null,answerDeadline:null,gameTimerSeconds:selectedGameTimerSeconds(),winScore:selectedTimelineWinScore(),message:'Spelet startat. Aktiv spelare drar första kortet.',winnerId:null,cardVisibility:readVisibilityToggles(),wrongReveal:null};
    await roomRef().update(updates);
  }
  async function startQuizGame(allPlayers){
    const quizType = selectedQuizType();
    const mode = normalizedQuizType(quizType);
    const partyModeEnabled = isPartyModeEnabled();
    const gameTimerSeconds = selectedGameTimerSeconds();
    const quizSongLimit = selectedQuizSongLimit();
    const fullDeck = shuffle(partyDeckFromPlaylistMix(mode));
    const limitedDeck = quizSongLimit  fullDeck.slice(0, quizSongLimit) : fullDeck;
    const deck = limitedDeck.map((s,i)=>({...s,drawId:'p_'+i+'_'+cleanKey(cardId(s))}));
    if(mode === 'party-owner'){
      const ownerCount = new Set(deck.map(song => song.ownerPlayerId || song.ownerName).filter(Boolean)).size;
      if(ownerCount < 2){ status(els.playlistStatus,'Vems l\u00e5t funkar b\u00e4st n\u00e4r minst tv\u00e5 spelare har lagt till varsin spellista.','warn'); }
    }
    const choices = partyChoicesFor(mode, deck, allPlayers);
    const hostId = roomData?.meta?.hostId || player.id;
    const answerPlayers = partyModeEnabled  allPlayers.filter(p => p.id !== hostId) : allPlayers;
    const answerPlayerIds = answerPlayers.map(p => p.id).filter(Boolean);
    const updates={};
    allPlayers.forEach(p=>{ updates['players/'+p.id+'/score']=0; updates['players/'+p.id+'/timeline']=[]; updates['players/'+p.id+'/ready']=false; updates['players/'+p.id+'/activeProposal']=null; });
    updates['meta/updatedAt']=serverTimestamp();
    updates['meta/updatedBy']=player.id;
    updates['meta/updatedByUid']=currentAuthUid();
    updates['meta/status']='playing';
    updates.game={status:'playing',mode,quizType:mode,partyModeEnabled,gameTimerSeconds,quizTimerSeconds:gameTimerSeconds,quizSongLimit,answerPlayerIds,startedAt:serverTimestamp(),turnPlayerId:player.id,turnNumber:0,deck,discard:[],currentCard:null,choices,answers:{},reveal:false,answerDeadline:null,message:partyQuestionFor(mode)+'. Hosten drar f\u00f6rsta l\u00e5ten.',winnerId:null,cardVisibility:readVisibilityToggles()};
    await roomRef().update(updates);
  }
  async function drawCard(){
    if(isQuizGame()){
      await drawPartyCard();
      return;
    }
    if(!isMeActive()) return;
    const game=roomData.game||{};
    if(game.currentCard){ status(els.gameStatus,'Placera och bekräfta det aktuella kortet först.','warn'); return; }
    const deck=Array.isArray(game.deck)?[...game.deck]:[];
    if(!deck.length){ status(els.gameStatus,'Kortleken är slut. Lås in eller starta om.','warn'); return; }
    const card=deck.shift();
    const timerSeconds = Number(game.gameTimerSeconds || selectedGameTimerSeconds() || 0);
    const answerDeadline = timerSeconds > 0  Date.now() + timerSeconds * 1000 : null;
    await roomRef().update({'game/deck':deck,'game/currentCard':card,'game/proposedIndex':null,'game/answerDeadline':answerDeadline,'game/wrongReveal':null,'game/message':'Dra kortet till rätt plats i tidslinjen.',['players/'+player.id+'/activeProposal']:null});
    playCurrentSpotify(false);
  }
  async function drawPartyCard(){
    if(!requireHost('Endast host kan dra n\u00e4sta quizl\u00e5t.')) return;
    const game=roomData.game||{};
    const deck=Array.isArray(game.deck)?[...game.deck]:[];
    if(!deck.length && game.currentCard && game.reveal){
      await roomRef().update({'game/status':'finished','meta/status':'finished','game/message':'Party-rundan \u00e4r slut.','game/currentCard':null,'meta/updatedAt':serverTimestamp(),'meta/updatedBy':player.id,'meta/updatedByUid':currentAuthUid()});
      return;
    }
    if(!deck.length && !game.currentCard){
      await roomRef().update({'game/status':'finished','meta/status':'finished','game/message':'Party-rundan \u00e4r slut.','meta/updatedAt':serverTimestamp(),'meta/updatedBy':player.id,'meta/updatedByUid':currentAuthUid()});
      return;
    }
    const card=deck.shift();
    const mode = normalizedQuizType(game.mode || selectedQuizType());
    const choices = partyChoicesFor(mode, [card, ...deck].filter(Boolean), activePlayersFrom(roomData.players || {}));
    const timerSeconds = Number(game.gameTimerSeconds || game.quizTimerSeconds || selectedGameTimerSeconds() || 0);
    const answerDeadline = timerSeconds > 0  Date.now() + timerSeconds * 1000 : null;
    quizAutoRevealInProgress = false;
    await roomRef('game').update({deck,currentCard:card || null,choices,answers:{},reveal:false,correctChoiceId:null,answerDeadline,turnNumber:(game.turnNumber||0)+1,message:partyQuestionFor(mode)+'. V\u00e4lj ditt svar.'});
    playCurrentSpotify(false);
  }
  async function submitPartyAnswer(choiceId){
    const game=roomData.game||{};
    if(!isQuizGame() || game.status !== 'playing' || !game.currentCard || game.reveal) return;
    if(!canPlayerAnswerQuiz(roomData, player.id)){
      status(els.gameStatus,'Hosten styr rundan och svarar inte i Party-l?get.','warn');
      return;
    }
    await roomRef('game/answers/'+player.id).set({playerId:player.id,uid:currentAuthUid(),playerName:player.name || 'Spelare',choiceId:String(choiceId),answeredAt:serverTimestamp()});
    await maybeAutoRevealQuiz({[player.id]:true});
  }
  async function maybeAutoRevealQuiz(extraAnswers={}){
    const game = roomData?.game || {};
    if(!isQuizGame() || game.status !== 'playing' || !game.currentCard || game.reveal || quizAutoRevealInProgress) return;
    const players = quizAnswerPlayers();
    const total = players.length;
    if(!total) return;
    const answered = players.filter(p => !!game.answers?.[p.id] || !!extraAnswers[p.id]).length;
    const deadline = Number(game.answerDeadline || 0);
    const timeIsUp = !!deadline && Date.now() >= deadline;
    if(answered < total && !timeIsUp) return;
    quizAutoRevealInProgress = true;
    await revealPartyRound(true);
  }
  async function revealPartyRound(auto=false){
    if(!auto && !requireHost('Endast host kan visa svaret.')) return;
    const liveGame = auto  ((await roomRef('game').get()).val() || {}) : (roomData.game || {});
    const game=liveGame, card=game.currentCard;
    if(!isQuizGame() || !card) return;
    if(game.reveal) return;
    const correctId = normalizedQuizType(game.mode) === 'party-year'  String(card.year) : String(card.ownerPlayerId || card.ownerName || '');
    const updates = {'game/reveal':true,'game/correctChoiceId':correctId,'game/answerDeadline':null,'game/message':'R\u00e4tt svar: '+partyCorrectLabel(game, card),'meta/updatedAt':serverTimestamp(),'meta/updatedBy':player.id,'meta/updatedByUid':currentAuthUid()};
    const expectedAnswerIds = new Set(quizAnswerPlayers({...roomData, game}).map(p => p.id));
    Object.values(game.answers || {}).forEach(answer => {
      if(expectedAnswerIds.size && !expectedAnswerIds.has(answer.playerId)) return;
      if(String(answer.choiceId) !== correctId) return;
      const id = answer.playerId;
      const currentScore = Number(roomData.players?.[id]?.score || 0);
      updates['players/'+id+'/score'] = currentScore + 1;
    });
    await roomRef().update(updates);
  }
  async function maybeAutoResolveTimeline(){
    const game = roomData?.game || {};
    if(isQuizGame() || game.status !== 'playing' || !game.currentCard || game.wrongReveal) return;
    if(roomData?.meta?.hostId !== player.id) return;
    const deadline = Number(game.answerDeadline || 0);
    if(!deadline || Date.now() < deadline) return;
    const activeId = game.turnPlayerId;
    const active = roomData.players?.[activeId] || {};
    const timeline = timelineOf(active);
    const pending = timeline.filter(c=>c.status==='pending');
    const locked = timeline.filter(c=>c.status==='locked');
    const returnCards = [...pending, game.currentCard].map(c=>{ const x={...c}; delete x.status; return x; });
    const deck = [...(Array.isArray(game.deck)?game.deck:[]), ...shuffle(returnCards)];
    const nextId = nextPlayerId(activeId);
    const until = Date.now() + 5000;
    await roomRef('game').update({wrongReveal:{card:{...game.currentCard,status:'wrong'},playerId:activeId,until,year:game.currentCard.year},answerDeadline:null,message:'Tiden gick ut. Rätt är var '+game.currentCard.year+'. Nästa spelares tur om 5 sekunder.'});
    setTimeout(async()=>{
      const snap = await roomRef('game/wrongReveal').get();
      const wr = snap.val();
      if(!wr || wr.until !== until) return;
      await roomRef().update({['players/'+activeId+'/timeline']:locked,['players/'+activeId+'/activeProposal']:null,'game/deck':deck,'game/currentCard':null,'game/proposedIndex':null,'game/wrongReveal':null,'game/turnPlayerId':nextId,'game/turnNumber':(game.turnNumber||1)+1,'game/message':'Tiden gick ut. Gula kort från rundan gick tillbaka. Nästa spelares tur.'});
    }, 5000);
  }
  function partyCorrectLabel(game, card){
    if(normalizedQuizType(game?.mode) === 'party-year') return String(card?.year || '');
    return card?.ownerName || 'Ok\u00e4nd spelare';
  }
  async function setProposedIndex(index){
    if(!isMeActive() || !currentCard()) return;
    const me=roomData.players?.[player.id];
    const len=timelineOf(me).length;
    const i=Math.max(0,Math.min(Number(index)||0,len));
    const card=currentCard();
    await roomRef().update({
      'game/proposedIndex': i,
      ['players/'+player.id+'/activeProposal']: {
        index: i,
        card: {...card, status:'proposed'},
        updatedAt: serverTimestamp()
      }
    });
  }
  function nextPlayerId(currentId){
    const players=activePlayersFrom(roomData.players || {});
    if(!players.length) return currentId;
    const idx=players.findIndex(p=>p.id===currentId);
    return players[(idx+1+players.length)%players.length].id;
  }
  async function confirmPlacement(){
    if(!isMeActive()) return;
    const game=roomData.game||{}, card=game.currentCard, idx=proposedIndex();
    if(!card){ status(els.gameStatus,'Dra ett kort först.','warn'); return; }
    if(idx===null){ status(els.gameStatus,'Dra kortet till en plats i tidslinjen först.','warn'); return; }
    const me=roomData.players?.[player.id]||{};
    const timeline=timelineOf(me);
    const proposed=timelineWithProposal(timeline,card,idx);
    const correct=isSortedByYear(proposed);
    if(correct){
      const newTimeline=[...timeline]; newTimeline.splice(idx,0,{...card,status:'pending'});
      await roomRef().update({['players/'+player.id+'/timeline']:newTimeline,['players/'+player.id+'/activeProposal']:null,'game/currentCard':null,'game/proposedIndex':null,'game/message':'Rätt. Dra ett till kort eller lås in dina gula kort.'});
      status(els.gameStatus,'Rätt. Kortet är gult och riskeras tills du l?ser in.','ok');
    }else{
      const pending=timeline.filter(c=>c.status==='pending');
      const locked=timeline.filter(c=>c.status==='locked');
      const returnCards=[...pending,card].map(c=>{ const x={...c}; delete x.status; return x; });
      const deck=[...(Array.isArray(game.deck)?game.deck:[]),...shuffle(returnCards)];
      const nextId = nextPlayerId(player.id);
      const until = Date.now() + 5000;
      await roomRef('game').update({wrongReveal:{card:{...card,status:'wrong'},playerId:player.id,until,year:card.year},message:'Fel placering. Rätt är var '+card.year+'. Nästa spelares tur om 5 sekunder.'});
      status(els.gameStatus,'Fel. Rätt är var '+card.year+'. Du förlorar gula kort från rundan.','bad');
      setTimeout(async()=>{
        const snap = await roomRef('game/wrongReveal').get();
        const wr = snap.val();
        if(!wr || wr.until !== until) return;
        await roomRef().update({['players/'+player.id+'/timeline']:locked,['players/'+player.id+'/activeProposal']:null,'game/deck':deck,'game/discard':[...(game.discard||[])],'game/currentCard':null,'game/proposedIndex':null,'game/wrongReveal':null,'game/turnPlayerId':nextId,'game/turnNumber':(game.turnNumber||1)+1,'game/message':'Fel placering. Gula kort från rundan gick tillbaka. Nästa spelares tur.'});
      }, 5000);
    }
  }
  async function lockIn(){
    if(!isMeActive()) return;
    const game=roomData.game||{}, me=roomData.players?.[player.id]||{};
    if(game.currentCard){ status(els.gameStatus,'Placera aktuellt kort först, eller bekräfta fel/rätt.','warn'); return; }
    const timeline=timelineOf(me);
    if(!timeline.some(c=>c.status==='pending')){ status(els.gameStatus,'Du har inga gula kort att l?sa in. Dra ett kort eller passa turen.','warn'); return; }
    const locked=timeline.map(c=>({...c,status:'locked'}));
    const score=locked.length;
    const winScore = selectedTimelineWinScore();
    const updates={['players/'+player.id+'/timeline']:locked,['players/'+player.id+'/score']:score,['players/'+player.id+'/activeProposal']:null};
    if(score>=winScore){
      updates['game/status']='finished'; updates['game/winnerId']=player.id; updates['game/message']=(me.name||player.name)+' vann med '+score+' låsta kort.';
      updates['meta/status']='finished'; updates['meta/updatedAt']=serverTimestamp();
      updates['meta/updatedBy']=player.id;
      updates['meta/updatedByUid']=currentAuthUid();
    }else{
      updates['game/turnPlayerId']=nextPlayerId(player.id); updates['game/turnNumber']=(game.turnNumber||1)+1; updates['game/message']='Kort låsta. Nästa spelares tur.';
    }
    await roomRef().update(updates);
  }
  async function playCurrentSpotify(showStatus=true){
    try{
      const card=currentCard(); if(!card?.uri || card.uri.includes('demo')){ if(showStatus) status(els.gameStatus,'Den här demolåten har ingen riktig Spotify-URI.','warn'); return; }
      await spotifyFetch('/me/player/play',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({uris:[card.uri]})});
      if(showStatus) status(els.gameStatus,'Spelar aktuell låt i Spotify.','ok');
    }catch(err){ console.error(err); if(showStatus) status(els.gameStatus,'Kunde inte spela i Spotify: '+err.message,'bad'); }
  }
  async function endGame(){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan avsluta spelet.')) return;
    const updates = {'game':null,'songBank':null,'selectedPlaylistId':null,'selectedPlaylist':null,'playlistMix':null,'playlistImportDebug':null};
    const players = roomData.players || {};
    Object.keys(players).forEach(id => { updates['players/'+id+'/timeline'] = []; updates['players/'+id+'/score'] = 0; updates['players/'+id+'/ready'] = false; updates['players/'+id+'/activeProposal'] = null; });
    updates['meta/status']='lobby';
    updates['meta/updatedAt']=serverTimestamp();
    updates['meta/updatedBy']=player.id;
    updates['meta/updatedByUid']=currentAuthUid();
    await roomRef().update(updates);
    status(els.playlistStatus,'Spelet är avslutat och sessionens låtdata är rensad.','ok');
  }
  async function returnToLobbySettings(){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan ändra spelinställningar.')) return;
    const updates = {'game':null,'meta/status':'lobby','meta/updatedAt':serverTimestamp(),'meta/updatedBy':player.id,'meta/updatedByUid':currentAuthUid()};
    Object.keys(roomData.players || {}).forEach(id => {
      updates['players/'+id+'/timeline'] = [];
      updates['players/'+id+'/score'] = 0;
      updates['players/'+id+'/ready'] = false;
      updates['players/'+id+'/activeProposal'] = null;
    });
    await roomRef().update(updates);
    status(els.playlistStatus,'Ändra inställningar och starta igen när ni är redo.','ok');
  }
  async function closeLobby(reason='manual'){
    await ensureFirebaseReady();
    if(lobbyCleanupInProgress) return;
    if(reason === 'manual' && !requireHost('Endast host kan avsluta lobbyn.')) return;
    if(reason === 'manual' && !confirm('Avsluta lobbyn? Detta tar bort rummet för alla spelare.')) return;
    lobbyCleanupInProgress = true;
    const ref = roomRef();
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    await ref.child('meta').update({status:'closed',closedAt:serverTimestamp(),closedBy:player.id,closedByUid:currentAuthUid(),closeReason:reason,updatedAt:serverTimestamp(),updatedBy:player.id,updatedByUid:currentAuthUid()});
    stopPresence();
    setTimeout(()=>ref.remove().catch(err=>console.warn('[close-lobby]',err)), CLOSED_LOBBY_REMOVE_DELAY_MS);
  }
  async function leaveLobby(){
    const leavingRoomId = activeRoomId;
    if(leavingRoomId === ROOM_ID) return;
    await ensureFirebaseReady();
    if(els.leaveLobbyBtn) els.leaveLobbyBtn.disabled = true;
    try{
      if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
      stopRoomListener();
      stopPresence();
      await getRoomRef(db, 'players/'+player.id, leavingRoomId).remove();
      await closeRoomIfEmpty(leavingRoomId);
      if(currentAuthUid()) await getRoomRef(db, 'memberUids/'+currentAuthUid(), leavingRoomId).remove().catch(()=>{});
      roomData = {};
      localStorage.removeItem(LS.startDone);
      localStorage.removeItem(LS.lobbyRoom);
      activeRoomId = ROOM_ID;
      closedRoomHandled = false;
      lobbyCleanupInProgress = false;
      syncRoomUrl();
      updateStartScreen();
      render();
      status(els.startStatus,'Du l?mnade lobbyn.','ok');
    }catch(err){
      status(els.startStatus,'Kunde inte l?mna lobbyn: '+err.message,'bad');
    }finally{
      if(els.leaveLobbyBtn) els.leaveLobbyBtn.disabled = false;
    }
  }

  async function resetRoom(){
    await ensureFirebaseReady();
    if(!requireHost('Endast host kan resetta rummet.')) return;
    if(!confirm('Resetta rummet Detta tar bort spel och spelare i lobby '+activeRoomId+'. Dina sparade spellistor finns kvar.')) return;
    const updates = roomActorUpdates({game:null,songBank:null,selectedPlaylistId:null,selectedPlaylist:null,playlistMix:null,playlistImportDebug:null,'meta/status':'lobby'});
    Object.keys(roomData.players || {}).forEach(id => {
      updates['players/'+id+'/timeline'] = [];
      updates['players/'+id+'/score'] = 0;
      updates['players/'+id+'/ready'] = false;
      updates['players/'+id+'/activeProposal'] = null;
    });
    await roomRef().update(updates);
    roomData={...roomData,game:null,songBank:null,selectedPlaylistId:null,selectedPlaylist:null,playlistMix:null};
    await upsertPlayer({timeline:[],score:0});
    status(els.connectionStatus,'Rummet är återställt.','ok');
  }

  const renderer = createRenderer({
    els,
    uiState,
    getRoomData:()=>roomData,
    getUserPlaylists:()=>userPlaylists,
    getPlayer:()=>player,
    getDb:()=>db,
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
  });
  function render(){ renderer.render(); renderLobbySummary(); }
  function renderProfile(){ renderer.renderProfile(); }
  function applyOwnTimelineCollapsed(collapsed){
    const isCollapsed = !!collapsed;
    document.body.classList.toggle('ownCollapsed', isCollapsed);
    if(els.ownTimelineToggle) els.ownTimelineToggle.textContent = isCollapsed ? 'Öppna' : 'Minimera';
  }
  function toggleOwnTimeline(){
    const next = !document.body.classList.contains('ownCollapsed');
    applyOwnTimelineCollapsed(next);
    localStorage.setItem(LS.ownCollapsed, next ? '1' : '0');
  }
  function splitSettingsMenus(){
    if(!els.playlistMenu) return;
    const utilitySettings = els.playlistMenu.querySelector('.utilitySettings');
    if(!utilitySettings) return;
    let utilityMenu = els.utilityMenu || document.getElementById('utilityMenu');
    if(!utilityMenu){
      utilityMenu = document.createElement('div');
      utilityMenu.className = 'utilityMenu';
      utilityMenu.id = 'utilityMenu';
      els.playlistMenu.insertAdjacentElement('afterend', utilityMenu);
    }
    utilityMenu.appendChild(utilitySettings);
    els.utilityMenu = utilityMenu;
    let closeLobbyBtn = document.getElementById('utilityCloseLobbyBtn');
    if(!closeLobbyBtn){
      closeLobbyBtn = document.createElement('button');
      closeLobbyBtn.className = 'danger';
      closeLobbyBtn.id = 'utilityCloseLobbyBtn';
      closeLobbyBtn.type = 'button';
      closeLobbyBtn.textContent = 'Avsluta lobby';
      utilitySettings.querySelector('.actions')?.appendChild(closeLobbyBtn);
    }
    els.utilityCloseLobbyBtn = closeLobbyBtn;
    if(els.playlistMenu.parentElement !== document.body){
      document.body.appendChild(els.playlistMenu);
    }
  }

  function bind(){
    splitSettingsMenus();
    if(els.redirectUriText) els.redirectUriText.textContent=redirectUri();
    if(els.playerNameInput) els.playerNameInput.value=player.name;
    applyOwnTimelineCollapsed(false); localStorage.setItem(LS.ownCollapsed,'0'); if(els.ownTimelineToggle) els.ownTimelineToggle.onclick=toggleOwnTimeline;
    if(els.startPlayerNameInput) els.startPlayerNameInput.value = player.name;
    if(els.roomCodeText) setText(els.roomCodeText, activeRoomId || '-');
    if(els.lobbyCodeInput) els.lobbyCodeInput.value = activeRoomId || '';
    if(els.profileButton) els.profileButton.onclick=()=>{
      const open = !els.profileMenu?.classList.contains('open');
      els.profileMenu?.classList.toggle('open', open);
      els.playlistMenu?.classList.remove('open');
      els.profileButton.classList.add('spinning');
      els.profileButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      window.setTimeout(()=>els.profileButton?.classList.remove('spinning'), 520);
    };
    if(els.playlistButton) els.playlistButton.onclick=()=>{
      const open = !els.utilityMenu?.classList.contains('open');
      els.utilityMenu?.classList.toggle('open', open);
      els.playlistMenu?.classList.remove('open');
      els.profileMenu?.classList.remove('open');
      els.profileButton?.setAttribute('aria-expanded','false');
      els.playlistButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      els.playlistButton.classList.add('spinning');
      window.setTimeout(()=>els.playlistButton?.classList.remove('spinning'), 520);
    };
    if(els.spotifyLoginBtn) els.spotifyLoginBtn.onclick=()=>loginSpotify(redirectUri(), window.location.href);
    if(els.startSpotifyLoginBtn) els.startSpotifyLoginBtn.onclick=async()=>{ await savePlayerNameFromStart(); loginSpotify(redirectUri(), window.location.href); };
    if(els.testSpotifyBtn) els.testSpotifyBtn.onclick=testSpotifyConnection;
    if(els.createLobbyBtn) els.createLobbyBtn.onclick=async()=>{
      await savePlayerNameFromStart();
      await switchRoom(await createUniqueLobbyCode(), true);
      status(els.startStatus,'Lobby '+activeRoomId+' skapad. Dela koden eller l?nken.','ok');
    };
    if(els.joinLobbyBtn) els.joinLobbyBtn.onclick=async()=>{
      const code = normalizeRoomId(els.lobbyCodeInput?.value || '');
      if(!code || code === ROOM_ID){ status(els.startStatus,'Skriv en lobbykod först.','warn'); return; }
      await savePlayerNameFromStart();
      if(!await roomExists(code)){ status(els.startStatus,'Hittar ingen lobby med kod '+code+'.','bad'); return; }
      await switchRoom(code, false);
      status(els.startStatus,'Du är med i lobby '+activeRoomId+'.','ok');
    };
    if(els.copyShareLinkBtn) els.copyShareLinkBtn.onclick=async()=>{
      try{
        const link = shareLink();
        if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
        else { els.shareLinkInput?.select(); document.execCommand('copy'); }
        status(els.startStatus,'Länken är kopierad.','ok');
      }catch(err){
        status(els.startStatus,'Kunde inte kopiera l?nken automatiskt.','warn');
      }
    };
    if(els.leaveLobbyBtn) els.leaveLobbyBtn.onclick=leaveLobby;
    if(els.enterGameBtn) els.enterGameBtn.onclick=async()=>{
      await savePlayerNameFromStart();
      if(!activeRoomId){
        status(els.startStatus,'Skapa en lobby eller gå med med en kod först.','warn');
        return;
      }
      if(!roomData?.meta?.hostId && !await roomExists(activeRoomId)){
        status(els.startStatus,'Skapa en lobby eller gå med med en kod först.','warn');
        return;
      }
      localStorage.setItem(LS.startDone,'1');
      updateStartScreen();
      status(els.connectionStatus,'Ansluten till lobby '+activeRoomId+'.','ok');
    };
    const startFooter = document.querySelector('.startFooter');
    if(startFooter && els.enterGameBtn){
      startFooter.onclick=e=>{
        if(e.target?.closest?.('button') === els.enterGameBtn) return;
        els.enterGameBtn.click();
      };
      startFooter.onkeydown=e=>{
        if(e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        els.enterGameBtn.click();
      };
      startFooter.tabIndex = 0;
      startFooter.setAttribute('role','button');
      startFooter.setAttribute('aria-label','Forts?tt till spel');
    }
    if(els.spotifyLogoutBtn) els.spotifyLogoutBtn.onclick=async()=>{ localStorage.removeItem(LS.token); localStorage.removeItem(LS.spotifyProfile); player.avatarUrl=''; status(els.connectionStatus,'Utloggad från Spotify.','ok'); await upsertPlayer({avatarUrl:''}); renderProfile(); updateStartScreen(); };
    if(els.connectFirebaseBtn) els.connectFirebaseBtn.onclick=async()=>{
      try{
        await ensureFirebaseReady();
        status(els.connectionStatus,'Firebase anslutet.','ok');
      }catch(err){
        status(els.connectionStatus,'Firebase Auth saknas: '+err.message,'bad');
      }
    };
    if(els.resetRoomBtn) els.resetRoomBtn.onclick=resetRoom;
    if(els.saveNameBtn) els.saveNameBtn.onclick=async()=>{ player.name=(els.playerNameInput?.value||'Spelare').slice(0,32); localStorage.setItem(LS.playerName,player.name); await upsertPlayer(); };
    if(els.utilityEndGameBtn) els.utilityEndGameBtn.onclick=endGame;
    if(els.utilityCloseLobbyBtn) els.utilityCloseLobbyBtn.onclick=()=>closeLobby('manual');
    if(els.autoPlaySpotifyToggle){ const savedAutoplay = localStorage.getItem(LS.autoplay); els.autoPlaySpotifyToggle.checked = savedAutoplay === null  true : savedAutoplay === '1'; if(savedAutoplay === null) localStorage.setItem(LS.autoplay,'1'); els.autoPlaySpotifyToggle.onchange=()=>localStorage.setItem(LS.autoplay, els.autoPlaySpotifyToggle.checked?'1':'0'); }
    document.querySelectorAll('.modeButton[data-game-mode]').forEach(button => {
      button.onclick=()=>updateRoomSettings({gameMode:button.dataset.gameMode});
    });
    if(els.partyModeToggle) els.partyModeToggle.onchange=()=>updateRoomSettings({partyModeEnabled:!!els.partyModeToggle.checked,gameMode:'quiz'});
    if(els.partyModeSelect) els.partyModeSelect.onchange=()=>updateRoomSettings({quizType:els.partyModeSelect.value,partyMode:els.partyModeSelect.value,gameMode:'quiz'});
    if(els.quizTimerSelect) els.quizTimerSelect.onchange=()=>updateRoomSettings({gameTimerSeconds:Number(els.quizTimerSelect.value || 0),quizTimerSeconds:Number(els.quizTimerSelect.value || 0)});
    if(els.quizSongLimitSelect) els.quizSongLimitSelect.onchange=()=>updateRoomSettings({quizSongLimit:els.quizSongLimitSelect.value === 'all'  'all' : Number(els.quizSongLimitSelect.value || 0),gameMode:'quiz'});
    if(els.timelineWinScoreSelect) els.timelineWinScoreSelect.onchange=()=>updateRoomSettings({timelineWinScore:Number(els.timelineWinScoreSelect.value || WIN_SCORE),gameMode:'timeline'});
    els.importPlaylistBtn.onclick=importPlaylist;
    els.createDemoBtn.onclick=createDemo;
    els.refreshPlaylistsBtn.onclick=refreshPlaylists;
    els.selectPlaylistBtn.onclick=selectPlaylist;
    if(els.addPlaylistBtn) els.addPlaylistBtn.onclick=addPlaylistToMix;
    els.startGameBtn.onclick=()=>{
      const isHost = roomData?.meta?.hostId === player.id;
      if(roomData?.game?.status==='playing'){
        if(isHost) endGame().catch(err=>status(els.playlistStatus,'Kunde inte avsluta spel: '+(err?.message || err),'bad'));
        return;
      }
      if(isHost) startGame().catch(err=>status(els.playlistStatus,'Kunde inte starta spel: '+(err?.message || err),'bad'));
      else toggleReady().catch(err=>status(els.playlistStatus,'Kunde inte markera redo: '+(err?.message || err),'bad'));
    };
    els.drawCardBtn.onclick=drawCard;
    els.confirmPlacementBtn.onclick=()=>{ if(isQuizGame()) revealPartyRound(); else confirmPlacement(); };
    els.lockInBtn.onclick=lockIn;
    if(els.playSpotifyBtn) els.playSpotifyBtn.onclick=()=>playCurrentSpotify(true);
    document.addEventListener('click', e=>{
      const removeMixKey = e.target?.closest?.('[data-remove-mix-playlist]')?.dataset?.removeMixPlaylist;
      if(removeMixKey){ removePlaylistFromMix(removeMixKey); return; }
      const quizHostAction = e.target?.closest?.('[data-quiz-host-action]')?.dataset?.quizHostAction;
      if(quizHostAction === 'draw' || quizHostAction === 'next'){ drawCard(); return; }
      if(quizHostAction === 'reveal'){ revealPartyRound(); return; }
      const partyChoice = e.target?.closest?.('[data-party-choice]')?.dataset?.partyChoice;
      if(partyChoice){ submitPartyAnswer(partyChoice); return; }
      const action = e.target?.closest?.('[data-result-action]')?.dataset?.resultAction;
      if(!action) return;
      if(action === 'play-again') startGame().catch(err=>status(els.playlistStatus,'Kunde inte starta spel: '+(err?.message || err),'bad'));
      if(action === 'settings') returnToLobbySettings();
      if(action === 'close-lobby') closeLobby('manual');
    });
  }

  async function init(){
    if(urlRoom) localStorage.removeItem(LS.startDone);
    window.musicTimelineDebug={VERSION,connectFirebase,roomRef,createDemo,startGame,endGame,drawCard,confirmPlacement,lockIn,setProposedIndex,activePlayers:()=>activePlayersFrom(roomData.players||{}),get room(){return roomData},get player(){return player},get roomId(){return activeRoomId}};
    ensurePlaylistSettingsUi();
    bind();
    updateStartScreen();
    try{ if(await handleSpotifyCallback(redirectUri(), syncSpotifyProfile)){ status(els.connectionStatus,'Spotify ar anslutet.','ok'); updateStartScreen(); } }catch(err){ console.error(err); status(els.connectionStatus,err.message,'bad'); }
    if(!validToken(readToken()) && await getValidSpotifyToken()){ updateStartScreen(); renderProfile(); }
    try{
      await ensureFirebaseReady();
    }catch(err){
      status(els.connectionStatus,'Firebase Auth saknas: '+err.message,'bad');
    }
    const cachedProfile = spotifyProfileCache();
    if(validToken(readToken()) && (!cachedProfile || !cachedProfile.updatedAt || now() - cachedProfile.updatedAt > 24*60*60*1000)){ syncSpotifyProfile(); }
    status(els.connectionStatus,'Appen är laddad. Version '+VERSION+'.','ok');
  }
  init();
})();





