import { DEFAULT_CLIENT_ID, LS } from '../config.js?v=active-room-start-v108';
import { now } from '../utils/helpers.js';

export function readToken(){ try{return JSON.parse(localStorage.getItem(LS.token)||'null')}catch{return null} }
export function saveToken(t){ localStorage.setItem(LS.token, JSON.stringify(t)); }
export function validToken(t){ return t?.access_token && Number(t.expires_at||0) > now()+60000; }

export async function refreshSpotifyToken(token=readToken()){
  if(!token?.refresh_token) return null;
  const body=new URLSearchParams({client_id:DEFAULT_CLIENT_ID,grant_type:'refresh_token',refresh_token:token.refresh_token});
  const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!res.ok) return null;
  const next=await res.json();
  const merged={...token,...next,refresh_token:next.refresh_token || token.refresh_token,expires_at:now()+Number(next.expires_in||3600)*1000};
  saveToken(merged);
  return merged;
}

export async function getValidSpotifyToken(){
  const token=readToken();
  if(validToken(token)) return token;
  return refreshSpotifyToken(token);
}

export async function spotifyFetch(path, options={}){
  const blockedUntil=Number(localStorage.getItem(LS.rateLimitUntil)||0);
  if(blockedUntil && blockedUntil>now()){
    const sec=Math.ceil((blockedUntil-now())/1000); throw new SpotifyRateLimitError('Spotify rate limit. Vanta '+sec+' sekunder.', sec);
  }
  const token=await getValidSpotifyToken(); if(!validToken(token)) throw new Error('Du maste logga in med Spotify forst.');
  const res=await fetch('https://api.spotify.com/v1'+path,{...options,headers:{Authorization:'Bearer '+token.access_token,...(options.headers||{})}});
  if(res.status===429){
    const retryAfter=Math.max(Number.parseInt(res.headers.get('Retry-After')||'60',10)||60,60);
    localStorage.setItem(LS.rateLimitUntil,String(now()+retryAfter*1000));
    throw new SpotifyRateLimitError('Spotify rate limit. Spotify bad oss vanta '+retryAfter+' sekunder.', retryAfter);
  }
  if(res.status===403){
    let detail='';
    try{ const json=await res.json(); detail=json?.error?.message || json?.message || JSON.stringify(json); }
    catch{ detail=await res.text(); }
    throw new SpotifyForbiddenError('Spotify nekade atkomst (403). Logga ut och in igen sa appen far ny behorighet. Om felet finns kvar maste spellistan vara din eller en spellista dar du ar collaborator. Detalj: '+(detail || 'Forbidden'));
  }
  if(!res.ok) throw new Error('Spotify-fel '+res.status+': '+await res.text());
  if(res.status===204) return null;
  return res.json();
}

export class SpotifyRateLimitError extends Error{ constructor(message,retryAfter){ super(message); this.name='SpotifyRateLimitError'; this.retryAfter=retryAfter; } }
export class SpotifyForbiddenError extends Error{ constructor(message){ super(message); this.name='SpotifyForbiddenError'; } }
