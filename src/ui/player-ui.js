import { VIEWED_TIMELINE_KEY, WIN_SCORE } from '../config.js';
import { esc, lockedCount } from '../utils/helpers.js';

export function renderPlayerStrip({ playerStrip, players, roomData, viewedTimelinePlayerId, fallbackPlayerId, playerRgb, onSelectPlayer }){
  playerStrip.innerHTML='';
  if(!players.length){ playerStrip.innerHTML='<p class="small">Inga spelare ännu.</p>'; return viewedTimelinePlayerId; }
  let activeViewedId = viewedTimelinePlayerId;
  if(!players.some(p=>p.id===activeViewedId)) activeViewedId = fallbackPlayerId;
  const mode = String(roomData?.game?.mode || '');
  const isPartyGame = mode.startsWith('party-') || mode.startsWith('quiz-');
  const answers = roomData?.game?.answers || {};
  const hostId = roomData?.meta?.hostId || '';
  const settings = roomData?.settings || {};
  const partyMasterMode = roomData?.game?.partyModeEnabled === true || settings.partyModeEnabled === true || settings.gameMode === 'party';
  const hasCurrentPartyCard = isPartyGame && !!roomData?.game?.currentCard && !roomData?.game?.reveal;
  players.forEach(p=>{
    const div=document.createElement('button');
    div.type='button';
    const isAnsweringPlayer = !(partyMasterMode && p.id === hostId);
    const hasAnswered = !!answers[p.id];
    div.className='playerTile'+(p.id===roomData?.game?.turnPlayerId?' active':'')+(roomData?.game?.winnerId===p.id?' winner':'')+(p.id===activeViewedId?' viewing':'')+(isPartyGame ? ' partyPlayerTile' : '')+(hasCurrentPartyCard && isAnsweringPlayer ? (hasAnswered ? ' answered' : ' waiting') : '');
    div.style.setProperty('--player-rgb', playerRgb(p.id));
    div.title=isPartyGame ? (isAnsweringPlayer ? (hasAnswered ? 'Svar inne' : 'Väntar på svar') : 'Spelmaster') : 'Visa '+(p.name||'spelarens')+' tidslinje';
    const hostBadge = p.id === roomData?.meta?.hostId ? ' <span class="scoreLabel">Host</span>' : '';
    const score = isPartyGame ? Number(p.score || 0) : lockedCount(p);
    const scoreLabel = isPartyGame ? ' poäng' : ' / '+WIN_SCORE;
    const answerStatus = isPartyGame && hasCurrentPartyCard && isAnsweringPlayer ? '<div class="partyAnswerStatus">'+(hasAnswered ? 'Svarat' : 'Väntar')+'</div>' : '';
    div.innerHTML='<div class="playerName">'+esc(p.name||'Spelare')+hostBadge+'</div><div class="playerScore">'+score+'<span class="scoreLabel">'+scoreLabel+'</span></div>'+answerStatus;
    div.addEventListener('click',()=>{ localStorage.setItem(VIEWED_TIMELINE_KEY,p.id); onSelectPlayer(p.id); });
    playerStrip.appendChild(div);
  });
  return activeViewedId;
}
