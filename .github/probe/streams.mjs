// What does SoundCloud really serve? List transcodings of several tracks and inspect the HLS playlist.
import { readFileSync } from 'node:fs';
const boot = JSON.parse(readFileSync(new URL('../../shared/soundcloud-bootstrap.json', import.meta.url)));
const id = boot.clientId, api = 'https://api-v2.soundcloud.com';
const j = async u => (await fetch(u + (u.includes('?') ? '&' : '?') + 'client_id=' + id)).json();
const hits = (await j(api + '/search/tracks?q=daft%20punk&limit=8')).collection.filter(t => t.streamable !== false && t.policy !== 'BLOCK' && t.policy !== 'SNIP');
const seen = new Set();
for (const t of hits.slice(0, 5)) {
  console.log('TRACK', t.id, t.title.slice(0, 40), '| policy', t.policy, '| auth', !!t.track_authorization);
  for (const x of t.media.transcodings) console.log('   ', x.quality, x.format.protocol, x.format.mime_type, x.snipped ? 'SNIPPED' : '');
}
const plain = hits.filter(t => t.media.transcodings.some(x => x.format.protocol === 'hls'));
console.log('\nTRACKS WITH PLAIN HLS:', plain.length, 'of', hits.length, '| DRM-only:', hits.length - plain.length);
const t = plain[0];
for (const x of t.media.transcodings.filter(x => x.format.protocol === 'hls' && !x.snipped)) {
  const r = await j(x.url + '?track_authorization=' + encodeURIComponent(t.track_authorization));
  console.log('\nRESOLVED', x.quality, x.format.protocol, x.format.mime_type, '->', (r.url || JSON.stringify(r)).slice(0, 110));
  if (!r.url) continue;
  const text = await (await fetch(r.url)).text();
  console.log(text.split('\n').slice(0, 16).join('\n'));
  const lines = text.split('\n').filter(l => l && !l.startsWith('#')), seg = lines[0];
  const map = /#EXT-X-MAP:URI="([^"]+)"/.exec(text), key = /#EXT-X-KEY:([^\n]+)/.exec(text);
  console.log('segments:', lines.length, '| EXT-X-MAP:', map ? 'yes' : 'none', '| EXT-X-KEY:', key ? key[1].slice(0, 80) : 'none', '| first:', seg && seg.slice(0, 100));
  if (seg) { const s2 = await fetch(new URL(map ? map[1] : seg, r.url), { headers: { Range: 'bytes=0-63' } }); const b = Buffer.from(await s2.arrayBuffer()); console.log('first object', s2.status, s2.headers.get('content-type'), 'acao:', s2.headers.get('access-control-allow-origin'), 'head:', b.subarray(0, 12).toString('hex'), JSON.stringify(b.subarray(4, 12).toString('latin1'))); }
}
