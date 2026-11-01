# BitChord: Android and TV Lite

Independent Android and Samsung Tizen 5 builds. Neither device requires a phone bridge.

- [Android APK](android/releases/BitChord-Android-arm64-release.apk?raw=true): original BitChord with built-in free public SoundCloud search and playback. Open Search → Addons and select SoundCloud. No SoundCloud developer account or paid API registration is needed. YouTube Music and Spotify retain the original Android integrations; live account testing is pending.
- [Tizen widget](tizen/releases/BitChord-TV-Lite-unsigned.wgt?raw=true): public SoundCloud with expanded search and codec retries, YouTube Music search with a visible official player, and public Spotify playlist/album/track imports matched to YouTube Music. Also includes remote navigation, SoundCloud favorites/history, and optional glass effects. TV account login is deferred; private libraries are not connected.
- [Browser preview](https://olahdavidxdd.github.io/BitChord-TV-Lite/): interface preview; Samsung AVPlay and app launching require a TV.
- [Native Android source](https://github.com/OlahDavidXdd/BitChord-TV-Lite/tree/android-soundcloud).

## SoundCloud

Android uses the existing NewPipe extractor directly. TV uses public SoundCloud endpoints and offers an official embedded player for public track links. Restricted, paid and preview-only tracks are excluded. Public endpoints can change. Browser CORS restrictions can prevent direct TV searches on some runtimes: an optional free Node helper is provided (`cd addons/soundcloud && npm run start:public`). This is a server option, not a phone dependency. No helper is required by Android. TV network compatibility still needs physical-device validation.

This free path does not sign into SoundCloud or sync private libraries. The legacy OAuth server remains optional source code and is not configured in these builds.

## Size and loading

The widget bundles a small web interface and uses the TV runtime. Android includes native libraries, media engines and the original full app, so its APK is much larger. Package bytes are recorded in [build metadata](builds/latest.json); installed size differs.

Android uses release optimization and resource shrinking. Spotify now waits for saved login cookies before loading, hooks token responses at document start when the system WebView supports it, detects single-page login transitions, and clears only Spotify web storage. TV defers artwork loading and embedded players, swaps fonts during loading, and caches/deduplicates searches. Per-card artwork downloads/canvas sampling, hidden-library redraws and the large background blur have been removed. No physical-device startup benchmark has been measured.

## Installation and validation

Android is development-signed, ARM64, Android 8+; signature, alignment and install flags are checked. Keep the signing key for future updates. The Tizen widget is **unsigned** and must be signed with a Samsung TV certificate including your TV DUID before installation. See [TV instructions](tizen/README.md).

Automated interface/extractor tests and live public SoundCloud stream probes pass. Neither build has been tested on physical devices. The TV interface follows Android TV styling. Account login is deferred by request; full feature parity remains unfinished. Live YouTube endpoint testing was blocked by the build environment network proxy. Samsung network/CORS and embedded-player compatibility remain unverified.

See [music integration setup and limits](addons/music/README.md). SoundCloud requests 50 tracks per page with Load more; unavailable/premium tracks remain excluded. TV filters Opus/Ogg and prefers explicit MP3/AAC over adaptive streams, then retries alternatives or opens the official player on decoder failure. This cannot guarantee every track is available on every TV.
