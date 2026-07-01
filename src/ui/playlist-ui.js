export function refreshSavedPlaylistSelect(savedPlaylistSelect, roomData){
  const playlists=roomData.savedPlaylists||{};
  const current=savedPlaylistSelect.value;
  savedPlaylistSelect.innerHTML='';
  const keys=Object.keys(playlists);
  if(!keys.length){ savedPlaylistSelect.innerHTML='<option value="">Ingen spellista sparad Ã¤n</option>'; return; }
  keys.forEach(k=>{
    const p=playlists[k];
    const opt=document.createElement('option');
    opt.value=k;
    opt.textContent=(p.name||k)+' ('+(p.songCount || (p.songs?Object.keys(p.songs).length:0))+' lÃ¥tar)';
    savedPlaylistSelect.appendChild(opt);
  });
  if(current && playlists[current]) savedPlaylistSelect.value=current;
  else if(roomData.selectedPlaylistId && playlists[roomData.selectedPlaylistId]) savedPlaylistSelect.value=roomData.selectedPlaylistId;
}
