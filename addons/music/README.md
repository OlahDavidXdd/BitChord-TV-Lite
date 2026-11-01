# Public music inside BitChord TV

YouTube Music: choose the service in Settings or Search, enter a song/artist, and select a result. Playback uses a visible official YouTube player in BitChord with remote pause, seek, next/previous and completion handling. Embedding, regional restrictions, adverts and availability are controlled by YouTube. Error 153 means YouTube rejected the widget origin; it is not a decoder fixable by relabelling a stream.

Spotify: choose Spotify and paste a public track, album or playlist link. BitChord reads public metadata, displays the tracks, and matches each selection to YouTube Music by title, artist and duration, with penalties for unwanted covers/remixes. Uncertain matches are rejected. This is the original app's matching approach, not Spotify audio playback. Public embeds may expose only part of a large playlist. No private libraries or account login are supported in this update; TV login was deferred by request.

## Optional free helper

Some widget/browser runtimes block cross-origin metadata requests. On an independently hosted Node 22+ machine:

```
cd addons/music
HOST=0.0.0.0 PORT=8788 npm start
```

Put its reachable origin in TV Settings → Music helper. Expose it through HTTPS with your own reverse proxy when used remotely. It needs no API key, OAuth registration or phone bridge. It only fetches fixed YouTube Music endpoints and validated public Spotify embed links, not arbitrary URLs. Do not expose an unbounded public deployment without rate limiting at your proxy.

Search caching and concurrent-request deduplication keep repeated work down. `npm test` validates metadata parsing, matching and HTTP routes. A live Spotify playlist probe returned and parsed 50 tracks. The build environment's proxy refused music.youtube.com, so YouTube search/playback here is verified with fixtures and player mocks, not a live account or Samsung TV. Device network/CORS, player identity and codec testing is required.

## Existing audio helper routes

The merged update also preserves `/yt`, `/spotify`, `/soundcloud` and root SoundCloud addon routes, with byte-range audio proxying. Install `yt-dlp` on the helper for native progressive YouTube audio (`python3 -m pip install -U yt-dlp`). Optional Spotify catalog search needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server; public-link imports need neither. Choose the explicit helper source buttons in TV Settings. These routes do not implement user login.

## Older Samsung TV audio compatibility

If the TV still rejects SoundCloud AAC/HLS, install FFmpeg on the independently hosted helper and start it with compatible audio enabled:

```
HOST=0.0.0.0 PORT=8788 SOUNDCLOUD_TRANSCODE=1 npm start
```

Set that origin in TV Settings → Free helper server, then select SoundCloud. The helper converts allowed public streams to a cached, seekable MP3 before handing them to AVPlay. No phone or SoundCloud developer account is needed. First playback waits for conversion; repeat playback uses the cache. Set `FFMPEG` for a custom binary, `SOUNDCLOUD_CACHE_DIR` for the cache location or `SOUNDCLOUD_CA_FILE` for a custom trusted CA file. Cache entries expire after 30 minutes; the cache is bounded, and conversions time out rather than running indefinitely. This does not unlock paid/private/restricted tracks.

The actual converter was tested with a live allowed SoundCloud AAC stream, and its MP3 output decoded successfully. Byte ranges, HEAD requests and concurrent-request deduplication have automated tests. Samsung hardware itself remains untested.

TV 1.5.1 uses native AVPlay audio for YouTube Music and matched Spotify selections when **Music helper** is configured. Install yt-dlp on that helper; it uses `/yt/search`, `/yt/stream` and range-proxied `/yt/audio` routes. Next/previous and completion stay in the selected playlist. Leave Music helper blank to use direct public search and the visible official YouTube player. The separate SoundCloud helper field does not silently enable YouTube helper mode.

## Account library sync

The new read-only connection flow is documented in [LIBRARY-SYNC.md](LIBRARY-SYNC.md). It needs publisher-owned Spotify/Google OAuth registrations and an HTTPS service; neither has been configured for the released widget. The public SoundCloud and public playlist features do not need these credentials.
