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

    // 2. Fallback: LRCLIB search (broader fuzzy match, also CORS-safe)
    try {
      // Use the search endpoint which accepts partial title/artist matches
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}`;
      const res2 = await fetch(searchUrl);
      if (res2.ok) {
        const hits = await res2.json();
        const hit = Array.isArray(hits) && hits[0];
        if (hit && (hit.syncedLyrics || hit.plainLyrics)) {
          console.log('[Lyrics] Found on LRCLIB (search)');
          const result = { text: hit.plainLyrics || hit.syncedLyrics, source: 'LRCLIB' };
          if (hit.syncedLyrics) result.synced = _parseLRC(hit.syncedLyrics);
          return result;
        }
      }
    } catch (err) {
      // LRCLIB search may not allow CORS from all origins — silently skip
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
   * Detect if text is likely Spanish tango lyrics.
   */
  function _looksSpanish(text) {
    if (!text || text.length < 30) return false;
    const sample = text.substring(0, 600).toLowerCase();
    const markers = [' que ', ' mi ', ' amor', ' un ', ' con ', ' como ', ' tu ', ' de ', ' para ', ' no ', ' es ', ' en ', ' yo ', ' una '];
    const hits = markers.filter(w => sample.includes(w));
    return hits.length >= 4;
  }

  /**
   * Translate Spanish lyrics to poetic English using Claude Sonnet via OpenRouter.
   * Caches the result permanently in the lyrics cache.
   * @returns {Promise<string|null>} English translation, or null if unavailable.
   */
  async function translateLyrics(title, artist, spanishText, cacheKey) {
    if (!spanishText || !spanishText.trim()) return null;

    // Return cached translation immediately if available
    const existing = _getCached(cacheKey);
    if (existing && existing.en) return existing.en;

    const apiKey = localStorage.getItem('spotd_openrouter_key');
    if (!apiKey) return null;

    const prompt = `You are an Argentine tango poet and literary translator.
Translate the tango lyric below from Spanish to English using the "imitation" approach — not word-for-word, not paraphrase, but a free recreation that preserves the spirit, emotional texture, and poetic imagery of the original.

Your reader is an English speaker at a Buenos Aires milonga. They cannot understand Spanish. They want to feel what this song is about — the longing, the loss, the passion, the bittersweet nostalgia. Make them feel it.

Guidelines:
- Preserve the emotional register of each line: if a line is tender, be tender; if bitter, be bitter; if resigned, be resigned
- Lunfardo (Buenos Aires slang) should be rendered as vivid idiomatic English, not literally — convey the meaning and tone, not the word
- Where a metaphor doesn't translate directly, find an equivalent English image with the same emotional weight (e.g. "hauls her desire" not "drags desire" — weight matters)
- Keep verse and stanza structure: same number of lines, blank lines between stanzas
- Avoid clichés unless the original is intentionally using one
- After completing the translation, review it once for any lines that sound awkward or un-poetic, and improve them before responding

Reply with ONLY the final English translation. No explanations, no notes, no Spanish.

Spanish original:
${spanishText.trim()}`;

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://127.0.0.1:3456/',
        },
        body: JSON.stringify({
          models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-sonnet-4'],
          route: 'fallback',
          max_tokens: 800,
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      const en = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!en || en.trim().length < 10) return null;

      const translation = en.trim();

      // Persist into the existing lyrics cache entry
      const cached = _getCached(cacheKey) || {};
      cached.en = translation;
      _setCached(cacheKey, cached);

      console.log('[Lyrics] Translation cached for:', cacheKey);
      return translation;
    } catch (err) {
      console.warn('[Lyrics] Translation error:', err.message || err);
      return null;
    }
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
    translateLyrics,
    looksSpanish: _looksSpanish,
    getCachedLyrics,
    clearCache
  };
})();
