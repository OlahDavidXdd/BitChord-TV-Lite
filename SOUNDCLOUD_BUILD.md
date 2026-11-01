# Modified BitChord Android source

Based on upstream BitChord revision b690dc146009d4815825fa4a20815ef2e4ee8898. This branch contains the native Android project with the SoundCloud sign-in integration. The main branch holds the publisher-hosted OAuth service, Tizen widget and integration/build documentation.

The app uses package ID com.music.bitchord.soundcloud and keeps the original Android interface. Set BITCHORD_SOUNDCLOUD_AUTH_URL to your deployed HTTPS login service before building. Without a configured service the app explicitly disables SoundCloud login; no fake or shared developer credentials are embedded.

Build with a full JDK and the real API 37 SDK plus the upstream NDK/CMake dependencies. The main branch's android-integration/prepare-sdk.py provides an SDK 37.0 metadata alias for this project's older Android Gradle plugin. Then run ./gradlew :app:assembleProdDebug -Pbitchord.bundleWear=false.

Development-signed builds require physical-device validation before use as a release. See the main branch for current build status and APK downloads.
