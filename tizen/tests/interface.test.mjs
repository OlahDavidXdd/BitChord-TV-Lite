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
  for (const name of ['qrcode.js', 'app.js', 'soundcloud-login.js']) window.eval(read(name));
  return { window, document: window.document, calls, av, el: id => window.document.getElementById(id),
    submit(id) { window.document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } };
}
test('top tabs, settings and Return restore navigation without inventing a catalogue', async t => {
  const ui = await setup(t);
  assert.equal(ui.el('view-home').hidden, false); assert.equal(ui.el('home-empty').hidden, false);
  assert.equal(ui.document.activeElement.textContent, 'Home');
  ui.document.querySelector('[data-view="settings"]').click(); assert.equal(ui.el('view-settings').hidden, false);
  ui.el('sc-login').click(); assert.match(ui.el('sc-status').textContent, /publisher must configure/);
  assert.equal(ui.el('sc-configuration').open, true);
  ui.document.querySelector('[data-view="search"]').click(); ui.el('query').value = 'song'; ui.submit('search');
  assert.equal(ui.calls.length, 0); assert.match(ui.el('status').textContent, /Connect an addon/);
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
test('TV phone pairing renders QR, connects addon automatically, and disconnect clears playback/source', async t => {
  const key = 'k'.repeat(43), id = 'i'.repeat(43), ticket = 't'.repeat(43);
  const ui = await setup(t, request => {
    if (request.method === 'POST' && request.url.endsWith('/pair')) return { body: { key, pairId: id, loginUrl: 'https://login.example/authorize?id=' + id + '&ticket=' + ticket } };
    if (request.url.endsWith('/pair/' + id)) { assert.equal(request.headers.Authorization, 'Bearer ' + key); return { body: { connected: true, addonUrl: 'https://login.example/addon/' + key } }; }
    if (request.url.endsWith('/manifest.json')) return { body: { id: 'soundcloud', name: 'SoundCloud' } };
    if (request.method === 'DELETE') return { body: { disconnected: true } };
    return { status: 404, body: { error: 'Unknown fixture' } };
  });
  ui.el('sc-service').value = 'https://login.example'; ui.submit('sc-service-form'); ui.el('sc-login').click();
  assert.ok(ui.el('sc-qr').src.startsWith('data:image/gif;base64,'));
  assert.equal(ui.el('addon').value, 'https://login.example/addon/' + key);
  assert.match(ui.el('sc-status').textContent, /Connected/); assert.equal(ui.el('sc-disconnect').hidden, false);
  ui.el('sc-disconnect').click(); assert.equal(ui.el('addon').value, ''); assert.equal(ui.window.localStorage.getItem('sc-session'), null);
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
