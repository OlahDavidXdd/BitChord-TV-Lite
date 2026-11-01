import { createYouTube, createSpotify, createHelper } from './audio-helper.mjs';
export { createYouTube, createSpotify, createHelper, runYtDlp } from './audio-helper.mjs';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const { create } = createRequire(import.meta.url)('../../shared/music-public.cjs');
export function musicServer({ audioHelper = false, request = async (url, body) => {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Music service request failed (${response.status})`);
  return response.text();
} } = {}) {
  const client = create({ request });
  let audioHandler;
  if (audioHelper) {
    const { create: sc } = createRequire(import.meta.url)('../../shared/soundcloud-public.cjs');
    const bootstrap = JSON.parse(readFileSync(new URL('../../shared/soundcloud-bootstrap.json', import.meta.url)));
    const soundcloud = sc({ ...bootstrap, request });
    const youtube = createYouTube();
    const spotify = createSpotify({ clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, youtube, market: process.env.SPOTIFY_MARKET });
    audioHandler = createHelper({ soundcloud, youtube, spotify }).listeners('request')[0];
  }
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(JSON.stringify({ error: 'GET required' })); return; }
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
  musicServer({ audioHelper: true }).listen(Number(process.env.PORT || 8788), process.env.HOST || '127.0.0.1', () => console.log('BitChord public music helper listening; no account credentials required'));
}
