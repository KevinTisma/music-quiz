import { VIEWED_TIMELINE_KEY, WIN_SCORE } from '../config.js';
import { esc, lockedCount } from '../utils/helpers.js';

export function renderPlayerStrip({ playerStrip, players, roomData, viewedTimelinePlayerId, fallbackPlayerId, playerRgb, onSelectPlayer }){
  playerStrip.innerHTML='';
  if(!players.length){ playerStrip.innerHTML='<p class="small">Inga spelare Ã¤nnu.</p>'; return viewedTimelinePlayerId; }
  let activeViewedId = viewedTimelinePlayerId;
  if(!players.some(p=>p.id===activeViewedId)) activeViewedId = fallbackPlayerId;
  players.forEach(p=>{
    const div=document.createElement('button');
    div.type='button';
    div.className='playerTile'+(p.id===roomData?.game?.turnPlayerId?' active':'')+(roomData?.game?.winnerId===p.id?' winner':'')+(p.id===activeViewedId?' viewing':'');
    div.style.setProperty('--player-rgb', playerRgb(p.id));
    div.title='Visa '+(p.name||'spelarens')+' tidslinje';
    const hostBadge = p.id === roomData?.meta?.hostId ? ' <span class="scoreLabel">Host</span>' : '';
    div.innerHTML='<div class="playerName">'+esc(p.name||'Spelare')+hostBadge+'</div><div class="playerScore">'+lockedCount(p)+'<span class="scoreLabel"> / '+WIN_SCORE+'</span></div>';
    div.addEventListener('click',()=>{ localStorage.setItem(VIEWED_TIMELINE_KEY,p.id); onSelectPlayer(p.id); });
    playerStrip.appendChild(div);
  });
  return activeViewedId;
}
