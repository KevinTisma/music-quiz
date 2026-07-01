import { LS } from '../config.js';

export function now(){ return Date.now(); }
export function setText(el,text){ if(el) el.textContent = text || ''; }
export function status(el,text,cls){ if(!el) return; el.className = 'status' + (cls ? ' ' + cls : ''); el.textContent = text || ''; console.log('[music-timeline]', text || ''); }
export function getPlayerId(){ let id = localStorage.getItem(LS.playerId); if(!id){ id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(LS.playerId,id); } return id; }
export function cleanKey(s){ return String(s || '').replace(/[.#$\[\]/]/g,'_').slice(0,120); }
export function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
export function sortPlayers(players){ return Object.values(players || {}).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0) || String(a.name||'').localeCompare(String(b.name||''))); }
export function timelineOf(p){ return Array.isArray(p?.timeline) ? p.timeline : []; }
export function lockedCount(p){ return timelineOf(p).filter(c=>c.status === 'locked').length; }
export function pendingCount(p){ return timelineOf(p).filter(c=>c.status === 'pending').length; }
export function cardId(card){ return card?.id || card?.uri || (card?.title + '-' + card?.artist + '-' + card?.year); }
export function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
export async function sha256(text){ return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); }
export function base64url(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function randomString(len=64){ const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'; const arr=crypto.getRandomValues(new Uint8Array(len)); return Array.from(arr,n=>chars[n%chars.length]).join(''); }
