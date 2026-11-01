# SoundCloud addon for BitChord

A dependency-free Node 22+ HTTP addon using the official SoundCloud API. It works with the existing BitChord Android/TV **Addons → Add by URL** flow and the new Tizen TV Lite client. This is a server addon, not a Chrome extension.

## Run

Register a SoundCloud API application at https://developers.soundcloud.com/docs/api/guide. On your server, set `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET`, then run:

```sh
cd addons/soundcloud
npm start
```

It listens on `127.0.0.1:8787`. Put it behind an HTTPS reverse proxy and enter the resulting base URL in BitChord. For testing on a trusted LAN, set `HOST=0.0.0.0` before starting; use your computer's LAN IP on the TV, not `localhost`. A temporary alternative is `SOUNDCLOUD_ACCESS_TOKEN`; the server uses it until it expires, after which it must be replaced. Never put credentials in the TV package or a URL.

The normal credentials flow reuses its token and refreshes with the single-use refresh token. Token state is held in memory, so run one instance and avoid frequent restarts (SoundCloud limits new token issuance). Supply your own deployment access controls if exposing the addon publicly; it has no built-in user authentication.

## Protocol

- `GET /manifest.json`: BitChord addon manifest, downloads disabled.
- `GET /search?q=...`: up to 30 public, fully playable tracks. Durations are seconds, not SoundCloud's milliseconds. Extra attribution fields are preserved for the Tizen client.
- `GET /stream/{encoded-track-id}`: direct MP3 when supplied by the API, otherwise AAC/MP3 HLS. Stream URLs are short-lived and resolved per playback. Credentials stay on the server.

Blocked, preview-only, private and subscription-restricted tracks are not unlocked. There is no scraping or embedded third-party client key. SoundCloud does not offer lossless through this addon.

## Verification

```sh
npm test
```

Tests use synthetic upstream responses to verify protocol mapping, restricted tracks, authentication deduplication, CORS and errors. Live API playback still requires valid SoundCloud credentials and was not tested in the build environment. API reference: https://developers.soundcloud.com/docs/api/guide.
