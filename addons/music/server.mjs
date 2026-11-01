import { createLibraryService, libraryStore } from './library-auth.mjs';
import { compatibleSoundCloud } from './compatible-soundcloud.mjs';
import { createYouTube, createSpotify, createHelper } from './audio-helper.mjs';
export { createYouTube, createSpotify, createHelper, runYtDlp } from './audio-helper.mjs';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const { create } = createRequire(import.meta.url)('../../shared/music-public.cjs');
export function musicServer({ audioHelper = false, library = null, request = async (url, body) => {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (body?.context?.client?.clientName === 'WEB_REMIX') { headers['X-YouTube-Client-Name'] = '67'; headers['X-YouTube-Client-Version'] = body.context.client.clientVersion; if (body.context.client.visitorData) headers['X-Goog-Visitor-Id'] = body.context.client.visitorData; }
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error(`Music service request failed (${response.status})`), { status: response.status });
  return response.text();
} } = {}) {
  const client = create({ request });
  let audioHandler;
  if (audioHelper) {
    const { create: sc } = createRequire(import.meta.url)('../../shared/soundcloud-public.cjs');
    const bootstrap = JSON.parse(readFileSync(new URL('../../shared/soundcloud-bootstrap.json', import.meta.url)));
    const publicSoundcloud = sc({ ...bootstrap, request });
    const soundcloud = process.env.SOUNDCLOUD_TRANSCODE === '1' ? compatibleSoundCloud(publicSoundcloud) : publicSoundcloud;
    const youtube = createYouTube();
    const spotify = createSpotify({ clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, youtube, market: process.env.SPOTIFY_MARKET });
    audioHandler = createHelper({ soundcloud, youtube, spotify }).listeners('request')[0];
  }
  return createServer(async (req, res) => {
    if ((req.url || '').split('?')[0].startsWith('/library/')) {
      if (library) { await library(req, res); return; }
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; } res.setHeader('Content-Type', 'application/json'); res.statusCode = req.url === '/library/config' ? 200 : 503; res.end(JSON.stringify({ spotify: false, youtube: false, error: 'Library sync requires publisher OAuth credentials and an HTTPS library service. See the helper setup instructions.' })); return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET' && !(audioHelper && req.method === 'HEAD')) { res.writeHead(405); res.end(JSON.stringify({ error: 'GET required' })); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.url.length > 2048) throw new Error('Request too long');
      let data;
      if (url.pathname === '/youtube/search') data = await client.search(url.searchParams.get('q'));
      else if (url.pathname === '/spotify/public') data = await client.spotify(url.searchParams.get('url'));
      else if (url.pathname === '/health') data = { ok: true, accounts: false };
      else if (audioHandler) { audioHandler(req, res); return; }
      else { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.end(JSON.stringify(data));
    } catch (error) { res.writeHead(502); res.end(JSON.stringify({ error: error.message })); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const library = process.env.LIBRARY_PUBLIC_URL && process.env.LIBRARY_STORE_KEY ? createLibraryService({ publicUrl: process.env.LIBRARY_PUBLIC_URL, store: libraryStore(process.env.LIBRARY_STORE_FILE || fileURLToPath(new URL('./data/library.enc', import.meta.url)), process.env.LIBRARY_STORE_KEY), credentials: { spotify: { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET }, youtube: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } }) : null;
  musicServer({ audioHelper: true, library }).listen(Number(process.env.PORT || 8788), process.env.HOST || '127.0.0.1', () => console.log('BitChord public music helper listening; no account credentials required'));
}
