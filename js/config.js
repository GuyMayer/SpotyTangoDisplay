// SpotyTangoDisplay — Central configuration
// Set SPOTIFY_CLIENT_ID after registering at https://developer.spotify.com/dashboard
// Add this Redirect URI to your Spotify app: http://127.0.0.1:3456/

const CONFIG = {
  spotify: {
    clientId: localStorage.getItem('spotd_spotify_client_id') || 'YOUR_SPOTIFY_CLIENT_ID',
    redirectUri: 'http://127.0.0.1:3456/',
    scopes: 'user-read-currently-playing user-read-playback-state user-modify-playback-state',
    pollIntervalPlaying: 1000,   // ms when playing
    pollIntervalPaused: 5000,    // ms when paused/idle
  },
  app: {
    version: '1.4.7',
    brand: 'TangoPassion',
    storagePrefix: 'spotd_',
  },
};
