export const VERSION = 'timeline-game-v93';
export const DEFAULT_CLIENT_ID = 'cd412c7bf9344b9994aeb0e564ac5049';
export const SPOTIFY_SCOPES = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative';
export const FIREBASE_CONFIG = { databaseURL: 'https://music-quiz-bd465-default-rtdb.europe-west1.firebasedatabase.app' };
export const ROOM_ID = 'active';
export const WIN_SCORE = 7;
export const VIEWED_TIMELINE_KEY = 'timeline_viewed_player_v1';
export const ACTIVE_PLAYER_WINDOW_MS = 2 * 60 * 1000;
export const PLAYER_PALETTES = ['110,231,183','255,75,160','124,29,255','250,204,21','37,99,235'];

export const LS = {
  token:'hitster_spotify_token_v4',
  verifier:'hitster_spotify_pkce_verifier_v3',
  oauthState:'hitster_spotify_oauth_state_v3',
  oauthPayload:'hitster_spotify_oauth_payload_v4',
  playerId:'timeline_player_id_v1',
  playerName:'timeline_player_name_v1',
  spotifyProfile:'timeline_spotify_profile_v1',
  rateLimitUntil:'hitster_spotify_rate_limit_until_v1',
  autoplay:'timeline_autoplay_spotify_v1',
  ownCollapsed:'timeline_own_collapsed_v1',
  lobbyRoom:'timeline_lobby_room_v1',
  startDone:'timeline_start_done_v1'
};
