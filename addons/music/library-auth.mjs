import { randomBytes, createHash } from 'node:crypto';
import { TokenStore } from '../soundcloud/oauth.mjs';
const random = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');
const fail = (status, message) => Object.assign(new Error(message), { status });
const providers = {
  spotify: { authorize: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token', api: 'https://api.spotify.com/v1', scope: 'playlist-read-private playlist-read-collaborative user-library-read' },
  youtube: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com/youtube/v3', scope: 'https://www.googleapis.com/auth/youtube.readonly' }
};
export function libraryStore(file, key) {
  if (Buffer.from(key || '', 'base64').length !== 32) throw Error('LIBRARY_STORE_KEY must encode 32 random bytes');
  return new TokenStore(file, key);
}
/** Read-only official OAuth. Service refresh tokens never go into the widget. */
export function createLibraryService({ publicUrl, credentials = {}, store, fetcher = fetch, now = Date.now }) {
  const origin = new URL(publicUrl);
  if (origin.protocol !== 'https:' || origin.origin !== publicUrl.replace(/\/$/, '') || origin.username || origin.password) throw Error('LIBRARY_PUBLIC_URL must be an HTTPS origin');
  const pending = new Map(), refreshing = new Map(), base = origin.origin;
  const enabled = name => !!(credentials[name]?.clientId && credentials[name]?.clientSecret);
  async function exchange(provider, fields, previous) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = { client_id: credentials[provider].clientId, ...fields };
    if (provider === 'spotify') headers.Authorization = 'Basic ' + Buffer.from(credentials[provider].clientId + ':' + credentials[provider].clientSecret).toString('base64'); else body.client_secret = credentials[provider].clientSecret;
    const response = await fetcher(providers[provider].token, { method: 'POST', headers, body: new URLSearchParams(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail(401, 'Account authorization failed. Connect the account again.');
    const data = await response.json();
    if (!data.access_token) throw fail(502, 'The account provider returned no access token.');
    return { access: data.access_token, refresh: data.refresh_token || previous?.refresh, expires: now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000 };
  }
  function session(req) {
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    const key = bearer && digest(bearer[1]), record = key && store.sessions[key];
    if (!record) throw fail(401, 'Connect this TV account first.');
    return { key, record };
  }
  async function access(key, record) {
    if (!record.tokens) throw fail(401, 'Finish signing in on this TV.');
    if (record.tokens.expires > now()) return record.tokens.access;
    if (!record.tokens.refresh) throw fail(401, 'Account authorization expired. Connect again.');
    if (!refreshing.has(key)) refreshing.set(key, (async () => {
      const tokens = await exchange(record.provider, { grant_type: 'refresh_token', refresh_token: record.tokens.refresh }, record.tokens);
      if (store.sessions[key] !== record) throw fail(401, 'Account disconnected.');
      record.tokens = tokens; store.save(); return tokens.access;
    })().finally(() => refreshing.delete(key)));
    return refreshing.get(key);
  }
  async function api(key, record, path) {
    const response = await fetcher(providers[record.provider].api + path, { headers: { Authorization: 'Bearer ' + await access(key, record) }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail(response.status, response.status === 403 ? 'Library access was denied. Check API activation, account access and the granted read permissions.' : response.status === 429 ? 'Library rate limit reached. Try again later.' : 'Library request failed (' + response.status + ').');
    return response.json();
  }
  const image = images => (images || [])[0]?.url || '';
  const spotifyTrack = item => ({ id: item.id, title: item.name || '', artist: (item.artists || []).map(a => a.name).join(', '), duration: Number(item.duration_ms || 0) / 1000, artworkURL: image(item.album?.images), source: 'Spotify' });
  const youtubeTrack = item => ({ id: item.snippet?.resourceId?.videoId || item.id, videoId: item.snippet?.resourceId?.videoId || item.id, title: item.snippet?.title || '', artist: item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || '', artworkURL: item.snippet?.thumbnails?.medium?.url || '', source: 'YouTube Music' });
  return async function library(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, base); let result;
      if (url.pathname === '/library/config' && req.method === 'GET') result = { spotify: enabled('spotify'), youtube: enabled('youtube'), privateLibraries: true, youtubeScope: 'YouTube playlists and liked videos; saved YouTube Music albums are not exposed by this API' };
      else if (url.pathname.startsWith('/library/connect/') && req.method === 'POST') {
        const provider = url.pathname.slice('/library/connect/'.length);
        if (!providers[provider] || !enabled(provider)) throw fail(503, 'The app publisher must configure this provider’s OAuth credentials on the library service first.');
        for (const [state, item] of pending) if (item.expires < now()) pending.delete(state);
        for (const [key, record] of Object.entries(store.sessions)) if (!record.tokens && record.pendingUntil < now()) delete store.sessions[key];
        if (pending.size >= 100) throw fail(429, 'Too many sign-ins. Try again later.');
        const device = random(), key = digest(device), state = random(), verifier = random(), redirect = base + '/library/callback/' + provider;
        pending.set(state, { key, provider, verifier, redirect, expires: now() + 600000 });
        store.sessions[key] = { provider, pendingUntil: now() + 600000 }; store.save();
        const authorization = new URL(providers[provider].authorize);
        authorization.search = new URLSearchParams({ client_id: credentials[provider].clientId, redirect_uri: redirect, response_type: 'code', scope: providers[provider].scope, state, code_challenge: digest(verifier), code_challenge_method: 'S256', ...(provider === 'youtube' ? { access_type: 'offline', prompt: 'consent select_account' } : {}) });
        result = { device, authorizeUrl: authorization.href, provider };
      } else if (url.pathname.startsWith('/library/callback/') && req.method === 'GET') {
        const state = url.searchParams.get('state'), item = pending.get(state); pending.delete(state);
        if (!item || item.expires < now() || url.pathname !== '/library/callback/' + item.provider) throw fail(400, 'This sign-in expired or its state was invalid. Start again from BitChord.');
        if (url.searchParams.get('error')) { if (store.sessions[item.key]) { store.sessions[item.key].error = 'Sign-in was cancelled. Connect the account again when ready.'; store.save(); } throw fail(400, 'Sign-in was cancelled. Return to BitChord.'); }
        const record = store.sessions[item.key]; if (!record) throw fail(401, 'This TV disconnected before sign-in completed.');
        record.tokens = await exchange(item.provider, { grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: item.redirect, code_verifier: item.verifier }); store.save();
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>BitChord connected</title><body style="background:#17171e;color:white;font:28px sans-serif;padding:50px"><h1>Account connected</h1><p>Return to BitChord on this TV to sync your library.</p>'); return;
      } else {
        const { key, record } = session(req), provider = record.provider;
        if (url.pathname === '/library/session' && req.method === 'GET') result = { provider, connected: !!record.tokens, expired: !record.tokens && record.pendingUntil < now(), error: record.error || null };
        else if (url.pathname === '/library/session' && req.method === 'DELETE') { delete store.sessions[key]; store.save(); result = { disconnected: true }; }
        else if (url.pathname === '/library/collections' && req.method === 'GET') {
          if (provider === 'spotify') {
            const albums = url.searchParams.get('type') === 'albums', offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('cursor')) || 0));
            const data = await api(key, record, (albums ? '/me/albums' : '/me/playlists') + '?limit=50&offset=' + offset);
            const items = (data.items || []).map(raw => { const item = raw.album || raw; return { id: item.id, title: item.name || '', artist: albums ? 'Spotify album' : 'Spotify playlist', artworkURL: image(item.images), type: albums ? 'album' : 'playlist' }; });
            if (!albums && !offset) items.unshift({ id: 'liked', title: 'Liked Songs', artist: 'Spotify', type: 'liked' });
            result = { items, cursor: data.next ? String(offset + 50) : null };
          } else {
            const cursor = (url.searchParams.get('cursor') || '').slice(0, 2048);
            const data = await api(key, record, '/playlists?' + new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50', ...(cursor ? { pageToken: cursor } : {}) }));
            const items = (data.items || []).map(item => ({ id: item.id, title: item.snippet?.title || '', artist: 'YouTube playlist', artworkURL: item.snippet?.thumbnails?.medium?.url || '', type: 'playlist' }));
            if (!cursor) items.unshift({ id: 'liked', title: 'Liked Videos & Music', artist: 'YouTube', type: 'liked' });
            result = { items, cursor: data.nextPageToken || null };
          }
        } else if (url.pathname === '/library/tracks' && req.method === 'GET') {
          const id = url.searchParams.get('id'), cursor = (url.searchParams.get('cursor') || '').slice(0, 2048);
          if (provider === 'spotify') {
            if (id !== 'liked' && !/^[A-Za-z0-9]{22}$/.test(id || '')) throw fail(400, 'Invalid library id.');
            const offset = Math.max(0, Math.min(100000, Number(cursor) || 0)), type = url.searchParams.get('type');
            let path = id === 'liked' ? '/me/tracks' : type === 'album' ? '/albums/' + id + '/tracks' : '/playlists/' + id + '/items';
            let data; try { data = await api(key, record, path + '?limit=50&offset=' + offset); } catch (error) { if (error.status !== 404 || id === 'liked' || type === 'album') throw error; data = await api(key, record, '/playlists/' + id + '/tracks?limit=50&offset=' + offset); }
            result = { tracks: (data.items || []).map(item => item.item || item.track || item).filter(item => item?.id).map(spotifyTrack), cursor: data.next ? String(offset + 50) : null };
          } else {
            if (id !== 'liked' && !/^[A-Za-z0-9_-]{10,128}$/.test(id || '')) throw fail(400, 'Invalid library id.');
            const data = await api(key, record, (id === 'liked' ? '/videos?' : '/playlistItems?') + new URLSearchParams({ part: 'snippet', maxResults: '50', ...(id === 'liked' ? { myRating: 'like' } : { playlistId: id }), ...(cursor ? { pageToken: cursor } : {}) }));
            result = { tracks: (data.items || []).map(youtubeTrack).filter(item => /^[A-Za-z0-9_-]{11}$/.test(item.videoId)), cursor: data.nextPageToken || null };
          }
        } else throw fail(404, 'Library endpoint not found.');
      }
      res.end(JSON.stringify(result));
    } catch (error) { if (res.headersSent) { res.destroy(); return; } res.statusCode = error.status || 502; res.end(JSON.stringify({ error: error.status ? error.message : 'Library service failed. Try again later.' })); }
  };
}
