import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createLibraryService } from './library-auth.mjs';
async function setup(t, provider='spotify') {
 let clock=1000000, refreshes=0;const store={sessions:{},save(){}};
 const handler=createLibraryService({publicUrl:'https://library.example',credentials:{[provider]:{clientId:'test-client',clientSecret:'test-server-secret'}},store,now:()=>clock,fetcher:async(url,options)=>{
  if(url.includes('/token')){const fields=options.body;assert.ok(fields.get('code_verifier')||fields.get('refresh_token'));if(fields.get('grant_type')==='refresh_token')refreshes++;return new Response(JSON.stringify({access_token:'provider-access',refresh_token:'provider-refresh',expires_in:3600}),{status:200});}
  assert.equal(options.headers.Authorization,'Bearer provider-access');
  if(url.includes('/me/playlists'))return new Response(JSON.stringify({items:[{id:'a'.repeat(22),name:'Private playlist',images:[]}],next:null}));
  if(url.includes('/me/albums'))return new Response(JSON.stringify({items:[{album:{id:'b'.repeat(22),name:'Saved album',images:[]}}],next:null}));
  if(url.includes('/me/tracks'))return new Response(JSON.stringify({items:[{track:{id:'c'.repeat(22),name:'Private liked song',artists:[{name:'Artist'}],duration_ms:123000}}],next:null}));
  if(url.includes('/youtube/v3/playlists'))return new Response(JSON.stringify({items:[{id:'PLabcdefghijk',snippet:{title:'YouTube music list'}}]}));
  if(url.includes('/youtube/v3/videos'))return new Response(JSON.stringify({items:[{id:'abcdefghijk',snippet:{title:'Liked music',channelTitle:'Artist'}}]}));
  throw Error('Unexpected provider endpoint');
 }});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 async function login(){const start=await (await fetch(base+'/library/connect/'+provider,{method:'POST'})).json();const url=new URL(start.authorizeUrl);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('state'));assert.equal(start.authorizeUrl.includes('test-server-secret'),false);const callback='/library/callback/'+provider+'?code=test-code&state='+url.searchParams.get('state');const done=await fetch(base+callback);assert.equal(done.status,200);return {device:start.device,callback};}
 return {base,login,store,advance:()=>{clock+=7200000;},refreshes:()=>refreshes};
}
test('Spotify official account sync is state-bound, read-only and keeps provider tokens off the TV',async t=>{
 const ui=await setup(t);assert.equal((await fetch(ui.base+'/library/collections')).status,401);
 const {device,callback}=await ui.login(),headers={Authorization:'Bearer '+device};
 const list=await (await fetch(ui.base+'/library/collections',{headers})).json();assert.equal(list.items[0].id,'liked');assert.equal(list.items[1].title,'Private playlist');assert.equal(JSON.stringify(list).includes('provider-access'),false);
 const tracks=await (await fetch(ui.base+'/library/tracks?id=liked',{headers})).json();assert.equal(tracks.tracks[0].duration,123);
 assert.equal((await fetch(ui.base+callback)).status,400);
 await fetch(ui.base+'/library/session',{method:'DELETE',headers});assert.equal((await fetch(ui.base+'/library/session',{headers})).status,401);assert.equal(Object.keys(ui.store.sessions).length,0);
});
test('account sync coalesces expired-token refresh across concurrent library requests',async t=>{
 const ui=await setup(t),{device}=await ui.login(),headers={Authorization:'Bearer '+device};ui.advance();
 const responses=await Promise.all([fetch(ui.base+'/library/collections',{headers}),fetch(ui.base+'/library/collections?type=albums',{headers})]);assert.ok(responses.every(r=>r.status===200));assert.equal(ui.refreshes(),1);
});
test('YouTube sync returns authorized playlists and liked videos without claiming saved music albums',async t=>{
 const ui=await setup(t,'youtube'),{device}=await ui.login(),headers={Authorization:'Bearer '+device};
 const config=await (await fetch(ui.base+'/library/config')).json();assert.match(config.youtubeScope,/not exposed/);
 const collections=await (await fetch(ui.base+'/library/collections',{headers})).json();assert.equal(collections.items[1].title,'YouTube music list');
 const tracks=await (await fetch(ui.base+'/library/tracks?id=liked',{headers})).json();assert.equal(tracks.tracks[0].videoId,'abcdefghijk');
});
