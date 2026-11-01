import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYouTube, createSpotify, createHelper } from './server.mjs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const entry = (id, duration = 200, extra = {}) => ({ id, title: 'Song ' + id, channel: 'Artist - Topic', duration, ...extra });
const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', LONG = 'ccccccccccc';

test('YouTube search maps songs, drops shorts/long mixes and invalid ids, and queries safely', async () => {
  const calls = []; const yt = createYouTube({ run: async args => { calls.push(args); return JSON.stringify({ entries: [entry(A), entry(LONG, 7200), entry(B, 10), entry('bad id', 200)] }); } });
  const result = await yt.search('--exec evil');
  assert.deepEqual(result.tracks.map(t => t.id), [A]); assert.equal(result.tracks[0].artist, 'Artist');
  assert.equal(calls[0].at(-2), '--'); assert.equal(calls[0].at(-1), 'ytsearch25:--exec evil');
});
test('YouTube streams are proxied through the helper and cached', async () => {
  let runs = 0; const yt = createYouTube({ run: async () => { runs++; return 'https://rr1.googlevideo.com/audio?x=1\n'; } });
  assert.equal((await yt.stream(A, { origin: 'http://tv.local:8787' })).url, 'http://tv.local:8787/yt/audio/' + A);
  await yt.stream(A, { origin: 'http://tv.local:8787' }); assert.equal(runs, 1);
  await assert.rejects(yt.stream('../x', { origin: 'http://x' }), { status: 400 });
});
test('Spotify searches the catalogue and matches the closest YouTube audio by duration', async () => {
  let tokens = 0;
  const youtube = createYouTube({ run: async args => args.includes('-g') ? 'https://rr.googlevideo.com/a\n' : JSON.stringify({ entries: [entry(A, 260), entry(B, 214)] }) });
  const sp = createSpotify({ clientId: 'id', clientSecret: 'secret', youtube, fetcher: async (url, options) => {
    if (url.includes('/api/token')) { tokens++; assert.equal(options.headers.Authorization, 'Basic aWQ6c2VjcmV0'); return json({ access_token: 't', expires_in: 3600 }); }
    assert.equal(options.headers.Authorization, 'Bearer t');
    return json({ tracks: { items: [{ id: '4uLU6hMCjMI75M1A2tKUQC', name: 'Never Gonna', artists: [{ name: 'Rick' }], duration_ms: 213000, album: { images: [{ url: 'big' }, { url: 'mid' }] }, external_urls: { spotify: 'https://open.spotify.com/track/x' } }, { id: 'x' }] } });
  } });
  const found = await sp.search('never'); assert.equal(found.tracks.length, 1); assert.equal(found.tracks[0].artworkURL, 'mid'); assert.equal(found.tracks[0].duration, 213);
  assert.equal((await sp.stream('4uLU6hMCjMI75M1A2tKUQC', { origin: 'http://h' })).url, 'http://h/yt/audio/' + B); assert.equal(tokens, 1);
  await assert.rejects(createSpotify({ youtube }).search('x'), { status: 503 });
});
test('helper routes sources, keeps the old SoundCloud root, proxies ranges and reports unconfigured sources', async t => {
  const youtube = createYouTube({ run: async () => 'https://rr.googlevideo.com/a\n' });
  const soundcloud = { search: async q => ({ tracks: [{ id: '1', title: q }] }), stream: async () => ({ url: 'https://x/y.mp3' }) };
  let range; const server = createHelper({ soundcloud, youtube, fetcher: async (url, options) => { range = options.headers.Range; return new Response('abc', { status: 206, headers: { 'content-type': 'audio/mp4', 'content-range': 'bytes 0-2/10' } }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await (await fetch(base + '/search?q=a')).json()).tracks[0].title, 'a');
  assert.equal((await (await fetch(base + '/soundcloud/search?q=b')).json()).tracks[0].title, 'b');
  assert.equal((await (await fetch(base + '/yt/manifest.json')).json()).name, 'YouTube Music');
  assert.equal((await (await fetch(base + '/yt/stream/' + A)).json()).url, base + '/yt/audio/' + A);
  const audio = await fetch(base + '/yt/audio/' + A, { headers: { Range: 'bytes=0-2' } });
  assert.equal(audio.status, 206); assert.equal(range, 'bytes=0-2'); assert.equal(await audio.text(), 'abc'); assert.equal(audio.headers.get('content-range'), 'bytes 0-2/10');
  assert.equal((await fetch(base + '/spotify/search?q=a')).status, 503);
  assert.equal((await fetch(base + '/yt/search?q=' + 'a'.repeat(301))).status, 400);
});
