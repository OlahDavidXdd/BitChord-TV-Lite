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

## Version 1.5 playback and catalogue fixes

Android SoundCloud previously inherited the default lossless-only request even though public SoundCloud audio is lossy. Explicit SoundCloud selections now request its available public audio without a lossless substitution search. Source-backed HLS is recorded for Media3 manifest recovery, modern public MP3/AAC transcodings are resolved with track authorization, and failures refresh the URL/try another variant. If public playback still fails after retries, Android keeps the track/error visible rather than silently skipping it. Unavailable, paid-only, private and region-restricted uploads remain unavailable.

Android Search → Addons now requests up to 200 SoundCloud songs. Search a name and choose **SoundCloud Albums** or **SoundCloud Artists** to open collections and artist pages. Song artist links open the SoundCloud page. Album tracks retain their collection identity. TV Search offers **SoundCloud Songs**, **Albums & Playlists** and **Artists**; Now Playing has **Open SoundCloud artist**. Artist pages provide tracks and their albums/playlists without stopping current TV playback. Large public playlists hydrate all metadata batches instead of dropping tracks after fifty.

Spotify playlist tracks begin matching as each page arrives, with three concurrent requests and cached successful matches. Recent complete playlist/library metadata is reused for two minutes and keyed by the authenticated bearer, preventing reuse across accounts. Live private Spotify account timing remains unmeasured.

A live SoundCloud check returned 200 search rows, 198 artist tracks, 20 artist albums and 27 artist playlists. Three seconds of an allowed AAC HLS stream decoded successfully using FFmpeg. This validates the sample stream, not every uploader or Samsung's hardware decoder. Actual phone/TV end-to-end testing remains pending.

## TV 1.6: Back, SoundCloud exit, YouTube rejection and account connectors

Back/Escape now closes text entry and focuses the current navigation tab; Samsung hardware Back is handled separately and duplicate key/hardware events are suppressed. The official SoundCloud iframe no longer receives pointer/tab focus, an Exit player button stays outside it, and exiting stops/removes the session. Next/previous/completion preserve the original queue after native SoundCloud fallback. The launcher icon is resized from Android's default bundled launcher artwork.

Direct YouTube Music search now refreshes the live public client configuration after a 403, sends matching client headers and retries once. Persistent rejection produces a persistent explanation with a Music settings button. This cannot override Google's refusal of a particular TV origin; a configured yt-dlp music helper remains the supported alternative. The live YouTube endpoint could not be verified from the build environment.

Read-only Spotify/YouTube account-sync code and TV connection/library pages are included, but **private sync is not activated**: provider app registrations and a deployed HTTPS library service are still missing. Spotify supports playlists, liked songs and saved albums; YouTube's official API supports playlists and likes, not the entire saved YouTube Music album library. See [publisher setup](addons/music/LIBRARY-SYNC.md). No phone pairing is required by the implementation.

## On-device service experiment for Tizen 5

[Build/test notes](tizen/ON-TV-SERVICE.md) describe a new TV-local JavaScript service, inspired by the packaged service mechanism demonstrated by TizenBrew. It is a different approach from the external Node 22/Python/FFmpeg helper. Build the separate `BitChord On-TV Test` app with `python3 tizen/scripts/package.py --on-tv`; no root or firmware modification is used. Its loopback service handles public metadata and SoundCloud media proxying, and provides a local HTTP wrapper for the official YouTube player. **This is an unverified hardware test build, not full private-library support or a claim that every provider works on the exact RU7172 firmware.** The stable web-only WGT remains available separately.
