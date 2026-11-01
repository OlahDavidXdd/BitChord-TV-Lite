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
const t = hits[0];
for (const x of t.media.transcodings.filter(x => !x.snipped && x.quality === 'sq').slice(0, 3)) {
  const r = await j(x.url + '?track_authorization=' + encodeURIComponent(t.track_authorization));
  console.log('\nRESOLVED', x.format.protocol, x.format.mime_type, '->', (r.url || JSON.stringify(r)).slice(0, 120));
  if (x.format.protocol !== 'hls' || !r.url) continue;
  const text = await (await fetch(r.url)).text();
  console.log(text.split('\n').slice(0, 14).join('\n'));
  const seg = text.split('\n').find(l => l && !l.startsWith('#'));
  const map = /#EXT-X-MAP:URI="([^"]+)"/.exec(text);
  console.log('first segment line:', seg && seg.slice(0, 110), '| EXT-X-MAP:', map ? map[1].slice(0, 90) : 'none', '| segments:', text.split('\n').filter(l => l && !l.startsWith('#')).length);
  if (seg) { const s = await fetch(new URL(seg, r.url), { headers: { Range: 'bytes=0-63' } }); const b = Buffer.from(await s.arrayBuffer()); console.log('segment', s.status, s.headers.get('content-type'), 'acao:', s.headers.get('access-control-allow-origin'), 'head:', b.subarray(0, 16).toString('hex')); }
}
