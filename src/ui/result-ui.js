import { WIN_SCORE } from '../config.js';
import { cardId, esc, lockedCount, pendingCount, timelineOf } from '../utils/helpers.js';

export function renderFinishedResultsScene({ drawCardWrap, players, roomData, coverForCard, playerRgb, isHost=false }){
  const mode = String(roomData?.game?.mode || '');
  const isPartyGame = mode.startsWith('party-') || mode.startsWith('quiz-');
  const playerScore = player => isPartyGame ? Number(player?.score || 0) : lockedCount(player);
  const sortedPlayers = players.slice().sort((a,b)=>{
    const scoreDiff = playerScore(b) - playerScore(a);
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
      isHost,
      mode: roomData?.game?.mode || '',
      players: sortedPlayers.map(p=>({
        id:p.id,
        name:p.name,
        score:playerScore(p),
        locked:lockedCount(p),
        pending:pendingCount(p),
        timeline:timelineOf(p).map(c=>cardId(c)+'|'+(c.year||'')+'|'+(c.status||''))
      }))
  });

  const existingScene = drawCardWrap.querySelector('.planetResultsScene');
  if(existingScene && existingScene.dataset.resultKey === resultKey) return;

  const scene=document.createElement('section');
  scene.className='planetResultsScene'+(isPartyGame ? ' quizResultsScene' : '');
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
      '<div class="planetResultActions">'+
        '<button class="primary" type="button" data-result-action="play-again"'+(isHost?'':' disabled')+'>Spela igen</button>'+
        '<button class="secondary" type="button" data-result-action="settings"'+(isHost?'':' disabled')+'>Ändra spelinställningar</button>'+
        '<button class="danger" type="button" data-result-action="close-lobby"'+(isHost?'':' disabled')+'>Avsluta lobby</button>'+
      '</div>'+
      (isHost ? '' : '<p class="tiny planetHostHint">Väntar på host.</p>')+
    '</div>'+
    '<div class="planetList"></div>';

  const list=scene.querySelector('.planetList');
  sortedPlayers.forEach((p,i)=>{
    const rank=i+1;
    const item=document.createElement('article');
    item.className='planetResult planetRank'+rank+(roomData?.game?.winnerId===p.id?' winner':'');
    item.style.setProperty('--player-rgb', playerRgb(p.id));
    if(isPartyGame){
      const centerAngle = -90;
      const spread = sortedPlayers.length <= 1 ? 0 : Math.min(260, (sortedPlayers.length - 1) * 58);
      const startAngle = centerAngle - (spread / 2);
      const angle = sortedPlayers.length <= 1 ? centerAngle : startAngle + (spread * i / (sortedPlayers.length - 1));
      item.style.setProperty('--quiz-angle', angle+'deg');
    }
    const tl = timelineOf(p).slice().sort((a,b)=>(Number(a.year)||0)-(Number(b.year)||0));
    const timelineHtml = isPartyGame
      ? '<p class="planetTimelineEmpty quizCorrectCount">'+playerScore(p)+' rätt i Quiz-mode</p>'
      : (tl.length
        ? tl.map(c=>{
            const cover = coverForCard(c);
            const img = cover ? '<img src="'+esc(cover)+'" alt="" loading="lazy">' : '';
            return '<div class="planetTimelineCard '+esc(c.status||'locked')+'">'+img+'<span>'+esc(String(c.year || '?'))+'</span></div>';
          }).join('')
        : '<p class="planetTimelineEmpty">Ingen tidslinje</p>');

    item.innerHTML=
      '<div class="planetShape" aria-hidden="true"><span></span></div>'+
      '<div class="planetResultText">'+
        '<div><strong>'+rank+'</strong><b>'+esc(p.name||'Spelare')+'</b></div>'+
        '<small>'+(isPartyGame ? (playerScore(p)+' poäng') : (lockedCount(p)+'/'+WIN_SCORE+' låsta kort'))+'</small>'+
      '</div>'+
      '<div class="planetPlayerTimeline" aria-label="'+(isPartyGame ? 'Quizresultat för ' : 'Tidslinje för ')+esc(p.name||'Spelare')+'">'+timelineHtml+'</div>';
    list.appendChild(item);
  });

  drawCardWrap.innerHTML='';
  drawCardWrap.appendChild(scene);
}
