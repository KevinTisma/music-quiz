import { DEFAULT_CLIENT_ID, LS, SPOTIFY_SCOPES } from '../config.js?v=active-room-start-v80';
import { base64url, now, randomString, sha256 } from '../utils/helpers.js';
import { saveToken } from './spotify-api.js?v=active-room-start-v80';

export async function loginSpotify(redirectUri, returnUrl=window.location.href){
  const verifier=randomString(96), challenge=base64url(await sha256(verifier)), state=randomString(24);
  localStorage.setItem(LS.verifier,verifier); localStorage.setItem(LS.oauthState,state); localStorage.setItem(LS.oauthPayload,JSON.stringify({redirectUri,returnUrl,startedAt:now()}));
  const params=new URLSearchParams({response_type:'code',client_id:DEFAULT_CLIENT_ID,redirect_uri:redirectUri,state,scope:SPOTIFY_SCOPES,code_challenge_method:'S256',code_challenge:challenge});
  window.location.href='https://accounts.spotify.com/authorize?'+params.toString();
}

export async function handleSpotifyCallback(redirectUri, onToken){
  const url=new URL(window.location.href), code=url.searchParams.get('code'), state=url.searchParams.get('state');
  if(!code) return false;
  const savedState=localStorage.getItem(LS.oauthState), verifier=localStorage.getItem(LS.verifier), payload=JSON.parse(localStorage.getItem(LS.oauthPayload)||'{}');
  if(!state || state!==savedState || !verifier) throw new Error('Spotify-login misslyckades: state/verifier saknas.');
  const body=new URLSearchParams({client_id:DEFAULT_CLIENT_ID,grant_type:'authorization_code',code,redirect_uri:payload.redirectUri || redirectUri,code_verifier:verifier});
  const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!res.ok) throw new Error('Kunde inte hamta Spotify-token: '+await res.text());
  const token=await res.json(); token.expires_at=now()+Number(token.expires_in||3600)*1000; saveToken(token);
  localStorage.removeItem(LS.verifier); localStorage.removeItem(LS.oauthState); localStorage.removeItem(LS.oauthPayload);
  history.replaceState(null,'',payload.returnUrl || redirectUri);
  if(onToken) await onToken();
  return true;
}
