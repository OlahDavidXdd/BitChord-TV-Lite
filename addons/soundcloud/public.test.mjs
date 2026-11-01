import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { create } = createRequire(import.meta.url)('../../shared/soundcloud-public.cjs');
const id='a'.repeat(32), streamUrl='https://api-v2.soundcloud.com/media/test/stream/hls';
const track = overrides => ({ id: 123, title: 'Music', duration: 120000, policy: 'ALLOW', streamable: true, user: { username: 'Artist' }, permalink_url: 'https://soundcloud.com/artist/song', media: { transcodings: [{ url: streamUrl, quality: 'sq', snipped: false, format: { protocol: 'hls', mime_type: 'audio/mpegurl' } }] }, ...overrides });
test('public search maps rows and deduplicates in-flight/cached queries without credentials',async()=>{
 let requests=0;const api=create({clientId:id,request:async url=>{requests++;assert.ok(url.includes('/search/tracks?'));return {collection:[track({}),track({id:2,policy:'BLOCK'}),track({id:3,policy:'SNIP'})]};}});
 const [a,b]=await Promise.all([api.search('song'),api.search('song')]);assert.equal(requests,1);assert.equal(a.tracks.length,1);assert.equal(a.tracks[0].duration,120);assert.deepEqual(a,b);
 await api.search('song');assert.equal(requests,1);await api.search('constructor');assert.equal(requests,2);
});
test('stream uses cached track metadata, rejects preview tracks, and declares HLS',async()=>{
 const calls=[];const api=create({clientId:id,request:async url=>{calls.push(url);if(url.includes('/search/tracks?'))return {collection:[track({})]};if(url.includes('/media/'))return {url:'https://cf-hls-media.sndcdn.com/audio.m3u8'};return track({policy:'SNIP'});}});
 await api.search('music');const stream=await api.stream('123');assert.equal(stream.manifest,'hls');assert.equal(stream.format,'mp3');assert.equal(calls.length,2);
 await api.stream('123');assert.equal(calls.length,2);await assert.rejects(api.stream('999'),{status:403});await assert.rejects(api.stream('../private'),{status:400});
});
test('refreshes a changed public web identifier once using asset discovery',async()=>{
 let searches=0;const api=create({clientId:id,assets:['https://a-v2.sndcdn.com/assets/current.js'],request:async url=>{
  if(url==='https://soundcloud.com')throw Error('CORS');
  if(url.includes('/assets/'))return ',client_id:"'+'b'.repeat(32)+'"';
  searches++;if(url.includes('client_id='+id))throw Object.assign(Error('Expired'),{status:401});return {collection:[]};}});
 assert.deepEqual(await api.search('hello'),{tracks:[]});assert.equal(searches,2);
});
test('never selects paid HQ or snipped transcoding and refuses arbitrary API endpoints',async()=>{
 let media=false;const api=create({clientId:id,request:async url=>{if(url.includes('/media/'))media=true;return track({media:{transcodings:[{url:streamUrl,quality:'hq',format:{protocol:'hls'}},{url:'https://evil.example/media/123',quality:'sq',format:{protocol:'hls'}}]}});}});
 await assert.rejects(api.stream('123'),{status:404});assert.equal(media,false);
});
test('sends the track authorization, skips Opus, orders progressive first and keeps fallbacks',async()=>{
 const urls=[];const api=create({clientId:id,request:async url=>{if(url.includes('/media/')){urls.push(url);return {url:'https://cf.sndcdn.com/'+(url.includes('progressive')?'a.mp3':'b.m3u8')};}return track({track_authorization:'tok en',media:{transcodings:[
  {url:'https://api-v2.soundcloud.com/media/o/stream/hls',quality:'sq',format:{protocol:'hls',mime_type:'audio/ogg; codecs="opus"'}},
  {url:streamUrl,quality:'sq',format:{protocol:'hls',mime_type:'audio/mpeg'}},
  {url:'https://api-v2.soundcloud.com/media/p/stream/progressive',quality:'sq',format:{protocol:'progressive',mime_type:'audio/mpeg'}}]}});}});
 const stream=await api.stream('123');assert.equal(stream.url,'https://cf.sndcdn.com/a.mp3');assert.equal(stream.manifest,'none');assert.equal(stream.alternates.length,1);assert.equal(stream.alternates[0].manifest,'hls');
 assert.equal(urls.length,2);assert.ok(urls.every(u=>u.includes('track_authorization=tok%20en')));
});
test('search returns up to 50 rows, de-duplicates and hydrates rows that only carry an id',async()=>{
 const urls=[];const api=create({clientId:id,request:async url=>{urls.push(url);if(url.includes('/tracks?ids=2'))return [track({id:2,title:'Hydrated'})];return {collection:[track({}),track({}),{id:2,kind:'track'}]};}});
 const result=await api.search('more');assert.ok(urls[0].includes('limit=50'));assert.deepEqual(result.tracks.map(t=>t.id),['123','2']);assert.equal(result.tracks[1].title,'Hydrated');
});
