# BitChord music helper (TV)

One small Node server that gives the TV three sources: SoundCloud (also at `/`), YouTube Music (`/yt`) and Spotify (`/spotify`).

```sh
pip install -U yt-dlp          # YouTube lookups; keep it updated
cd addons/music && node server.mjs   # Node 22+, listens on 0.0.0.0:8787
```

In BitChord TV: Settings → Free helper server → `http://<this-computer-ip>:8787`, then choose YouTube Music or Spotify.

- **YouTube Music**: search and audio come from yt-dlp. Audio is proxied through the helper, so the helper can run anywhere the TV can reach.
- **Spotify**: set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (free app at developer.spotify.com, no Premium needed). BitChord searches the Spotify catalogue and plays the matching song from YouTube, because Spotify does not allow its own audio outside its apps. Your Spotify account and library are not used.
- Optional: `PORT`, `HOST`, `SPOTIFY_MARKET` (e.g. `RO`), `YT_DLP` (path to the binary).

Do not expose the helper to the internet without a firewall or reverse proxy that requires authentication.
