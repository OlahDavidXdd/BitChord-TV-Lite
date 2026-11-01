# BitChord: Android and TV Lite

Independent Android and Samsung Tizen 5 builds. Neither device requires a phone bridge.

- [Android APK](android/releases/BitChord-Android-arm64-release.apk?raw=true): original BitChord with built-in free public SoundCloud search and playback. Open Search → Addons and select SoundCloud. No SoundCloud developer account or paid API registration is needed. YouTube Music and Spotify retain the original Android integrations; live account testing is pending.
- [Tizen widget](tizen/releases/BitChord-TV-Lite-unsigned.wgt?raw=true): public SoundCloud search/playback, remote navigation, favorites, history, and an optional glass appearance in Settings. YouTube and Spotify buttons launch their installed official TV apps; their accounts and libraries are **not integrated into BitChord**.
- [Browser preview](https://olahdavidxdd.github.io/BitChord-TV-Lite/): interface preview; Samsung AVPlay and app launching require a TV.
- [Native Android source](https://github.com/OlahDavidXdd/BitChord-TV-Lite/tree/android-soundcloud).

## SoundCloud

Android uses the existing NewPipe extractor directly. TV uses public SoundCloud endpoints and offers an official embedded player for public track links. Restricted, paid and preview-only tracks are excluded. Public endpoints can change. Browser CORS restrictions can prevent direct TV searches on some runtimes: an optional free Node helper is provided (`cd addons/soundcloud && npm run start:public`). This is a server option, not a phone dependency. No helper is required by Android. TV network compatibility still needs physical-device validation.

This free path does not sign into SoundCloud or sync private libraries. The legacy OAuth server remains optional source code and is not configured in these builds.

## Size and loading

The widget bundles a small web interface and uses the TV runtime. Android includes native libraries, media engines and the original full app, so its APK is much larger. Package bytes are recorded in [build metadata](builds/latest.json); installed size differs.

Android now uses release optimization and resource shrinking. TV defers artwork loading and the embedded player, swaps fonts during loading, and caches/deduplicates public searches and stream resolution. No physical-device startup benchmark has been measured.

## Installation and validation

Android is development-signed, ARM64, Android 8+; signature, alignment and install flags are checked. Keep the signing key for future updates. The Tizen widget is **unsigned** and must be signed with a Samsung TV certificate including your TV DUID before installation. See [TV instructions](tizen/README.md).

Automated interface/extractor tests and live public SoundCloud stream probes pass. Neither build has been tested on physical devices. The TV interface follows Android TV styling but full feature parity and in-app YouTube/Spotify sign-in remain unfinished.
