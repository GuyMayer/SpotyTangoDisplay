// spotify.js — PKCE OAuth2 auth + API polling + genre cache

const Spotify = (() => {
  const STORAGE = {
    accessToken: 'spotd_sp_access_token',
    refreshToken: 'spotd_sp_refresh_token',
    tokenExpiry: 'spotd_sp_token_expiry',
    codeVerifier: 'spotd_sp_code_verifier',
  };
  const GENRE_CACHE_KEY = 'spotd_genre_cache'; // sessionStorage
  const API_BASE = 'https://api.spotify.com/v1';

  let _pollTimer = null;
  let _onTrackChange = null;
  let _lastTrackId = null;
  let _lastIsPlaying = null;

  // ── PKCE helpers ─────────────────────────────────────────────────────────

  function _generateCodeVerifier(length = 128) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => chars[b % chars.length]).join('');
  }

  async function _generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function login() {
    const verifier = _generateCodeVerifier();
    const challenge = await _generateCodeChallenge(verifier);
    sessionStorage.setItem(STORAGE.codeVerifier, verifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CONFIG.spotify.clientId,
      scope: CONFIG.spotify.scopes,
      redirect_uri: CONFIG.spotify.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;

    const verifier = sessionStorage.getItem(STORAGE.codeVerifier);
    if (!verifier) return false;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CONFIG.spotify.redirectUri,
      client_id: CONFIG.spotify.clientId,
      code_verifier: verifier,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      console.error('Spotify token exchange failed:', await res.text());
      return false;
    }

    const data = await res.json();
    _storeTokens(data);
    sessionStorage.removeItem(STORAGE.codeVerifier);

    // Remove code from URL
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, clean);
    return true;
  }

  function _storeTokens(data) {
    localStorage.setItem(STORAGE.accessToken, data.access_token);
    if (data.refresh_token) {
      localStorage.setItem(STORAGE.refreshToken, data.refresh_token);
    }
    const expiry = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer
    localStorage.setItem(STORAGE.tokenExpiry, expiry.toString());
  }

  async function _refreshToken() {
    const refresh = localStorage.getItem(STORAGE.refreshToken);
    if (!refresh) return false;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CONFIG.spotify.clientId,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      console.error('Spotify token refresh failed:', await res.text());
      return false;
    }

    const data = await res.json();
    _storeTokens(data);
    return true;
  }

  async function _getAccessToken() {
    const expiry = parseInt(localStorage.getItem(STORAGE.tokenExpiry) || '0', 10);
    if (Date.now() >= expiry) {
      const ok = await _refreshToken();
      if (!ok) return null;
    }
    return localStorage.getItem(STORAGE.accessToken);
  }

  function isLoggedIn() {
    return !!localStorage.getItem(STORAGE.accessToken);
  }

  function logout() {
    localStorage.removeItem(STORAGE.accessToken);
    localStorage.removeItem(STORAGE.refreshToken);
    localStorage.removeItem(STORAGE.tokenExpiry);
    sessionStorage.removeItem(GENRE_CACHE_KEY);
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  async function _apiFetch(path) {
    const token = await _getAccessToken();
    if (!token) return null;

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      const ok = await _refreshToken();
      if (!ok) return null;
      return _apiFetch(path); // one retry
    }
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) {
      console.error('Spotify API error:', res.status, path);
      return null;
    }
    return res.json();
  }

  async function getCurrentlyPlaying() {
    return _apiFetch('/me/player/currently-playing?additional_types=track');
  }

  async function getQueue() {
    return _apiFetch('/me/player/queue');
  }

  async function getArtistGenres(artistId) {
    const cache = JSON.parse(sessionStorage.getItem(GENRE_CACHE_KEY) || '{}');
    if (cache[artistId]) return cache[artistId];

    const data = await _apiFetch(`/artists/${artistId}`);
    const genres = (data && data.genres) ? data.genres : [];
    cache[artistId] = genres;
    sessionStorage.setItem(GENRE_CACHE_KEY, JSON.stringify(cache));
    return genres;
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling(onTrackChange) {
    _onTrackChange = onTrackChange;
    _poll();
  }

  function stopPolling() {
    if (_pollTimer) clearTimeout(_pollTimer);
    _pollTimer = null;
  }

  async function _poll() {
    let interval = CONFIG.spotify.pollIntervalPaused;

    try {
      const data = await getCurrentlyPlaying();
      const isPlaying = !!(data && data.is_playing);
      const track = data && data.item;

      if (isPlaying) interval = CONFIG.spotify.pollIntervalPlaying;

      const trackId = track ? track.id : null;
      const changed = trackId !== _lastTrackId || isPlaying !== _lastIsPlaying;

      if (changed && _onTrackChange) {
        _lastTrackId = trackId;
        _lastIsPlaying = isPlaying;

        let genres = [];
        if (track && track.artists && track.artists.length > 0) {
          genres = await getArtistGenres(track.artists[0].id);
        }

        let queueData = null;
        if (isPlaying) {
          queueData = await getQueue();
        }

        _onTrackChange({
          isPlaying,
          track,
          genres,
          queueData,
          raw: data,
        });
      }
    } catch (err) {
      console.error('Spotify poll error:', err);
    }

    _pollTimer = setTimeout(_poll, interval);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    login,
    handleCallback,
    isLoggedIn,
    logout,
    startPolling,
    stopPolling,
    getCurrentlyPlaying,
    getQueue,
    getArtistGenres,
  };
})();
