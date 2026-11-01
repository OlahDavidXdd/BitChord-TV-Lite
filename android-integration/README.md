# SoundCloud sign-in inside BitChord for Android

**Source integration only. No modified APK has been successfully built or tested yet.**

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

The upstream project requires Android SDK platform **37**, its Android/NDK dependencies, and its pinned Gradle dependencies. This environment's SDK manager reported `Failed to find package 'platforms;android-37'`, so the Android build could not be completed. No APK is provided or claimed working. The login integration has not been compiled or device-tested.

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

The patch was checked for clean application to the pinned revision. Nine addon/OAuth tests pass against synthetic upstream responses, including state/PKCE, denied sign-in, token refresh, encrypted persistence and disconnection. Live SoundCloud OAuth, Android compilation and physical-device behavior remain unverified. Refresh tokens can expire or be revoked; in those cases another sign-in is required.
