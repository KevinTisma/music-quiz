import { FIREBASE_CONFIG } from '../config.js';

export function getFirebaseDatabase(){
  const app = firebase.apps.find(a=>a.name==='music-timeline') || firebase.initializeApp(FIREBASE_CONFIG,'music-timeline');
  return firebase.database(app);
}

export function serverTimestamp(){
  return firebase.database.ServerValue.TIMESTAMP;
}
