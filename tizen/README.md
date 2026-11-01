# BitChord TV Lite — Tizen 5.0+

A separate, deliberately small web client for BitChord HTTP addons, including `../addons/soundcloud`. This is not the Android APK renamed to `.wgt`, and it does not embed the full Android app or the existing modern React web app.

## Included

Addon URL setup, track search, result queue with next/previous, playback, pause, seek, elapsed time, spatial D-pad focus, media keys, Return handling and saved addon URL. On Samsung TVs it uses AVPlay for native progressive/HLS playback; ordinary browsers use HTML audio for basic development. Playback stops when the application becomes hidden.

## Size

The build contains only HTML, ES5 JavaScript, CSS, one 117px icon and `config.xml`. There are no npm dependencies, bundled browser, native libraries, music downloads, ONNX models, artwork cache or custom fonts. The packager enforces a **1 MiB** compressed budget. Measured unsigned package size is printed by the build; signing adds certificate overhead. TV storage usage includes platform metadata and runtime caches, so package size is not a promise of total installed size.

This size reduction trades away full Android feature parity: no YouTube Music, account login, synced library, lyrics, AI Automix, vocal separation, EQ, downloads, casting or Listen Together. The original Android TV build is unchanged.

## Build the unsigned widget

```sh
python3 tizen/scripts/package.py
```

Output: `tizen/dist/BitChord-TV-Lite-unsigned.wgt`. The ZIP root contains `config.xml`. This is an **unsigned build artifact**, not yet installable on a Samsung TV.

## Sign and install

Install Tizen Studio CLI, Samsung TV extensions and Samsung Certificate Extension. In Certificate Manager create a Samsung TV certificate profile, including the TV's DUID in the distributor certificate. Keep that profile and its private keys on your computer.

Enable Developer Mode on the TV, set your development computer's IP, restart the TV, connect it in Device Manager and use **Permit to install applications**. Then, from the repository root, package with your existing profile:

```sh
tizen package -t wgt -s YOUR_SAMSUNG_PROFILE -o tizen/dist/signed -- tizen/app
```

Use the generated signed `.wgt` filename with the target shown by `tizen list`:

```sh
tizen install -n YOUR_SIGNED_WIDGET.wgt -t YOUR_TV_TARGET -- tizen/dist/signed
tizen run -p BitChordTV.Lite -t YOUR_TV_TARGET
```

If CLI packaging expects a project, import `tizen/app` as an existing web project in Tizen Studio, select the certificate profile, and use **Build Signed Package**. Do not install the unsigned archive.

See Samsung's CLI and certificate instructions:
https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html
https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html

## Use

Run the SoundCloud addon on a computer/server with valid API credentials (see its README). The TV cannot run a Node server. Enter the server's HTTPS base URL in the TV's **Addon server URL** field, save it, then search. Any compatible BitChord HTTP addon can also be used. The URL and media origins need network access, which is why the widget declares internet access to arbitrary origins. Use a trusted addon.

Arrow keys move focus, Enter activates buttons, and Return leaves input editing, stops playback, then exits. Playback media keys and ±10-second buttons are supported. You can inspect the layout with `python3 -m http.server 8080 --directory tizen/app`; Samsung AVPlay is only available on the TV.

## Validation and remaining device checks

`node --check tizen/app/app.js` checks syntax. The package script validates XML and enforces the byte budget. No Samsung device, emulator, signing certificate or Tizen SDK was available in the build environment. Before treating this as a release, test on a Tizen 5 TV: installation/signatures, remote focus and on-screen keyboard, SoundCloud search, MP3/HLS playback, next/previous/seek, Return and suspend. Availability also depends on SoundCloud access and the TV's codecs/TLS support.
