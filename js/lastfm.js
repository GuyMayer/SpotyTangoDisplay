// lastfm.js — song story lookup: local JSON → Last.fm → Wikipedia
// No build step; browser globals only.

const LastFm = (() => {
  const STORAGE_KEY    = 'spotd_lastfm_key';
  const API_URL        = 'https://ws.audioscrobbler.com/2.0/';
  const _cache         = {};   // keyed by "title|artist" lowercase, runtime session
  let   _localStories  = null; // loaded once from data/tango-stories.json

  function getKey() { return localStorage.getItem(STORAGE_KEY) || ''; }
  function setKey(k) {
    if (k) localStorage.setItem(STORAGE_KEY, k);
    else   localStorage.removeItem(STORAGE_KEY);
  }

  // ── Local curated stories ────────────────────────────────────────────────
  async function _loadLocal() {
    if (_localStories) return _localStories;
    try {
      const r = await fetch('data/tango-stories.json');
      _localStories = r.ok ? await r.json() : {};
    } catch (_) { _localStories = {}; }
    return _localStories;
  }

  function _lookupLocal(db, title) {
    if (!title) return null;
    const key = title.toLowerCase().trim();
    const entry = db[key];
    if (!entry || !entry.story) return null;
    return { story: entry.story, source: 'local' };
  }

  // ── Story override (DJ can edit per-track, stored in localStorage) ───────
  const _OVERRIDE_KEY = 'spotd_story_overrides';
  function _getOverrides() {
    try { return JSON.parse(localStorage.getItem(_OVERRIDE_KEY) || '{}'); } catch { return {}; }
  }
  function getStoryOverride(title) {
    if (!title) return null;
    const overrides = _getOverrides();
    return overrides[title.toLowerCase().trim()] || null;
  }
  function setStoryOverride(title, story) {
    if (!title) return;
    const overrides = _getOverrides();
    const k = title.toLowerCase().trim();
    if (story) overrides[k] = story;
    else delete overrides[k];
    localStorage.setItem(_OVERRIDE_KEY, JSON.stringify(overrides));
    // Invalidate cache so next fetch picks up the change
    const cacheKey = (title + '|').toLowerCase();
    Object.keys(_cache).forEach(k2 => { if (k2.startsWith(k + '|')) delete _cache[k2]; });
  }

  function _stripHtml(html) {
    // Preserve paragraph breaks, then collapse inline whitespace
    return html
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function _cleanLastFm(text) {
    // Strip the "Read more on Last.fm." trailer
    return text.replace(/\.\s*Read more on Last\.fm\.?$/i, '').trim();
  }

  // Music-related terms that indicate a Wikipedia result is actually about a song/musician
  const MUSIC_TERMS = /\b(song|tango|milonga|vals|waltz|music|album|single|track|band|orchestra|musician|composer|singer|vocalist|bandoneon|guitar|piano|soundtrack|recording)\b/i;

  async function _tryWikipedia(title, artist) {
    // Try title alone first, then "Title (song)" as fallback for common words
    const variants = [title];
    // If the title is a common word likely to match a non-music article, try _(song) first
    if (title.split(' ').length <= 2) variants.push(title + ' (song)');

    for (const variant of variants) {
      try {
        const r = await fetch(
          'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(variant)
        );
        if (!r.ok) continue;
        const d = await r.json();
        if (d.type === 'disambiguation' || !d.extract) continue;

        // Validate: description or first sentence must be music-related
        // Otherwise we'd show "Carousel = amusement ride" instead of the song
        const descCheck = (d.description || '') + ' ' + d.extract.slice(0, 200);
        // Accept if: description says "song by", "album by", "tango", "musician" etc.
        // OR artist name appears in the extract (good sign it's the right page)
        const artistMatch = artist && d.extract.toLowerCase().includes(
          artist.toLowerCase().replace(/\s+(y su|and his|orquesta|orchestra|sexteto|quartet|quintet).*/i, '').split(' ')[0]
        );
        if (!MUSIC_TERMS.test(descCheck) && !artistMatch) continue;

        return {
          story:  d.extract,
          source: 'wikipedia',
          url:    d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page,
        };
      } catch (_) { continue; }
    }
    return null;
  }

  /**
   * Fetch song story for (title, artist).
   * Priority: DJ override → local JSON → Last.fm → Wikipedia.
   * Returns { story, source, url? } or null.
   * Results are cached for the lifetime of the page (overrides bypass cache on write).
   */
  async function fetchTrackInfo(title, artist) {
    if (!title) return null;
    const cacheKey = (title + '|' + (artist || '')).toLowerCase();
    if (_cache[cacheKey] !== undefined) return _cache[cacheKey];

    // ── 1. DJ override ───────────────────────────────────────────────────────
    const override = getStoryOverride(title);
    if (override) {
      const result = { story: override, source: 'custom' };
      _cache[cacheKey] = result;
      return result;
    }

    // ── 2. Local curated JSON ────────────────────────────────────────────────
    const db = await _loadLocal();
    const local = _lookupLocal(db, title);
    if (local) {
      _cache[cacheKey] = local;
      return local;
    }

    let result = null;
    const key = getKey();

    // ── 3. Last.fm ───────────────────────────────────────────────────────────
    if (key) {
      try {
        const params = new URLSearchParams({
          method:      'track.getInfo',
          api_key:     key,
          artist:      artist || '',
          track:       title  || '',
          format:      'json',
          autocorrect: '1',
        });
        const r = await fetch(API_URL + '?' + params);
        const d = await r.json();
        const wiki = d.track && d.track.wiki;
        if (wiki && wiki.summary) {
          const story = _cleanLastFm(_stripHtml(wiki.summary));
          if (story.length > 30) result = { story, source: 'lastfm' };
        }
      } catch (_) { /* fall through to Wikipedia */ }
    }

    // ── 4. Wikipedia fallback ────────────────────────────────────────────────
    if (!result) result = await _tryWikipedia(title, artist);

    _cache[cacheKey] = result;
    return result;
  }

  return { getKey, setKey, fetchTrackInfo, getStoryOverride, setStoryOverride };
})();
