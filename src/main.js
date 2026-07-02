import { ACTIVE_PLAYER_WINDOW_MS, LS, PLAYER_PALETTES, ROOM_ID, VERSION, VIEWED_TIMELINE_KEY, WIN_SCORE } from './config.js';
import { cardId, cleanKey, esc, getPlayerId, lockedCount, now, pendingCount, setText, shuffle, sortPlayers, status, timelineOf } from './utils/helpers.js';
import { readToken, spotifyFetch, validToken } from './spotify/spotify-api.js';
import { handleSpotifyCallback, loginSpotify } from './spotify/spotify-auth.js';
import { isSortedByYear, timelineWithProposal } from './modes/timeline-mode.js';
import { normalizeTrack, playlistIdFromInput } from './spotify/spotify-playlists.js';
import { getFirebaseDatabase, serverTimestamp } from './firebase/firebase.js';
import { getRoomRef, getUserRef, normalizeRoomId, playerRoomPath } from './firebase/rooms.js';
import { createRenderer } from './ui/render.js';

(() => {
  'use strict';


  let db = null, roomData = {}, userPlaylists = {}, roomListenerRef = null, roomListenerCallback = null, userPlaylistsListenerRef = null, userPlaylistsListenerCallback = null, heartbeatTimer = null, presenceRef = null, migrationInProgress = false, lobbyCleanupTimer = null, lobbyCleanupInProgress = false, closedRoomHandled = false;
  const LOBBY_MAX_AGE_MS = 4 * 60 * 60 * 1000;
  const LOBBY_INACTIVE_MS = 45 * 60 * 1000;
  const CLOSED_LOBBY_REMOVE_DELAY_MS = 1600;
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  let activeRoomId = normalizeRoomId(urlRoom || localStorage.getItem(LS.lobbyRoom) || ROOM_ID);
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
    spotifyLoginBtn:$('spotifyLoginBtn'), spotifyLogoutBtn:$('spotifyLogoutBtn'), connectFirebaseBtn:$('connectFirebaseBtn'), resetRoomBtn:$('resetRoomBtn'), playerNameInput:$('playerNameInput'), saveNameBtn:$('saveNameBtn'), utilityEndGameBtn:$('utilityEndGameBtn'), autoPlaySpotifyToggle:$('autoPlaySpotifyToggle'), redirectUriText:$('redirectUriText'), connectionStatus:$('connectionStatus'), playlistInput:$('playlistInput'), playlistNameInput:$('playlistNameInput'), importPlaylistBtn:$('importPlaylistBtn'), createDemoBtn:$('createDemoBtn'), savedPlaylistSelect:$('savedPlaylistSelect'), addPlaylistBtn:$('addPlaylistBtn'), selectedPlaylistList:$('selectedPlaylistList'), lobbySettingsNotice:$('lobbySettingsNotice'), selectPlaylistBtn:$('selectPlaylistBtn'), refreshPlaylistsBtn:$('refreshPlaylistsBtn'), playlistStatus:$('playlistStatus'), startGameBtn:$('startGameBtn'), drawCardBtn:$('drawCardBtn'), lockInBtn:$('lockInBtn'), playSpotifyBtn:$('playSpotifyBtn'), confirmPlacementBtn:$('confirmPlacementBtn'), turnTitle:$('turnTitle'), turnSub:$('turnSub'), playerStrip:$('playerStrip'), drawCardWrap:$('drawCardWrap'), gameStatus:$('gameStatus'), activePlayerBanner:$('activePlayerBanner'), activeTimelineTitle:$('activeTimelineTitle'), roundPill:$('roundPill'), activeTimeline:$('activeTimeline'), playerBoards:$('playerBoards'), ownTimeline:$('ownTimeline'), ownTimelineTitle:$('ownTimelineTitle'), ownTimelineToggle:$('ownTimelineToggle'), profileButton:$('profileButton'), profileMenu:$('profileMenu'), profileName:$('profileName'), profileSub:$('profileSub'), playlistButton:$('playlistButton'), playlistMenu:$('playlistMenu'), utilityMenu:$('utilityMenu'), playlistButtonSub:$('playlistButtonSub'), utilityLobbyCode:$('utilityLobbyCode'), versionPill:$('versionPill'), showCoverToggle:$('showCoverToggle'), showArtistToggle:$('showArtistToggle'), showTitleToggle:$('showTitleToggle'), startScreen:$('startScreen'), startPlayerNameInput:$('startPlayerNameInput'), startSpotifyLoginBtn:$('startSpotifyLoginBtn'), testSpotifyBtn:$('testSpotifyBtn'), createLobbyBtn:$('createLobbyBtn'), joinLobbyBtn:$('joinLobbyBtn'), lobbyCodeInput:$('lobbyCodeInput'), startStatus:$('startStatus'), roomCodeText:$('roomCodeText'), enterGameBtn:$('enterGameBtn'), shareLinkInput:$('shareLinkInput'), copyShareLinkBtn:$('copyShareLinkBtn'), hostStatusText:$('hostStatusText'), firebasePathText:$('firebasePathText'), lobbyPlayers:$('lobbyPlayers')
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
    const spotifyId = spotifyProfileCache()?.spotifyId;
    return cleanKey(spotifyId ? 'spotify_'+spotifyId : player.id);
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
        await upsertPlayer({name:player.name, avatarUrl:player.avatarUrl});
        renderProfile();
      }
    }catch(err){
      console.warn('[spotify-profile]', err);
    }
  }


  function connectFirebase(){
    if(db) return db;
    db = getFirebaseDatabase();
    setupPresence();
    listenRoom();
    listenUserPlaylists();
    upsertPlayer();
    return db;
  }
  function setupPresence(){
    if(!db) return;
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
  function scheduleLobbyExpiry(){
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    if(!roomData?.meta?.hostId || roomData?.meta?.status === 'closed') return;
    const createdAt = Number(roomData?.meta?.createdAt || 0);
    const lastActivity = lastRoomActivityMs();
    if(!createdAt && !lastActivity) return;
    const ageExpiresAt = createdAt ? createdAt + LOBBY_MAX_AGE_MS : Infinity;
    const inactiveExpiresAt = lastActivity ? lastActivity + LOBBY_INACTIVE_MS : Infinity;
    const expiresAt = Math.min(ageExpiresAt, inactiveExpiresAt);
    const ms = expiresAt - Date.now();
    if(ms <= 0){ closeLobby('timeout').catch(err=>console.warn('[lobby-timeout]',err)); return; }
    lobbyCleanupTimer = setTimeout(()=>closeLobby('timeout').catch(err=>console.warn('[lobby-timeout]',err)), Math.min(ms, 2147483647));
  }
  function handleClosedLobby(){
    if(closedRoomHandled) return;
    closedRoomHandled = true;
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    stopPresence();
    stopRoomListener();
    roomData = {};
    localStorage.removeItem(LS.startDone);
    localStorage.removeItem(LS.lobbyRoom);
    activeRoomId = ROOM_ID;
    syncRoomUrl();
    updateStartScreen();
    status(els.startStatus,'Lobbyn är avslutad. Skapa en ny lobby för att spela igen.','warn');
  }
  function listenRoom(){
    if(roomListenerRef) return;
    roomListenerRef = roomRef();
    roomListenerCallback = snap => {
      if(!snap.exists()){
        roomData = {};
        if(activeRoomId !== ROOM_ID && localStorage.getItem(LS.startDone) === '1'){ handleClosedLobby(); return; }
        render();
        return;
      }
      roomData = snap.val() || {};
      if(roomData?.meta?.status === 'closed'){ handleClosedLobby(); return; }
      closedRoomHandled = false;
      scheduleLobbyExpiry();
      migrateLegacyRoomPlaylists().catch(err=>console.warn('[playlist-migration]',err));
      render();
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
    localStorage.setItem(LS.lobbyRoom, activeRoomId);
    if(els.roomCodeText) setText(els.roomCodeText, activeRoomId);
    if(els.utilityLobbyCode) setText(els.utilityLobbyCode, activeRoomId);
    if(els.versionPill) setText(els.versionPill, VERSION);
    if(els.shareLinkInput) els.shareLinkInput.value = shareLink();
    if(els.firebasePathText) setText(els.firebasePathText, 'rooms/'+activeRoomId);
    const url = new URL(window.location.href);
    url.searchParams.set('room', activeRoomId);
    window.history.replaceState({}, '', url);
  }
  function shareLink(){
    const url = new URL(window.location.href);
    url.searchParams.set('room', activeRoomId);
    return url.toString();
  }
  function stopRoomListener(){
    if(roomListenerRef && roomListenerCallback) roomListenerRef.off('value', roomListenerCallback);
    roomListenerRef = null;
    roomListenerCallback = null;
  }
  async function switchRoom(roomId, asHost=false){
    const nextRoomId = normalizeRoomId(roomId);
    if(db && nextRoomId !== activeRoomId){
      db.ref(playerRoomPath(player.id, activeRoomId)).update({online:false,lastSeen:serverTimestamp()}).catch(()=>{});
    }
    activeRoomId = nextRoomId;
    closedRoomHandled = false;
    lobbyCleanupInProgress = false;
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    syncRoomUrl();
    roomData = {};
    stopRoomListener();
    if(db) setupPresence();
    connectFirebase();
    listenRoom();
    restartUserPlaylistsListener();
    const roomMeta = asHost ? {
      hostId:player.id,
      code:activeRoomId,
      status:'lobby',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    } : {
      code:activeRoomId,
      updatedAt:serverTimestamp()
    };
    roomRef('meta').update(roomMeta).catch(err => status(els.startStatus,'Kunde inte spara lobby: '+err.message,'bad'));
    upsertPlayer({ready:true}).catch(err => status(els.startStatus,'Kunde inte ansluta spelaren: '+err.message,'bad'));
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
    connectFirebase();
    for(let i=0;i<8;i++){
      const code = createLobbyCode();
      const snap = await getRoomRef(db, 'meta', code).get();
      if(!snap.exists()) return code;
    }
    return createLobbyCode();
  }
  async function roomExists(roomId){
    connectFirebase();
    const snap = await getRoomRef(db, 'meta', roomId).get();
    return snap.exists();
  }
  function updateStartScreen(){
    syncRoomUrl();
    if(els.startPlayerNameInput && els.startPlayerNameInput.value !== player.name) els.startPlayerNameInput.value = player.name;
    if(els.lobbyCodeInput) els.lobbyCodeInput.value = activeRoomId === ROOM_ID ? '' : activeRoomId;
    const spotifyConnected = validToken(readToken());
    if(els.startSpotifyLoginBtn){
      els.startSpotifyLoginBtn.disabled = spotifyConnected;
      els.startSpotifyLoginBtn.textContent = spotifyConnected ? 'Spotify anslutet' : 'Koppla Spotify';
      els.startSpotifyLoginBtn.className = spotifyConnected ? 'spotifyConnectedButton' : 'primary';
      els.startSpotifyLoginBtn.setAttribute('aria-disabled', spotifyConnected ? 'true' : 'false');
    }
    renderLobbySummary();
    const done = localStorage.getItem(LS.startDone) === '1';
    document.body.classList.toggle('startOpen', !done);
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
      const badges = (p.id === hostId ? '<span class="pill">Host</span>' : '') + (p.id === player.id ? '<span class="pill">Du</span>' : '');
      return '<div class="lobbyPlayer"><span class="lobbyPlayerName">'+esc(p.name || 'Spelare')+'</span><span class="lobbyPlayerBadges">'+badges+'</span></div>';
    }).join('');
  }
  async function savePlayerNameFromStart(){
    const input = els.startPlayerNameInput || els.playerNameInput;
    player.name = (input?.value || player.name || 'Spelare').slice(0,32);
    localStorage.setItem(LS.playerName, player.name);
    if(els.playerNameInput) els.playerNameInput.value = player.name;
    upsertPlayer().catch(err => status(els.startStatus,'Kunde inte spara spelaren: '+err.message,'bad'));
  }
  async function testSpotifyConnection(){
    try{
      if(!validToken(readToken())) throw new Error('Koppla Spotify först.');
      const profile = await spotifyFetch('/me');
      applySpotifyProfile(profile);
      await upsertPlayer({name:player.name, avatarUrl:player.avatarUrl});
      status(els.startStatus,'Spotify svarar som '+(player.name || 'spelare')+'.','ok');
      status(els.connectionStatus,'Spotify anslutet.','ok');
      renderProfile();
      updateStartScreen();
    }catch(err){
      status(els.startStatus,'Spotify-test misslyckades: '+err.message,'bad');
    }
  }
  async function upsertPlayer(extra={}){
    connectFirebase();
    const name=(player.name || 'Spelare').slice(0,32);
    const existing = roomData?.players?.[player.id] || {};
    await roomRef('players/'+player.id).update({id:player.id,name,avatarUrl:player.avatarUrl||'',ready:!!player.ready,online:true,joinedAt:existing.joinedAt || serverTimestamp(),lastSeen:serverTimestamp(),timeline:timelineOf(existing),...extra});
  }

  async function importPlaylist(){
    const btn = els.importPlaylistBtn;
    try{
      const pid=playlistIdFromInput(els.playlistInput.value); if(!pid) throw new Error('Klistra in en Spotify-spellista först.');
      const appName=(els.playlistNameInput?.value || '').trim();
      if(!appName) throw new Error('Skriv ett namn för spellistan i appen först.');
      const limit=50;
      let offset=0;
      let total=null;
      const songs=[];
      if(btn) btn.disabled = true;
      status(els.playlistStatus,'Importerar hela spellistan. Hämtar första 50 låtarna...', 'warn');
      // Spotify ändrade playlist-endpointen 2026: /tracks är borttagen i Development Mode.
      // Den nya endpointen är /items och själva låten ligger i item i stället för track.
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
      await savePlaylist(pid,appName.slice(0,48),songs,'spotify');
      status(els.playlistStatus,'Sparade "'+appName.slice(0,48)+'" med '+songs.length+' låtar.','ok');
    }catch(err){ console.error('[playlist-import]',err); status(els.playlistStatus,'Kunde inte importera: '+err.message,'bad'); }
    finally{ if(btn) btn.disabled = false; }
  }
  async function savePlaylist(pid,name,songs,source){
    connectFirebase();
    const id = cleanKey(pid);
    const ownerId = currentUserId();
    const playlist = {id:pid,name,source:source||'manual',songCount:songs.length,importedAt:serverTimestamp(),songs};
    await userRef('playlists/'+id).set(playlist);
    await savePlaylistToRoomMix(id, {id,ownerId,name,source:playlist.source}, songs);
  }
  async function migrateLegacyRoomPlaylists(){
    if(migrationInProgress || !db || !roomData?.savedPlaylists) return;
    migrationInProgress = true;
    try{
      const updates = {};
      Object.entries(roomData.savedPlaylists || {}).forEach(([key,playlist]) => {
        const id = cleanKey(playlist?.id || key);
        updates['playlists/'+id] = {...playlist,id:playlist?.id || key,migratedFromRoom:activeRoomId,migratedAt:serverTimestamp()};
      });
      if(Object.keys(updates).length) await userRef().update(updates);
      await roomRef().update({savedPlaylists:null,songBanks:null});
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
    await savePlaylist('demo-3-songs','Demo-spellista med 3 låtar',songs,'demo');
    status(els.playlistStatus,'Demo-spellista skapad.','ok');
  }
  function playlistMixEntries(nextEntry=null){
    const entries = {...(roomData.playlistMix || {})};
    if(nextEntry) entries[nextEntry.key] = nextEntry.value;
    return entries;
  }
  function songsFromPlaylistMix(entries=roomData.playlistMix || {}){
    return Object.values(entries).flatMap(entry => {
      const songs = entry?.songs;
      return Array.isArray(songs) ? songs : Object.values(songs || {});
    });
  }
  async function savePlaylistToRoomMix(id, playlist, songs){
    const ownerId = currentUserId();
    const key = cleanKey(ownerId+'_'+id);
    const entry = {
      id,
      ownerId,
      playerId:player.id,
      playerName:player.name || 'Spelare',
      name:playlist.name || id,
      source:playlist.source || 'manual',
      songCount:songs.length,
      songs,
      addedAt:serverTimestamp()
    };
    const entries = playlistMixEntries({key,value:entry});
    const mixedSongs = songsFromPlaylistMix(entries);
    await roomRef().update({
      playlistMix:entries,
      songBank:mixedSongs,
      selectedPlaylistId:'mixed',
      selectedPlaylist:{id:'mixed',ownerId:'room',name:'Blandad spellista',source:'mixed',songCount:mixedSongs.length},
      'meta/updatedAt':serverTimestamp()
    });
  }
  async function refreshPlaylists(){
    connectFirebase();
    await migrateLegacyRoomPlaylists();
    const snap=await userRef('playlists').get();
    const playlists=snap.val()||{};
    const current=els.savedPlaylistSelect.value;
    els.savedPlaylistSelect.innerHTML='';
    const keys=Object.keys(playlists);
    if(!keys.length){ els.savedPlaylistSelect.innerHTML='<option value="">Ingen spellista sparad än</option>'; return; }
    keys.forEach(k=>{ const p=playlists[k]; const opt=document.createElement('option'); opt.value=k; opt.textContent=(p.name||k)+' ('+(p.songCount || (p.songs?Object.keys(p.songs).length:0))+' låtar)'; els.savedPlaylistSelect.appendChild(opt); });
    if(current && playlists[current]) els.savedPlaylistSelect.value=current;
  }
  async function selectPlaylist(){
    connectFirebase();
    const id=els.savedPlaylistSelect.value; if(!id) return;
    const snap=await userRef('playlists/'+id+'/songs').get();
    let songs=snap.val(); if(!Array.isArray(songs)) songs=Object.values(songs||{});
    if(!songs.length) throw new Error('Spellistan saknar låtar.');
    const playlist = userPlaylists?.[id] || {};
    await roomRef().update({selectedPlaylistId:id,selectedPlaylist:{id,ownerId:currentUserId(),name:playlist.name||id,source:playlist.source||'manual',songCount:songs.length},songBank:songs,'meta/updatedAt':serverTimestamp()});
    status(els.playlistStatus,'Vald spellista används nu.','ok');
  }
  async function addPlaylistToMix(){
    connectFirebase();
    try{
      const id=els.savedPlaylistSelect?.value;
      if(!id) throw new Error('Välj en spellista först.');
      const snap=await userRef('playlists/'+id).get();
      const playlist=snap.val() || userPlaylists?.[id] || {};
      let songs=playlist.songs;
      if(!Array.isArray(songs)) songs=Object.values(songs||{});
      if(!songs.length) throw new Error('Spellistan saknar låtar.');
      await savePlaylistToRoomMix(id, playlist, songs);
      status(els.playlistStatus,'Spellistan lades till i den blandade spellistan.','ok');
    }catch(err){
      status(els.playlistStatus,'Kunde inte lägga till spellista: '+err.message,'bad');
    }
  }

  function getSongs(){ const s=roomData.songBank; return Array.isArray(s)?s:Object.values(s||{}); }
  async function songsFromSelectedPlaylist(){
    const id=els.savedPlaylistSelect?.value;
    if(!id) return null;
    const snap=await userRef('playlists/'+id+'/songs').get();
    let songs=snap.val();
    if(!Array.isArray(songs)) songs=Object.values(songs||{});
    if(!songs.length) return null;
    const playlist = userPlaylists?.[id] || {};
    await roomRef().update({selectedPlaylistId:id,selectedPlaylist:{id,ownerId:currentUserId(),name:playlist.name||id,source:playlist.source||'manual',songCount:songs.length},songBank:songs});
    return songs;
  }
  async function startGame(){
    connectFirebase();
    const hostId = roomData?.meta?.hostId || '';
    if(hostId !== player.id){ status(els.gameStatus,'Endast host kan starta spelet.','bad'); return; }
    const hasPlaylistMix = Object.keys(roomData.playlistMix || {}).length > 0;
    const selectedSongs = hasPlaylistMix ? null : await songsFromSelectedPlaylist().catch(err=>{ console.warn('[playlist-select]',err); return null; });
    const songs=selectedSongs || getSongs(); if(!songs.length){ status(els.gameStatus,'Välj eller skapa en spellista först.','bad'); return; }
    const players=activePlayersFrom(roomData.players || {});
    if(!players.length){ await upsertPlayer(); }
    const allPlayers=activePlayersFrom((await roomRef('players').get()).val()||{});
    const deck=shuffle(songs).map((s,i)=>({...s,drawId:'d_'+i+'_'+cleanKey(cardId(s))}));
    const updates={};
    allPlayers.forEach(p=>{ updates['players/'+p.id+'/timeline']=[]; updates['players/'+p.id+'/ready']=false; updates['players/'+p.id+'/activeProposal']=null; });
    updates['meta/updatedAt']=serverTimestamp();
    updates['meta/status']='playing';
    updates.game={status:'playing',startedAt:serverTimestamp(),turnPlayerId:allPlayers[0]?.id || player.id,turnNumber:1,deck,discard:[],currentCard:null,proposedIndex:null,message:'Spelet startat. Aktiv spelare drar första kortet.',winnerId:null,cardVisibility:readVisibilityToggles(),wrongReveal:null};
    await roomRef().update(updates);
  }
  async function drawCard(){
    if(!isMeActive()) return;
    const game=roomData.game||{};
    if(game.currentCard){ status(els.gameStatus,'Placera och bekräfta det aktuella kortet först.','warn'); return; }
    const deck=Array.isArray(game.deck)?[...game.deck]:[];
    if(!deck.length){ status(els.gameStatus,'Kortleken är slut. Lås in eller starta om.','warn'); return; }
    const card=deck.shift();
    await roomRef().update({'game/deck':deck,'game/currentCard':card,'game/proposedIndex':null,'game/wrongReveal':null,'game/message':'Dra kortet till rätt plats i tidslinjen.',['players/'+player.id+'/activeProposal']:null});
    playCurrentSpotify(false);
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
      status(els.gameStatus,'Rätt. Kortet är gult och riskeras tills du låser in.','ok');
    }else{
      const pending=timeline.filter(c=>c.status==='pending');
      const locked=timeline.filter(c=>c.status==='locked');
      const returnCards=[...pending,card].map(c=>{ const x={...c}; delete x.status; return x; });
      const deck=[...(Array.isArray(game.deck)?game.deck:[]),...shuffle(returnCards)];
      const nextId = nextPlayerId(player.id);
      const until = Date.now() + 5000;
      await roomRef('game').update({wrongReveal:{card:{...card,status:'wrong'},playerId:player.id,until,year:card.year},message:'Fel placering. Rätt år var '+card.year+'. Nästa spelares tur om 5 sekunder.'});
      status(els.gameStatus,'Fel. Rätt år var '+card.year+'. Du förlorar gula kort från rundan.','bad');
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
    if(!timeline.some(c=>c.status==='pending')){ status(els.gameStatus,'Du har inga gula kort att låsa in. Dra ett kort eller passa turen.','warn'); return; }
    const locked=timeline.map(c=>({...c,status:'locked'}));
    const score=locked.length;
    const updates={['players/'+player.id+'/timeline']:locked,['players/'+player.id+'/score']:score,['players/'+player.id+'/activeProposal']:null};
    if(score>=WIN_SCORE){
      updates['game/status']='finished'; updates['game/winnerId']=player.id; updates['game/message']=(me.name||player.name)+' vann med '+score+' låsta kort.';
      updates['meta/status']='finished'; updates['meta/updatedAt']=serverTimestamp();
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
    connectFirebase();
    const updates = {'game':null,'songBank':null,'selectedPlaylistId':null,'selectedPlaylist':null,'playlistMix':null,'playlistImportDebug':null};
    const players = roomData.players || {};
    Object.keys(players).forEach(id => { updates['players/'+id+'/timeline'] = []; updates['players/'+id+'/score'] = 0; updates['players/'+id+'/ready'] = false; updates['players/'+id+'/activeProposal'] = null; });
    updates['meta/status']='lobby';
    updates['meta/updatedAt']=serverTimestamp();
    await roomRef().update(updates);
    status(els.playlistStatus,'Spelet är avslutat och sessionens låtdata är rensad.','ok');
  }
  async function returnToLobbySettings(){
    connectFirebase();
    const hostId = roomData?.meta?.hostId || '';
    if(hostId !== player.id){ status(els.gameStatus,'Endast host kan ändra spelinställningar.','bad'); return; }
    const updates = {'game':null,'meta/status':'lobby','meta/updatedAt':serverTimestamp()};
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
    connectFirebase();
    if(lobbyCleanupInProgress) return;
    const hostId = roomData?.meta?.hostId || '';
    if(reason === 'manual' && hostId !== player.id){ status(els.gameStatus,'Endast host kan avsluta lobbyn.','bad'); return; }
    if(reason === 'manual' && !confirm('Avsluta lobbyn? Detta tar bort rummet för alla spelare.')) return;
    lobbyCleanupInProgress = true;
    const ref = roomRef();
    if(lobbyCleanupTimer){ clearTimeout(lobbyCleanupTimer); lobbyCleanupTimer = null; }
    await ref.child('meta').update({status:'closed',closedAt:serverTimestamp(),closedBy:player.id,closeReason:reason});
    stopPresence();
    setTimeout(()=>ref.remove().catch(err=>console.warn('[close-lobby]',err)), CLOSED_LOBBY_REMOVE_DELAY_MS);
  }

  async function resetRoom(){
    connectFirebase();
    if(!confirm('Resetta rummet? Detta tar bort spel och spelare i lobby '+activeRoomId+'. Dina sparade spellistor finns kvar.')) return;
    await roomRef().remove(); roomData={}; await upsertPlayer({timeline:[],score:0}); status(els.connectionStatus,'Rummet är återställt.','ok');
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
    if(els.roomCodeText) setText(els.roomCodeText, activeRoomId);
    if(els.lobbyCodeInput) els.lobbyCodeInput.value = activeRoomId === ROOM_ID ? '' : activeRoomId;
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
    if(els.spotifyLoginBtn) els.spotifyLoginBtn.onclick=()=>loginSpotify(redirectUri());
    if(els.startSpotifyLoginBtn) els.startSpotifyLoginBtn.onclick=async()=>{ await savePlayerNameFromStart(); loginSpotify(redirectUri()); };
    if(els.testSpotifyBtn) els.testSpotifyBtn.onclick=testSpotifyConnection;
    if(els.createLobbyBtn) els.createLobbyBtn.onclick=async()=>{
      await savePlayerNameFromStart();
      await switchRoom(await createUniqueLobbyCode(), true);
      status(els.startStatus,'Lobby '+activeRoomId+' skapad. Dela koden eller länken.','ok');
    };
    if(els.joinLobbyBtn) els.joinLobbyBtn.onclick=async()=>{
      const code = normalizeRoomId(els.lobbyCodeInput?.value || '');
      if(code === ROOM_ID){ status(els.startStatus,'Skriv en lobbykod först.','warn'); return; }
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
        status(els.startStatus,'Kunde inte kopiera länken automatiskt.','warn');
      }
    };
    if(els.enterGameBtn) els.enterGameBtn.onclick=async()=>{
      await savePlayerNameFromStart();
      if(!roomData?.meta?.hostId && !await roomExists(activeRoomId)){
        status(els.startStatus,'Skapa en lobby eller gå med med en kod först.','warn');
        return;
      }
      localStorage.setItem(LS.startDone,'1');
      updateStartScreen();
      status(els.connectionStatus,'Ansluten till lobby '+activeRoomId+'.','ok');
    };
    if(els.spotifyLogoutBtn) els.spotifyLogoutBtn.onclick=async()=>{ localStorage.removeItem(LS.token); localStorage.removeItem(LS.spotifyProfile); player.avatarUrl=''; status(els.connectionStatus,'Utloggad från Spotify.','ok'); await upsertPlayer({avatarUrl:''}); renderProfile(); updateStartScreen(); };
    if(els.connectFirebaseBtn) els.connectFirebaseBtn.onclick=()=>{ connectFirebase(); status(els.connectionStatus,'Firebase anslutet.','ok'); };
    if(els.resetRoomBtn) els.resetRoomBtn.onclick=resetRoom;
    if(els.saveNameBtn) els.saveNameBtn.onclick=async()=>{ player.name=(els.playerNameInput?.value||'Spelare').slice(0,32); localStorage.setItem(LS.playerName,player.name); await upsertPlayer(); };
    if(els.utilityEndGameBtn) els.utilityEndGameBtn.onclick=endGame;
    if(els.autoPlaySpotifyToggle){ const savedAutoplay = localStorage.getItem(LS.autoplay); els.autoPlaySpotifyToggle.checked = savedAutoplay === null ? true : savedAutoplay === '1'; if(savedAutoplay === null) localStorage.setItem(LS.autoplay,'1'); els.autoPlaySpotifyToggle.onchange=()=>localStorage.setItem(LS.autoplay, els.autoPlaySpotifyToggle.checked?'1':'0'); }
    els.importPlaylistBtn.onclick=importPlaylist;
    els.createDemoBtn.onclick=createDemo;
    els.refreshPlaylistsBtn.onclick=refreshPlaylists;
    els.selectPlaylistBtn.onclick=selectPlaylist;
    if(els.addPlaylistBtn) els.addPlaylistBtn.onclick=addPlaylistToMix;
    els.startGameBtn.onclick=()=>{ if(roomData?.game?.status==='playing') endGame(); else startGame(); };
    els.drawCardBtn.onclick=drawCard;
    els.confirmPlacementBtn.onclick=confirmPlacement;
    els.lockInBtn.onclick=lockIn;
    if(els.playSpotifyBtn) els.playSpotifyBtn.onclick=()=>playCurrentSpotify(true);
    document.addEventListener('click', e=>{
      const action = e.target?.closest?.('[data-result-action]')?.dataset?.resultAction;
      if(!action) return;
      if(action === 'play-again') startGame();
      if(action === 'settings') returnToLobbySettings();
      if(action === 'close-lobby') closeLobby('manual');
    });
  }

  async function init(){
    if(urlRoom) localStorage.removeItem(LS.startDone);
    window.musicTimelineDebug={VERSION,connectFirebase,roomRef,createDemo,startGame,endGame,drawCard,confirmPlacement,lockIn,setProposedIndex,activePlayers:()=>activePlayersFrom(roomData.players||{}),get room(){return roomData},get player(){return player},get roomId(){return activeRoomId}};
    bind();
    updateStartScreen();
    try{ if(await handleSpotifyCallback(redirectUri(), syncSpotifyProfile)){ status(els.connectionStatus,'Spotify ar anslutet.','ok'); updateStartScreen(); } }catch(err){ console.error(err); status(els.connectionStatus,err.message,'bad'); }
    connectFirebase();
    const cachedProfile = spotifyProfileCache();
    if(validToken(readToken()) && (!cachedProfile || !cachedProfile.updatedAt || now() - cachedProfile.updatedAt > 24*60*60*1000)){ syncSpotifyProfile(); }
    status(els.connectionStatus,'Appen är laddad. Version '+VERSION+'.','ok');
  }
  init();
})();





