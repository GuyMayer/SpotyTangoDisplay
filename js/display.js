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
    artworkWrap:  $('artwork-wrap'),
    artwork:      $('artwork'),
    trackArtist:  $('track-artist'),
    trackTitle:   $('track-title'),
    trackGenre:   $('track-genre'),
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
  };

  let _profile = null;
  let _currentState = null; // 'idle' | 'track' | 'cortina'
  let _transitionActive = false;
  let _localVideoActive = false;
  let _localVideos = [];
  let _localVideoIndex = 0;

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    // Load profile from URL param or localStorage
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('profile');

    _profile = profileId ? Profiles.get(profileId) : null;
    if (!_profile) _profile = Profiles.getActive();

    _applyProfileStyles();
    _showIdle();
    _connectPusher();

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

  // ── Pusher connection ─────────────────────────────────────────────────────

  function _connectPusher() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');

    if (!roomCode) {
      _setConnectionBadge('error', 'No room code in URL');
      return;
    }

    // Load Pusher SDK dynamically (needs key from localStorage)
    const { key, cluster } = PusherRelay.getCredentials();
    if (!key) {
      _setConnectionBadge('error', 'No Pusher key — check DJ control app');
      return;
    }

    _loadPusherSdk(key, cluster, () => {
      PusherRelay.subscribe({
        roomCode,
        key,
        cluster,
        onMessage: _handleMessage,
        onStatusChange: (state, msg) => {
          _setConnectionBadge(state, msg);
          // On reconnect, re-render last known state (already in DOM — no action needed)
        },
      });
    });
  }

  function _loadPusherSdk(key, cluster, cb) {
    if (window.Pusher) { cb(); return; }
    const script = document.createElement('script');
    script.src = 'https://js.pusher.com/8.4.0/pusher.min.js';
    script.onload = cb;
    document.head.appendChild(script);
  }

  // ── Message handler ───────────────────────────────────────────────────────

  function _handleMessage(data) {
    if (data.type === 'dj-message') {
      _showDjMessage(data.message || '');
      return;
    }

    // Apply profile from payload if provided (live profile switch)
    if (data.appearance) {
      _profile = _mergeAppearance(_profile, data.appearance);
      _applyProfileStyles();
    }

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
    _setTextField(els.trackGenre,  fields, 'genre',  data.genre);
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

    // Next track / next tanda preview on track screen
    if (data.nextArtist) {
      els.trackNextHeader.textContent = data.nextLabel || 'Next';
      const detail = data.nextGenre
        ? data.nextGenre + (data.nextArtist ? ' · ' + data.nextArtist : '')
        : data.nextArtist;
      els.trackNextDetail.textContent = detail;
      els.trackNext.classList.remove('hidden');
    } else {
      els.trackNext.classList.add('hidden');
    }

    // Reorder DOM elements to match field order
    _reorderChildren(els.trackScreen, _profile.danceFields || [], {
      artist: els.trackArtist,
      title:  els.trackTitle,
      genre:  els.trackGenre,
      year:   els.trackYear,
      artwork: els.artworkWrap,
      tanda:  els.tandaCounter,
    });

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
    const bg = _profile.background || {};
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

  function _reorderChildren(parent, fieldsArray, elMap) {
    const ordered = (fieldsArray || [])
      .map(f => elMap[f.id])
      .filter(Boolean);
    ordered.forEach(el => parent.appendChild(el));
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
