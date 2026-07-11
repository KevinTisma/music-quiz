import { FIREBASE_CONFIG } from '../config.js';

function getFirebaseApp(){
  return firebase.apps.find(a=>a.name==='music-timeline') || firebase.initializeApp(FIREBASE_CONFIG,'music-timeline');
}

export function getFirebaseDatabase(){
  return firebase.database(getFirebaseApp());
}

export function getFirebaseAuth(){
  if(!firebase.auth) throw new Error('Firebase Auth-scriptet saknas.');
  return firebase.auth(getFirebaseApp());
}

export async function ensureFirebaseAuth(){
  const auth = getFirebaseAuth();
  if(auth.currentUser) return auth.currentUser;
  if(!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.authDomain){
    throw new Error('Firebase Auth kräver apiKey och authDomain i FIREBASE_CONFIG.');
  }
  await auth.signInAnonymously();
  return auth.currentUser;
}

export function serverTimestamp(){
  return firebase.database.ServerValue.TIMESTAMP;
}
