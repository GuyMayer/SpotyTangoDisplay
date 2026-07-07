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
    tandaSequence:$('tanda-sequence'),
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
  let _currentTrackKey = '';    // "title|artist" of the currently displayed track
  let _currentOrchBio  = null;  // orchestraBio of current track (null = not yet loaded)
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
  let _currentLyrics = null;   // current track lyrics {text, synced?, source}
  let _karaokeInterval = null; // interval for updating karaoke highlight
  let _playbackPosition = 0;   // current playback position in ms

  function _getOrchestraBio(name) {
    if (!name || !_orchestras) return null;
    
    // Normalize: lowercase, trim, remove accents
    let key = name.toLowerCase().trim();
    key = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Try exact match first
    if (_orchestras[key]) return _orchestras[key];
    
    // Strip common orchestra suffixes and try again
    const patterns = [
      / y su orquesta tipica$/,
      / y su orquesta tpica$/,  // without accent
      / and his orchestra$/,
      / y su orquesta$/,
      / orquesta$/,
      /'s orchestra$/,
    ];
    
    for (const pattern of patterns) {
      const stripped = key.replace(pattern, '').trim();
      if (_orchestras[stripped]) return _orchestras[stripped];
    }
    
    return null;
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
      .then(d => {
        const normalized = {};
        Object.keys(d).forEach(k => {
          const nk = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          normalized[nk] = d[k];
        });
        _orchestras = normalized;
      })
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
    // Default to local relay on 127.0.0.1:3456 when no host specified
    const defaultHost = '127.0.0.1:3456';
    _connectLocal(host ? decodeURIComponent(host) : defaultHost);
  }

  function _connectLocal(host) {
    _setConnectionBadge('', 'Connecting…');
    let _es = null;

    function connect() {
      // The relay always serves HTTP (never HTTPS). No TLS on localhost:3456.
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
    _displayLang = data.lang || 'es';

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
      const incomingKey = (data.title || '') + '|' + (data.artist || '');
      if (_currentState === 'track' && incomingKey === _currentTrackKey &&
          data.orchestraBio && !_currentOrchBio) {
        // Bio arrived — update left panel only
        _currentOrchBio = data.orchestraBio;
        _updateOrchBioOnly(data.orchestraBio, data.artist);
      } else if (_currentState === 'track' && incomingKey === _currentTrackKey &&
          data.orchLookupDone && !data.orchestraBio && !_currentOrchBio) {
        // Bio lookup finished with no result — clear "Looking up..."
        els.lessonOrchStyle.textContent = '';
      } else if (data.orchBioUpdate && incomingKey !== _currentTrackKey) {
        // Stale bio update for a track that's no longer playing — discard
        return;
      } else {
        _currentTrackKey = incomingKey;
        _currentOrchBio  = data.orchestraBio || null;
        _transitionTo('track', () => _renderTrack(data, mode, format));
      }
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

  /**
   * Render the tanda sequence strip: T T M T T V with current highlighted.
   * Shown only in milonga mode with tanda format (not single).
   */
  function _renderTandaSequence(data, mode, format) {
    if (!els.tandaSequence) return;

    // Hide if not applicable
    if (mode !== 'milonga' || format === 'single' ||
        !data.tandaSequence || !data.tandaSequence.length ||
        data.tandaSequenceIndex < 0) {
      els.tandaSequence.classList.add('hidden');
      els.tandaSequence.innerHTML = '';
      return;
    }

    const seq   = data.tandaSequence;
    const idx   = data.tandaSequenceIndex;
    const GENRE_LETTER = { Tango: 'T', Milonga: 'M', Vals: 'V' };

    els.tandaSequence.innerHTML = '';
    seq.forEach((genre, i) => {
      const pill = document.createElement('div');
      pill.className = 'tanda-pill';
      pill.textContent = GENRE_LETTER[genre] || '?';
      if (i < idx)       pill.classList.add('past');
      else if (i === idx) pill.classList.add('current');
      else                pill.classList.add('future');
      els.tandaSequence.appendChild(pill);
    });

    els.tandaSequence.classList.remove('hidden');
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
    // Composer / original orchestra — shown when the playing band is not in local DB
    if (els.trackComposer) {
      els.trackComposer.textContent = data.composerInfo || '';
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

    // Tanda sequence strip (milonga mode only)
    _renderTandaSequence(data, mode, format);

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

  // Update only the orchestra bio (left panel) without disturbing the right panel.
  // Called when the async bio fetch completes after the track is already displayed.
  function _updateOrchBioOnly(orchBio, fallbackArtist) {
    if (!orchBio) return;
    const orch  = orchBio;
    const chars = orch.characteristics || [];
    const isWikiBio = chars.length === 1 && chars[0].length > 80;

    els.lessonOrchName.textContent = orch.name || fallbackArtist || '';
    els.lessonOrchNick.textContent = orch.nickname || '';

    if (isWikiBio) {
      els.lessonOrchEra.textContent   = '';
      els.lessonOrchStyle.textContent = '';
      els.lessonOrchChars.innerHTML   = '<p style="font-size:12px;color:#999;line-height:1.6;margin:6px 0 0">' +
        chars[0].replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
      els.lessonOrchSingers.textContent = '';
    } else {
      els.lessonOrchEra.textContent   = orch.era   || '';
      els.lessonOrchStyle.textContent = orch.style || '';
      els.lessonOrchChars.innerHTML   = '';
      chars.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        els.lessonOrchChars.appendChild(li);
      });
      const singers = orch.notable_singers;
      els.lessonOrchSingers.textContent = singers && singers.length
        ? 'Singers: ' + singers.join(', ') : '';
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

    // Detect Wikipedia-sourced bio: single characteristics entry that is prose
    const chars = orch.characteristics || [];
    const isWikiBio = chars.length === 1 && chars[0].length > 80;

    if (!data.orchestraBio) {
      // Bio not yet loaded — show subtle placeholder
      els.lessonOrchEra.textContent   = '';
      els.lessonOrchStyle.textContent = 'Looking up…';
      els.lessonOrchChars.innerHTML   = '';
      els.lessonOrchSingers.textContent = '';
    } else if (isWikiBio) {
      // Show Wikipedia extract as a paragraph; suppress era/style/singers (may be empty)
      els.lessonOrchEra.textContent   = '';
      els.lessonOrchStyle.textContent = '';
      els.lessonOrchChars.innerHTML   = '<p style="font-size:12px;color:#999;line-height:1.6;margin:6px 0 0">' +
        chars[0].replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
      els.lessonOrchSingers.textContent = '';
    } else {
      els.lessonOrchEra.textContent   = orch.era   || '';
      els.lessonOrchStyle.textContent = orch.style || '';
      els.lessonOrchChars.innerHTML = '';
      chars.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        els.lessonOrchChars.appendChild(li);
      });
      const singers = orch.notable_singers;
      els.lessonOrchSingers.textContent = singers && singers.length
        ? 'Singers: ' + singers.join(', ') : '';
    }

    const rightPanel = document.getElementById('lesson-right');

    // Song story / lyrics (right panel)
    // Priority depends on song type:
    // - Tango songs: story first (Wikipedia/Last.fm) → lyrics fallback
    // - Non-tango songs: lyrics first → story fallback
    if (data.songStory) {
      _applyStory(data.songStory);
      els.lessonThemes.textContent = '';
      _stopKaraokeSync();
    } else if (data.title) {
      els.lessonStory.textContent = 'Loading…';
      els.lessonThemes.textContent = '';
      const trackKey = (data.title + '|' + (data.artist || '')).toLowerCase();
      _lessonTrackKey = trackKey;

      // Strip remastered/live suffixes for story/lyric lookups so APIs get clean titles
      const cleanTitle = data.title
        .replace(/\s*[-–([]?\s*(remaster(?:ed|izado)?|live|mono|stereo)\b[^)\]]*[)\]]?/gi, '')
        .replace(/\s*\(\d{4}\s+remaster[^)]*\)/gi, '')
        .trim() || data.title;

      // Check if it's a tango song (use clean title for lookup)
      const isTango = typeof TangoDB !== 'undefined' && TangoDB.lookupSync(cleanTitle, data.artist).type !== null;
      
      if (isTango) {
        // Tango: try story first, lyrics fallback
        if (typeof LastFm !== 'undefined') {
          LastFm.fetchTrackInfo(cleanTitle, data.artist).then(info => {
            if (_lessonTrackKey !== trackKey) return; // stale
            if (info && info.story) {
              _applyStory(info.story);
              els.lessonThemes.textContent = info.source === 'wikipedia' ? 'Source: Wikipedia' : 'Source: Last.fm';
              _stopKaraokeSync();
            } else {
              // No story, try lyrics then provenance
              _tryFetchLyrics(cleanTitle, data.artist, trackKey, data, () => _showFallbackContent(data, trackKey));
            }
          }).catch(() => { 
            if (_lessonTrackKey === trackKey) _tryFetchLyrics(cleanTitle, data.artist, trackKey, data, () => _showFallbackContent(data, trackKey));
          });
        } else {
          _tryFetchLyrics(cleanTitle, data.artist, trackKey, data, () => _showFallbackContent(data, trackKey));
        }
      } else {
        // Non-tango: try lyrics first, story fallback
        _tryFetchLyrics(cleanTitle, data.artist, trackKey, data, () => {
          // Lyrics not found, try story
          if (_lessonTrackKey !== trackKey) return;
          if (typeof LastFm !== 'undefined') {
            LastFm.fetchTrackInfo(cleanTitle, data.artist).then(info => {
              if (_lessonTrackKey !== trackKey) return;
              if (info && info.story) {
                _applyStory(info.story);
                els.lessonThemes.textContent = info.source === 'wikipedia' ? 'Source: Wikipedia' : 'Source: Last.fm';
                _stopKaraokeSync();
              } else {
                _showFallbackContent(data, trackKey);
              }
            }).catch(() => {
              if (_lessonTrackKey === trackKey) _showFallbackContent(data, trackKey);
            });
          } else {
            _showFallbackContent(data, trackKey);
          }
        });
      }
    } else {
      _applyStory('');
      els.lessonThemes.textContent = '';
      _stopKaraokeSync();
    }
  }

  function _applyStory(text) {
    const rightPanel = document.getElementById('lesson-right');
    els.lessonStory.textContent = text || '';
    if (rightPanel && text) requestAnimationFrame(() => _fitTextToPanel(els.lessonStory, rightPanel, 16, 9));
  }

  function _renderLyricsEs(lyrics, position, rightPanel) {
    rightPanel = rightPanel || document.getElementById('lesson-right');
    if (lyrics.synced && lyrics.synced.length > 0) {
      els.lessonStory.innerHTML = lyrics.synced.map((line, idx) =>
        `<div class="lyric-line" data-time="${line.time}" data-idx="${idx}">${line.text || '&nbsp;'}</div>`
      ).join('');
      els.lessonThemes.textContent = 'Source: ' + lyrics.source;
      _startKaraokeSync(position || 0);
    } else if (lyrics.es) {
      _stopKaraokeSync();
      els.lessonStory.textContent = lyrics.es;
      els.lessonThemes.textContent = 'Lyrics';
      if (rightPanel && lyrics.es) requestAnimationFrame(() => _fitTextToPanel(els.lessonStory, rightPanel, 14, 9));
    } else if (lyrics.text) {
      _stopKaraokeSync();
      els.lessonStory.textContent = lyrics.text;
      els.lessonThemes.textContent = 'Lyrics: ' + lyrics.source;
      if (rightPanel && lyrics.text) requestAnimationFrame(() => _fitTextToPanel(els.lessonStory, rightPanel, 14, 9));
    }
  }

  function _renderLyricsEn(lyrics) {
    const rightPanel = document.getElementById('lesson-right');
    _stopKaraokeSync();
    els.lessonStory.textContent = lyrics.en || '';
    els.lessonThemes.textContent = 'English translation';
    if (rightPanel && lyrics.en) requestAnimationFrame(() => _fitTextToPanel(els.lessonStory, rightPanel, 14, 9));
  }

  // Display language (controlled by DJ panel, syncs via payload.lang)
  let _displayLang = 'es'; 

  function _applyLyrics(lyrics, position, title, artist, cacheKey) {
    if (!lyrics) {
      els.lessonStory.innerHTML = '';
      els.lessonThemes.textContent = '';
      _currentLyrics = null;
      return;
    }
    const rightPanel = document.getElementById('lesson-right');
    _currentLyrics = lyrics;

    // Show EN if DJ switched language and translation is available
    if (_displayLang === 'en' && lyrics.en) {
      _renderLyricsEn(lyrics);
    } else {
      _renderLyricsEs(lyrics, position, rightPanel);
    }

    // Background translation: detect non-English, fire-and-forget
    if (!lyrics.en && typeof LyricsModule !== 'undefined' && cacheKey) {
      const textToTranslate = lyrics.text ||
        (lyrics.synced ? lyrics.synced.map(l => l.text).filter(Boolean).join('\n') : '') ||
        lyrics.es || '';
      if (textToTranslate && LyricsModule.looksSpanish(textToTranslate)) {
        const snapshot = _lessonTrackKey;
        LyricsModule.translateLyrics(title || '', artist || '', textToTranslate, cacheKey)
          .then(en => {
            if (!en || _lessonTrackKey !== snapshot) return;
            lyrics.en = en;
            // If DJ already switched to EN, re-render with new translation
            if (_displayLang === 'en') _renderLyricsEn(lyrics);
          });
      }
    }
  }

  function _tryFetchLyrics(title, artist, trackKey, data, onNotFound) {
    if (typeof LyricsModule === 'undefined') {
      if (onNotFound) onNotFound();
      else _showFallbackContent(data, trackKey);
      return;
    }

    LyricsModule.getLyrics(title, artist).then(lyrics => {
      if (_lessonTrackKey !== trackKey) return; // stale
      if (lyrics) {
        const cacheKey = (typeof LyricsModule !== 'undefined')
          ? (title.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim() + '|' + artist.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim())
          : null;
        _applyLyrics(lyrics, data.progressMs || 0, title, artist, cacheKey);
      } else {
        if (onNotFound) onNotFound();
        else _showFallbackContent(data, trackKey);
      }
    }).catch(() => {
      if (_lessonTrackKey === trackKey) {
        if (onNotFound) onNotFound();
        else _showFallbackContent(data, trackKey);
      }
    });
  }

  // Last resort: show song provenance (classic song covered by modern orch)
  // or a brief metadata card (year / type / singer from TangoDB or payload).
  function _showFallbackContent(data, trackKey) {
    if (_lessonTrackKey !== trackKey) return; // stale

    // Try song provenance — search TangoDB for all recordings of this title
    if (data.title && typeof TangoDB !== 'undefined') {
      const recordings = TangoDB.searchByTitle(data.title);
      if (recordings.length > 0) {
        const earliest = recordings[0]; // already sorted ascending by year
        // Build "also by" list — top 3 different orchestras (not the current one)
        const currentNorm = (data.artist || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const others = recordings
          .filter(r => r.artist !== earliest.artist && r.artist !== currentNorm)
          .slice(0, 3)
          .map(r => {
            // Capitalise first letter of each word
            return r.artist.replace(/\b\w/g, c => c.toUpperCase());
          });

        const type = (earliest.type || 'Tango');
        let lines = [];
        lines.push('🎻 ' + type + ' · ' + recordings.length + ' known recordings');
        if (earliest.year) {
          const name = earliest.artist.replace(/\b\w/g, c => c.toUpperCase());
          lines.push('Earliest: ' + name + ' (' + earliest.year + ')');
        }
        if (others.length > 0) {
          lines.push('Also: ' + others.join(', '));
        }
        if (earliest.singer) {
          lines.push('Singer: ' + earliest.singer);
        }

        els.lessonStory.textContent = lines.join('\n');
        els.lessonThemes.textContent = 'Song Provenance';
        return;
      }
    }

    // Final fallback: metadata card from payload (year/genre from Spotify)
    const year   = data.year || '';
    const genre  = data.genre || '';
    const singer = data.singer || '';
    const album  = data.album || '';
    const mins   = data.durationMs ? Math.floor(data.durationMs / 60000) : 0;
    const secs   = data.durationMs ? String(Math.floor((data.durationMs % 60000) / 1000)).padStart(2, '0') : '';
    const parts  = [];
    if (year)   parts.push('📅 ' + year);
    if (genre)  parts.push('🎵 ' + genre);
    if (singer) parts.push('🎤 ' + singer);
    if (album)  parts.push('💿 ' + album);
    if (mins)   parts.push('⏱ ' + mins + ':' + secs);

    if (parts.length > 0) {
      els.lessonStory.innerHTML = parts.map(p => `<div style="margin:3px 0">${p}</div>`).join('');
      els.lessonThemes.textContent = '';
    } else {
      els.lessonStory.textContent = '';
      els.lessonThemes.textContent = '';
    }
  }

  function _startKaraokeSync(startPosition) {
    _stopKaraokeSync();
    _playbackPosition = startPosition || 0;
    
    // Update every 100ms
    _karaokeInterval = setInterval(() => {
      _playbackPosition += 100;
      _updateKaraokeHighlight();
    }, 100);
    
    _updateKaraokeHighlight();
  }

  function _stopKaraokeSync() {
    if (_karaokeInterval) {
      clearInterval(_karaokeInterval);
      _karaokeInterval = null;
    }
    _currentLyrics = null;
  }

  function _updateKaraokeHighlight() {
    if (!_currentLyrics || !_currentLyrics.synced) return;

    const lines = document.querySelectorAll('.lyric-line');
    if (!lines.length) return;

    // Find current line based on playback position
    let currentIdx = -1;
    for (let i = _currentLyrics.synced.length - 1; i >= 0; i--) {
      if (_playbackPosition >= _currentLyrics.synced[i].time) {
        currentIdx = i;
        break;
      }
    }

    // Update highlighting
    lines.forEach((line, idx) => {
      if (idx === currentIdx) {
        line.classList.add('current');
      } else {
        line.classList.remove('current');
      }
    });

    // Auto-scroll to keep current line visible
    if (currentIdx >= 0 && lines[currentIdx]) {
      const rightPanel = document.getElementById('lesson-right');
      if (rightPanel) {
        const lineTop = lines[currentIdx].offsetTop;
        const lineHeight = lines[currentIdx].offsetHeight;
        const panelHeight = rightPanel.offsetHeight;
        const scrollTop = lineTop - (panelHeight / 2) + (lineHeight / 2);
        rightPanel.scrollTop = Math.max(0, scrollTop);
      }
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
