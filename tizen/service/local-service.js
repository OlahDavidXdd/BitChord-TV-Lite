/* ES5 and Node 4 built-ins only: Samsung on-TV JavaScript service. */
'use strict';
var http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), urls = require('url'), zlib = require('zlib');
var SoundCloud = require('./soundcloud-public.js'), Music = require('./music-public.js');
function failure(message, status) { var error = new Error(message); error.status = status || 502; return error; }
function allowed(value) {
  var parsed; try { if (typeof value !== 'string') return false; parsed = urls.parse(value); } catch (_) { return false; }
  return parsed.protocol === 'https:' && !parsed.auth && (!parsed.port || parsed.port === '443') && /^(?:music\.youtube\.com|www\.youtube\.com|open\.spotify\.com|soundcloud\.com|api-v2\.soundcloud\.com|(?:[a-z0-9-]+\.)*sndcdn\.com|(?:[a-z0-9-]+\.)*googlevideo\.com)$/.test(parsed.hostname || '');
}
function transport(ca) {
  return function request(value, body, redirects) {
    return new Promise(function (resolve, reject) {
      if (!allowed(value)) { reject(failure('Unsupported upstream destination', 400)); return; }
      // The TV has a direct Internet connection. Never silently bypass a configured development proxy.
      if (process.env.HTTPS_PROXY || process.env.https_proxy) { reject(failure('Use an injected transport when testing behind a development proxy')); return; }
      var parsed = urls.parse(value), payload = body ? JSON.stringify(body) : null;
      var headers = { 'User-Agent': 'BitChord-TV/1.7', 'Accept-Encoding': 'gzip, deflate', Accept: '*/*' };
      if (payload) {
        headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload);
        if (body.context && body.context.client) { headers['X-YouTube-Client-Name'] = '67'; headers['X-YouTube-Client-Version'] = body.context.client.clientVersion; if (body.context.client.visitorData) headers['X-Goog-Visitor-Id'] = body.context.client.visitorData; headers.Origin = 'https://music.youtube.com'; }
      }
      var req = https.request({ hostname: parsed.hostname, path: parsed.path, port: 443, method: payload ? 'POST' : 'GET', headers: headers, ca: ca, rejectUnauthorized: true }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); if ((redirects || 0) >= 3) { reject(failure('Too many upstream redirects')); return; }
          request(urls.resolve(value, res.headers.location), body, (redirects || 0) + 1).then(resolve, reject); return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); reject(failure('Upstream music request rejected (' + res.statusCode + ')', res.statusCode)); return; }
        var stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res.headers['content-encoding'] === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        var chunks = [], bytes = 0;
        stream.on('data', function (chunk) { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) { req.destroy(); reject(failure('Music metadata response was too large')); } else chunks.push(chunk); });
        stream.on('error', reject); stream.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      });
      req.setTimeout(20000, function () { req.destroy(); reject(failure('Upstream music request timed out', 504)); }); req.on('error', reject);
      if (payload) req.write(payload); req.end();
    });
  };
}
function createService(options) {
  options = options || {};
  var root = options.root || path.resolve(__dirname, '..'), ca = options.ca || fs.readFileSync(path.join(__dirname, 'ca.pem'));
  var request = options.request || transport(ca), bootstrap = options.bootstrap || JSON.parse(fs.readFileSync(path.join(__dirname, 'soundcloud-bootstrap.json'), 'utf8'));
  var soundcloud = SoundCloud.create({ clientId: bootstrap.clientId, assets: bootstrap.assets, request: request }), music = Music.create({ request: request });
  var port = options.port == null ? 8790 : options.port;
  var files = ['youtube-player.html', 'youtube-player.js'];
  function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }
  function media(value, req, res, redirects) {
    if (!allowed(value) || !/(?:sndcdn\.com|googlevideo\.com)$/.test(urls.parse(value).hostname || '')) { send(res, 400, { error: 'Unsupported media destination' }); return; }
    if (process.env.HTTPS_PROXY || process.env.https_proxy) { send(res, 502, { error: 'The on-TV proxy is intended for the TV runtime, not a proxied development shell.' }); return; }
    var parsed = urls.parse(value), headers = { 'User-Agent': 'BitChord-TV/1.7', 'Accept-Encoding': 'identity' };
    if (req.headers.range) headers.Range = req.headers.range;
    var upstream = https.request({ hostname: parsed.hostname, path: parsed.path, port: 443, headers: headers, ca: ca, rejectUnauthorized: true }, function (reply) {
      if (reply.statusCode >= 300 && reply.statusCode < 400 && reply.headers.location) { reply.resume(); if ((redirects || 0) >= 3) send(res, 502, { error: 'Media redirect limit reached' }); else media(urls.resolve(value, reply.headers.location), req, res, (redirects || 0) + 1); return; }
      if (reply.statusCode !== 200 && reply.statusCode !== 206) { reply.resume(); send(res, reply.statusCode, { error: 'SoundCloud media rejected (' + reply.statusCode + ')' }); return; }
      var type = reply.headers['content-type'] || 'application/octet-stream';
      if (/mpegurl/i.test(type) || /\.m3u8(?:\?|$)/.test(value)) {
        var chunks = [], size = 0;
        reply.on('data', function (chunk) { size += chunk.length; if (size > 1024 * 1024) upstream.destroy(); else chunks.push(chunk); });
        reply.on('error', function () { res.destroy(); });
        reply.on('end', function () {
          function local(uri) { return '/media?url=' + encodeURIComponent(urls.resolve(value, uri)); }
          var manifest = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map(function (line) {
            if (!line) return line;
            if (line.charAt(0) !== '#') return local(line.trim());
            return line.replace(/URI="([^"]+)"/g, function (_, uri) { return 'URI="' + local(uri) + '"'; });
          }).join('\n');
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(manifest);
        });
      } else {
        var outgoing = { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
        ['content-length', 'content-range', 'accept-ranges'].forEach(function (name) { if (reply.headers[name]) outgoing[name] = reply.headers[name]; });
        res.writeHead(reply.statusCode, outgoing); if (req.method === 'HEAD') { reply.resume(); res.end(); } else reply.pipe(res);
      }
    });
    upstream.setTimeout(20000, function () { upstream.destroy(); if (!res.headersSent) send(res, 504, { error: 'Media proxy timed out' }); else res.destroy(); });
    upstream.on('error', function () { if (!res.headersSent) send(res, 502, { error: 'TV service could not reach the media host' }); else res.destroy(); });
    res.on('close', function () { upstream.destroy(); }); upstream.end();
  }
  var server = http.createServer(function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Range'); res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, { error: 'GET required' }); return; }
    var parsed = urls.parse(req.url, true), route = parsed.pathname, query = parsed.query;
    if (req.url.length > 16000) { send(res, 400, { error: 'Request too long' }); return; }
    if (route === '/health') { send(res, 200, { ok: true, runtime: process.version, onTV: typeof tizen !== 'undefined' && !!tizen.application, externalServer: false, youtubePlayback: 'official-loopback-player', privateLibraryConfigured: false }); return; }
    if (route === '/library/config') { send(res, 200, { spotify: false, youtube: false, error: 'Private account sync is not available in this on-TV test build.' }); return; }
    if (/^\/media(?:\/(?:stream\.m3u8|audio\.(?:mp3|aac)))?$/.test(route)) { media(query.url || '', req, res); return; }
    if (files.indexOf(route.slice(1)) >= 0) {
      fs.readFile(path.join(root, route.slice(1)), function (error, data) { if (error) { send(res, 404, { error: 'Player file missing' }); return; } res.writeHead(200, { 'Content-Type': /\.js$/.test(route) ? 'application/javascript' : 'text/html', 'Cache-Control': 'no-store' }); res.end(data); }); return;
    }
    var task;
    try {
      if (route === '/manifest.json') task = Promise.resolve({ id: 'bitchord.on-tv.soundcloud', name: 'SoundCloud · on this TV' });
      else if (route === '/search') task = soundcloud.search(query.q || '', Number(query.offset) || 0);
      else if (route.indexOf('/stream/') === 0) task = soundcloud.stream(decodeURIComponent(route.slice(8))).then(function (stream) {
        function local(item) { return { url: 'http://127.0.0.1:' + server.address().port + (item.manifest === 'hls' ? '/media/stream.m3u8?url=' : '/media/audio.' + (item.format === 'mp3' ? 'mp3' : 'aac') + '?url=') + encodeURIComponent(item.url), format: item.format, manifest: item.manifest, encrypted: false }; }
        var data = local(stream); data.alternatives = (stream.alternatives || []).map(local); return data;
      });
      else if (route === '/catalog/search') task = soundcloud.browse(query.q, query.type);
      else if (route.indexOf('/artist/') === 0) task = soundcloud.artist(route.slice(8));
      else if (route.indexOf('/playlist/') === 0) task = soundcloud.playlist(route.slice(10));
      else if (route === '/yt/search' || route === '/youtube/search') task = music.search(query.q);
      else if (route === '/spotify/public') task = music.spotify(query.url);
      else { send(res, 404, { error: 'On-TV endpoint not available' }); return; }
      task.then(function (data) { send(res, 200, data); }, function (error) { send(res, error.status || 502, { error: error.code === 'YOUTUBE_DIRECT_FORBIDDEN' ? 'YouTube rejected the on-TV service request (403). Report this together with the on-TV service status; this build cannot override the provider response.' : error.message, code: error.code === 'YOUTUBE_DIRECT_FORBIDDEN' ? 'ON_TV_YOUTUBE_FORBIDDEN' : error.code || 'ON_TV_REQUEST_FAILED' }); });
    } catch (error) { send(res, error.status || 400, { error: error.message }); }
  });
  return server;
}
var running;
module.exports.createService = createService;
module.exports.allowed = allowed;
module.exports.onStart = function () { if (!running) { running = createService(); running.listen(8790, '127.0.0.1'); } };
module.exports.onStop = function () { if (running) running.close(); running = null; };
module.exports.onRequest = function () {};
