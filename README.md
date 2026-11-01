# BitChord Android + Tizen TV

Modified builds of [BitChord](https://github.com/kushagrasinghx/BitChord), with a full native Android APK, a lightweight Tizen 5 TV client, and a SoundCloud addon/login service.

## Downloads

**Installation fix:** the latest Android APK removes an accidental `testOnly` flag that caused normal installers to reject previous downloads. Delete the old downloaded file and download the replacement below.

- **[Android APK — ARM64](android/releases/BitChord-Android-arm64-debug.apk?raw=true)**: full native BitChord, including the original YouTube Music and Spotify integrations. Development-signed, Android 8.0 or newer. The file uses Git LFS; use this download link for the actual APK.
- **[Samsung Tizen 5 widget](tizen/releases/BitChord-TV-Lite-unsigned.wgt?raw=true)**: approximately 251 KiB. Requires your Samsung TV certificate signing before installation.
- **[Live TV interface preview](https://olahdavidxdd.github.io/BitChord-TV-Lite/)**.
- **[Build checksums and provenance](builds/latest.json)**.

## Integration status

| Feature | Android APK | Tizen widget |
| --- | --- | --- |
| YouTube Music sign-in and playback | Original native integration retained; not account-tested here | Not implemented |
| Spotify playlists and liked songs | Original native integration retained; tracks matched to YouTube Music | Not implemented |
| SoundCloud sign-in | Added UI/service flow; inactive until publisher configures the login service | QR flow implemented; needs a configured login service |
| Compatible HTTP addon search/playback | Included in original app | Implemented through Samsung AVPlay |
| Original Android TV interface | Native Android project retained in source branch | Source-guided visual adaptation; not verified pixel-identical |

Spotify's original integration reads playlists/liked songs and matches them to YouTube Music for playback. It is not direct Spotify audio streaming. The Tizen build is currently a smaller, reduced-feature client; its visual similarity does not establish feature parity.

**SoundCloud login is not live in the distributed builds.** No developer credentials or shared login service are embedded. The publisher must configure the HTTPS service described in [OAuth setup](addons/soundcloud/OAUTH.md). Users' passwords are never collected by BitChord.

## Source and setup

- [Full native Android source](https://github.com/OlahDavidXdd/BitChord-TV-Lite/tree/android-soundcloud).
- [Android integration/build notes](android-integration/README.md).
- [Tizen build, signing and installation](tizen/README.md).
- [TV design reference and parity limits](tizen/DESIGN-PARITY.md).
- [SoundCloud server addon](addons/soundcloud/README.md).

The Android APK compiled successfully and passed APK signature and alignment verification. Physical Android/Tizen device tests and live account playback have not been performed. The APK is a development build; the widget is unsigned.

## Checks

```sh
node --test addons/soundcloud/*.test.mjs
npm ci --prefix tizen
npm test --prefix tizen
python3 tizen/scripts/package.py
```

The Tizen packager enforces a 1 MiB compressed budget. Its test dependencies are not bundled in the widget.

Derived from BitChord; see [LICENSE](LICENSE). The main branch contains TV/addon sources and downloads; `android-soundcloud` contains the full modified native app source.
