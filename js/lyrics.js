/**
 * Tango Lyrics Module
 * Loads lyrics from local database, fetches from APIs if needed, caches in localStorage
 */

const LyricsModule = (() => {
  const STORAGE_CACHED_LYRICS = 'spotd_lyrics_cache';
  let _lyricsDb = {};
  let _loaded = false;

  // Normalize string for matching (same as tango-db.js)
  function _norm(s) {
    if (!s) return '';
    return s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s]/g, '') // remove non-alphanumeric
      .trim();
  }

  // Load local lyrics database
  async function _loadLocal() {
    if (_loaded) return;
    try {
      const res = await fetch('/data/tango-lyrics.json');
      if (res.ok) {
        _lyricsDb = await res.json();
        console.log('[Lyrics] Loaded', Object.keys(_lyricsDb).length, 'lyrics from local database');
      }
    } catch (err) {
      console.warn('[Lyrics] Failed to load local database:', err);
    }
    _loaded = true;
  }

  // Get cached lyrics from localStorage
  function _getCached(key) {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_CACHED_LYRICS) || '{}');
      return cache[key] || null;
    } catch (err) {
      return null;
    }
  }

  // Save lyrics to localStorage cache
  function _setCached(key, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_CACHED_LYRICS) || '{}');
      cache[key] = data;
      localStorage.setItem(STORAGE_CACHED_LYRICS, JSON.stringify(cache));
      console.log('[Lyrics] Cached:', key);
    } catch (err) {
      console.warn('[Lyrics] Failed to cache:', err);
    }
  }

  // Parse LRC format (timestamped karaoke lyrics)
  function _parseLRC(lrc) {
    if (!lrc) return null;
    
    const lines = lrc.split('\n');
    const parsed = [];
    
    for (const line of lines) {
      // Match [mm:ss.xx] timestamp
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const centiseconds = parseInt(match[3]);
        const text = match[4].trim();
        
        const timeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
        parsed.push({ time: timeMs, text });
      }
    }
    
    return parsed.length > 0 ? parsed : null;
  }

  // Fetch lyrics from external API
  async function _fetchFromAPI(title, artist) {
    // 1. Try LRCLIB (free synced lyrics API, no key required)
    try {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics || data.plainLyrics) {
          console.log('[Lyrics] Found on LRCLIB:', data.syncedLyrics ? 'synced' : 'plain');
          const result = {
            text: data.plainLyrics || data.syncedLyrics,
            source: 'LRCLIB'
          };
          
          // Parse synced lyrics if available
          if (data.syncedLyrics) {
            result.synced = _parseLRC(data.syncedLyrics);
          }
          
          return result;
        }
      }
    } catch (err) {
      console.warn('[Lyrics] LRCLIB error:', err);
    }

    // 2. Fallback: lyrics.ovh (free, no key required, plain text only)
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.lyrics) {
          console.log('[Lyrics] Found on lyrics.ovh');
          return {
            text: data.lyrics,
            source: 'lyrics.ovh'
          };
        }
      }
    } catch (err) {
      console.warn('[Lyrics] lyrics.ovh error:', err);
    }

    return null;
  }

  /**
   * Get lyrics for a song
   * @param {string} title - Song title
   * @param {string} artist - Artist name
   * @returns {Promise<Object|null>} Lyrics object with {text, synced?, es?, en?, source} or null
   */
  async function getLyrics(title, artist) {
    if (!title || !artist) return null;

    await _loadLocal();

    // Create normalized key
    const key = _norm(title) + '|' + _norm(artist);

    // 1. Check local database (tango translations)
    const dbLyrics = _lyricsDb[key];
    if (dbLyrics) {
      console.log('[Lyrics] Found in local database:', key);
      return { ...dbLyrics, source: 'local' };
    }

    // 2. Check localStorage cache
    const cached = _getCached(key);
    if (cached) {
      console.log('[Lyrics] Found in cache:', key);
      return cached;
    }

    // 3. Fetch from API
    console.log('[Lyrics] Fetching from API:', title, 'by', artist);
    const fetched = await _fetchFromAPI(title, artist);
    
    if (fetched) {
      _setCached(key, fetched);
      return fetched;
    }

    return null;
  }

  /**
   * Get all cached lyrics (for contribution)
   */
  function getCachedLyrics() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_CACHED_LYRICS) || '{}');
    } catch (err) {
      return {};
    }
  }

  /**
   * Clear cached lyrics
   */
  function clearCache() {
    localStorage.removeItem(STORAGE_CACHED_LYRICS);
    console.log('[Lyrics] Cache cleared');
  }

  return {
    getLyrics,
    getCachedLyrics,
    clearCache
  };
})();
