import { cleanKey } from '../utils/helpers.js';

export function playlistIdFromInput(input){
  const s=String(input||'').trim();
  if(!s) return '';
  if(/^[A-Za-z0-9]{15,}$/.test(s)) return s;
  const m=s.match(/playlist[/:]([A-Za-z0-9]+)/) || s.match(/[?&]playlist=([A-Za-z0-9]+)/);
  return m?.[1] || '';
}

export function normalizeTrack(track,i){
  if(!track || track.is_local || track.type !== 'track') return null;
  const y=Number(String(track.album?.release_date||'').slice(0,4));
  if(!Number.isFinite(y)) return null;
  return { id:track.id || cleanKey(track.uri || track.name+'-'+i), title:track.name, artist:(track.artists||[]).map(a=>a.name).join(', ') || 'Okand artist', year:y, uri:track.uri || '', spotifyUrl:track.external_urls?.spotify || '', image:track.album?.images?.[0]?.url || '', durationMs:track.duration_ms || 0 };
}
