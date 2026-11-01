# Experimental on-TV service build — RU7172 / Tizen 5

This is a separate test application, **BitChord On-TV Test** (`BChordOnTV.Lite`), so it does not replace the existing BitChord TV Lite app. Its application ID/package are intentionally different. The launcher uses the same Android default icon.

Build with `python3 tizen/scripts/package.py --on-tv`. Output: `tizen/dist/BitChord-TV-OnDevice-unsigned.wgt`. The normal `package.py` command still produces the web-only widget.

## Why this is possible

Samsung TV JavaScript web services are different from native `.tpk` applications. TizenBrew demonstrates a packaged JavaScript service with a loopback server on Tizen 3+ TVs:

- https://github.com/reisxd/TizenBrew/blob/main/docs/README.md
- https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/config.xml

The earlier blanket statement that the TV could not run a helper was too broad. The existing modern Node/Python/FFmpeg helper cannot simply be dropped into this firmware; this build contains a new ES5/legacy-Node service using built-ins, without Python, FFmpeg, a separate TizenBrew installation, firmware changes or root.

## What is in this build

- An on-device service registered as `BChordOnTV.LocalService`, launched through Samsung's application-control API.
- HTTP listener bound only to `127.0.0.1:8790`, not the home network.
- Public SoundCloud searches, artist/album/playlist metadata, signed-stream resolution, range forwarding and a local HLS proxy. Explicit `.m3u8` paths help AVPlay identify HLS. The proxy also moves upstream TLS handling off AVPlay. It **does not transcode unsupported codecs**.
- Public YouTube Music search made by the TV service rather than browser cross-origin XHR.
- A visible official YouTube player in a local HTTP wrapper, with an actual HTTP referrer, remote commands, queue handling and Exit. This targets the file-origin problem; it does not override YouTube's availability/browser restrictions.
- Public Spotify playlist/album/track imports matched to YouTube.
- A verified public Mozilla/curl CA bundle for upstream certificate validation. TLS certificate verification stays enabled.

## Installation and first test

The archive is **unsigned**. Sign it with your Samsung TV certificate/profile including the TV DUID, and install it using your existing developer-mode workflow. Samsung service permissions must be accepted by the signing/runtime. No changes to TV firmware are requested. You only need an installation device during setup; the design uses no external helper during playback.

Open **BitChord On-TV Test**, then Settings → Music Services. The status should say:

`On-TV service running · v... · no external server`

If it says Launch failed or timed out, report that exact status. The serial number and TVkey ID are not needed and are not included in the package or repository. The model/firmware alone cannot prove that a particular certificate/service launch will work.

After service readiness, test YouTube search and one song, then SoundCloud search/playback and a public Spotify playlist link. If the official player itself reports an error, report its error number separately from the service-startup status.

## Actual validation and limits

The service loads, parses the CA bundle and serves test searches using the real Node 4.4.3 binary. Modern-Node tests cover loopback routes, public metadata, media-destination restrictions, wrapper messages and queue/Exit handling. These are software tests; **this exact RU7172 firmware has not been physically tested**. No live YouTube playback was verified from the restricted build environment.

**Private account sync is not implemented in this local-service test.** The ordinary build's HTTPS OAuth connector has not been ported to the legacy service. Spotify/Google application registrations are also missing. Public playlist import and local favorites are different from private account-library sync. The full saved YouTube Music album library is not exposed by the official YouTube API.

This is a feasibility/test build for running the public music paths on the TV itself, not a claim that every requested feature or every recording works. The first hardware check is the on-TV service status.
