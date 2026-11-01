import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { TokenStore, createOAuthServer } from './oauth.mjs';
const json = data => new Response(JSON.stringify(data));
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bitchord-oauth-')), key = randomBytes(32).toString('base64');
  const file = join(dir, 'tokens.enc'), store = new TokenStore(file, key);
  let clock = 100000, refreshes = 0, verifier, revoked = false;
  const server = createOAuthServer({ publicUrl: 'https://login.example', clientId: 'app-id', clientSecret: 'app-secret', store, now: () => clock,
    fetcher: async (url, options) => {
      if (url.includes('/oauth/token')) {
        assert.equal(options.body.get('client_secret'), 'app-secret');
        if (options.body.get('grant_type') === 'refresh_token') { refreshes++; assert.equal(options.body.get('refresh_token'), 'refresh-secret'); }
        else { verifier = options.body.get('code_verifier'); assert.equal(options.body.get('redirect_uri'), 'https://login.example/callback'); }
        return json({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 });
      }
      if (url.endsWith('/disconnect')) { revoked = true; return new Response(null, { status: 204 }); }
      assert.equal(options.headers.Authorization, 'OAuth access-secret');
      return json({ collection: [{ id: 123, title: 'Music', user: { username: 'Artist' }, access: 'playable', duration: 1000 }] });
    } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  return { store, file, key, base, advance: () => { clock += 3600001; }, refreshCount: () => refreshes, verifier: () => verifier, revoked: () => revoked };
}
async function pair(base) {
  const data = await (await fetch(base + '/pair', { method: 'POST' })).json();
  const login = new URL(data.loginUrl);
  const response = await fetch(base + login.pathname + login.search, { redirect: 'manual' });
  assert.equal(response.status, 302);
  return { ...data, authorize: new URL(response.headers.get('location')) };
}
async function connect(base, data) {
  return fetch(base + '/callback?state=' + data.authorize.searchParams.get('state') + '&code=valid-code');
}
test('OAuth PKCE and state bind login to one device; addon receives user token server-side', async t => {
  const env = await setup(t), data = await pair(env.base);
  assert.equal((await fetch(env.base + '/callback?state=wrong&code=x')).status, 400);
  assert.equal((await fetch(env.base + '/pair/' + data.pairId)).status, 401);
  assert.equal((await connect(env.base, data)).status, 200);
  assert.equal(createHash('sha256').update(env.verifier()).digest('base64url'), data.authorize.searchParams.get('code_challenge'));
  assert.equal((await connect(env.base, data)).status, 400); // callback cannot be replayed
  const result = await (await fetch(env.base + '/pair/' + data.pairId, { headers: { Authorization: 'Bearer ' + data.key } })).json();
  assert.equal(result.addonUrl, 'https://login.example/addon/' + data.key);
  assert.ok(!JSON.stringify(result).includes('access-secret'));
  const search = await fetch(env.base + '/addon/' + data.key + '/search?q=hello');
  assert.equal((await search.json()).tracks[0].title, 'Music');
  assert.ok(!readFileSync(env.file).toString().includes('refresh-secret'));
  assert.equal(new TokenStore(env.file, env.key).sessions[data.key].refreshToken, 'refresh-secret');
});
test('concurrent playback searches refresh a user session only once', async t => {
  const env = await setup(t), data = await pair(env.base); await connect(env.base, data); env.advance();
  const results = await Promise.all([1, 2, 3].map(() => fetch(env.base + '/addon/' + data.key + '/search?q=music')));
  assert.ok(results.every(r => r.status === 200)); assert.equal(env.refreshCount(), 1);
});
test('disconnect revokes SoundCloud token and removes persistent addon access', async t => {
  const env = await setup(t), data = await pair(env.base); await connect(env.base, data);
  const response = await fetch(env.base + '/session', { method: 'DELETE', headers: { Authorization: 'Bearer ' + data.key } });
  assert.equal(response.status, 200); assert.ok(env.revoked());
  assert.equal((await fetch(env.base + '/addon/' + data.key + '/manifest.json')).status, 401);
  assert.equal(new TokenStore(env.file, env.key).sessions[data.key], undefined);
});
test('cancelled and expired sign-ins cannot create an addon session', async t => {
  const env = await setup(t), data = await pair(env.base);
  await fetch(env.base + '/callback?state=' + data.authorize.searchParams.get('state') + '&error=access_denied');
  const result = await (await fetch(env.base + '/pair/' + data.pairId, { headers: { Authorization: 'Bearer ' + data.key } })).json();
  assert.equal(result.failed, true); assert.equal(env.store.sessions[data.key], undefined);
  env.advance(); assert.equal((await fetch(env.base + '/pair/' + data.pairId, { headers: { Authorization: 'Bearer ' + data.key } })).status, 401);
});
test('encrypted store refuses missing/wrong encryption key', async t => {
  const env = await setup(t); env.store.sessions.test = { refreshToken: 'secret' }; env.store.save();
  assert.throws(() => new TokenStore(env.file, ''), /32 random bytes/);
  assert.throws(() => new TokenStore(env.file, randomBytes(32).toString('base64')), /Cannot decrypt/);
});
test('TV/browser pairing supports Authorization CORS preflight without cookies', async t => {
  const env = await setup(t);
  const response = await fetch(env.base + '/pair/device', { method: 'OPTIONS', headers: { Origin: 'https://tv.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
});
