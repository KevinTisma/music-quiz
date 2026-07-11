export function refreshSavedPlaylistSelect(savedPlaylistSelect, playlists={}, roomData={}){
  const current=savedPlaylistSelect.value;
  savedPlaylistSelect.innerHTML='';
  const keys=Object.keys(playlists);
  if(!keys.length){ savedPlaylistSelect.innerHTML='<option value="">Ingen spellista sparad än</option>'; return; }
  keys.forEach(k=>{
    const p=playlists[k];
    const opt=document.createElement('option');
    opt.value=k;
    const owner = p.attributedPlayerName ? ' · '+p.attributedPlayerName : '';
    opt.textContent=(p.name||k)+owner+' ('+(p.songCount || (p.songs?Object.keys(p.songs).length:0))+' låtar)';
    savedPlaylistSelect.appendChild(opt);
  });
  if(current && playlists[current]) savedPlaylistSelect.value=current;
  else if(roomData.selectedPlaylistId && playlists[roomData.selectedPlaylistId]) savedPlaylistSelect.value=roomData.selectedPlaylistId;
}
