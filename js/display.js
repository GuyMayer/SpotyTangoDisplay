// display.js — Dancer display renderer
// Subscribes to Pusher, applies profile styles, renders track/cortina/idle states.

const Display = (() => {
  // DOM refs
  const $ = id => document.getElementById(id);

  const els = {
    bgLayer:         $('bg-layer'),
    fadeOverlay:     $('fade-overlay'),
    connectionBadge: $('connection-badge'),
    branding:        $('branding'),
    brandingLogo:    $('branding-logo'),
    brandingName:    $('branding-name'),
    content:         $('content'),

    idleScreen:   $('idle-screen'),
    idleLogo:     $('idle-logo'),
    idleMessage:  $('idle-message'),
    idleDjName:   $('idle-dj-name'),

    trackScreen:  $('track-screen'),
    trackMain:    $('track-main'),
    lessonLeft:        $('lesson-left'),
    lessonRight:       $('lesson-right'),
    lessonOrchName:    $('lesson-orch-name'),
    lessonOrchNick:    $('lesson-orch-nickname'),
    lessonOrchEra:     $('lesson-orch-era'),
    lessonOrchStyle:   $('lesson-orch-style'),
    lessonOrchChars:   $('lesson-orch-chars'),
    lessonOrchSingers: $('lesson-orch-singers'),
    lessonStory:       $('lesson-story'),
    lessonThemes:      $('lesson-themes'),
    artworkWrap:  $('artwork-wrap'),
    artwork:      $('artwork'),
    trackArtist:      $('track-artist'),
    trackTitle:       $('track-title'),
    trackTranslation: $('track-translation'),
    trackGenre:       $('track-genre'),
    trackYear:    $('track-year'),
    tandaCounter: $('tanda-counter'),
    trackNext:       $('track-next'),
    trackNextHeader: $('track-next-header'),
    trackNextDetail: $('track-next-detail'),

    cortinaScreen: $('cortina-screen'),
    cortinaLabel:  $('cortina-label'),
    cortinaArtist: $('cortina-artist'),
    cortinaTitle:  $('cortina-title'),
    comingUp:      $('coming-up'),
    comingUpArtist:$('coming-up-artist'),
    comingUpGenre: $('coming-up-genre'),
    djMessageOverlay: $('dj-message-overlay'),
    djMessageText:    $('dj-message-text'),
    liveIndicator:    $('live-indicator'),
  };

  let _profile = null;
  let _currentState = null; // 'idle' | 'track' | 'cortina'
  let _currentMode = 'milonga'; // tracks last received mode for background selection
  let _lessonMode = false;
  let _transitionActive = false;
  let _localVideoActive = false;
  let _localVideos = [];
  let _localVideoIndex = 0;
  let _liveSource = false;     // true = AudD mic mode
  let _liveTimer  = null;      // setInterval handle
  const LIVE_INTERVAL_MS = 30000;
  let _orchestras = {};        // loaded from data/orchestras.json
  let _lessonTrackKey = '';    // stale-guard for async song story fetch

  function _getOrchestraBio(name) {
    if (!name) return null;
    return _orchestras[name.toLowerCase().trim()] || null;
  }

  // Live tanda tracking
  let _liveTandaGenre = null;  // genre of current tanda ('Tango'|'Milonga'|'Vals')
  let _liveTandaPos   = 0;     // tracks identified in current tanda
  let _liveTandaRotIdx = -1;   // position in rotation array

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    // Load profile from URL param or localStorage
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('profile');

    _profile = profileId ? Profiles.get(profileId) : null;
    if (!_profile) _profile = Profiles.getActive();

    _lessonMode = (new URLSearchParams(window.location.search)).get('lesson') === '1';
    _applyProfileStyles();

    // Restore last known state immediately so a page refresh isn't blank
    const params2 = new URLSearchParams(window.location.search);
    const roomForCache = params2.get('room') || 'default';
    const cached = localStorage.getItem('spotd_display_state_' + roomForCache);
    if (cached) {
      try { _handleMessage(JSON.parse(cached)); } catch (e) {}
    } else {
      _showIdle();
    }

    _connectPusher();
    _checkLiveSource();

    fetch('data/orchestras.json')
      .then(r => r.json())
      .then(d => { _orchestras = d; })
      .catch(() => {});

    const videoBtn   = document.getElementById('local-video-btn');
    const videoInput = document.getElementById('local-video-input');
    if (videoBtn && videoInput) {
      videoBtn.addEventListener('click', () => videoInput.click());
      videoInput.addEventListener('change', () => {
        if (videoInput.files && videoInput.files.length) {
          _startLocalVideoPlaylist(videoInput.files);
        }
      });
    }
  }

  // ── Local relay connection ────────────────────────────────────────────────

  function _connectPusher() {
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    _connectLocal(host ? decodeURIComponent(host) : window.location.host);
  }

  function _connectLocal(host) {
    _setConnectionBadge('', 'Connecting…');
    let _es = null;

    function connect() {
      _es = new EventSource('http://' + host + '/events');
      _es.onopen    = () => _setConnectionBadge('connected', 'Live (local)');
      _es.onmessage = e => {
        try { _handleMessage(JSON.parse(e.data)); } catch (err) { /* ignore malformed */ }
      };
      _es.onerror   = () => {
        _setConnectionBadge('disconnected', 'Reconnecting…');
        _es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
  }

  // ── Message handler ───────────────────────────────────────────────────────

  function _handleMessage(data) {
    if (data.type === 'dj-message') {
      _showDjMessage(data.message || '');
      return;
    }

    if (data.type === 'source-change') {
      if (data.source === 'live') _startLive();
      else                        _stopLive();
      return;
    }

    // Track mode early so _applyBackground can choose the right background
    _currentMode = data.mode || 'milonga';

    // Apply profile from payload if provided (live profile switch)
    if (data.appearance) {
      _profile = _mergeAppearance(_profile, data.appearance);
      _applyProfileStyles();
    }

    // Cache state so page refresh restores last known track
    const params3 = new URLSearchParams(window.location.search);
    const roomForCache2 = params3.get('room') || 'default';
    try { localStorage.setItem('spotd_display_state_' + roomForCache2, JSON.stringify(data)); } catch (e) {}

    const mode = data.mode || 'milonga';
    const format = data.format || 'tandas-cortinas';

    if (data.state === 'idle' || !data.artist) {
      _transitionTo('idle', () => _renderIdle(data));
      return;
    }

    if (data.isCortina && format === 'tandas-cortinas') {
      _transitionTo('cortina', () => _renderCortina(data, mode));
    } else {
      _transitionTo('track', () => _renderTrack(data, mode, format));
    }
  }

  // ── State transitions ─────────────────────────────────────────────────────

  function _transitionTo(newState, renderFn) {
    if (_transitionActive) return;

    const style = _profile.transition && _profile.transition.style;
    const dur   = _profile.transition && _profile.transition.durationMs || 600;

    if (style === 'none' || _currentState === null) {
      _hideAll();
      renderFn();
      _currentState = newState;
      return;
    }

    _transitionActive = true;
    els.fadeOverlay.style.transitionDuration = (dur / 2) + 'ms';
    els.fadeOverlay.classList.add('fading');

    setTimeout(() => {
      _hideAll();
      renderFn();
      _currentState = newState;

      els.fadeOverlay.classList.remove('fading');
      setTimeout(() => { _transitionActive = false; }, dur / 2);
    }, dur / 2);
  }

  function _hideAll() {
    els.idleScreen.classList.add('hidden');
    els.trackScreen.classList.add('hidden');
    els.cortinaScreen.classList.add('hidden');
  }

  function _showIdle() {
    _hideAll();
    _renderIdle({});
  }

  // ── Renderers ─────────────────────────────────────────────────────────────

  function _renderIdle(data) {
    if (!_profile) {
      els.idleScreen.classList.remove('hidden');
      els.idleMessage.textContent = data.idleMessage || 'Welcome';
      return;
    }
    const idle = _profile.idle || {};
    const branding = _profile.branding || {};

    // Idle message
    els.idleMessage.textContent = data.idleMessage || idle.message || 'Welcome';
    _applyFieldStyle(els.idleMessage, {
      color: idle.messageColor,
      font:  idle.messageFont,
      size:  idle.messageSize,
    });

    // Idle logo
    if (idle.showLogo && branding.logoData) {
      els.idleLogo.src = branding.logoData;
      els.idleLogo.style.display = 'block';
    } else {
      els.idleLogo.style.display = 'none';
    }

    // Idle DJ name
    if (idle.showDjName && branding.djName) {
      els.idleDjName.textContent = branding.djName;
      els.idleDjName.style.display = 'block';
    } else {
      els.idleDjName.style.display = 'none';
    }

    els.idleScreen.classList.remove('hidden');
  }

  function _renderTrack(data, mode, format) {
    format = format || 'tandas-cortinas';
    if (!_profile) { _renderIdle(data); return; }
    const fields = _fieldsById(_profile.danceFields || []);

    // Artwork
    if (_fieldVisible(fields, 'artwork') && data.albumArt) {
      const size = _fieldProp(fields, 'artwork', 'size', 200);
      els.artwork.src = data.albumArt;
      els.artwork.width = size;
      els.artwork.height = size;
      els.artwork.style.display = 'block';
    } else {
      els.artwork.style.display = 'none';
    }

    // Text fields
    _setTextField(els.trackArtist, fields, 'artist', data.artist);
    _setTextField(els.trackTitle,  fields, 'title',  data.title);
    if (els.trackTranslation) {
      els.trackTranslation.textContent = data.titleTranslation ? '(' + data.titleTranslation + ')' : '';
    }
    const genreLabel = (data.genre && format !== 'single' && data.tandaPosition)
      ? data.genre + ' #' + data.tandaPosition
      : (data.genre || '');
    _setTextField(els.trackGenre,  fields, 'genre',  genreLabel);
    _setTextField(els.trackYear,   fields, 'year',   data.year);

    // Tanda counter (milonga mode only)
    if (mode === 'milonga' && format !== 'single' && _fieldVisible(fields, 'tanda') &&
        data.tandaPosition && data.tandaTotal) {
      const f = fields['tanda'] || {};
      els.tandaCounter.textContent = 'Track ' + data.tandaPosition + ' of ' + data.tandaTotal;
      _applyFieldStyle(els.tandaCounter, f);
      els.tandaCounter.style.display = 'block';
    } else {
      els.tandaCounter.style.display = 'none';
    }

    // Next track / next tanda preview — hidden in single-track format
    format = data.format || format || 'tandas-cortinas';
    if (format !== 'single' && (data.nextArtist || data.nextGenre)) {
      const hdr = (data.nextLabel || 'Next') + (data.nextGenre ? ' · ' + data.nextGenre : '');
      els.trackNextHeader.textContent = hdr;
      els.trackNextDetail.textContent = data.nextArtist || '';
      els.trackNext.classList.remove('hidden');
    } else {
      els.trackNext.classList.add('hidden');
    }

    // Reorder DOM elements to match field order
    _reorderChildren(els.trackMain, _profile.danceFields || [], {
      artist: els.trackArtist,
      title:  els.trackTitle,
      genre:  els.trackGenre,
      year:   els.trackYear,
      artwork: els.artworkWrap,
      tanda:  els.tandaCounter,
    });

    // Lesson mode
    const lessonActive = _lessonMode || !!data.lessonMode || data.mode === 'lesson';
    if (lessonActive) {
      els.trackScreen.classList.add('lesson-mode');
      _applyBackground(); // re-apply: lesson may have its own background
      _populateLessonPanels(data);
    } else {
      els.trackScreen.classList.remove('lesson-mode');
      _applyBackground(); // re-apply: returning to milonga background
    }

    els.trackScreen.classList.remove('hidden');
  }

  function _renderCortina(data, mode) {
    const fields = _fieldsById(_profile.cortinaFields || []);
    const cuFields = _fieldsById(_profile.comingUpFields || []);

    // Cortina label
    const labelField = fields['label'] || {};
    const labelText = data.cortinaLabel || labelField.text || 'CORTINA';
    els.cortinaLabel.textContent = labelText;
    _applyFieldStyle(els.cortinaLabel, labelField);

    // Optional artist/title on cortina
    _setTextField(els.cortinaArtist, fields, 'artist', data.artist);
    _setTextField(els.cortinaTitle,  fields, 'title',  data.title);

    // "Coming Up" preview
    if (data.nextArtist) {
      const header = document.getElementById('coming-up-header');
      if (header) header.textContent = data.nextLabel || 'Next tanda';
      _setTextField(els.comingUpArtist, cuFields, 'artist', data.nextArtist);
      _setTextField(els.comingUpGenre,  cuFields, 'genre',  data.nextGenre);
      els.comingUp.classList.remove('hidden');
    } else {
      els.comingUp.classList.add('hidden');
    }

    els.cortinaScreen.classList.remove('hidden');
  }

  // ── Profile style application ─────────────────────────────────────────────

  function _applyProfileStyles() {
    if (!_profile) return;
    _applyBackground();
    _applyBranding();
    _applyTransitionStyle();
  }

  function _applyBackground() {
    if (_localVideoActive) return;
    // Use lessonBackground when in lesson mode, falling back to regular background
    const isLesson = _currentMode === 'lesson' || _lessonMode;
    const bg = (isLesson && _profile.lessonBackground) ? _profile.lessonBackground : (_profile.background || {});
    const layer = els.bgLayer;
    layer.innerHTML = '';

    if (bg.type === 'image' && bg.imageData) {
      const img = document.createElement('img');
      img.src = bg.imageData;
      layer.appendChild(img);
      layer.style.background = 'none';
    } else if (bg.type === 'video' && bg.videoObjectUrl) {
      const vid = document.createElement('video');
      vid.src = bg.videoObjectUrl;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      layer.appendChild(vid);
      layer.style.background = 'none';
    } else {
      layer.style.background = bg.color || '#1a0a2e';
    }
  }

  function _applyCortinaBackground() {
    if (_localVideoActive) return;
    const cbg = _profile.cortinaBackground || {};
    if (!cbg.enabled) { _applyBackground(); return; }

    const layer = els.bgLayer;
    layer.innerHTML = '';

    if (cbg.type === 'image' && cbg.imageData) {
      const img = document.createElement('img');
      img.src = cbg.imageData;
      layer.appendChild(img);
      layer.style.background = 'none';
    } else {
      layer.style.background = cbg.color || '#0a0a0a';
    }
  }

  function _applyBranding() {
    const b = _profile.branding || {};

    // Position
    const pos = b.logoPosition || b.djNamePosition || 'bottom-right';
    els.branding.className = pos;

    // Logo
    if (b.logoData) {
      els.brandingLogo.src = b.logoData;
      els.brandingLogo.style.width  = (b.logoSize || 80) + 'px';
      els.brandingLogo.style.height = (b.logoSize || 80) + 'px';
      els.brandingLogo.style.opacity = b.logoOpacity != null ? b.logoOpacity : 0.85;
      els.brandingLogo.style.display = 'block';
    } else {
      els.brandingLogo.style.display = 'none';
    }

    // DJ name
    if (b.djName) {
      els.brandingName.textContent = b.djName;
      els.brandingName.style.color = b.djNameColor || '#fff';
      els.brandingName.style.fontFamily = b.djNameFont || 'Georgia, serif';
      els.brandingName.style.fontSize = (b.djNameSize || 18) + 'px';
      els.brandingName.style.display = 'block';
    } else {
      els.brandingName.style.display = 'none';
    }
  }

  function _applyTransitionStyle() {
    const t = _profile.transition || {};
    const dur = t.durationMs || 600;
    els.fadeOverlay.style.transitionDuration = (dur / 2) + 'ms';
  }

  // ── DJ message overlay ────────────────────────────────────────────────────

  function _showDjMessage(text) {
    if (!els.djMessageOverlay) return;
    if (!text) {
      els.djMessageOverlay.classList.add('hidden');
      return;
    }
    els.djMessageText.textContent = text;
    els.djMessageOverlay.classList.remove('hidden');
  }

  // ── Local video playlist ──────────────────────────────────────────────────

  function _startLocalVideoPlaylist(files) {
    _localVideos.forEach(url => URL.revokeObjectURL(url));
    _localVideos = Array.from(files).map(f => URL.createObjectURL(f));
    _localVideoIndex = 0;
    _localVideoActive = true;
    const btn = document.getElementById('local-video-btn');
    if (btn) btn.textContent = '\uD83C\uDFAC ' + _localVideos.length;
    _playNextLocalVideo();
  }

  function _playNextLocalVideo() {
    if (!_localVideos.length) return;
    const url = _localVideos[_localVideoIndex];
    const layer = els.bgLayer;
    layer.innerHTML = '';
    layer.style.background = 'none';
    const vid = document.createElement('video');
    vid.src = url;
    vid.autoplay = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    vid.addEventListener('ended', () => {
      _localVideoIndex = (_localVideoIndex + 1) % _localVideos.length;
      _playNextLocalVideo();
    });
    vid.addEventListener('error', () => {
      _localVideoIndex = (_localVideoIndex + 1) % _localVideos.length;
      _playNextLocalVideo();
    });
    layer.appendChild(vid);
    vid.play().catch(() => {});
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _fieldsById(fieldsArray) {
    const map = {};
    (fieldsArray || []).forEach(f => { map[f.id] = f; });
    return map;
  }

  function _fieldVisible(fieldsMap, id) {
    const f = fieldsMap[id];
    return f ? f.visible !== false : true;
  }

  function _fieldProp(fieldsMap, id, prop, fallback) {
    const f = fieldsMap[id];
    return f && f[prop] != null ? f[prop] : fallback;
  }

  function _setTextField(el, fieldsMap, fieldId, value) {
    if (!_fieldVisible(fieldsMap, fieldId) || !value) {
      el.style.display = 'none';
      return;
    }
    el.textContent = value;
    _applyFieldStyle(el, fieldsMap[fieldId] || {});
    el.style.display = 'block';
  }

  function _applyFieldStyle(el, field) {
    if (field.color)  el.style.color      = field.color;
    if (field.font)   el.style.fontFamily = field.font;
    if (field.size)   el.style.fontSize   = field.size + 'px';
    if (field.bold  != null) el.style.fontWeight  = field.bold  ? 'bold'   : 'normal';
    if (field.italic != null) el.style.fontStyle  = field.italic ? 'italic' : 'normal';
  }

  function _fitTextToPanel(el, panel, maxSize, minSize) {
    el.style.fontSize = maxSize + 'px';
    while (panel.scrollHeight > panel.clientHeight && parseFloat(el.style.fontSize) > minSize) {
      el.style.fontSize = (parseFloat(el.style.fontSize) - 1) + 'px';
    }
  }

  function _populateLessonPanels(data) {
    // Panel visibility from profile
    const lp = _profile.lessonPanels || {};
    if (els.lessonLeft)  els.lessonLeft.style.display  = lp.showOrchestra === false ? 'none' : '';
    if (els.lessonRight) els.lessonRight.style.display = lp.showStory     === false ? 'none' : '';

    // Orchestra bio (left panel)
    const orch = data.orchestraBio || {};
    els.lessonOrchName.textContent    = orch.name    || data.artist || '';
    els.lessonOrchNick.textContent    = orch.nickname || '';
    els.lessonOrchEra.textContent     = orch.era      || '';
    els.lessonOrchStyle.textContent   = orch.style    || '';
    els.lessonOrchChars.innerHTML = '';
    (orch.characteristics || []).forEach(c => {
      const li = document.createElement('li');
      li.textContent = c;
      els.lessonOrchChars.appendChild(li);
    });
    const singers = orch.notable_singers;
    els.lessonOrchSingers.textContent = singers && singers.length
      ? 'Singers: ' + singers.join(', ') : '';

    const rightPanel = document.getElementById('lesson-right');

    function _applyStory(text) {
      els.lessonStory.textContent = text || '';
      if (rightPanel && text) requestAnimationFrame(() => _fitTextToPanel(els.lessonStory, rightPanel, 16, 9));
    }

    // Song story (right panel) — use pushed story if available, else async fallback
    if (data.songStory) {
      _applyStory(data.songStory);
      els.lessonThemes.textContent = '';
    } else if (data.title) {
      els.lessonStory.textContent = 'Loading…';
      els.lessonThemes.textContent = '';
      const trackKey = (data.title + '|' + (data.artist || '')).toLowerCase();
      _lessonTrackKey = trackKey;
      if (typeof LastFm !== 'undefined') {
        LastFm.fetchTrackInfo(data.title, data.artist).then(info => {
          if (_lessonTrackKey !== trackKey) return; // stale
          if (info && info.story) {
            _applyStory(info.story);
            els.lessonThemes.textContent = info.source === 'wikipedia' ? 'Source: Wikipedia' : 'Source: Last.fm';
          } else {
            _applyStory('');
            els.lessonThemes.textContent = '';
          }
        }).catch(() => { if (_lessonTrackKey === trackKey) _applyStory(''); });
      } else {
        _applyStory(data.songStory || '');
        const themes = data.songThemes;
        els.lessonThemes.textContent = themes && themes.length ? 'Themes: ' + themes.join(', ') : '';
      }
    } else {
      _applyStory('');
      els.lessonThemes.textContent = '';
    }
  }

  function _reorderChildren(parent, fieldsArray, elMap) {
    const ordered = (fieldsArray || [])
      .map(f => elMap[f.id])
      .filter(Boolean);
    ordered.forEach(el => parent.appendChild(el));
  }

  // ── AudD live recognition ─────────────────────────────────────────────────

  function _checkLiveSource() {
    if (localStorage.getItem('spotd_source') === 'live') _startLive();
  }

  function _startLive() {
    if (_liveSource) return;   // already running
    if (typeof AudD === 'undefined' || !AudD.getKey()) {
      console.warn('[display] AudD not available or no key set');
      return;
    }
    _liveSource = true;
    _setLiveIndicator('listening');
    // Run immediately then repeat
    _runAudD();
    _liveTimer = setInterval(_runAudD, LIVE_INTERVAL_MS);
  }

  function _stopLive() {
    _liveSource = false;
    if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
    if (typeof AudD !== 'undefined') AudD.releaseStream();
    _setLiveIndicator('off');
  }

  // ── Live tanda tracking ────────────────────────────────────────────────────

  const _GENRE_MAP = { T: 'Tango', M: 'Milonga', V: 'Vals' };

  function _getRotation() {
    const style = localStorage.getItem('spotd_live_tanda_style') || 'TTMTTV';
    return style.split('').map(c => _GENRE_MAP[c]).filter(Boolean);
  }

  // Called on each successful AudD identification. Returns predicted next-tanda genre.
  function _updateLiveTanda(genre) {
    if (!genre) return null;
    const size = parseInt(localStorage.getItem('spotd_live_tanda_size') || '4', 10);
    const rot  = _getRotation();
    if (!rot.length) return null;

    if (genre === _liveTandaGenre) {
      // Same tanda still playing
      _liveTandaPos = Math.min(_liveTandaPos + 1, size);
    } else {
      // New tanda detected
      _liveTandaPos   = 1;
      _liveTandaGenre = genre;
      // Advance rotation index to next matching slot
      const len = rot.length;
      for (let i = 1; i <= len; i++) {
        const candidate = rot[(_liveTandaRotIdx + i) % len];
        if (candidate === genre) { _liveTandaRotIdx = (_liveTandaRotIdx + i) % len; break; }
      }
    }

    // Predict next tanda genre from rotation
    return rot[(_liveTandaRotIdx + 1) % rot.length] || null;
  }

  // ── AudD live recognition loop ───────────────────────────────────────────

  async function _runAudD() {
    _setLiveIndicator('listening');
    try {
      const resp = await AudD.recognize();
      if (resp.status === 'no-audio') {
        // Mic is silent — no music playing, skip silently and stay in listening state
        return;
      } else if (resp.status === 'success' && resp.result) {
        const r    = resp.result;
        const year = r.release_date ? r.release_date.slice(0, 4) : null;
        // Look up genre from tango DB
        const db    = TangoDB.lookupSync(r.title || '', r.artist || '', null);
        const genre = db && db.type ? db.type : null;
        // Update live tanda tracking and predict next
        const nextGenre = _updateLiveTanda(genre);
        // Synthesize a track payload and feed it through the normal renderer
        _handleMessage({
          state:    'playing',
          mode:     localStorage.getItem('spotd_mode') || 'milonga',
          format:   localStorage.getItem('spotd_format') || 'tandas-cortinas',
          artist:   r.artist || '',
          title:    r.title  || '',
          year,
          albumArt: r.spotify && r.spotify.album && r.spotify.album.images &&
                    r.spotify.album.images[0] && r.spotify.album.images[0].url,
          nextGenre,
          nextLabel:    nextGenre ? 'Next tanda' : null,
          orchestraBio: _getOrchestraBio(r.artist),
          _fromLive: true,
        });
        _setLiveIndicator('identified');
        // Revert indicator to listening after 3s
        setTimeout(() => { if (_liveSource) _setLiveIndicator('listening'); }, 3000);
      } else {
        _setLiveIndicator('no-match');
        setTimeout(() => { if (_liveSource) _setLiveIndicator('listening'); }, 3000);
      }
    } catch (err) {
      console.warn('[display] AudD error:', err.message);
      _setLiveIndicator('error');
      setTimeout(() => { if (_liveSource) _setLiveIndicator('listening'); }, 5000);
    }
  }

  function _setLiveIndicator(state) {
    const el = els.liveIndicator;
    if (!el) return;
    el.className = 'live-indicator ' + state;
    el.title = { listening: 'Listening…', identified: 'Track identified!',
                 'no-match': 'No match', error: 'Recognition error', off: '' }[state] || '';
    el.style.display = state === 'off' ? 'none' : 'flex';
  }

  function _setConnectionBadge(state, msg) {
    els.connectionBadge.className = state;
    els.connectionBadge.textContent = msg || state;
  }

  function _mergeAppearance(profile, appearance) {
    // appearance is a partial profile sent via Pusher payload
    if (!appearance) return profile;
    return Object.assign({}, profile, appearance);
  }

  // ── Public ────────────────────────────────────────────────────────────────

  return { init };
})();

// Kick off on load — Pusher SDK loaded lazily inside init
window.addEventListener('DOMContentLoaded', Display.init);
