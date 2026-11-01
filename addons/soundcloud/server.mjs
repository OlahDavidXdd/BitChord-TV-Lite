import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const manifest = { id: 'bitchord.soundcloud', name: 'SoundCloud', version: '1.0.0', resources: ['search', 'stream'], allowDownloads: false };
const fail = (status, message) => Object.assign(new Error(message), { status });

export function createSoundCloud({ clientId, clientSecret, accessToken, fetcher = fetch } = {}) {
  let token = accessToken, expires = accessToken ? Infinity : 0, refreshToken, pending;
  async function authenticate() {
    if (token && Date.now() < expires) return token;
    if (!pending) pending = (async () => {
      if (!clientId || !clientSecret) throw fail(503, 'Configure SoundCloud API credentials on the addon server');
      const body = new URLSearchParams(refreshToken
        ? { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }
        : { grant_type: 'client_credentials' });
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (!refreshToken) headers.Authorization = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
      const r = await fetcher('https://secure.soundcloud.com/oauth/token', { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw fail(503, 'SoundCloud authentication failed');
      const data = await r.json();
      if (!data.access_token) throw fail(502, 'Invalid SoundCloud token response');
      token = data.access_token; refreshToken = data.refresh_token;
      expires = Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000;
      return token;
    })().finally(() => { pending = undefined; });
    return pending;
  }
  async function api(path) {
    const r = await fetcher('https://api.soundcloud.com' + path, {
      headers: { Authorization: 'OAuth ' + await authenticate(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw fail([401, 403, 404, 429].includes(r.status) ? r.status : 502,
      r.status === 429 ? 'SoundCloud rate limit reached; try again later' : 'SoundCloud request failed (' + r.status + ')');
    return r.json();
  }
  return {
    async search(q) {
      if (!q.trim()) return { tracks: [] };
      const data = await api('/tracks?' + new URLSearchParams({ q, access: 'playable', limit: '30', linked_partitioning: 'true' }));
      return { tracks: (Array.isArray(data) ? data : data.collection || []).filter(t => t.access !== 'blocked' && t.access !== 'preview' && t.streamable !== false).map(t => ({
        id: String(t.urn || t.id), title: t.title, artist: t.metadata_artist || t.user?.username || '',
        duration: Number(t.duration || 0) / 1000, artworkURL: t.artwork_url || t.user?.avatar_url,
        permalinkURL: t.permalink_url, uploader: t.user?.username || '', source: 'SoundCloud'
      })) };
    },
    async stream(id) {
      if (!/^(urn:soundcloud:tracks:)?\d+$/.test(id)) throw fail(400, 'Invalid SoundCloud track id');
      const track = await api('/tracks/' + encodeURIComponent(id));
      if (track.access === 'blocked' || track.access === 'preview' || track.streamable === false) throw fail(403, 'Track is unavailable for full playback');
      const streams = await api('/tracks/' + encodeURIComponent(id) + '/streams');
      const url = streams.http_mp3_128_url || streams.hls_aac_160_url || streams.hls_mp3_128_url;
      if (!url || !/^https:\/\//.test(url)) throw fail(404, 'No supported SoundCloud stream');
      const hls = !streams.http_mp3_128_url;
      return { url, format: streams.hls_aac_160_url === url ? 'aac' : 'mp3', manifest: hls ? 'hls' : 'none', encrypted: false };
    }
  };
}

export function createServer(client) {
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    try {
      if (req.method !== 'GET') throw fail(405, 'Use GET');
      const url = new URL(req.url, 'http://localhost');
      let body;
      if (url.pathname === '/manifest.json') body = manifest;
      else if (url.pathname === '/search') {
        const q = url.searchParams.get('q') || '';
        if (q.length > 300) throw fail(400, 'Query too long');
        body = await client.search(q);
      } else if (url.pathname.startsWith('/stream/')) body = await client.stream(decodeURIComponent(url.pathname.slice(8)));
      else throw fail(404, 'Not found');
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = err.status || 502;
      if (res.statusCode === 429) res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: err.status ? err.message : 'SoundCloud is temporarily unavailable' }));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(createSoundCloud({ clientId: process.env.SOUNDCLOUD_CLIENT_ID, clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET, accessToken: process.env.SOUNDCLOUD_ACCESS_TOKEN }));
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('SoundCloud addon listening on port ' + (process.env.PORT || 8787)));
}
