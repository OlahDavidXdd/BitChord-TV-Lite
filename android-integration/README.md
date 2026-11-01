# SoundCloud sign-in inside BitChord for Android

**A development-signed ARM64 APK has now been built successfully. Physical-device testing and live SoundCloud sign-in are still pending.**

[Download the APK](../android/releases/BitChord-Android-arm64-debug.apk?raw=true) · [Full native source](https://github.com/OlahDavidXdd/BitChord-TV-Lite/tree/android-soundcloud)

The intended experience is **install modified BitChord → Sources → Sign in with SoundCloud → sign in on SoundCloud's website → return to BitChord**. The integration adds the SoundCloud source automatically. User access and refresh tokens stay on the OAuth service; the device stores its addon session credential in encrypted preferences. Refreshes happen automatically on the service. A Disconnect button revokes the session and removes the source. No extra Android background service, API key entry, local HTTP URL or companion APK is involved.

## Publisher prerequisites

The app publisher must register a SoundCloud developer application, deploy the HTTPS OAuth service in `addons/soundcloud/oauth.mjs`, and register its `/callback` URL with SoundCloud. End users only sign in. A client secret is required by SoundCloud's current confidential-client OAuth implementation; distributing it in the APK would not remove the service requirement safely.

Configure `BITCHORD_SOUNDCLOUD_AUTH_URL` to the HTTPS service origin before building. A build without this setting explicitly disables sign-in instead of pretending the service is available.

## Build

`build.sh` checks out upstream BitChord revision `b690dc146009d4815825fa4a20815ef2e4ee8898`, applies `soundcloud-login.patch`, and builds the modified Android phone app. The package ID is `com.music.bitchord.soundcloud`, separate from the official app, so it does not replace it or inherit its stored library.

Set `ANDROID_HOME` and `BITCHORD_SOUNDCLOUD_AUTH_URL`, then run:

```sh
./android-integration/build.sh
```

The upstream project requires Android SDK platform **37**, its Android/NDK dependencies, and its pinned Gradle dependencies. The current SDK repository names this platform `platforms;android-37.0`. `prepare-sdk.py` creates a local metadata alias for upstream's older Android Gradle plugin while preserving the real platform binaries. A full JDK with `javac` is required, not a Java runtime alone. The build succeeded with this setup. The APK signature verifies with v2 signing. The integration compiled successfully but has not been device-tested.

The script builds a development-signed APK, suitable for testing, not a release signed with upstream's key. Release distribution needs your own retained signing key. Existing BitChord library/account state is not migrated.

## Changes in the patch

- A SoundCloud sign-in button in Sources.
- A private Activity that opens the system browser, then checks the pairing status on return.
- OAuth state and PKCE on the service; no WebView password collection or browser cookie extraction.
- Automatic addon registration through the existing SourceRegistry and playback protocol.
- Keystore-backed encrypted session preferences, excluded from cloud backup and device transfer.
- No plaintext HTTP exception needed: the addon is reached over HTTPS.

The original Android TV module shares phone sources, so the patch adds an empty login-service field there to keep its generated BuildConfig compatible. This integration targets the Android phone app; it does not change the Tizen widget.

## Validation

The patch was checked for clean application to the pinned revision. Ten addon/OAuth tests pass against synthetic upstream responses, including state/PKCE, denied sign-in, token refresh, encrypted persistence and disconnection. Live SoundCloud OAuth, Physical-device behavior and live SoundCloud login remain unverified. Refresh tokens can expire or be revoked; in those cases another sign-in is required.

## Published build

- Package: `com.music.bitchord.soundcloud`, version 1.9 (36), Android 8.0/API 26 or newer, ARM64 only.
- Development signature verified with Android `apksigner`; not a production-key-signed release.
- APK size: 117,407,902 bytes. Native libraries are compressed in the download and extracted at installation, so installed size is larger.
- Full source is on the `android-soundcloud` branch, including the APK packaging change. The APK is stored with Git LFS; use the raw download link to obtain the binary rather than a pointer file.
- **The distributed build has no SoundCloud login service configured.** It explicitly disables sign-in until a publisher builds it with a deployed service origin. Ordinary upstream BitChord features remain in the full native app; this does not make unconfigured SoundCloud login work.
