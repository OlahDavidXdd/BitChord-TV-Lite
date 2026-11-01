import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundCloud, createServer } from './server.mjs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('search maps official fields, filters restricted tracks, and never exposes credentials', async () => {
  const client = createSoundCloud({ accessToken: 'secret', fetcher: async (url, options) => {
    assert.equal(new URL(url).searchParams.get('q'), 'hello & world');
    assert.equal(options.headers.Authorization, 'OAuth secret');
    return json({ collection: [{ urn: 'urn:soundcloud:tracks:123', title: 'Song', duration: 123000, metadata_artist: 'Artist', user: { username: 'Uploader' }, access: 'playable' }, { id: 2, access: 'blocked' }, { id: 3, access: 'preview' }] });
  } });
  const result = await client.search('hello & world');
  assert.equal(result.tracks.length, 1); assert.equal(result.tracks[0].duration, 123);
  assert.equal(result.tracks[0].id, 'urn:soundcloud:tracks:123'); assert.equal(result.tracks[0].artist, 'Artist');
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('streams declare HLS correctly, reject restricted access and invalid ids', async () => {
  let blocked = false;
  const client = createSoundCloud({ accessToken: 'secret', fetcher: async url => url.endsWith('/streams')
    ? json({ hls_aac_160_url: 'https://cdn.soundcloud.com/song.m3u8' }) : json({ access: blocked ? 'blocked' : 'playable' }) });
  assert.deepEqual(await client.stream('123'), { url: 'https://cdn.soundcloud.com/song.m3u8', format: 'aac', manifest: 'hls', encrypted: false });
  blocked = true; await assert.rejects(client.stream('123'), { status: 403 });
  await assert.rejects(client.stream('../me'), { status: 400 });
});
test('concurrent searches share one client-credentials token request', async () => {
  let tokens = 0;
  const client = createSoundCloud({ clientId: 'id', clientSecret: 'secret', fetcher: async (url, options) => {
    if (url.includes('/oauth/token')) { tokens++; assert.equal(options.headers.Authorization, 'Basic aWQ6c2VjcmV0'); return json({ access_token: 'token', expires_in: 3600 }); }
    return json({ collection: [] });
  } });
  await Promise.all([client.search('one'), client.search('two')]); assert.equal(tokens, 1);
});
test('HTTP manifest, CORS, search, validation and rate-limit handling', async t => {
  const server = createServer({ search: async q => ({ tracks: [{ id: '1', title: q }] }), stream: async () => { throw Object.assign(new Error('Rate limit'), { status: 429 }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const manifest = await fetch(base + '/manifest.json'); assert.equal(manifest.headers.get('access-control-allow-origin'), '*');
  assert.equal((await manifest.json()).allowDownloads, false);
  assert.equal((await (await fetch(base + '/search?q=hello')).json()).tracks[0].title, 'hello');
  const rate = await fetch(base + '/stream/123'); assert.equal(rate.status, 429); assert.equal(rate.headers.get('retry-after'), '60');
  assert.equal((await fetch(base + '/search?q=' + 'a'.repeat(301))).status, 400);
  assert.equal((await fetch(base + '/anything')).status, 404);
});
