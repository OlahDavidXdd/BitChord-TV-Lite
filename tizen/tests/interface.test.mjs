import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
const app = new URL('../app/', import.meta.url);
const read = name => readFileSync(new URL(name, app), 'utf8');
async function setup(t, routes = () => ({ status: 404, body: { error: 'Not found' } })) {
  const window = new Window({ url: 'https://preview.example', width: 1920, height: 1080, settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => window.happyDOM.close());
  window.document.write(read('index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace('<link rel="stylesheet" href="style.css">', '<style>' + read('style.css') + '</style>'));
  const calls = [];
  window.XMLHttpRequest = class {
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send() { calls.push(this); const result = routes(this); this.status = result.status ?? 200; this.responseText = JSON.stringify(result.body); this.onload?.(); }
  };
  const av = { state: 'IDLE', position: 0, duration: 120000, open(url) { this.url = url; }, close() {}, stop() { this.state = 'IDLE'; },
    setListener(listener) { this.listener = listener; }, prepareAsync(done) { done(); }, play() { this.state = 'PLAYING'; }, pause() { this.state = 'PAUSED'; },
    getDuration() { return this.duration; }, getCurrentTime() { return this.position; }, seekTo(ms) { this.position = ms; } };
  window.webapis = { avplay: av }; window.BITCHORD_CONFIG = {};
  for (const name of ['soundcloud-bootstrap.js', 'soundcloud-public.js', 'app.js', 'soundcloud-free.js', 'tv-services.js']) window.eval(read(name));
  return { window, document: window.document, calls, av, el: id => window.document.getElementById(id),
    submit(id) { window.document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } };
}
test('top tabs, settings and Return restore navigation and SoundCloud is the default source', async t => {
  const ui = await setup(t);
  assert.equal(ui.el('view-home').hidden, false); assert.equal(ui.el('home-empty').hidden, false);
  assert.equal(ui.document.activeElement.textContent, 'Home');
  ui.document.querySelector('[data-view="settings"]').click(); assert.equal(ui.el('view-settings').hidden, false);
  assert.match(ui.el('view-settings').textContent, /YouTube Music/); assert.match(ui.el('view-settings').textContent, /Spotify/);
  assert.equal(ui.calls.length, 0); assert.equal(ui.window.localStorage.getItem('bitchord-addon'), null);
});
test('YouTube Music and Spotify need the helper, then search through it', async t => {
  const ui = await setup(t, request => request.url.includes('/yt/search?') ? { body: { tracks: [{ id: 'aaaaaaaaaaa', title: 'YT Song', artist: 'A' }] } } : { body: { tracks: [{ id: '4uLU6hMCjMI75M1A2tKUQC', title: 'SP Song', artist: 'B' }] } });
  ui.el('yt-enable').click(); assert.match(ui.el('sc-status').textContent, /helper server URL/); assert.equal(ui.calls.length, 0);
  ui.el('sc-helper').value = 'http://192.168.1.10:8787/'; ui.submit('sc-helper-form');
  ui.el('yt-enable').click(); assert.equal(ui.window.localStorage.getItem('bitchord-addon'), 'http://192.168.1.10:8787/yt');
  ui.el('query').value = 'x'; ui.submit('search'); assert.equal(ui.calls.at(-1).url, 'http://192.168.1.10:8787/yt/search?q=x'); assert.equal(ui.el('results').querySelectorAll('button').length, 1);
  ui.el('sp-enable').click(); assert.equal(ui.window.localStorage.getItem('bitchord-addon'), 'http://192.168.1.10:8787/spotify');
  ui.el('query').value = 'y'; ui.submit('search'); assert.match(ui.calls.at(-1).url, /\/spotify\/search\?q=y$/);
});
test('a stream the TV cannot prepare falls back to the next one, and AVPlay is always closed', async t => {
  const ui = await setup(t, request => request.url.includes('/search?') ? { body: { tracks: [{ id: '1', title: 'Song', artist: 'A' }] } } : request.url.includes('/manifest.json') ? { body: { id: 't', name: 'T' } }
    : { body: { url: 'https://cdn.example/bad.m3u8', alternates: [{ url: 'https://cdn.example/good.mp3' }], encrypted: false } });
  let closed = 0; ui.av.close = () => { closed++; }; ui.av.stop = () => { throw new Error('InvalidStateError'); };
  ui.av.prepareAsync = (ok, fail) => (ui.av.url.endsWith('bad.m3u8') ? fail() : ok());
  ui.el('addon').value = 'https://music.example'; ui.submit('settings');
  ui.window.BitChordPlayer.show('search'); ui.el('query').value = 'song'; ui.submit('search'); ui.el('results').querySelector('button').click();
  assert.equal(ui.av.url, 'https://cdn.example/good.mp3'); assert.equal(ui.av.state, 'PLAYING'); assert.ok(closed >= 1);
});
test('addon search plays a real result with Samsung AVPlay, supports seek, favorites and recent history', async t => {
  const ui = await setup(t, request => {
    if (request.url.endsWith('/manifest.json')) return { body: { id: 'test', name: 'Music' } };
    if (request.url.includes('/search?')) return { body: { tracks: [{ id: '123', title: 'Test Song', artist: 'Test Artist', duration: 120, artworkURL: 'https://cdn.example/art.jpg' }] } };
    if (request.url.endsWith('/stream/123')) return { body: { url: 'https://cdn.example/track.m3u8', manifest: 'hls', encrypted: false } };
    return { status: 404, body: { error: 'Missing fixture' } };
  });
  ui.el('addon').value = 'https://music.example'; ui.submit('settings');
  ui.window.BitChordPlayer.show('search'); ui.el('query').value = 'test'; ui.submit('search');
  ui.el('results').querySelector('button').click();
  assert.equal(ui.el('view-playing').hidden, false); assert.equal(ui.av.state, 'PLAYING');
  assert.equal(ui.av.url, 'https://cdn.example/track.m3u8'); assert.equal(ui.el('player-title').textContent, 'Test Song');
  ui.el('toggle').click(); assert.equal(ui.av.state, 'PAUSED');
  ui.el('forward').click(); assert.equal(ui.av.position, 10000);
  assert.notEqual(ui.window.getComputedStyle(ui.el('favorite').parentElement).display, 'none');
  ui.el('favorite').click(); assert.equal(ui.el('favorite').textContent, '♥');
  ui.el('close-player').click(); ui.window.BitChordPlayer.show('library'); assert.equal(ui.el('library-cards').querySelectorAll('button').length, 1);
  ui.window.BitChordPlayer.show('home'); assert.equal(ui.el('home-empty').hidden, true); assert.equal(ui.el('home-cards').querySelectorAll('button').length, 1);
});
test('free public SoundCloud enables without login and plays a resolved stream', async t => {
  const ui = await setup(t, request => {
    if (request.url.includes('/search/tracks?')) return { body: { collection: [{ id: 123, title: 'Public Music', user: { username: 'Artist' }, duration: 120000, policy: 'ALLOW', streamable: true, media: { transcodings: [{ url: 'https://api-v2.soundcloud.com/media/test/stream/hls', quality: 'sq', format: { protocol: 'hls', mime_type: 'audio/mpegurl' } }] } }] } };
    if (request.url.includes('/media/')) return { body: { url: 'https://cf-hls-media.sndcdn.com/audio.m3u8' } };
    return { status: 404, body: { error: 'Missing fixture' } };
  });
  ui.el('sc-free-enable').click(); assert.equal(ui.window.localStorage.getItem('bitchord-addon'), 'soundcloud:public');
  ui.el('query').value = 'song'; ui.submit('search'); await new Promise(setImmediate);
  ui.el('results').querySelector('button').click(); await new Promise(setImmediate);
  assert.equal(ui.av.state, 'PLAYING'); assert.equal(ui.av.url, 'https://cf-hls-media.sndcdn.com/audio.m3u8');
  assert.equal(ui.document.querySelector('#sc-login'), null);
});
test('glass option persists and does not trigger network requests', async t => {
  const ui = await setup(t); assert.equal(ui.el('glass-toggle').getAttribute('aria-pressed'), 'false');
  ui.el('glass-toggle').click(); assert.equal(ui.el('glass-value').textContent, 'On'); assert.equal(ui.el('tv-shell').classList.contains('glass-on'), true);
  assert.equal(ui.window.localStorage.getItem('bitchord-tv-glass'), 'on'); assert.equal(ui.calls.length, 0);
  ui.el('glass-toggle').click(); assert.equal(ui.el('glass-value').textContent, 'Off');
});
test('Return on the player closes its screen while the song keeps playing', async t => {
  const ui = await setup(t, request => {
    if (request.url.includes('/manifest.json')) return { body: { id: 'test', name: 'Test' } };
    if (request.url.includes('/search?')) return { body: { tracks: [{ id: '1', title: 'Song', artist: 'Artist' }] } };
    return { body: { url: 'https://cdn.example/song.mp3', encrypted: false } };
  });
  ui.el('addon').value = 'https://music.example'; ui.submit('settings');
  ui.window.BitChordPlayer.show('search'); ui.el('query').value = 'song'; ui.submit('search');
  ui.el('results').querySelector('button').click();
  assert.equal(ui.av.state, 'PLAYING');
  ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { keyCode: 10009, bubbles: true }));
  assert.equal(ui.el('view-playing').hidden, true); assert.equal(ui.el('view-search').hidden, false);
  assert.equal(ui.av.state, 'PLAYING');
});

test('provider shortcuts launch discovered TV apps without pretending accounts are linked', async t => {
  const ui = await setup(t), launched = [];
  ui.window.tizen = { application: { getAppsInfo: done => done([{ id: 'youtube-test', name: 'YouTube' }, { id: 'spotify-test', name: 'Spotify' }]), launch: id => launched.push(id) } };
  ui.el('open-youtube').click(); ui.el('open-spotify').click();
  assert.deepEqual(launched, ['youtube-test', 'spotify-test']); assert.match(ui.el('view-settings').textContent, /not connected to BitChord/);
});

test('public link fallback uses the official widget and stops it on suspend', async t => {
  const ui = await setup(t), events = {}, calls = [];
  const widget = { bind: (event, callback) => { events[event] = callback; }, play: () => calls.push('play'), pause: () => calls.push('pause'), toggle: () => calls.push('toggle'), next() {}, prev() {}, getPosition: callback => callback(5000), seekTo: ms => calls.push(ms), getDuration: callback => callback(120000) };
  const Widget = () => widget;
  Widget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', PLAY_PROGRESS: 'progress', ERROR: 'error' };
  ui.window.SC = { Widget };
  ui.el('sc-track-link').value = 'https://example.com/artist/track'; ui.submit('sc-link-form');
  assert.equal(ui.el('soundcloud-embed').children.length, 0);
  ui.el('sc-track-link').value = 'https://soundcloud.com/artist/track?secret_token=ignored'; ui.submit('sc-link-form');
  await new Promise(setImmediate);
  const frame = ui.el('soundcloud-embed').querySelector('iframe');
  assert.ok(frame); assert.equal(new URL(frame.src).searchParams.get('url'), 'https://soundcloud.com/artist/track');
  events.ready(); ui.el('toggle').click(); ui.el('forward').click();
  assert.deepEqual(calls, ['play', 'toggle', 15000]);
  Object.defineProperty(ui.document, 'hidden', { value: true, configurable: true });
  ui.document.dispatchEvent(new ui.window.Event('visibilitychange'));
  assert.equal(calls.at(-1), 'pause'); assert.equal(ui.el('soundcloud-embed').hidden, true);
});
