# Android free SoundCloud integration

The native source is on the `android-soundcloud` branch. SoundCloud is a built-in public source using the existing NewPipe extractor. Search through Search → Addons. No OAuth credentials, companion app or login server are needed. Private/paid content and account sync are not supported.

`build.sh` applies the patch to pinned upstream revision b690dc146009d4815825fa4a20815ef2e4ee8898 and builds an optimized ARM64 APK. Set ANDROID_HOME and use a full JDK 21. Android SDK platforms 36 and 37, build-tools 35, NDK 27.0.12077973 and CMake 3.22.1 are required. prepare-sdk.py handles the SDK 37.0 metadata alias.

Package: com.music.bitchord.soundcloud. Development signing is used when no release signing configuration exists. Physical-device testing remains pending. The original Android YouTube Music and Spotify features are retained.
