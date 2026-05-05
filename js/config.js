// SpotyTangoDisplay — Central configuration
// Set SPOTIFY_CLIENT_ID after registering at https://developer.spotify.com/dashboard
// Redirect URI must be set to: https://guymayer.github.io/SpotyTangoDisplay/

const CONFIG = {
  spotify: {
    clientId: localStorage.getItem('spotd_spotify_client_id') || 'YOUR_SPOTIFY_CLIENT_ID',
    redirectUri: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/'),
    scopes: 'user-read-currently-playing user-read-playback-state',
    pollIntervalPlaying: 1000,   // ms when playing
    pollIntervalPaused: 5000,    // ms when paused/idle
  },
  app: {
    version: '1.0.0',
    brand: 'TangoPassion',
    storagePrefix: 'spotd_',
  },
};
