import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const { createService, allowed } = createRequire(import.meta.url)('../service/local-service.js');
async function setup(t) {
 const calls=[];const server=createService({port:0,root:fileURLToPath(new URL('../app/',import.meta.url)),bootstrap:{clientId:'a'.repeat(32)},request:async(url,body)=>{
  calls.push({url,body});
  if(url.includes('/search/tracks'))return {collection:[{id:123,title:'Song',policy:'ALLOW',streamable:true,user:{id:7,username:'Artist'},media:{transcodings:[{url:'https://api-v2.soundcloud.com/media/test',preset:'aac_96k',format:{protocol:'hls',mime_type:'audio/mp4'}}]}}]};
  if(url.includes('/media/test'))return {url:'https://cf-hls-media.sndcdn.com/audio.m3u8'};
  if(url.includes('/youtubei/'))return {contents:[{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'Song'}}}]};
  throw Error('Unexpected request');
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {base:'http://127.0.0.1:'+server.address().port,calls};
}
test('on-device service searches public SoundCloud and gives AVPlay loopback media URLs',async t=>{
 const ui=await setup(t);const rows=await (await fetch(ui.base+'/search?q=Song')).json();assert.equal(rows.tracks[0].artistId,'7');
 const media=await (await fetch(ui.base+'/stream/123')).json();assert.equal(new URL(media.url).hostname,'127.0.0.1');assert.equal(media.manifest,'hls');assert.equal(new URL(media.url).pathname,'/media/stream.m3u8');
});
test('YouTube metadata is requested by the local service and the official wrapper has a real HTTP origin',async t=>{
 const ui=await setup(t);const rows=await (await fetch(ui.base+'/yt/search?q=Song')).json();assert.equal(rows.tracks[0].videoId,'abcdefghijk');
 assert.equal(ui.calls[0].body.context.client.clientName,'WEB_REMIX');const wrapper=await fetch(ui.base+'/youtube-player.html?video=abcdefghijk');assert.equal(wrapper.status,200);assert.match(await wrapper.text(),/youtube-player.js/);
});
test('local service exposes runtime diagnostics without private device identifiers',async t=>{
 const ui=await setup(t),health=await (await fetch(ui.base+'/health')).json();assert.equal(health.ok,true);assert.equal(health.externalServer,false);assert.match(health.runtime,/^v/);assert.equal(JSON.stringify(health).includes('serial'),false);
 const config=await (await fetch(ui.base+'/library/config')).json();assert.equal(config.spotify,false);assert.equal(config.youtube,false);
});
test('on-device proxy rejects arbitrary destinations and serves no private files',async t=>{
 const ui=await setup(t);assert.equal(allowed('https://api-v2.soundcloud.com.evil.example/media/a'),false);assert.equal(allowed('https://127.0.0.1/private'),false);assert.equal(allowed('http://api-v2.soundcloud.com/media/a'),false);assert.equal(allowed('https://cf-hls-media.sndcdn.com/audio'),true);
 assert.equal((await fetch(ui.base+'/media?url=https://evil.example/file')).status,400);assert.equal((await fetch(ui.base+'/service/ca.pem')).status,404);assert.equal((await fetch(ui.base+'/health',{method:'POST'})).status,405);
});
test('loopback player validates its video ID and authenticates messages by source',()=>{
 const script=readFileSync(new URL('../app/youtube-player.js',import.meta.url),'utf8');assert.match(script,/event.source !== window.parent/);assert.match(script,/A-Za-z0-9_/);
});
