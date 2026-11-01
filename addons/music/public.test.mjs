import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { musicServer } from './server.mjs';
const music = createRequire(import.meta.url)('../../shared/music-public.cjs');
const song = { musicResponsiveListItemRenderer: { playlistItemData: { videoId: 'abcdefghijk' }, flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Song' }] } } }, { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Artist' }] } } }], fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:12' }] } } }] } };
const yt = { contents: [{ contents: [song, song] }] };
const playlist = '<script type="application/json" id="__NEXT_DATA__">' + JSON.stringify({ props: { pageProps: { state: { data: { entity: { name: 'My list', trackList: [{ uri: 'spotify:track:123', title: 'Song', subtitle: 'Artist', duration: 192000 }] } } } } } }) + '</script>';
test('YouTube Music parser extracts playable songs and deduplicates repeated renderer data', () => {
  const rows = music.parseYouTube(yt); assert.equal(rows.length, 1); assert.equal(rows[0].videoId, 'abcdefghijk'); assert.equal(rows[0].duration, 192); assert.equal(rows[0].artist, 'Artist');
});
test('public Spotify metadata maps tracks and rejects private, malformed and arbitrary URLs', () => {
  const data = music.parseSpotify(playlist); assert.equal(data.title, 'My list'); assert.equal(data.tracks[0].duration, 192);
  assert.throws(() => music.parseSpotify('login required'), /public playlist/);
  assert.throws(() => music.spotifyLink('https://evil.example/playlist/123'));
  assert.throws(() => music.spotifyLink('https://open.spotify.com.evil.example/playlist/' + 'a'.repeat(22)));
  assert.equal(music.spotifyLink('https://open.spotify.com/intl-en/playlist/' + 'a'.repeat(22) + '?si=123').id, 'a'.repeat(22));
});
test('Spotify matching refuses unrelated tracks and prefers the recording over covers', () => {
  const wanted = { title: 'Song', artist: 'Artist', duration: 192 };
  const original = { ...wanted, videoId: 'original' }, cover = { ...wanted, title: 'Song cover', videoId: 'cover' };
  assert.equal(music.matchTrack(wanted, [cover, original]).videoId, 'original');
  assert.equal(music.matchTrack(wanted, [{ title: 'Different', artist: 'Other' }]), null);
});
test('searches coalesce and use the YouTube Music endpoint without account credentials', async () => {
  let calls = 0;
  const api = music.create({ request: async (url, body) => { calls++; assert.equal(new URL(url).hostname, 'music.youtube.com'); assert.equal(body.context.client.clientName, 'WEB_REMIX'); return yt; } });
  const [a, b] = await Promise.all([api.search('Song'), api.search('Song')]);
  assert.deepEqual(a, b); assert.equal(calls, 1); await api.search('Song'); assert.equal(calls, 1);
});
test('free helper serves parsed metadata and cannot proxy arbitrary destinations', async t => {
  const server = musicServer({ request: async url => url.includes('/embed/') ? playlist : yt });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/youtube/search?q=Song'); assert.equal(response.status, 200); assert.equal((await response.json()).tracks.length, 1);
  assert.equal((await fetch(base + '/spotify/public?url=https://evil.example')).status, 502);
  assert.equal((await fetch(base + '/youtube/search?q=Song', { method: 'POST' })).status, 405);
});

test('a rejected YouTube search refreshes current public client configuration and retries once',async()=>{
 let posts=0,gets=0;
 const api=music.create({request:async(url,body)=>{
  if(!body){gets++;return 'ytcfg.set({"INNERTUBE_CLIENT_VERSION":"1.current.01","INNERTUBE_API_KEY":"public-key","VISITOR_DATA":"public-visitor"});';}
  posts++;if(posts===1)throw Object.assign(Error('Forbidden'),{status:403});
  assert.equal(new URL(url).searchParams.get('key'),'public-key');assert.equal(body.context.client.clientVersion,'1.current.01');assert.equal(body.context.client.visitorData,'public-visitor');return yt;
 }});
 assert.equal((await api.search('Song')).tracks.length,1);assert.equal(posts,2);assert.equal(gets,1);
 await api.search('Song');assert.equal(posts,2);
});
test('persistent YouTube rejection stops retrying and explains the helper requirement',async()=>{
 let posts=0;
 const api=music.create({request:async(url,body)=>{if(!body)return '{"INNERTUBE_CLIENT_VERSION":"1.current","INNERTUBE_API_KEY":"public-key"}';posts++;throw Object.assign(Error('Forbidden'),{status:403});}});
 await assert.rejects(api.search('Song'),error=>error.code==='YOUTUBE_DIRECT_FORBIDDEN'&&/Music helper/.test(error.message));assert.equal(posts,2);
});
