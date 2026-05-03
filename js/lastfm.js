// lastfm.js — song story lookup: Last.fm primary, Wikipedia fallback
// No build step; browser globals only.

const LastFm = (() => {
  const STORAGE_KEY = 'spotd_lastfm_key';
  const API_URL     = 'https://ws.audioscrobbler.com/2.0/';
  const _cache      = {};   // keyed by "title|artist" lowercase

  function getKey() { return localStorage.getItem(STORAGE_KEY) || ''; }
  function setKey(k) {
    if (k) localStorage.setItem(STORAGE_KEY, k);
    else   localStorage.removeItem(STORAGE_KEY);
  }

  function _stripHtml(html) {
    return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function _cleanLastFm(text) {
    // Strip the "Read more on Last.fm." trailer
    return text.replace(/\.\s*Read more on Last\.fm\.?$/i, '').trim();
  }

  async function _tryWikipedia(title) {
    const variants = [title, title + '_(tango)', title + '_(song)'];
    for (const v of variants) {
      try {
        const r = await fetch(
          'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(v)
        );
        if (!r.ok) continue;
        const d = await r.json();
        if (d.type === 'disambiguation' || !d.extract) continue;
        return {
          story:  d.extract,
          source: 'wikipedia',
          url:    d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page,
        };
      } catch (_) { /* try next */ }
    }
    return null;
  }

  /**
   * Fetch song story for (title, artist).
   * Returns { story, source, url? } or null.
   * Results are cached for the lifetime of the page.
   */
  async function fetchTrackInfo(title, artist) {
    if (!title) return null;
    const cacheKey = (title + '|' + (artist || '')).toLowerCase();
    if (_cache[cacheKey] !== undefined) return _cache[cacheKey];

    let result = null;
    const key = getKey();

    // ── Last.fm ──────────────────────────────────────────────────────────────
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

    // ── Wikipedia fallback ───────────────────────────────────────────────────
    if (!result) result = await _tryWikipedia(title);

    _cache[cacheKey] = result;
    return result;
  }

  return { getKey, setKey, fetchTrackInfo };
})();
