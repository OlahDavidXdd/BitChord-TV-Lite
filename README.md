# BitChord-TV-Lite

A lightweight Samsung Tizen 5.0+ TV music player and a SoundCloud HTTP addon for [BitChord](https://github.com/kushagrasinghx/BitChord).

- **[TV app and installation instructions](tizen/README.md)** — addon search, playback queue, remote navigation and Samsung AVPlay. The unsigned widget is about 250 KiB, including display fonts and QR sign-in.
- **[Download the unsigned TV widget](tizen/releases/BitChord-TV-Lite-unsigned.wgt?raw=true)** — requires signing with your Samsung TV certificate before installation.
- **[SoundCloud addon setup](addons/soundcloud/README.md)** — run the Node server with your own SoundCloud API credentials, then enter its URL in the TV app or BitChord's addon settings.

This reduced-feature client does not include the full Android app, YouTube, library sync or AI features. No physical Tizen TV playback testing has been performed. The SoundCloud addon is a server addon, not a browser extension.

## Android APK and SoundCloud sign-in

[Modified BitChord login integration](android-integration/README.md) adds a **Sign in with SoundCloud** flow rather than asking users to operate the addon server. It needs a publisher-hosted [OAuth service](addons/soundcloud/OAUTH.md) and registered SoundCloud application credentials. [Download the development-signed ARM64 APK](android/releases/BitChord-SoundCloud-arm64-debug.apk?raw=true). The full native app builds successfully, but device testing and live SoundCloud login are pending. The distributed APK has no login service configured; SoundCloud sign-in is explicitly disabled until the publisher configures one. [Full native source](https://github.com/OlahDavidXdd/BitChord-TV-Lite/tree/android-soundcloud).

## Build and checks

Requires Node 22+ and Python 3, with no npm install needed:

```sh
node --test addons/soundcloud/server.test.mjs
node --check tizen/app/app.js
python3 tizen/scripts/package.py
```

The package builder enforces a 1 MiB compressed size limit and writes an unsigned widget to `tizen/dist/`.

Derived from the BitChord project; see [LICENSE](LICENSE). This repository contains the new addon and Tizen client rather than a copy of the full Android project.
