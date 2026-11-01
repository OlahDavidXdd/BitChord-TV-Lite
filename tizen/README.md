# BitChord TV Lite — Tizen 5+

Standalone web widget, with Android TV inspired navigation, free public SoundCloud playback, remote controls, favorites/history and optional glass effects in Settings → Appearance. YouTube/Spotify open installed official TV apps and do not connect accounts or libraries inside BitChord. No phone bridge is used.

Build: `python3 tizen/scripts/package.py`. The compressed unsigned widget has a 1 MiB budget. It uses the TV runtime rather than bundling Android libraries.

Choose free SoundCloud in Settings. Direct public searches depend on TV network/CORS behavior; if blocked, configure the optional free helper (`addons/soundcloud`, `npm run start:public`) on an independently hosted server. Public track links can use the official embedded player. No developer credentials are required. Private/paid tracks and SoundCloud library login are not supported.

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

## Validation

Run `npm ci --prefix tizen && npm test --prefix tizen`; run Node tests in addons/soundcloud for the public extractor and helper. DOM/AVPlay mocks do not prove Samsung compatibility. Before deployment validate signing, installation, keyboard/remote focus, network/CORS, media codecs, seek, Return and suspend on the actual TV. No physical TV or Samsung signing certificate was available here.
