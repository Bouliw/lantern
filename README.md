# Lantern

A fast, Netflix-style client for [Jellyfin](https://jellyfin.org). One small web app that runs on a desktop browser, on LG webOS TVs and on phones, with Jellyfin staying the engine behind it.

- **Home that feels like a streaming service**: a rotating banner (fade, arrows, dots, logo, summary, Play and More info), then Continue watching, recently added titles, movies, series, sagas, top rated and genres, then "Because you watched…" rows. Title pages end with "More like this".
- **Sagas, not piles of sequels**: movies that belong to a Jellyfin collection are grouped into one saga card, with its own page listing the films in release order.
- **Parts instead of seasons** when a show's seasons have their own names (a TV run, a film, a film series). Extras are shown like a season of their own on the movie page.
- **Its own player**: direct play when the device can, otherwise HLS through Jellyfin (remux first, transcode only when needed). Audio and subtitle choice, resume, next episode, skip intro / credits (media segments), scrubbing previews (trickplay) and chapters.
- **Recommendations computed on the device** from genres, directors, writers, cast, studios, tags, decade and title words (TF-IDF + cosine similarity), blended with the viewer's history and Jellyfin's own "similar" list.
- **Styles**: a sober default plus Title Card, Chrome, Neon, Glass, Keynote, Pixel and Ransom. Colors, typography and shapes can be mixed in a custom style, with accent color, animation level, card shape and size. Appearance can follow the profile across devices or stay on one device.
- **English and French**, following the device language or set by hand, including summaries (see below).
- **Sign in on the TV with a code**: Jellyfin Quick Connect, approved from Settings on any signed-in device.
- **Resilient playback**: if a device fails to decode what it claimed to support, the player retries through hls.js, then as a plain H.264 transcode.
- **Built for each screen**: native trackpad scrolling and lively hover previews on desktop; instant, focus-following navigation with no blur on TV; touch layout on phones.
- **No CDN, no tracking**: fonts are bundled, artwork is preloaded and cached on the device.

## Requirements

- A Jellyfin server (10.9 or later).
- Node.js 20 or later to build.
- Optional: the Intro Skipper plugin (skip buttons) and trickplay images enabled in Jellyfin (scrubbing previews).

## Build and run

```sh
npm install
npm run build        # outputs dist/
npm run serve        # serves dist/ on http://localhost:8097
```

The app talks to Jellyfin on the same host, port 8096, unless another server is chosen on the sign-in screen.

### macOS: start at login

```sh
npm run deploy:mac   # builds, copies the app to ~/Library/Application Support/Lantern, serves it at login
```

In Safari, open `http://localhost:8097` and choose **File › Add to Dock** to get a standalone app.

### LG webOS TV

The TV must be in [developer mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) and registered with the webOS CLI (`ares-setup-device`).

```sh
npm run tv -- --server http://<jellyfin-host>:8096 --device <ares-device-name>
```

This builds a package (`out/*.ipk`), installs it and launches it. The server address and device name can also be stored in a git-ignored `lantern.config.json`:

```json
{ "server": "http://192.168.1.10:8096", "device": "tv" }
```

### Summaries in the interface language

Jellyfin keeps one summary per title, in the library's metadata language. To show summaries in the
other interface language too, run this on the server machine (administrator API key needed):

```sh
node scripts/localize-overviews.mjs --server http://localhost:8096 --token-file <api-key-file> \
  --out ~/Library/Application\ Support/Lantern/overviews.json --langs en,fr
```

It asks Jellyfin's own metadata providers for the missing languages, keeps what it already has (so
it is cheap to run on a schedule) and leaves locked, hand-written summaries alone. The macOS service
serves the file to every device, TVs included.

### Phones

Open `http://<computer>:8097` on the phone and add it to the home screen. For offline viewing, see [docs/phones.md](docs/phones.md).

## How the library is read

| Lantern | Jellyfin |
| --- | --- |
| Movies | movies that are not in a collection |
| Sagas | collections (box sets) that contain movies |
| Series | TV shows |
| Parts | seasons whose names are not "Season N" |
| Extras | special features of a movie |

## Controls

| Action | Keyboard | TV remote |
| --- | --- | --- |
| Play / pause | Space or K | OK, Play/Pause |
| Seek ±10 s | ← / → | ← / → (presses add up, then jump) |
| Volume | ↑ / ↓ | TV volume |
| Full screen | F | — |
| Back | Esc | Back |

## Project layout

```
src/api        Jellyfin client, catalog cache, artwork URLs
src/home       home rows
src/reco       recommendation engine
src/player     player, device profile, subtitles
src/nav        TV remote navigation
src/pages      pages (home, library, details, search, settings, profiles)
src/themes     style definitions
src/styles     CSS (styles are split into palette, typography and shape layers)
scripts        static server, macOS service, webOS packaging, icons
webos          webOS app manifest and icons
```

## License

MIT. Bundled fonts are under the SIL Open Font License, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
