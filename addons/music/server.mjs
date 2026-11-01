// One helper for the TV: SoundCloud (root and /soundcloud), YouTube Music (/yt) and Spotify (/spotify).
// YouTube audio is resolved with yt-dlp and proxied through this server, because the direct links are tied to
// the requesting IP address and the TV's decoder works best with a plain progressive stream.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const fail = (status, message) => Object.assign(new Error(message), { status });
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SP_ID = /^[A-Za-z0-9]{22}$/;
const cap = (map, limit) => { if (map.size >= limit) map.delete(map.keys().next().value); };

export function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YT_DLP || 'yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(fail(504, 'YouTube lookup timed out')); }, 40000);
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 8e6) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { err = (err + chunk).slice(-2000); });
    child.on('error', e => { clearTimeout(timer); reject(fail(503, e.code === 'ENOENT' ? 'yt-dlp is not installed on the helper (pip install -U yt-dlp)' : 'Cannot run yt-dlp')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(fail(502, /Sign in|bot|429/i.test(err) ? 'YouTube asked for verification; update yt-dlp or try later' : 'YouTube lookup failed')); });
  });
}

export function createYouTube({ run = runYtDlp } = {}) {
  const urls = new Map();
  const map = e => ({ id: e.id, title: e.title || '', artist: String(e.channel || e.uploader || '').replace(/ - Topic$/, ''),
    duration: Number(e.duration || 0), artworkURL: 'https://i.ytimg.com/vi/' + e.id + '/mqdefault.jpg',
    permalinkURL: 'https://music.youtube.com/watch?v=' + e.id, uploader: e.channel || e.uploader || '', source: 'YouTube Music' });
  async function search(q, count = 25) {
    q = String(q || '').trim(); if (!q) return { tracks: [] };
    const data = JSON.parse(await run(['--flat-playlist', '--dump-single-json', '--no-warnings', '--', 'ytsearch' + count + ':' + q]));
    return { tracks: (data.entries || []).filter(e => e && YT_ID.test(e.id || '') && e.duration >= 30 && e.duration <= 1500).map(map) };
  }
  async function audioUrl(id, fresh) {
    if (!YT_ID.test(id)) throw fail(400, 'Invalid YouTube id');
    const hit = urls.get(id); if (hit && !fresh && Date.now() - hit.at < 15 * 60000) return hit.url;
    const out = await run(['-f', 'bestaudio[ext=m4a]/bestaudio', '-g', '--no-playlist', '--no-warnings', '--', 'https://www.youtube.com/watch?v=' + id]);
    const url = out.split('\n').map(l => l.trim()).find(Boolean);
    if (!url || !/^https:\/\//.test(url)) throw fail(404, 'No audio stream for this video');
    cap(urls, 100); urls.set(id, { url, at: Date.now() }); return url;
  }
  return {
    manifest: { id: 'bitchord.ytmusic', name: 'YouTube Music' }, search, audioUrl,
    async stream(id, { origin }) { await audioUrl(id); return { url: origin + '/yt/audio/' + id, format: 'aac', manifest: 'none', encrypted: false }; }
  };
}

export function createSpotify({ clientId, clientSecret, youtube, fetcher = fetch, market } = {}) {
  let token, expires = 0, pending; const meta = new Map(), matched = new Map();
  async function authenticate() {
    if (token && Date.now() < expires) return token;
    if (!clientId || !clientSecret) throw fail(503, 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the helper');
    pending ||= (async () => {
      const r = await fetcher('https://accounts.spotify.com/api/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64') }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw fail(503, 'Spotify authentication failed; check the client id and secret');
      const data = await r.json(); token = data.access_token; expires = Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000; return token;
    })().finally(() => { pending = undefined; });
    return pending;
  }
  async function api(path) {
    const r = await fetcher('https://api.spotify.com/v1' + path, { headers: { Authorization: 'Bearer ' + await authenticate() }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw fail(r.status === 429 ? 429 : r.status === 404 ? 404 : 502, r.status === 429 ? 'Spotify rate limit reached; try again later' : 'Spotify request failed (' + r.status + ')');
    return r.json();
  }
  const map = t => ({ id: t.id, title: t.name, artist: (t.artists || []).map(a => a.name).join(', '), duration: Number(t.duration_ms || 0) / 1000,
    artworkURL: ((t.album || {}).images || [])[1]?.url || ((t.album || {}).images || [])[0]?.url || '', permalinkURL: (t.external_urls || {}).spotify, uploader: (t.artists || [])[0]?.name || '', source: 'Spotify' });
  return {
    manifest: { id: 'bitchord.spotify', name: 'Spotify' },
    async collections(q) {
      q = String(q || '').trim(); if (!q) return { albums: [] };
      const data = await api('/search?' + new URLSearchParams({ q, type: 'album', limit: '20', ...(market ? { market } : {}) }));
      return { albums: ((data.albums || {}).items || []).filter(a => a && SP_ID.test(a.id || '')).map(a => ({ id: a.id, title: a.name, artist: (a.album_type === 'single' ? 'Single' : 'Album') + ' · ' + (a.artists || []).map(x => x.name).join(', '),
        artworkURL: (a.images || [])[1]?.url || (a.images || [])[0]?.url || '', duration: 0, permalinkURL: (a.external_urls || {}).spotify, source: 'Spotify', kind: 'album' })) };
    },
    async playlist(id) {
      if (!SP_ID.test(id)) throw fail(400, 'Invalid Spotify album id');
      const album = await api('/albums/' + id), art = (album.images || [])[1]?.url || (album.images || [])[0]?.url || '';
      const items = [...(album.tracks?.items || [])];
      for (let next = album.tracks?.next; next && items.length < 200;) { const page = await api(next.replace('https://api.spotify.com/v1', '')); items.push(...(page.items || [])); next = page.next; }
      const tracks = items.filter(t => t && SP_ID.test(t.id || '')).map(t => ({ ...map({ ...t, album: { images: album.images } }), artworkURL: art }));
      tracks.forEach(t => { cap(meta, 300); meta.set(t.id, t); }); return { title: album.name || '', tracks };
    },
    async search(q) {
      q = String(q || '').trim(); if (!q) return { tracks: [] };
      const data = await api('/search?' + new URLSearchParams({ q, type: 'track', limit: '30', ...(market ? { market } : {}) }));
      const tracks = ((data.tracks || {}).items || []).filter(t => t && SP_ID.test(t.id || '')).map(map);
      tracks.forEach(t => { cap(meta, 300); meta.set(t.id, t); }); return { tracks };
    },
    // Spotify does not allow its audio outside its own apps, so the catalogue is matched to the same song on YouTube.
    async stream(id, ctx) {
      if (!SP_ID.test(id)) throw fail(400, 'Invalid Spotify track id');
      if (matched.has(id)) return { url: ctx.origin + '/yt/audio/' + matched.get(id), format: 'aac', manifest: 'none', encrypted: false };
      const track = meta.get(id) || map(await api('/tracks/' + id));
      const found = (await youtube.search(track.artist + ' ' + track.title + ' audio', 8)).tracks
        .map(t => ({ t, gap: Math.abs(t.duration - track.duration) })).filter(x => x.gap <= 15).sort((a, b) => a.gap - b.gap)[0];
      if (!found) throw fail(404, 'No matching audio found for this Spotify track');
      await youtube.audioUrl(found.t.id); cap(matched, 300); matched.set(id, found.t.id);
      return { url: ctx.origin + '/yt/audio/' + found.t.id, format: 'aac', manifest: 'none', encrypted: false };
    }
  };
}

export function createHelper({ soundcloud, youtube, spotify, fetcher = fetch }) {
  const sources = { '/soundcloud': soundcloud, '/yt': youtube, '/spotify': spotify, '': soundcloud };
  async function proxy(id, req, res) {
    for (const fresh of [false, true]) {
      const controller = new AbortController(); res.on('close', () => controller.abort());
      const upstream = await fetcher(await youtube.audioUrl(id, fresh), { headers: { 'User-Agent': 'Mozilla/5.0', ...(req.headers.range ? { Range: req.headers.range } : {}) }, signal: controller.signal });
      if (!upstream.ok && upstream.status !== 206) { if (!fresh && (upstream.status === 403 || upstream.status === 410)) continue; throw fail(502, 'YouTube audio is unavailable'); }
      const headers = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
      for (const name of ['content-type', 'content-length', 'content-range']) if (upstream.headers.get(name)) headers[name] = upstream.headers.get(name);
      res.writeHead(upstream.status, headers);
      if (req.method === 'HEAD' || !upstream.body) { res.end(); return; }
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res); return;
    }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Range');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'Use GET');
      const url = new URL(req.url, 'http://localhost');
      const match = /^(\/yt|\/spotify|\/soundcloud)(\/.*)?$/.exec(url.pathname), prefix = match ? match[1] : '', rest = match ? match[2] || '/' : url.pathname;
      const client = sources[prefix];
      if (prefix === '/yt' && rest.startsWith('/audio/')) { await proxy(decodeURIComponent(rest.slice(7)), req, res); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      if (!client) throw fail(503, 'This source is not configured on the helper');
      const origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host;
      let body;
      if (rest === '/manifest.json') body = client.manifest || { id: 'bitchord.soundcloud', name: 'SoundCloud' };
      else if (rest === '/search') { const q = url.searchParams.get('q') || ''; if (q.length > 300) throw fail(400, 'Query too long'); body = await client.search(q); }
      else if (rest === '/albums') { const q = url.searchParams.get('q') || ''; if (q.length > 300) throw fail(400, 'Query too long'); body = client.collections ? await client.collections(q) : { albums: [] }; }
      else if (rest.startsWith('/playlist/') && client.playlist) body = await client.playlist(decodeURIComponent(rest.slice(10)));
      else if (rest.startsWith('/stream/')) body = await client.stream(decodeURIComponent(rest.slice(8)), { origin });
      else throw fail(404, 'Not found');
      res.end(JSON.stringify(body));
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.statusCode = err.status || 502;
      if (res.statusCode === 429) res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: err.status ? err.message : 'The source is temporarily unavailable' }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { create } = createRequire(import.meta.url)('../../shared/soundcloud-public.cjs');
  const bootstrap = JSON.parse(readFileSync(new URL('../../shared/soundcloud-bootstrap.json', import.meta.url)));
  const soundcloud = create({ ...bootstrap, request: async url => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Object.assign(new Error('SoundCloud request failed (' + r.status + ')'), { status: r.status });
    return r.text();
  } });
  const youtube = createYouTube();
  const spotify = createSpotify({ clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, youtube, market: process.env.SPOTIFY_MARKET });
  const port = Number(process.env.PORT || 8787);
  createHelper({ soundcloud, youtube, spotify }).listen(port, process.env.HOST || '0.0.0.0', () => console.log('BitChord music helper on port ' + port + ' (SoundCloud, YouTube Music' + (process.env.SPOTIFY_CLIENT_ID ? ', Spotify' : '') + ')'));
}
