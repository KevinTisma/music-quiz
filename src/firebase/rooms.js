import { ROOM_ID } from '../config.js';

export function normalizeRoomId(roomId){
  return String(roomId || ROOM_ID).trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,18) || ROOM_ID;
}

export function getRoomRef(db, path='', roomId=ROOM_ID){
  const safeRoomId = normalizeRoomId(roomId);
  return db.ref('rooms/'+safeRoomId+(path?'/'+path:''));
}

export function playerRoomPath(playerId, roomId=ROOM_ID){
  return 'rooms/'+normalizeRoomId(roomId)+'/players/'+playerId;
}
