// cortina.js — Cortina detection logic
// Two methods: genre denylist + cortina playlist override

const Cortina = (() => {
  const STORAGE_DENYLIST = 'spotd_dance_genres';      // JSON array of {genre, label}
  const STORAGE_PLAYLIST = 'spotd_cortina_playlist';  // Spotify playlist ID
  const STORAGE_TRACKS   = 'spotd_cortina_tracks';    // sessionStorage: Set of track IDs

  // Default dance genres (pre-filled in wizard)
  const DEFAULT_DANCE_GENRES = [
    { genre: 'tango', label: 'Tango' },
    { genre: 'milonga', label: 'Milonga' },
    { genre: 'vals', label: 'Vals' },
    { genre: 'tango argentino', label: 'Tango' },
    { genre: 'Argentine tango', label: 'Tango' },
  ];

  // ── Dance genre list ──────────────────────────────────────────────────────

  function getDanceGenres() {
    const stored = localStorage.getItem(STORAGE_DENYLIST);
    return stored ? JSON.parse(stored) : DEFAULT_DANCE_GENRES;
  }

  function setDanceGenres(list) {
    localStorage.setItem(STORAGE_DENYLIST, JSON.stringify(list));
  }

  // ── Cortina playlist ──────────────────────────────────────────────────────

  function getCortinaPlaylistId() {
    return localStorage.getItem(STORAGE_PLAYLIST) || null;
  }

  function setCortinaPlaylistUrl(url) {
    if (!url) {
      localStorage.removeItem(STORAGE_PLAYLIST);
      return;
    }
    // Extract ID from URL like https://open.spotify.com/playlist/XXXXX
    const match = url.match(/playlist\/([A-Za-z0-9]+)/);
    if (match) {
      localStorage.setItem(STORAGE_PLAYLIST, match[1]);
    }
  }

  // ── Cortina playlist track cache ──────────────────────────────────────────

  function _loadCachedTrackIds() {
    const stored = sessionStorage.getItem(STORAGE_TRACKS);
    return stored ? new Set(JSON.parse(stored)) : null;
  }

  function _saveCachedTrackIds(ids) {
    sessionStorage.setItem(STORAGE_TRACKS, JSON.stringify([...ids]));
  }

  async function _fetchPlaylistTrackIds(playlistId) {
    const cached = _loadCachedTrackIds();
    if (cached) return cached;

    const token = await Spotify._getAccessToken ? Spotify._getAccessToken() : null;
    // We call via the Spotify module's getArtistGenres path (which has auth)
    // Instead, expose a direct fetch using the access token pattern
    const ids = new Set();
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id)),next&limit=100`;

    while (url) {
      // We piggyback on Spotify's token refresh by fetching ourselves
      // (spotifyFetch is exposed below)
      const res = await _spotifyFetch(url);
      if (!res) break;
      (res.items || []).forEach(item => {
        if (item.track && item.track.id) ids.add(item.track.id);
      });
      url = res.next || null;
    }

    _saveCachedTrackIds(ids);
    return ids;
  }

  // Access token fetch helper (mirrors Spotify module's internal logic)
  async function _spotifyFetch(url) {
    const token = localStorage.getItem('spotd_sp_access_token');
    if (!token) return null;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Invalidate the track cache (call when playlist changes)
  function clearPlaylistCache() {
    sessionStorage.removeItem(STORAGE_TRACKS);
  }

  // ── Detection ─────────────────────────────────────────────────────────────

  /**
   * Determine if the current track is a cortina.
   * @param {object} params
   * @param {string} params.trackId
   * @param {string[]} params.genres - artist genres from Spotify
   * @returns {{ isCortina: boolean, label: string|null }}
   */
  async function detect({ trackId, genres = [] }) {
    // 1. Playlist override — track is explicitly in cortina playlist
    const playlistId = getCortinaPlaylistId();
    if (playlistId) {
      const ids = await _fetchPlaylistTrackIds(playlistId);
      if (ids.has(trackId)) {
        return { isCortina: true, label: 'CORTINA' };
      }
    }

    // 2. Genre denylist — check if ANY artist genre matches a dance genre
    const danceGenres = getDanceGenres();
    const genresLower = genres.map(g => g.toLowerCase());

    for (const entry of danceGenres) {
      if (genresLower.some(g => g.includes(entry.genre.toLowerCase()))) {
        // It IS a dance track — not a cortina
        return { isCortina: false, label: entry.label || null };
      }
    }

    // No dance genre match → cortina (or unknown — treat as cortina)
    return { isCortina: true, label: 'CORTINA' };
  }

  /**
   * Detect synchronously from cached/stored data only (no async).
   * Used when we need an immediate answer without API calls.
   */
  function detectSync({ trackId, genres = [] }) {
    const danceGenres = getDanceGenres();
    const genresLower = genres.map(g => g.toLowerCase());

    for (const entry of danceGenres) {
      if (genresLower.some(g => g.includes(entry.genre.toLowerCase()))) {
        return { isCortina: false, label: entry.label || null };
      }
    }

    // Check playlist cache (sync)
    const cached = _loadCachedTrackIds();
    if (cached && trackId && cached.has(trackId)) {
      return { isCortina: true, label: 'CORTINA' };
    }

    return { isCortina: true, label: 'CORTINA' };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    detect,
    detectSync,
    getDanceGenres,
    setDanceGenres,
    getCortinaPlaylistId,
    setCortinaPlaylistUrl,
    clearPlaylistCache,
    DEFAULT_DANCE_GENRES,
  };
})();
