# SpotyTangoDisplay — Project Plan

## What It Is

A web app for tango DJs and teachers that displays current Spotify track info on a dancer screen.
Standalone project associated with **TangoPassion** (tangopassion.co.uk).
Hosted on GitHub Pages. No install. Works across two PCs via a Pusher relay.

---

## Brand Association

- **Brand:** TangoPassion — tangopassion.co.uk
- **Default DJ name (wizard pre-fill):** TangoPassion
- **Default logo:** TangoPassion logo (to be added to `assets/`)
- **Custom domain (future):** `display.tangopassion.co.uk` → GitHub Pages CNAME
  - When ready: add `CNAME` file to repo root, point DNS to `guymayer.github.io`
  - Update Spotify redirect URI to `https://display.tangopassion.co.uk/` at that point

---

## Repository

- **Repo:** `GuyMayer/SpotyTangoDisplay` (GitHub account: GuyMayer)
- **Hosting:** GitHub Pages (public repo required)
- **Live URL:** `https://guymayer.github.io/SpotyTangoDisplay/`
- **Spotify redirect URI:** `https://guymayer.github.io/SpotyTangoDisplay/`

---

## Architecture

```
DJ PC (Control App)                     Display PC
┌─────────────────────────┐             ┌─────────────────────────┐
│  index.html             │             │  display.html           │
│  - Spotify PKCE auth    │  Pusher     │  - No login             │
│  - Settings / profiles  │ ─────────▶  │  - Fullscreen renderer  │
│  - Cortina rules        │  real-time  │  - Freeze on disconnect │
│  - Branding config      │             │  - Chrome only          │
│  - Mode toggle          │             │                         │
└─────────────────────────┘             └─────────────────────────┘
         │
         │ polls every 1s (5s when paused)
         ▼
   Spotify Web API
   /currently-playing
   /queue
   /artists/{id} (genre, cached)
```

---

## File Structure

```
SpotyTangoDisplay/
├── index.html          — Control app (DJ PC)
├── display.html        — Dancer display (Display PC)
├── js/
│   ├── spotify.js      — PKCE auth + API polling
│   ├── pusher.js       — Relay send/receive wrapper
│   ├── cortina.js      — Cortina detection logic
│   ├── tanda.js        — Tanda position tracking
│   ├── profiles.js     — Appearance profile CRUD
│   ├── wizard.js       — First-time setup wizard
│   ├── control.js      — Control panel UI logic
│   └── display.js      — Display renderer logic
├── css/
│   ├── control.css     — Control panel styles
│   └── display.css     — Dancer display styles
└── assets/
    └── logo.svg        — SpotyTangoDisplay default logo
```

---

## Display Modes

### Milonga Mode
Full tango event experience:
- Artist, title, genre, year, album artwork
- Tanda position counter (Track 2 of 4) — history-based
- Cortina overlay ("CORTINA" or custom label)
- "COMING UP" next-tanda preview during cortinas (from Spotify queue)
- Idle message when nothing is playing

### Lesson Mode
Simple track display — cortina/tanda logic off:
- Artist, title, genre, year, album artwork
- DJ logo + branding
- Idle screen with branding when paused

Switch live from control panel. Same appearance profile for both modes.

---

## Cortina Detection

Two methods combined:

1. **Genre denylist** — fetch artist genres from Spotify API (`/artists/{id}`), cached per artist.
   User configures dance genres (e.g. `tango`, `milonga`, `vals`, `foxtrot`).
   If any artist genre matches → dance track. No match → cortina.

2. **Cortina playlist override** — user pastes a Spotify playlist URL.
   Any track in that playlist is always treated as a cortina, regardless of genre.

Display label overrides: each denylist entry can have a custom display label
(e.g. denylist entry `tango vals` → display label `Vals`).

---

## Pusher Relay

