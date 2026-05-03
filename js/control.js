// control.js — DJ control panel logic

const Control = (() => {

  let _mode = 'milonga';         // 'milonga' | 'lesson'
  let _format = 'tandas-cortinas'; // 'tandas-cortinas' | 'tandas-nocortinas' | 'single'
  let _lastTrack = null;
  let _currentTrackId = null;    // track ID for per-track DB overrides
  let _currentDetectedType = ''; // auto-detected type for current track
  let _source = 'spotify';       // 'spotify' | 'live'
  let _pusherConnected = false;
  let _spotifyConnected = false;
  let _danceOverride = '';        // '' | 'Tango' | 'Milonga' | 'Vals' — DJ manual override
  let _orchestras = {};          // loaded from data/orchestras.json

  // ── Orchestra lookup ──────────────────────────────────────────────────────

  function _loadOrchestras() {
    fetch('data/orchestras.json')
      .then(r => r.json())
      .then(d => { _orchestras = d; })
      .catch(() => {});
  }

  function _getOrchestraBio(artistName) {
    if (!artistName || !_orchestras) return null;
    const key = artistName.toLowerCase().trim();
    return _orchestras[key] || null;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    // Run wizard on first visit
    if (!Wizard.isComplete()) {
      Wizard.runIfNeeded();
      return;
    }

    _loadMode();
    _loadDanceOverride();
    _loadFormat();
    _renderProfileList();
    _renderRoomInfo();
    _renderStatusRow();

    _bindModeToggle();
    _bindProfileActions();
    _bindSettingsBtn();
    _bindDjMessage();
    _bindStoryCard();
    _bindDanceOverride();
    _bindFormat();
    _bindTrackOverride();
    _loadSource();
    _bindSourceToggle();

    _startSpotify();
    _startPusher();
    TangoDB.preload();
    _loadOrchestras();
  }
  // ── Input source (Spotify / Live AudD) ───────────────────────────────

  function _loadSource() {
    _source = localStorage.getItem('spotd_source') || 'spotify';
    _updateSourceUI();
    _loadLiveSettings();
  }

  function _setSource(s) {
    _source = s;
    localStorage.setItem('spotd_source', s);
    _updateSourceUI();
    // Tell the display screen to switch
    _pushState({ type: 'source-change', source: s });
  }

  function _loadLiveSettings() {
    const sizeEl  = document.getElementById('live-tanda-size');
    const styleEl = document.getElementById('live-tanda-style');
    if (sizeEl)  sizeEl.value  = localStorage.getItem('spotd_live_tanda_size')  || '4';
    if (styleEl) styleEl.value = localStorage.getItem('spotd_live_tanda_style') || 'TTMTTV';
  }

  function _bindSourceToggle() {
    document.querySelectorAll('.source-btn').forEach(btn => {
      btn.addEventListener('click', () => _setSource(btn.dataset.source));
    });
    const sizeEl  = document.getElementById('live-tanda-size');
    const styleEl = document.getElementById('live-tanda-style');
    if (sizeEl)  sizeEl.addEventListener('change',  () => localStorage.setItem('spotd_live_tanda_size',  sizeEl.value));
    if (styleEl) styleEl.addEventListener('change', () => localStorage.setItem('spotd_live_tanda_style', styleEl.value));
  }

  function _updateSourceUI() {
    document.querySelectorAll('.source-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.source === _source);
    });
    const statusEl   = document.getElementById('audd-status');
    const hintEl     = document.getElementById('audd-hint');
    const settingsEl = document.getElementById('live-settings');
    if (!statusEl) return;

    if (_source === 'live') {
      const hasKey = !!(localStorage.getItem('spotd_audd_key'));
      statusEl.textContent = hasKey ? '✓ Live mode active' : '⚠️ No AudD key — set it in Settings';
      statusEl.style.color = hasKey ? 'var(--accent)' : '#ff9800';
      if (hintEl) hintEl.style.display = hasKey ? 'none' : 'block';
    } else {
      statusEl.textContent = '';
      if (hintEl) hintEl.style.display = 'none';
    }
    _updateLiveSettingsVisibility();
  }

  // ── Mode ──────────────────────────────────────────────────────────────────

  function _loadMode() {
    _mode = localStorage.getItem('spotd_mode') || 'milonga';
    _updateModeUI();
  }

  function _setMode(m) {
    _mode = m;
    localStorage.setItem('spotd_mode', m);
    _updateModeUI();
    _pushCurrentState();
  }

  function _updateModeUI() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === _mode);
    });
  }

  function _bindModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => _setMode(btn.dataset.mode));
    });
  }

  // ── Format ────────────────────────────────────────────────────────────────

  function _loadFormat() {
    _format = localStorage.getItem('spotd_format') || 'tandas-cortinas';
    const sel = document.getElementById('format-select');
    if (sel) sel.value = _format;
    _updateLiveSettingsVisibility();
  }

  function _bindFormat() {
    const sel = document.getElementById('format-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      _format = sel.value;
      localStorage.setItem('spotd_format', _format);
      _updateLiveSettingsVisibility();
      _pushCurrentState();
    });
  }

  function _updateLiveSettingsVisibility() {
    const settingsEl = document.getElementById('live-settings');
    if (!settingsEl) return;
    // Only show live settings (rotation/tanda size) when in tanda format
    const isTanda = _format !== 'single';
    if (_source === 'live' && isTanda) settingsEl.classList.add('visible');
    else settingsEl.classList.remove('visible');
  }

  // ── Spotify ───────────────────────────────────────────────────────────────

  function _startSpotify() {
    // Check if this is an OAuth callback
    if (window.location.search.includes('code=')) {
      Spotify.handleCallback();
      // Remove code from URL to keep it clean
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }

    if (!Spotify.isLoggedIn()) {
      _setSpotifyStatus('error', 'Not connected');
      return;
    }

    _setSpotifyStatus('ok', 'Spotify connected');
    Spotify.startPolling(_onTrackChange);
  }

  async function _onTrackChange(data) {
    _lastTrack = data;

    const { isPlaying, track, genres, queueData } = data;

    if (!track) {
      _setNowPlaying(null, isPlaying);
      _pushState({ state: 'idle', mode: _mode });
      _updateTrackOverrideRow(null);
      _updateStoryCard(null, null);
      return;
    }

    // Update per-track override UI whenever track changes
    if (track.id !== _currentTrackId) {
      _currentTrackId = track.id;
      _updateStoryCard(track.name, track.artists && track.artists[0] && track.artists[0].name);
    }

    // Cortina detection (sync from cache — full async detection happens in _pushCurrentState)
    const rawCortina = track.id
      ? Cortina.detectSync({ trackId: track.id, genres: genres || [] })
      : false;

    // Apply format rules
    // 'single' → never show cortinas, never show tanda counter
    // 'tandas-nocortinas' → suppress cortina screen but keep tanda counter
    // 'tandas-cortinas' → full behaviour
    const showCortina = rawCortina.isCortina &&
      _format === 'tandas-cortinas' &&
      !(_danceOverride && _danceOverride !== 'none');
    const isCortina = { isCortina: showCortina, label: rawCortina.label };
    const showTanda = _format !== 'single';

    // Tanda tracking
    if (track.id) Tanda.record(track.id, rawCortina.isCortina);
    const tandaPos = (rawCortina.isCortina || !showTanda) ? null : Tanda.getPosition(track.id);

    // DB lookup for dance type + recording year
    const artistName = track.artists && track.artists[0] && track.artists[0].name;
    const dbResult = await TangoDB.lookup(track.name, artistName, track.id);

    // Resolve genre: manual override > DB type > Spotify artist genre
    let genre;
    if (_danceOverride === 'none') {
      genre = null;
    } else if (_danceOverride === 'db') {
      genre = dbResult.type || null;  // DB only, no Spotify fallback
    } else if (_danceOverride) {
      genre = _danceOverride;
    } else if (dbResult.type) {
      genre = dbResult.type;
    } else {
      genre = genres && genres[0];
    }

    // Year: DB recording year > Spotify release year
    const year = dbResult.year || (track.album && track.album.release_date && track.album.release_date.slice(0, 4));

    // Populate type field in override row
    const detectedType = showCortina ? 'Cortina' : (genre || '');
    _currentDetectedType = detectedType;
    _updateTrackOverrideRow(track.id, detectedType);

    // Update "now playing" panel
    _setNowPlaying(track, isPlaying, genres, rawCortina, tandaPos);

    // Queue preview — Spotify returns { queue: [track, ...] }
    const queue = (queueData && queueData.queue) || [];

    let nextArtist = null, nextGenre = null, nextLabel = null;

    if (_format === 'single') {
      // Single tracks: show immediate next track
      const nextTrack = queue[0];
      nextArtist = nextTrack && nextTrack.artists && nextTrack.artists[0] && nextTrack.artists[0].name;
      if (nextTrack && nextArtist) {
        const dbNext = TangoDB.lookupSync(nextTrack.name, nextArtist, nextTrack.id);
        nextGenre = dbNext.type;
      }
      nextLabel = 'Next';
    } else {
      // Tandas: scan past cortinas to find first track of next tanda
      // If currently in a cortina, next tanda starts at queue[0]
      // If currently in a tanda, scan forward until after the next cortina
      let scanFrom = rawCortina.isCortina ? 0 : null;
      if (scanFrom === null) {
        // Find the next cortina, then take the track after it
        for (let i = 0; i < queue.length; i++) {
          const q = queue[i];
          const qGenres = [];  // we don't have artist genres for queue items without API call
          const qCortina = Cortina.detectSync({ trackId: q.id, genres: qGenres });
          if (qCortina.isCortina) { scanFrom = i + 1; break; }
        }
      }
      if (scanFrom !== null && scanFrom < queue.length) {
        const tandaFirstTrack = queue[scanFrom];
        if (tandaFirstTrack) {
          nextArtist = tandaFirstTrack.artists && tandaFirstTrack.artists[0] && tandaFirstTrack.artists[0].name;
          const dbNext = TangoDB.lookupSync(tandaFirstTrack.name, nextArtist, tandaFirstTrack.id);
          nextGenre = dbNext.type;
          nextLabel = 'Next tanda';
        }
      }
    }

    _pushState({
      mode: _mode,
      format: _format,
      state: isPlaying ? 'playing' : 'paused',
      isCortina: isCortina.isCortina,
      cortinaLabel: isCortina.label,
      artist:    artistName,
      title:     track.name,
      genre,
      year,
      albumArt:  track.album && track.album.images && track.album.images[0] && track.album.images[0].url,
      tandaPosition: tandaPos && tandaPos.position,
      tandaTotal:    tandaPos && tandaPos.total,
      nextArtist,
      nextGenre,
      nextLabel,
      orchestraBio: _getOrchestraBio(artistName),
    });
  }

  async function _pushCurrentState() {
    if (_lastTrack) _onTrackChange(_lastTrack);
  }

  // ── Pusher ────────────────────────────────────────────────────────────────

  function _startPusher() {
    if (!PusherRelay.hasCredentials()) {
      _setPusherStatus('warn', 'Pusher not configured');
      return;
    }

    const { key, cluster } = PusherRelay.getCredentials();
    const roomCode = PusherRelay.getRoomCode();

    _setPusherStatus('', 'Connecting…');

    // Load Pusher SDK for control-side status monitoring only
    _loadPusherSdk(key, cluster, () => {
      // Subscribe purely for connection status feedback
      PusherRelay.subscribe({
        roomCode,
        key,
        cluster,
        onMessage: () => {}, // control panel doesn't need to receive its own messages
        onStatusChange: (state, msg) => {
          _pusherConnected = (state === 'connected');
          _setPusherStatus(state === 'connected' ? 'ok' : 'warn', msg || state);
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

  function _pushState(payload) {
    if (!PusherRelay.hasCredentials()) return;
    PusherRelay.send(payload).catch(err => {
      console.warn('[control] Pusher send failed:', err.message);
    });
  }

  // ── Profile management ────────────────────────────────────────────────────

  function _renderProfileList() {
    const select = document.getElementById('profile-select');
    if (!select) return;

    const profiles = Profiles.list();
    const active = Profiles.getActive();

    select.innerHTML = profiles
      .map(p => `<option value="${_esc(p.id)}" ${p.id === active.id ? 'selected' : ''}>${_esc(p.name)}</option>`)
      .join('');
  }

  function _bindProfileActions() {
    const select = document.getElementById('profile-select');
    if (!select) return;

    select.addEventListener('change', () => {
      Profiles.setActive(select.value);
      _pushCurrentState(); // send updated appearance to display
    });

    const btnNew = document.getElementById('profile-btn-new');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        const name = prompt('Profile name:');
        if (!name) return;
        const p = Profiles.create(name);
        Profiles.setActive(p.id);
        _renderProfileList();
      });
    }

    const btnDup = document.getElementById('profile-btn-dup');
    if (btnDup) {
      btnDup.addEventListener('click', () => {
        const active = Profiles.getActive();
        const p = Profiles.duplicate(active.id);
        if (p) {
          Profiles.setActive(p.id);
          _renderProfileList();
        }
      });
    }

    const btnDel = document.getElementById('profile-btn-del');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        const active = Profiles.getActive();
        if (active.id === 'default') { alert('Cannot delete the default profile.'); return; }
        if (!confirm('Delete profile "' + active.name + '"?')) return;
        Profiles.remove(active.id);
        _renderProfileList();
      });
    }
  }

  // ── Room / display URL ────────────────────────────────────────────────────

  function _renderRoomInfo() {
    const roomCode = PusherRelay.getRoomCode();
    const displayUrl = PusherRelay.getDisplayUrl();

    const codeEl = document.getElementById('room-code');
    const urlEl  = document.getElementById('display-url');
    const linkEl = document.getElementById('display-link');
    const copyBtn = document.getElementById('copy-url-btn');

    if (codeEl) codeEl.textContent = roomCode;
    if (urlEl)  urlEl.textContent  = displayUrl;
    if (linkEl) { linkEl.href = displayUrl; linkEl.textContent = 'Open ↗'; }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(displayUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      });
    }
  }

  // ── Now Playing panel ─────────────────────────────────────────────────────

  function _setNowPlaying(track, isPlaying, genres, isCortina, tandaPos) {
    const artEl    = document.getElementById('np-artwork');
    const artistEl = document.getElementById('np-artist');
    const titleEl  = document.getElementById('np-title');
    const metaEl   = document.getElementById('np-meta');

    if (!track) {
      if (artistEl) artistEl.textContent = isPlaying ? 'Playing…' : 'Nothing playing';
      if (titleEl)  titleEl.textContent = '';
      if (metaEl)   metaEl.textContent  = '';
      if (artEl)    artEl.classList.add('hidden');
      return;
    }

    const artist = track.artists && track.artists[0] && track.artists[0].name || '';
    const title  = track.name || '';
    const artUrl = track.album && track.album.images && track.album.images[1] && track.album.images[1].url;
    const year   = track.album && track.album.release_date && track.album.release_date.slice(0, 4) || '';
    const genre  = genres && genres[0] || '';

    if (artistEl) artistEl.textContent = artist;
    if (titleEl)  titleEl.textContent  = title;

    const metaParts = [genre, year].filter(Boolean);
    if (tandaPos) metaParts.push('Track ' + tandaPos.position + ' of ' + tandaPos.total);
    if (metaEl) metaEl.textContent = metaParts.join(' · ');

    if (artEl) {
      if (artUrl) { artEl.src = artUrl; artEl.classList.remove('hidden'); }
      else artEl.classList.add('hidden');
    }

  }

  // ── Status indicators ─────────────────────────────────────────────────────

  function _renderStatusRow() {
    _setSpotifyStatus(Spotify.isLoggedIn() ? 'ok' : 'error',
      Spotify.isLoggedIn() ? 'Spotify' : 'Spotify disconnected');
    _setPusherStatus(PusherRelay.hasCredentials() ? '' : 'warn',
      PusherRelay.hasCredentials() ? 'Pusher…' : 'Pusher not set up');
  }

  function _setSpotifyStatus(state, label) {
    _setStatusPill('status-spotify', state, label);
    _spotifyConnected = (state === 'ok');
  }

  function _setPusherStatus(state, label) {
    _setStatusPill('status-pusher', state, label);
  }

  function _setStatusPill(id, state, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status-pill ' + (state || '');
    el.innerHTML = `<span class="status-dot"></span>${_esc(label)}`;
  }

  // ── Settings button ───────────────────────────────────────────────────────

  // ── Dance type override ───────────────────────────────────────────────────

  function _loadDanceOverride() {
    _danceOverride = localStorage.getItem('spotd_dance_override') || '';
    const sel = document.getElementById('dance-override-select');
    if (sel) sel.value = _danceOverride;
    _updateDanceOverrideBadge();
  }

  function _bindDanceOverride() {
    const sel = document.getElementById('dance-override-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      _danceOverride = sel.value;
      localStorage.setItem('spotd_dance_override', _danceOverride);
      _updateDanceOverrideBadge();
      _pushCurrentState();
    });
  }

  function _updateDanceOverrideBadge() {
    const badge = document.getElementById('dance-override-badge');
    if (!badge) return;
    if (_danceOverride === 'db') {
      badge.textContent = 'DB';
      badge.className = 'dance-override-badge active';
    } else if (_danceOverride) {
      badge.textContent = _danceOverride;
      badge.className = 'dance-override-badge active';
    } else {
      badge.textContent = 'Auto';
      badge.className = 'dance-override-badge';
    }
  }

  // ── Per-track DB type override ────────────────────────────────────────────

  function _bindTrackOverride() {
    const input   = document.getElementById('np-type-override');
    const clearBtn = document.getElementById('np-override-clear');
    if (!input) return;

    input.addEventListener('change', () => {
      const val = input.value.trim();
      if (_currentTrackId) {
        TangoDB.setOverride(_currentTrackId, val || null);
        _pushCurrentState();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (_currentTrackId) {
          TangoDB.setOverride(_currentTrackId, null);
          input.value = '';
          input.placeholder = _currentDetectedType || 'Type…';
          _pushCurrentState();
        }
      });
    }
  }

  function _updateTrackOverrideRow(trackId, detectedType) {
    const row   = document.getElementById('np-override-row');
    const input = document.getElementById('np-type-override');
    if (!row || !input) return;

    if (!trackId) {
      row.classList.add('hidden');
      input.value = '';
      input.placeholder = 'Type…';
      return;
    }

    const existing = TangoDB.getOverride(trackId);
    input.value       = existing || '';
    input.placeholder = detectedType || 'Type…';
    row.classList.remove('hidden');
  }

  // ── Settings button ───────────────────────────────────────────────────────

  function _bindSettingsBtn() {
    const btn = document.getElementById('btn-settings');
    if (!btn) return;
    btn.addEventListener('click', () => Wizard.show(1));
  }

  function _bindDjMessage() {
    const sendBtn  = document.getElementById('dj-msg-send');
    const clearBtn = document.getElementById('dj-msg-clear');
    const input    = document.getElementById('dj-msg-input');
    if (!sendBtn || !clearBtn || !input) return;

    sendBtn.addEventListener('click', () => {
      const msg = input.value.trim();
      if (!msg) return;
      PusherRelay.send({ type: 'dj-message', message: msg }).catch(err => {
        console.warn('[control] DJ message send failed:', err.message);
      });
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      PusherRelay.send({ type: 'dj-message', message: '' }).catch(err => {
        console.warn('[control] DJ message clear failed:', err.message);
      });
    });
  }

  // ── Song Story card ───────────────────────────────────────────────────────
  let _storyCurrentTitle = '';

  function _updateStoryCard(title, artist) {
    _storyCurrentTitle = title || '';
    const trackLabel = document.getElementById('story-card-track');
    const sourceLabel = document.getElementById('story-source-label');
    const textarea   = document.getElementById('story-edit-input');
    if (!textarea) return;

    if (!title) {
      if (trackLabel) trackLabel.textContent = '';
      if (sourceLabel) sourceLabel.textContent = '';
      textarea.value = '';
      textarea.placeholder = 'No song playing.';
      return;
    }

    if (trackLabel) trackLabel.textContent = '— ' + title;
    textarea.value = '';
    textarea.placeholder = 'Loading…';
    if (sourceLabel) sourceLabel.textContent = '';

    // Check for existing override first (instant)
    if (typeof LastFm !== 'undefined') {
      const override = LastFm.getStoryOverride(title);
      if (override) {
        textarea.value = override;
        if (sourceLabel) sourceLabel.textContent = 'Custom (saved by you)';
        return;
      }
    }

    // Async fetch from local/Last.fm/Wikipedia
    const fetchTitle = title;
    if (typeof LastFm !== 'undefined') {
      LastFm.fetchTrackInfo(title, artist).then(result => {
        if (fetchTitle !== _storyCurrentTitle) return; // stale
        if (result && result.story) {
          textarea.value = result.story;
          const srcMap = { local: 'Curated local library', lastfm: 'Last.fm', wikipedia: 'Wikipedia', custom: 'Custom (saved by you)' };
          if (sourceLabel) sourceLabel.textContent = srcMap[result.source] || result.source;
        } else {
          textarea.value = '';
          textarea.placeholder = 'No story found. Type one to save it.';
          if (sourceLabel) sourceLabel.textContent = '';
          // Auto-generate if toggle is on and key is set
          const autogenOn = localStorage.getItem('spotd_autogen_stories') === '1';
          const hasKey = !!localStorage.getItem('spotd_openrouter_key');
          if (autogenOn && hasKey) {
            const aiBtn = document.getElementById('story-ai-btn');
            if (aiBtn) _generateAiStory(textarea, aiBtn);
          }
        }
      });
    }
  }

  function _bindStoryCard() {
    const saveBtn  = document.getElementById('story-save-btn');
    const clearBtn = document.getElementById('story-clear-btn');
    const aiBtn    = document.getElementById('story-ai-btn');
    const textarea = document.getElementById('story-edit-input');
    if (!saveBtn || !textarea) return;

    saveBtn.addEventListener('click', () => {
      const story = textarea.value.trim();
      if (!_storyCurrentTitle) return;
      if (typeof LastFm !== 'undefined') {
        LastFm.setStoryOverride(_storyCurrentTitle, story || null);
      }
      const sourceLabel = document.getElementById('story-source-label');
      if (sourceLabel) sourceLabel.textContent = story ? 'Custom (saved by you)' : '';
      if (!story) textarea.placeholder = 'No story saved.';
      // Visual confirmation flash
      const prev = saveBtn.textContent;
      saveBtn.textContent = 'Saved ✓';
      saveBtn.disabled = true;
      setTimeout(() => { saveBtn.textContent = prev; saveBtn.disabled = false; }, 1500);
    });

    // Autogenerate toggle — persist state
    const autogenToggle = document.getElementById('story-autogen-toggle');
    if (autogenToggle) {
      autogenToggle.checked = localStorage.getItem('spotd_autogen_stories') === '1';
      autogenToggle.addEventListener('change', () => {
        localStorage.setItem('spotd_autogen_stories', autogenToggle.checked ? '1' : '0');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!_storyCurrentTitle) return;
        if (typeof LastFm !== 'undefined') {
          LastFm.setStoryOverride(_storyCurrentTitle, null);
        }
        _updateStoryCard(_storyCurrentTitle, '');
      });
    }

    if (aiBtn) {
      aiBtn.addEventListener('click', () => _generateAiStory(textarea, aiBtn));
    }
  }

  async function _generateAiStory(textarea, btn) {
    if (!_storyCurrentTitle) return;

    // Get or prompt for OpenRouter key
    let apiKey = localStorage.getItem('spotd_openrouter_key') || '';
    if (!apiKey) {
      apiKey = (prompt('Enter your OpenRouter API key to generate stories.\nGet one free at openrouter.ai/keys — saved in your browser only.') || '').trim();
      if (!apiKey) return;
      localStorage.setItem('spotd_openrouter_key', apiKey);
    }

    const title  = _storyCurrentTitle;
    const artist = document.getElementById('np-artist') && document.getElementById('np-artist').textContent || '';

    btn.disabled = true;
    btn.textContent = '✨ …';
    const sourceLabel = document.getElementById('story-source-label');
    if (sourceLabel) sourceLabel.textContent = 'Generating…';

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://guymayer.github.io/SpotyTangoDisplay/',
        },
        body: JSON.stringify({
          models: [
            'nousresearch/hermes-3-llama-3.1-405b:free',
            'openai/gpt-oss-20b:free',
            'qwen/qwen3-coder:free',
          ],
          route: 'fallback',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: 'Write a short, engaging story/backstory (2–4 sentences) about the tango song "' + title + '"' +
              (artist ? ' by ' + artist : '') +
              '. Focus on the history, emotion, or cultural context. Plain text only, no markdown.',
          }],
        }),
      });

      if (resp.status === 401) {
        localStorage.removeItem('spotd_openrouter_key');
        if (sourceLabel) sourceLabel.textContent = 'Invalid API key — cleared.';
        return;
      }

      const data = await resp.json();

      if (!resp.ok) {
        const msg = (data.error && data.error.message) || ('HTTP ' + resp.status);
        if (sourceLabel) sourceLabel.textContent = 'API error: ' + msg;
        return;
      }

      const story = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (story && story.trim()) {
        textarea.value = story.trim();
        if (typeof LastFm !== 'undefined') {
          LastFm.setStoryOverride(title, story.trim());
        }
        if (sourceLabel) sourceLabel.textContent = 'AI-generated (saved)';
      } else {
        if (sourceLabel) sourceLabel.textContent = 'AI returned no content.';
      }
    } catch (err) {
      if (sourceLabel) sourceLabel.textContent = 'Error: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Generate';
    }
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Control.init);
