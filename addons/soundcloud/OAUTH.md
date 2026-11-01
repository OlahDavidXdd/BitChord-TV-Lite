# Publisher-hosted SoundCloud login service

For the modified Android integration, users sign in on SoundCloud's website once. They do not enter developer API credentials or run a server themselves. The app publisher runs this service.

## Configure

Register a SoundCloud developer application and set its redirect URI to `https://YOUR_LOGIN_DOMAIN/callback`. On a Node 22+ HTTPS host, configure:

- `PUBLIC_URL`: HTTPS origin, for example `https://login.example.com` (no path).
- `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET`: the registered application's credentials.
- `SOUNDCLOUD_STORE_KEY`: a durable base64-encoded random 32-byte key. Generate it once with a password manager or `openssl rand -base64 32`; store it as a hosting secret and keep it across restarts.
- `SOUNDCLOUD_STORE_FILE`: a file on durable writable storage, default `./data/soundcloud.enc`.
- `PORT`: default 8787. `HOST`: default `127.0.0.1`; set `0.0.0.0` only when required by your hosting platform.

Start with `npm run start:oauth`. Terminate TLS at a reverse proxy. Run one service instance: refresh-token rotation and encrypted-file persistence are coordinated in process, not across replicas. Persist and back up the encrypted file and store key separately. Do not configure access logging of full `/addon/...` paths, pairing tickets, query strings or Authorization headers: these contain per-device credentials.

No hosting account, domain or SoundCloud application credentials were supplied in this session, so this service has not been deployed and live sign-in is not configured.

## Flow

1. Android posts to `/pair` and stores its pair ID and private key.
2. It opens the returned one-time `/authorize` URL in the user's browser.
3. SoundCloud redirects to `/callback`; the service verifies state and exchanges the authorization code using PKCE and its server-side client secret.
4. Android checks `/pair/{id}` with its bearer key, receives the authenticated addon URL, and adds it to BitChord.
5. `/addon/{key}/manifest.json`, `/search` and `/stream/{id}` implement the existing addon protocol. The private key is unguessable and is a credential; never share its URL.
6. Expired access tokens are refreshed with a single shared in-flight refresh per session; the rotated refresh token is saved encrypted.
7. Android can `DELETE /session` with its bearer key to revoke the SoundCloud token and delete its persisted session.

Pairing links expire after ten minutes. Restarting during pairing requires a new sign-in attempt; completed sessions survive restarts. The access and refresh tokens are encrypted with AES-256-GCM on disk. Playback remains subject to creator, account, geographic and subscription restrictions.

The login service intentionally fails startup when required credentials or a valid encryption key are missing. It never uses extracted public client keys, collects SoundCloud passwords or embeds client secrets in an APK.

See https://developers.soundcloud.com/docs/api/guide for OAuth application registration, PKCE and refresh-token requirements.
