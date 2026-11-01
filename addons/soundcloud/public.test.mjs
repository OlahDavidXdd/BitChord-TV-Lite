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
 assert.deepEqual(await api.search('hello'),{nextOffset:null,tracks:[]});assert.equal(searches,2);
});
test('never selects paid HQ or snipped transcoding and refuses arbitrary API endpoints',async()=>{
 let media=false;const api=create({clientId:id,request:async url=>{if(url.includes('/media/'))media=true;return track({media:{transcodings:[{url:streamUrl,quality:'hq',format:{protocol:'hls'}},{url:'https://evil.example/media/123',quality:'sq',format:{protocol:'hls'}}]}});}});
 await assert.rejects(api.stream('123'),{status:404});assert.equal(media,false);
});

test('TV codec selection excludes Opus/Ogg, prefers progressive MP3 and exposes AAC retry', async () => {
 const requested=[];
 const trans=(name,protocol,mime,preset)=>({url:'https://api-v2.soundcloud.com/media/'+name,quality:'sq',preset,format:{protocol,mime_type:mime}});
 const api=create({clientId:id,request:async url=>{requested.push(url);if(url.includes('/media/'))return {url:'https://cf-media.sndcdn.com/'+new URL(url).pathname.split('/').pop()};return track({track_authorization:'public-track-authorization',media:{transcodings:[trans('opus','hls','audio/ogg; codecs="opus"','opus_0_0'),trans('aac','hls','audio/mp4','aac_160'),trans('mp3','progressive','audio/mpeg','mp3_128')]}});}});
 const result=await api.stream('123');assert.equal(result.format,'mp3');assert.equal(result.manifest,'none');assert.equal(result.alternatives[0].format,'aac');
 assert.equal(requested.some(url=>url.includes('/media/opus')),false);assert.ok(requested.filter(url=>url.includes('/media/')).every(url=>url.includes('track_authorization=')));
});
test('public SoundCloud searches request fifty songs and support independent pages', async () => {
 const offsets=[];const api=create({clientId:id,request:async url=>{const parsed=new URL(url);assert.equal(parsed.searchParams.get('limit'),'50');const offset=Number(parsed.searchParams.get('offset'));offsets.push(offset);return {next_href:offset===0?'next':null,collection:[track({id:offset+1})]};}});
 assert.equal((await api.search('music')).nextOffset,50);assert.equal((await api.search('music',50)).tracks[0].id,'51');assert.deepEqual(offsets,[0,50]);
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

test('SoundCloud artist and album browsing return real collections and keep artist identities',async()=>{
 const api=create({clientId:id,request:async url=>{
  const path=new URL(url).pathname;
  if(path==='/users/7')return {id:7,username:'Artist'};
  if(path==='/users/7/tracks')return {collection:[track({user:{id:7,username:'Artist',permalink_url:'https://soundcloud.com/artist'}})]};
  if(path==='/users/7/albums'||path==='/users/7/playlists')return {collection:[{id:9,title:'Album',is_album:true,user:{username:'Artist'}}]};
  if(path==='/search/users')return {collection:[{kind:'user',id:7,username:'Artist'}]};
  if(path==='/search/playlists')return {collection:[{kind:'playlist',id:9,title:'Album',is_album:true}]};
  if(path==='/playlists/9')return {title:'Album',tracks:[track({user:{id:7,username:'Artist'}})]};
  throw Error('Unexpected endpoint');
 }});
 assert.equal((await api.browse('artist','artists')).items[0].type,'artist');
 assert.equal((await api.browse('album','albums')).items[0].type,'album');
 const artist=await api.artist('7');assert.equal(artist.collections.length,1);assert.equal(artist.tracks[0].artistId,'7');
 assert.equal((await api.playlist('9')).tracks.length,1);await assert.rejects(api.artist('../private'),{status:400});
});
test('large albums hydrate every batch rather than silently dropping tracks after fifty',async()=>{
 let batches=0;const api=create({clientId:id,request:async url=>{
  const parsed=new URL(url);
  if(parsed.pathname==='/playlists/5')return {title:'Large album',tracks:Array.from({length:120},(_,i)=>({id:i+1}))};
  if(parsed.pathname==='/tracks'){batches++;return parsed.searchParams.get('ids').split(',').map(value=>track({id:Number(value)}));}
  throw Error('Unexpected endpoint');
 }});
 assert.equal((await api.playlist('5')).tracks.length,120);assert.equal(batches,3);
});
