import http from 'node:http';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSoundCloud, createServer } from './server.mjs';

const random = () => randomBytes(32).toString('base64url');
const failure = (status, message) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest('base64url');

// All refresh tokens and bearer URLs remain encrypted on disk between restarts.
export class TokenStore {
  constructor(file, key) {
    this.file = file; this.key = Buffer.from(key, 'base64'); this.sessions = {};
    if (this.key.length !== 32) throw Error('SOUNDCLOUD_STORE_KEY must encode 32 random bytes');
    try {
      const data = readFileSync(file);
      const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      this.sessions = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    } catch (e) { if (e.code !== 'ENOENT') throw Error('Cannot decrypt OAuth store; preserve the original store key'); }
  }
  save() {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(this.sessions)), cipher.final()]);
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
    renameSync(this.file + '.tmp', this.file);
  }
}

export function createOAuthServer({ publicUrl, clientId, clientSecret, store, fetcher = fetch, now = Date.now }) {
  const origin = new URL(publicUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error('PUBLIC_URL must be an HTTPS origin');
  if (!clientId || !clientSecret) throw Error('SoundCloud OAuth application credentials are required');
  const base = origin.origin, redirectUri = base + '/callback', pending = new Map(), refreshes = new Map(), handlers = new Map();
  async function token(body) {
    const r = await fetcher('https://secure.soundcloud.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }), signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw failure(502, 'SoundCloud authorization failed. Please sign in again.');
    const data = await r.json();
    if (!data.access_token || !data.refresh_token) throw failure(502, 'Invalid SoundCloud token response');
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expires: now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000 };
  }
  async function access(key) {
    const session = store.sessions[key];
    if (!session) throw failure(401, 'Sign in to SoundCloud again');
    if (session.expires > now()) return session.accessToken;
    if (!refreshes.has(key)) refreshes.set(key, (async () => {
      const next = await token({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
      if (store.sessions[key] !== session) throw failure(401, 'Disconnected');
      Object.assign(session, next); store.save(); return next.accessToken;
    })().finally(() => refreshes.delete(key)));
    return refreshes.get(key);
  }
  function addon(key) {
    if (!handlers.has(key)) handlers.set(key, createServer(createSoundCloud({ getAccessToken: () => access(key), fetcher })));
    return handlers.get(key);
  }
  function purge() {
    for (const [id, value] of pending) if (value.deadline <= now()) pending.delete(id);
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const page = message => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>BitChord SoundCloud</title><body style="background:#15121e;color:white;font:22px sans-serif;padding:32px"><h1>BitChord · SoundCloud</h1><p>' + message + '</p>'); };
    try {
      purge(); const url = new URL(req.url, base);
      if (req.method === 'GET' && url.pathname === '/health') { send(200, { ok: true }); return; }
      if (req.method === 'POST' && url.pathname === '/pair') {
        if (pending.size >= 500) throw failure(429, 'Too many sign-in attempts. Try later.');
        const id = random(), key = random(), ticket = random();
        pending.set(id, { key, ticket, deadline: now() + 600000 });
        send(200, { pairId: id, key, loginUrl: base + '/authorize?id=' + id + '&ticket=' + ticket }); return;
      }
      const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
      const pairMatch = /^\/pair\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
      if (pairMatch && req.method === 'GET') {
        const pair = pending.get(pairMatch[1]);
        if (!pair || pair.key !== bearer) throw failure(401, 'Sign-in expired. Start again.');
        send(200, pair.connected ? { connected: true, addonUrl: base + '/addon/' + pair.key } : { connected: false, failed: !!pair.failed }); return;
      }
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const pair = pending.get(url.searchParams.get('id'));
        if (!pair || !pair.ticket || pair.ticket !== url.searchParams.get('ticket')) throw failure(400, 'Sign-in link expired');
        delete pair.ticket; pair.state = random(); pair.verifier = random();
        const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state: pair.state, code_challenge: hash(pair.verifier), code_challenge_method: 'S256' });
        res.writeHead(302, { Location: 'https://secure.soundcloud.com/authorize?' + params }); res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/callback') {
        const state = url.searchParams.get('state');
        const pair = state && [...pending.values()].find(p => p.state === state);
        if (!pair || !pair.verifier) throw failure(400, 'Invalid or expired sign-in state');
        const verifier = pair.verifier; delete pair.verifier; delete pair.state;
        if (url.searchParams.has('error') || !url.searchParams.get('code')) { pair.failed = true; page('Sign-in was cancelled. Return to BitChord to try again.'); return; }
        try {
          store.sessions[pair.key] = await token({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri, code_verifier: verifier });
          store.save(); pair.connected = true;
        } catch (error) { pair.failed = true; throw error; }
        page('Connected. Return to BitChord; SoundCloud will be added automatically.'); return;
      }
      if (req.method === 'DELETE' && url.pathname === '/session') {
        if (!bearer || !store.sessions[bearer]) throw failure(401, 'Not connected');
        const session = store.sessions[bearer];
        const response = await fetcher('https://api.soundcloud.com/disconnect', { method: 'POST', headers: { Authorization: 'OAuth ' + session.accessToken }, signal: AbortSignal.timeout(15000) });
        if (!response.ok && response.status !== 401) throw failure(502, 'SoundCloud could not be disconnected. Try again.');
        delete store.sessions[bearer]; handlers.delete(bearer); store.save();
        for (const [id, pair] of pending) if (pair.key === bearer) pending.delete(id);
        send(200, { disconnected: true }); return;
      }
      const match = /^\/addon\/([A-Za-z0-9_-]{43})(\/.*)$/.exec(url.pathname);
      if (match && ['GET', 'OPTIONS'].includes(req.method)) {
        if (!store.sessions[match[1]]) throw failure(401, 'Sign in to SoundCloud again');
        req.url = match[2] + url.search; addon(match[1]).emit('request', req, res); return;
      }
      throw failure(404, 'Not found');
    } catch (error) { send(error.status || 500, { error: error.status ? error.message : 'Login service unavailable' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new TokenStore(process.env.SOUNDCLOUD_STORE_FILE || './data/soundcloud.enc', process.env.SOUNDCLOUD_STORE_KEY || '');
  createOAuthServer({ publicUrl: process.env.PUBLIC_URL, clientId: process.env.SOUNDCLOUD_CLIENT_ID, clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET, store })
    .listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('SoundCloud login service ready'));
}
