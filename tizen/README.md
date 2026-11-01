# BitChord TV Lite — Tizen 5+

Standalone web widget, with Android TV inspired navigation, free public SoundCloud playback, remote controls, favorites/history and optional glass effects in Settings → Appearance. YouTube Music searches and plays through the visible official player inside BitChord. Public Spotify links import tracks that are matched to YouTube Music. TV login/private libraries are deferred. Official-app shortcuts remain optional. See [music details](../addons/music/README.md). No phone bridge is used.

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

SoundCloud: 50 results per page and Load more. MP3/AAC are preferred; Opus/Ogg are filtered. Native decoder failures retry alternatives and then open the official SoundCloud player. Public restrictions still apply. The large artwork blur and per-card image color extraction are removed to reduce rendering work.

Version 1.5 adds SoundCloud artist/album/playlist browsing. Search a query and select the SoundCloud result type. While a SoundCloud song plays, use Open SoundCloud artist; artist tracks and collections load without stopping the current song. Album hydration handles all id-only metadata batches. The small WGT uses Samsung's browser/AVPlay and optional remote helpers, so file size does not indicate which services it supports. YouTube and matched Spotify playback still depend on supported embedding or the explicitly configured yt-dlp helper.

Version 1.5.1 fixes configured music-helper playback: YouTube and Spotify matches use Samsung AVPlay through the yt-dlp helper rather than continuing to use an embedded player. Queue next/previous/completion are preserved. Stop and suspend cancel delayed player starts; the SoundCloud player API now has a timeout. Physical TV validation and Samsung certificate signing are still required.

Version 1.6 adds explicit official-player exit, keyboard/hardware Back handling, queue-preserving SoundCloud fallback and the Android default launcher icon. YouTube Music 403 refresh/retry is bounded; origin-level refusal still needs the configured helper. Library account connection pages require publisher OAuth/HTTPS setup before they can connect; see [setup and supported library types](../addons/music/LIBRARY-SYNC.md).