- **Model:** DJ brings their own free Pusher account. Wizard guides setup.
- **Channel:** `tango-{roomCode}` (room code auto-generated, saved to localStorage)
- **Event:** `track-update` — full state JSON pushed on every change
- **Display URL:** `https://guymayer.github.io/SpotyTangoDisplay/display.html?room=XXXX`
- **On disconnect:** Display freezes last track info on screen

### State payload (pushed on every track change)

```json
{
  "mode": "milonga",
  "state": "playing",
  "artist": "Carlos Di Sarli",
  "title": "Bahia Blanca",
  "genre": "Tango",
  "year": "1947",
  "albumArt": "https://...",
  "isCortina": false,
  "tandaPosition": 2,
  "tandaTotal": 4,
  "nextArtist": "Osvaldo Pugliese",
  "nextGenre": "Tango",
  "idleMessage": "Welcome to Milonga de Londres",
  "appearance": { ... }
}
```

---

## Appearance Profiles

- Named profiles, multiple per DJ, stored in localStorage
- Switchable live — display updates immediately
- Per-field: color, font family, font size, bold, italic
- Field visibility: show/hide Genre, Artist, Year, Title, Artwork independently (Dance and Cortina columns)
- Text order: drag to reorder fields for dance display, cortina display, and "Coming Up" preview
- Background: image (upload, stored as base64 in localStorage) or video (upload, stored as object URL)
- Cortina background: optionally swap to different image/video during cortinas
- Transition: fade style + duration between tracks

### Branding (per profile)
- DJ / event name — text, own font/color/position
- Logo image — upload, position (corner: TL/TR/BL/BR or centre), size, opacity
- Idle screen: logo + event name displayed prominently when nothing is playing
- No "SpotyTangoDisplay" branding on the display screen (white-label ready)

---

## First-Time Setup Wizard

Runs on first visit. Resumes if closed mid-way. Re-runnable from Settings.

| Step | Content |
|---|---|
| 1. Welcome | App intro, "set up in 5 steps" |
| 2. Spotify Connect | PKCE OAuth — connects DJ's Spotify account |
| 3. Pusher Setup | Guide to create free Pusher account + paste credentials. Test button. |
| 4. Branding | DJ name, logo upload, accent color. Live preview. |
| 5. Cortina Rules | Dance genre list (pre-filled), optional cortina playlist URL. Skippable. |
| 6. Done | Display URL + room code + QR code. "Open Display" and "Go to Control Panel" buttons. |

---

## Spotify Integration

- **Auth:** PKCE OAuth2 — no client secret, runs entirely in browser
- **Scopes:** `user-read-currently-playing user-read-playback-state`
- **Polling:** every 1s when playing, every 5s when paused/idle
- **Genre cache:** artist genres cached in sessionStorage — one API call per unique artist
- **Token refresh:** PKCE refresh token flow, transparent to user

---

## Connection & Offline Behaviour

| Scenario | Behaviour |
|---|---|
| Display PC loses Pusher | Freeze last track info. No overlay. |
| DJ PC loses Spotify | Show last known state. Retry silently. |
| Nothing playing | Show idle message + branding |
| Player paused | Hold current track display. Poll drops to 5s. |

---

## Browser Support

- **Chrome only** (both DJ PC and Display PC)

---

## Build Order

1. Repo + GitHub Pages setup + Spotify app registration
2. `spotify.js` — PKCE auth + polling + genre cache
3. `cortina.js` + `tanda.js` — detection logic (unit-testable, no UI)
4. `pusher.js` — send/receive wrapper
5. `display.html` + `display.css` + `display.js` — dancer screen renderer
6. `profiles.js` — localStorage CRUD
7. `control.html` + `control.css` + `control.js` — control panel
8. `wizard.js` — first-time setup flow
9. Appearance editor (colors, fonts, background, branding)
10. Lesson mode toggle
11. QA + end-to-end test with two browsers

---

## Open Decisions

- [ ] White-label / business model (build is white-label-ready; model TBD)
- [ ] Whether to open-source or keep private long-term
