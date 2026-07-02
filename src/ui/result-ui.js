import { WIN_SCORE } from '../config.js';
import { cardId, esc, lockedCount, pendingCount, timelineOf } from '../utils/helpers.js';

export function renderFinishedResultsScene({ drawCardWrap, players, roomData, coverForCard, playerRgb }){
  const sortedPlayers = players.slice().sort((a,b)=>{
    const scoreDiff = lockedCount(b) - lockedCount(a);
    if(scoreDiff) return scoreDiff;
    return pendingCount(b) - pendingCount(a);
  });

  if(!sortedPlayers.length){
    drawCardWrap.innerHTML='<section class="planetResultsScene"><p class="small">Inga spelare att visa.</p></section>';
    return;
  }

  const selectedPlaylist = roomData?.selectedPlaylist;
  const playlistName = selectedPlaylist?.name ? selectedPlaylist.name : '';
  const resultKey = JSON.stringify({
    playlist: roomData?.selectedPlaylistId || '',
    winner: roomData?.game?.winnerId || '',
    players: sortedPlayers.map(p=>({
      id:p.id,
      name:p.name,
      locked:lockedCount(p),
      pending:pendingCount(p),
      timeline:timelineOf(p).map(c=>cardId(c)+'|'+(c.year||'')+'|'+(c.status||''))
    }))
  });

  const existingScene = drawCardWrap.querySelector('.planetResultsScene');
  if(existingScene && existingScene.dataset.resultKey === resultKey) return;

  const scene=document.createElement('section');
  scene.className='planetResultsScene';
  scene.dataset.resultKey=resultKey;
  scene.innerHTML=
    '<div class="planetStars"></div>'+
    '<div class="planetSun"></div>'+
    '<div class="planetOrbit planetOrbit1"></div>'+
    '<div class="planetOrbit planetOrbit2"></div>'+
    '<div class="planetOrbit planetOrbit3"></div>'+
    '<div class="planetResultsTitle">'+
      '<span>Spellista:'+(playlistName ? ' '+esc(playlistName) : '')+'</span>'+
      '<b>Slutresultat</b>'+
    '</div>'+
    '<div class="planetList"></div>';

  const list=scene.querySelector('.planetList');
  sortedPlayers.forEach((p,i)=>{
    const rank=i+1;
    const item=document.createElement('article');
    item.className='planetResult planetRank'+rank+(roomData?.game?.winnerId===p.id?' winner':'');
    item.style.setProperty('--player-rgb', playerRgb(p.id));
    const tl = timelineOf(p).slice().sort((a,b)=>(Number(a.year)||0)-(Number(b.year)||0));
    const timelineHtml = tl.length
      ? tl.map(c=>{
          const cover = coverForCard(c);
          const img = cover ? '<img src="'+esc(cover)+'" alt="" loading="lazy">' : '';
          return '<div class="planetTimelineCard '+esc(c.status||'locked')+'">'+img+'<span>'+esc(String(c.year || '?'))+'</span></div>';
        }).join('')
      : '<p class="planetTimelineEmpty">Ingen tidslinje</p>';

    item.innerHTML=
      '<div class="planetShape" aria-hidden="true"><span></span></div>'+
      '<div class="planetResultText">'+
        '<div><strong>'+rank+'</strong><b>'+esc(p.name||'Spelare')+'</b></div>'+
        '<small>'+lockedCount(p)+'/'+WIN_SCORE+' lÃ¥sta kort</small>'+
      '</div>'+
      '<div class="planetPlayerTimeline" aria-label="Tidslinje fÃ¶r '+esc(p.name||'Spelare')+'">'+timelineHtml+'</div>';
    list.appendChild(item);
  });

  drawCardWrap.innerHTML='';
  drawCardWrap.appendChild(scene);
}
