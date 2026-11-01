import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compatibleSoundCloud } from './compatible-soundcloud.mjs';
import { createHelper } from './audio-helper.mjs';
test('compatible SoundCloud conversion coalesces requests and serves seekable MP3 ranges', async t => {
 const cacheDir=await mkdtemp(join(tmpdir(),'bitchord-audio-test-'));t.after(()=>rm(cacheDir,{recursive:true,force:true}));let conversions=0;
 const source=compatibleSoundCloud({stream:async()=>({url:'https://cdn.example/public-aac.m3u8'})},{cacheDir,convert:async(url,file)=>{conversions++;assert.match(url,/public-aac/);await writeFile(file,Buffer.from('ID3public-test-audio'));}});
 const [a,b]=await Promise.all([source.stream('123',{origin:'http://h'}),source.stream('123',{origin:'http://h'})]);
 assert.equal(a.url,'http://h/soundcloud/audio/123');assert.equal(a.format,'mp3');assert.deepEqual(a,b);assert.equal(conversions,1);
 const server=createHelper({soundcloud:source});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const range=await fetch(base+'/soundcloud/audio/123',{headers:{Range:'bytes=0-2'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'audio/mpeg');assert.equal(await range.text(),'ID3');
 const head=await fetch(base+'/soundcloud/audio/123',{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),20);
 assert.equal((await fetch(base+'/soundcloud/audio/123',{headers:{Range:'bytes=9999-'}})).status,416);assert.equal(conversions,1);
 await assert.rejects(source.stream('../private',{origin:base}),/Invalid/);
});
