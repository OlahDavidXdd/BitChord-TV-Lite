# Private account library sync

The widget includes a connection/sync client and the helper includes a read-only official OAuth service. **It is not enabled in the distributed build:** the publisher has not registered Spotify/Google OAuth applications or deployed an HTTPS service. Adding buttons or repackaging a WGT cannot provide those account permissions.

Supported after configuration:

- Spotify: your playlists, liked songs and saved albums, with pagination. Playback matches selections to YouTube, as elsewhere in BitChord.
- YouTube: your account's playlists and liked videos/music. The official YouTube API does not expose the complete saved YouTube Music album library; this is not a complete private YouTube Music library replica.
- Both accounts stay independent of the phone. Sign-in opens the provider's real website in the TV browser, then returns to BitChord. A TV browser must itself be supported by the provider.

## Publisher setup

1. Register a Spotify web application and a Google OAuth web client; enable YouTube Data API v3 in the Google project and configure its consent screen/testing users.
2. Register these exact callback URLs, using your deployed HTTPS origin:
   - `https://YOUR-ORIGIN/library/callback/spotify`
   - `https://YOUR-ORIGIN/library/callback/youtube`
3. Set server environment variables: `LIBRARY_PUBLIC_URL` (HTTPS origin), `LIBRARY_STORE_KEY` (base64-encoded 32-byte random key), `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Use `openssl rand -base64 32` on the server to generate the encryption key. Keep secrets on the server; do not put them in the WGT, GitHub, screenshots or chat.
4. Run `addons/music/server.mjs` behind your HTTPS reverse proxy. Node 22+ is required. For a private environment file outside the repository, Node supports `node --env-file=/secure/path/provider.env server.mjs`. Retain the store key and encrypted store between deployments. The default encrypted file is `addons/music/data/library.enc`; override with `LIBRARY_STORE_FILE` if needed.
5. On TV, Settings → Library accounts: save the HTTPS library-service origin, then connect Spotify and/or YouTube. Sign in on the TV's provider page. Return to BitChord; Library → Spotify account / YouTube account → Sync now reads current collections. Spotify also offers Saved albums. Read-only permissions are requested.

Refresh/access tokens are encrypted on the server using AES-256-GCM. The TV stores only its own random session credential in app-local storage. Requests use Authorization headers rather than putting credentials in URLs. State, PKCE, expiry and one-use callbacks protect sign-in. Disconnect removes the TV's server-side session/token record; it does not delete playlists or modify the provider's library. Changing or losing the encryption key makes existing sessions unreadable.

The server and widget flows are tested with provider fixtures, including token refresh, private library pagination, disconnect and replay rejection. No real Spotify/Google account has been connected in this environment. Provider app eligibility, API quotas, consent verification, supported TV browsers and account permissions still apply.
