# Android free SoundCloud integration

The native source is on the `android-soundcloud` branch. SoundCloud is a built-in public source using the existing NewPipe extractor. Search through Search → Addons. No OAuth credentials, companion app or login server are needed. Private/paid content and account sync are not supported.

`build.sh` applies the patch to pinned upstream revision b690dc146009d4815825fa4a20815ef2e4ee8898 and builds an optimized ARM64 APK. Set ANDROID_HOME and use a full JDK 21. Android SDK platforms 36 and 37, build-tools 35, NDK 27.0.12077973 and CMake 3.22.1 are required. prepare-sdk.py handles the SDK 37.0 metadata alias.

Package: com.music.bitchord.soundcloud. Development signing is used when no release signing configuration exists. Physical-device testing remains pending. The original Android YouTube Music and Spotify features are retained.

Spotify fixes in version code 38: await CookieManager completion, install token hooks at document start on supporting Android WebViews, poll safely for Spotify SPA login completion, validate exact HTTPS login hosts, reset bearer cache for account changes, and clear Spotify storage without deleting Google/YouTube storage. These fixes compile; live authenticated Android testing remains pending. Keep Android System WebView current. SoundCloud now fetches additional result pages (up to 50 results per query) and selects MP3/AAC-family audio.

Version code 39 fixes the SoundCloud/lossless preference mismatch and missing source-backed HLS transport record. It resolves current public MP3/AAC media endpoints with track authorization, rotates/refetches on playback recovery, and leaves a visible error after exhausted SoundCloud retries. Search requests up to 200 songs; album/playlist search, artist search, artist track/collection pages and source-specific artist links use the public SoundCloud API. Spotify pages match tracks as each page arrives, cache successful matches, and reuse account-keyed metadata for two minutes. No hardware loading benchmark or authenticated private library test has been performed.
