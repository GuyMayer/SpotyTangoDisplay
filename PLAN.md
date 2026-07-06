````````````````````````````````````````````# SpotyTangoDisplay — Project Plan

> **Version:** 1.2.0 | **Updated:** 2026-07-06 | **126 commits**
> **Live:** <https://guymayer.github.io/SpotyTangoDisplay/>

## What It Is

A web app for tango DJs and teachers that displays live track info on a dancer
screen — at milongas, lessons, or workshops. Two surfaces:

1. **Software** — browser-based control panel + fullscreen display, served by a
   zero-dependency Node.js local relay. GitHub Pages hosts the UI; the relay
   runs on the DJ's laptop.
2. **Venue Kit** — portable hardware kit (router + Android TV stick) for
   deploying the display on any venue TV without touching the venue's network.

Branded under **TangoPassion** (<https://tangopassion.co.uk>). White-label ready.

---

## Brand Association

- **Brand:** TangoPassion — tangopassion.co.uk
- **Default DJ name (wizard pre-fill):** TangoPassion
- **Default logo:** TangoPassion logo (to be added to `assets/`)
- **Custom domain (future):** `display.tangopassion.co.uk` → GitHub Pages CNAME
  - Add `CNAME` file to repo root, point DNS to `guymayer.github.io`
  - Update Spotify redirect URI to `https://display.tangopassion.co.uk/`

---

## Repository

- **Repo:** `GuyMayer/SpotyTangoDisplay`
- **Hosting:** GitHub Pages (public repo)
- **CI/CD:** GitHub Actions — NSIS Windows installer build on push to `main`;
  deploy to GitHub Pages
- **Live URL:** <https://guymayer.github.io/SpotyTangoDisplay/>
- **Spotify redirect URI:** <https://guymayer.github.io/SpotyTangoDisplay/>

---

## Architecture

```text
                        ┌──────────────────────────────────┐
                        │       GL-AR300M16-Ext Router      │
                        │       SSID: TangoDisplay (open)   │
                        │       Client isolation ON          │
                        │       Captive portal → display     │
                        └──┬────────────┬────────────┬──────┘
                           │ Ethernet   │ WiFi       │ WiFi
                           ▼            ▼            ▼
                    ┌──────────┐  ┌──────────┐  ┌──────────────┐
                    │ DJ Laptop │  │ Android   │  │ Participants' │
                    │ relay.js  │  │ TV stick  │  │ phones        │
                    │ :3456     │  │ (HDMI→TV) │  │ (display URL) │
                    │ index.html│  │ fullscreen│  └──────────────┘
                    └─────┬─────┘  │ display   │
                          │        └──────────┘
                          │ SSE (port 3456)
                          ▼
                   ┌──────────────┐
                   │ Spotify API  │
                   │ (poll 1s/5s) │
                   └──────────────┘
```

**DJ laptop** runs `relay.js` (Node.js HTTP + SSE server, port 3456, zero deps).
Control panel at `http://localhost:3456/`. Display at
`http://<laptop-ip>:3456/display.html`.

**No Pusher, no cloud relay, no internet required after Spotify auth.**
Pusher was removed in v1.1.0. The local relay handles all communication.

### Alternative: Two-laptop setup (no venue kit)

```text
DJ Laptop (relay.js :3456) ──WiFi──► Display Laptop (display.html?host=...)
```

Any device on the same WiFi can open the display URL. No router kit needed.

---

## File Structure (actual, as of v1.2.0)

```text
SpotyTangoDisplay/
├── index.html              — DJ control panel
├── display.html            — Dancer fullscreen display
├── download.html           — Public download/install landing page
├── favicon.png
├── relay.js                — Local HTTP + SSE relay server (Node.js, zero deps)
├── relay-tray.ps1          — Windows system tray wrapper (singleton, auto-open)
├── start-windows.bat       — Windows one-click launcher (checks Node.js, winget)
├── start.sh                — macOS/Linux launcher
├── setup.bat               — Windows auto-download + install + launch
├── version.txt             — Current version (1.2.0)
├── SpotyTangoDisplay_Settings.skp  — Example settings backup (SKPE1 encoded)
├── PLAN.md                 — This file
├── CHANGELOG.md
├── js/
│   ├── config.js           — Central config (Spotify client ID)
│   ├── spotify.js          — PKCE OAuth2 auth + API polling + genre cache
│   ├── pusher.js           — Local relay send/receive wrapper (Pusher removed)
│   ├── cortina.js          — Cortina detection (genre denylist + playlist override)
│   ├── tanda.js            — Tanda position tracking (history-based)
│   ├── profiles.js         — Appearance profile CRUD (localStorage)
│   ├── wizard.js           — 10-step first-time setup wizard
│   ├── control.js          — DJ control panel UI logic
│   ├── display.js          — Dancer display renderer (SSE subscriber)
│   ├── audd.js             — AudD music recognition (mic → track ID)
│   ├── lastfm.js           — Song story lookup (Last.fm → Wikipedia)
│   └── tango-db.js         — Offline tango DB (~20k tracks, el-recodo.com)
├── css/
│   ├── control.css         — Control panel styles
│   └── display.css         — Dancer display styles
├── data/
│   ├── orchestras.json     — ~25 orchestra biographies
│   ├── tango-db.json       — Offline tango track type database
│   └── tango-stories.json  — Song stories (local cache)
└── installer/
    └── setup.nsi           — NSIS Windows installer definition
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
- 3-column layout: orchestra bio | track info | song story
- DJ logo + branding
- Idle screen with branding when paused

### Live Mode (AudD)

Display listens via microphone, identifies tracks without Spotify:

- AudD API for music recognition (300 req/month free tier ≈ 2.5h milonga)
- 30s poll interval
- Synthesizes same payload format → display renders identically
- Source toggle in control panel: `[Spotify]` `[Live (mic)]`

Switch modes live from control panel. Same appearance profile across all modes.

---

## Cortina Detection

Two methods, combined:

1. **Genre denylist** — fetch artist genres from Spotify API (`/artists/{id}`),
   cached per artist. User configures dance genres (e.g. `tango`, `milonga`,
   `vals`). Any artist genre match → dance track. No match → cortina.

2. **Cortina playlist override** — user pastes a Spotify playlist URL. Any track
   in that playlist is always treated as a cortina.

Display label overrides: each denylist entry can have a custom label
(e.g. denylist `tango vals` → display label `Vals`).

---

## Local Relay (`relay.js`)

- **Protocol:** HTTP + Server-Sent Events (SSE)
- **Port:** 3456 (auto-increments 3457–3465 if busy)
- **Dependencies:** None (Node.js stdlib only: `http`, `fs`, `path`, `os`)
- **Routes:**
  - `GET /` — serves `index.html` (DJ control panel)
  - `GET /display.html` — dancer display
  - `GET /events` — SSE stream (display subscribes)
  - `POST /push` — control panel pushes state → broadcast to all SSE clients
  - `GET /ping` — health check (returns `pong`)
  - `GET /*` — static file server (JS, CSS, data, images)
- **CORS:** open (`Access-Control-Allow-Origin: *`)
- **Windows tray:** `relay-tray.ps1` — singleton guard, system tray icon,
  auto-opens browser, Debug Info dialog (port status, version, recent logs),
  kill-on-exit

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
- Field visibility: show/hide Genre, Artist, Year, Title, Artwork independently
  (Dance and Cortina columns)
- Text order: drag to reorder fields for dance, cortina, and "Coming Up"
- Background: image (base64 in localStorage) or video (object URL)
- Cortina background: optionally different image/video during cortinas
- Transition: fade style + duration between tracks

### Branding (per profile)

- DJ / event name — text, own font/color/position
- Logo image — upload, position (TL/TR/BL/BR or centre), size, opacity
- Idle screen: logo + event name displayed prominently when nothing is playing
- No "SpotyTangoDisplay" branding on display screen (white-label ready)

---

## Wizard (10 Steps)

Runs on first visit. Resumes if closed mid-way. Re-runnable from Settings.

| Step | Content |
| --- | --- |
| 1. Welcome | App intro, what you'll set up |
| 2. Spotify Connect | PKCE OAuth, load settings from .skp file |
| 3. Relay Setup | Local relay — one-click download or manual setup |
| 4. AudD (Live) | AudD API key + 3s mic test (optional, skippable) |
| 5. Last.fm | Last.fm API key for song stories (optional) |
| 6. AI (OpenRouter) | OpenRouter API key for orchestra bios (optional) |
| 7. Branding | DJ name, logo upload, accent color, live preview |
| 8. Cortina Rules | Dance genre list (pre-filled), optional playlist URL |
| 9. Display Design | Appearance profiles — colors, fonts, backgrounds |
| 10. Done | Display URL, copy/share, save settings .skp file |

Settings auto-saved as `.skp` (SKPE1-encoded) on completion. Importable on
another laptop to skip re-entry.

---

## Spotify Integration

- **Auth:** PKCE OAuth2 — no client secret, runs entirely in browser
- **Scopes:** `user-read-currently-playing user-read-playback-state`
- **Polling:** every 1s when playing, every 5s when paused/idle
- **Genre cache:** artist genres cached in sessionStorage
- **Token refresh:** PKCE refresh token flow, transparent to user

---

## Data Sources (Lesson Mode Enrichment)

| Source | What | Status |
| --- | --- | --- |
| `data/orchestras.json` | ~25 orchestra bios (era, style, singers) | Done |
| `data/tango-db.json` | ~20k tracks from el-recodo.com (type + year) | Done |
| `data/tango-stories.json` | Song story cache (local + AI-generated) | Done |
| OpenRouter AI | Orchestra bio fallback for unknown orchestras | Done |
| Last.fm API | Song story lookup (→ Wikipedia fallback) | Done |
| AudD API | Live microphone recognition | Done |

---

## Connection & Offline Behaviour

| Scenario | Behaviour |
| --- | --- |
| Display loses relay connection | Freeze last track. Auto-reconnect. |
| DJ PC loses Spotify | Show last known state. Retry silently. |
| Nothing playing | Show idle message + branding |
| Player paused | Hold current track display. Poll drops to 5s. |

---

## Browser Support

- **Chrome / Chromium** (DJ laptop + display). Firefox works for display but not
  officially supported.

---

## Venue Hardware Kit

Portable kit for deploying the display on any venue TV without touching the
venue's network or WiFi.

### Bill of Materials

| Item | Model | Price |
| --- | --- | --- |
| Router | GL.iNet GL-AR300M16-Ext (external antennas, OpenWrt) | ~£25–30 |
| Android TV stick | RK3518, Android 14, Google Play | ~£25–30 |
| HDMI cable | Short (0.5m), for TV stick | ~£3 |
| USB power | Micro-USB for router + USB-C for TV stick | reuse |
| App on stick | Fully Kiosk Browser (free) — auto-boot URL, fullscreen | free |

### Router Config (GL.iNet, one-time)

- SSID: `TangoDisplay` (open, no password)
- Client isolation: ON
- Captive portal: redirect to `http://192.168.8.100:3456/display.html`
- Static DHCP lease: DJ laptop MAC → `192.168.8.100`
- DJ laptop connects via **Ethernet** (not WiFi) for separation
- No internet uplink — local only. Phones auto-fall back to mobile data

### DJ Laptop Firewall (Windows, one-time)

```powershell
netsh advfirewall set privateprofile firewallpolicy `
  blockinbound,allowoutbound
netsh advfirewall firewall add rule name="TangoDisplay" `
  dir=in action=allow protocol=TCP localport=3456
```

### Participant Flow

1. Participant scans QR code → auto-joins `TangoDisplay` WiFi (no password)
2. Captive portal pops up → redirects to display URL
3. Display loads in phone browser — one tap, no typing

### QR Code

```text
WIFI:T:nopass;S:TangoDisplay;;
```

Generate: `pip install qrcode[pil] && python3 -c "import qrcode; qrcode.make('WIFI:T:nopass;S:TangoDisplay;;').save('tango-wifi-qr.png')"`

---

## Feature Status (as of 2026-07-06)

### Done (v1.2.0)

- [x] Spotify PKCE OAuth + polling + genre cache
- [x] Local relay (HTTP + SSE, Node.js, zero deps)
- [x] Cortina detection (genre denylist + playlist override)
- [x] Tanda position tracking (history-based)
- [x] Display screen renderer (SSE subscriber, fullscreen)
- [x] Appearance profiles (colors, fonts, backgrounds, branding, transitions)
- [x] 10-step wizard with settings export/import (.skp SKPE1 encoded)
- [x] Windows tray app (singleton, debug info, auto-open browser)
- [x] Windows one-click launcher (checks Node.js, winget auto-install)
- [x] NSIS installer → EXE via GitHub Actions
- [x] Lesson mode (3-column: orchestra bio | track | song story)
- [x] Live mode (AudD microphone recognition)
- [x] Last.fm song stories + Wikipedia fallback
- [x] Offline tango DB (~20k tracks from el-recodo.com)
- [x] AI orchestra bio fallback (OpenRouter, cached)
- [x] Song story persistence (custom + AI-saved)
- [x] Settings backup/restore (full export of all keys)
- [x] Next track / tanda preview on display
- [x] macOS/Linux launcher (`start.sh`)

### Remaining Work

#### Software

- [ ] **tango-db.json enrichment** — Python script to add singer `s` field from
  elrecodo.csv (~8k of 20k entries)
- [ ] **Custom domain** — `display.tangopassion.co.uk` CNAME + DNS + Spotify
  redirect URI update
- [ ] **TangoPassion logo** — add brand logo to `assets/`
- [ ] **Smoke test / QA checklist** — end-to-end test with two browsers
- [ ] **Non-Chrome browser validation** — Firefox display testing

#### Venue Kit

- [ ] **QR code generator script** — automate PNG generation in repo
- [ ] **Captive portal HTML** — lightweight redirect page on router
- [ ] **Kit packing checklist** — laminated card: what's in the case, setup
  steps, troubleshooting
- [ ] **Acquire hardware** — order router + TV stick
- [ ] **Router config doc** — step-by-step GL.iNet config with screenshots
- [ ] **Field test** — deploy at a real milonga

---

## Deployment Runbook

### Pre-Event (at home, 10 min)

1. Charge/power all devices
2. Laptop: run `relay.js` → verify `http://localhost:3456/` loads
3. Laptop: log into Spotify in control panel → verify track display updates
4. Android stick: install Fully Kiosk Browser, set start URL to
   `http://192.168.8.100:3456/display.html`
5. Router: confirm SSID `TangoDisplay` is broadcasting, captive portal works
6. Pack: router, TV stick, HDMI cable, USB cables, laptop charger

### At Venue (5 min)

1. Plug router into power — place near DJ table (Ethernet reach)
2. Plug TV stick into venue TV HDMI + USB power
3. Connect DJ laptop to router **Ethernet** port
4. Start `relay.js` on laptop (or it's already running)
5. TV: switch to correct HDMI input → display should appear
6. Verify: play a track on Spotify → display updates
7. Print/show QR code for participants

### Troubleshooting

| Symptom | Check |
| --- | --- |
| Display black/blank | TV on correct HDMI? Fully Kiosk booted? Relay running? |
| Display stuck on old track | Laptop → router Ethernet connected? |
| Phones can't connect | SSID `TangoDisplay` visible? Client isolation ON? |
| Captive portal not popup | Android: open browser manually. iOS: auto. |
| Spotify not updating | Logged in? Playing on this device? Check `/ping`. |

---

## Build Order (Historical — all steps complete)

1. ✅ Repo + GitHub Pages + Spotify app registration
2. ✅ `spotify.js` — PKCE auth + polling + genre cache
3. ✅ `cortina.js` + `tanda.js` — detection logic
4. ✅ `pusher.js` → local relay wrapper
5. ✅ `display.html` + `display.css` + `display.js` — display renderer
6. ✅ `profiles.js` — localStorage CRUD
7. ✅ `control.html` + `control.css` + `control.js` — control panel
8. ✅ `wizard.js` — 10-step setup flow
9. ✅ Appearance editor
10. ✅ Lesson mode
11. ✅ AudD live recognition
12. ✅ Windows installer + tray app
13. ✅ Last.fm + AI orchestra bios + tango DB

### Next Build Order (prioritised)

1. TangoPassion logo asset
2. Custom domain (`display.tangopassion.co.uk`)
3. Venue kit — acquire hardware, router config, QR script, captive portal
4. Venue kit — field test at a real milonga
5. tango-db.json singer field enrichment
6. Smoke test / QA checklist
7. Non-Chrome browser validation

---

## Open Decisions

- [ ] White-label / business model (build is white-label-ready; model TBD)
- [ ] Whether to open-source or keep private long-term
- [ ] Pricing if commercial (per-event license? subscription? hardware bundle?)
- [ ] Venue kit — sell as pre-configured bundle or DIY guide?
