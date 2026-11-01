/* Public SoundCloud extraction, following NewPipe's public web-client discovery.
 * No account credentials, OAuth app, private cookies or paid-track unlocking.
 * ES5 syntax so the same implementation runs on Tizen 5 and Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SoundCloudPublic = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var API = 'https://api-v2.soundcloud.com';
  function error(message, status) { var e = new Error(message); e.status = status || 502; return e; }
  function browserRequest(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.timeout = 15000;
      xhr.onload = function () { if (xhr.status < 200 || xhr.status >= 300) { reject(error('SoundCloud request failed (' + xhr.status + ')', xhr.status)); return; } resolve(xhr.responseText); };
      xhr.onerror = function () { reject(error('SoundCloud network access was blocked. This browser/TV may need the free helper server.', 0)); };
      xhr.ontimeout = function () { reject(error('SoundCloud timed out. Try again.', 504)); }; xhr.send();
    });
  }
  function create(options) {
    options = options || {}; var request = options.request || browserRequest;
    var client = options.clientId || '', assets = options.assets || [], discovering, pending = Object.create(null), tracks = Object.create(null), searches = Object.create(null), streams = Object.create(null);
    function json(url) { return request(url).then(function (text) { return typeof text === 'string' ? JSON.parse(text) : text; }); }
    function discover() {
      if (discovering) return discovering;
      function find(list, index) {
        if (index >= list.length) throw error('SoundCloud changed its website. Refresh the app or use the free helper server.');
        var url = list[index]; if (!/^https:\/\/[a-z0-9.-]*sndcdn\.com\/assets\/[A-Za-z0-9._/-]+\.js$/.test(url)) return find(list, index + 1);
        return request(url).then(function (text) {
          var match = /client_id\s*[:=]\s*["']([A-Za-z0-9]{32})["']/.exec(text);
          if (!match) return find(list, index + 1); client = match[1]; return client;
        }, function () { return find(list, index + 1); });
      }
      discovering = request('https://soundcloud.com').then(function (html) {
        var list = [], regex = /<script[^>]+src=["'](https:\/\/[^"']*sndcdn\.com\/assets\/[^"']+\.js)["']/g, match;
        while ((match = regex.exec(html))) list.unshift(match[1]); return find(list.concat(assets), 0);
      }, function () { return find(assets, 0); }).then(function (id) { discovering = null; return id; }, function (e) { discovering = null; throw e; });
      return discovering;
    }
    function api(path, retry) {
      return (client ? Promise.resolve(client) : discover()).then(function (id) {
        return json(API + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'client_id=' + encodeURIComponent(id));
      }).catch(function (e) {
        if (retry !== false && (e.status === 401 || e.status === 403)) { client = ''; return discover().then(function () { return api(path, false); }); }
        throw e;
      });
    }
    // Search rows can arrive as bare ids; fetch their details so they are not silently dropped.
    function hydrate(data) {
      var rows = data.collection || [], stubs = rows.filter(function (row) { return row && row.id && !row.title; }).map(function (row) { return row.id; });
      if (!stubs.length) return data;
      return api('/tracks?ids=' + stubs.slice(0, 50).join(',')).then(function (full) {
        var byId = Object.create(null); (Array.isArray(full) ? full : []).forEach(function (track) { byId[String(track.id)] = track; });
        data.collection = rows.map(function (row) { return row && !row.title && byId[String(row.id)] ? byId[String(row.id)] : row; }); return data;
      }, function () { return data; });
    }
    function playable(track) { return track && track.streamable !== false && track.policy !== 'BLOCK' && track.policy !== 'SNIP' && track.access !== 'blocked' && track.access !== 'preview'; }
    function mapped(track) {
      return { id: String(track.id), title: track.title || '', artist: (track.publisher_metadata || {}).artist || (track.user || {}).username || '',
        duration: Number(track.duration || 0) / 1000, artworkURL: (track.artwork_url || (track.user || {}).avatar_url || '').replace('-large.', '-t300x300.'),
        permalinkURL: track.permalink_url, uploader: (track.user || {}).username || '', source: 'SoundCloud' };
    }
    return {
      search: function (query) {
        query = String(query || '').trim(); if (!query) return Promise.resolve({ tracks: [] });
        if (query.length > 300) return Promise.reject(error('Query too long', 400));
        if (searches[query] && Date.now() - searches[query].at < 120000) return Promise.resolve(searches[query].data);
        if (pending[query]) return pending[query];
        pending[query] = api('/search/tracks?q=' + encodeURIComponent(query) + '&limit=50').then(hydrate).then(function (data) {
          var seen = Object.create(null);
          var result = { tracks: (data.collection || []).filter(function (track) { var key = String(track.id); if (!track.id || seen[key]) return false; seen[key] = true; return playable(track); }).map(function (track) { tracks[String(track.id)] = { at: Date.now(), data: track }; return mapped(track); }) };
          if (Object.keys(searches).length >= 40) searches = Object.create(null);
          searches[query] = { at: Date.now(), data: result }; delete pending[query]; return result;
        }, function (e) { delete pending[query]; throw e; }); return pending[query];
      },
      stream: function (id) {
        id = String(id); if (!/^\d+$/.test(id)) return Promise.reject(error('Invalid SoundCloud track id', 400));
        if (streams[id] && Date.now() - streams[id].at < 45000) return Promise.resolve(streams[id].data);
        var cached = tracks[id];
        return (cached && Date.now() - cached.at < 300000 ? Promise.resolve(cached.data) : api('/tracks/' + id)).then(function (track) {
          if (!playable(track)) throw error('This track is restricted or preview-only on SoundCloud', 403);
          // Opus/Ogg cannot be decoded by Tizen 5, so it is never offered.
          var list = ((track.media || {}).transcodings || []).filter(function (t) { return t.snipped !== true && t.quality !== 'hq' && !/opus|ogg/i.test((t.format || {}).mime_type || '') && /^https:\/\/api-v2\.soundcloud\.com\/media\//.test(t.url || ''); });
          function score(t) { var format = t.format || {}, mime = format.mime_type || ''; return format.protocol === 'progressive' ? (/mpeg/.test(mime) ? 13 : 10) : (/mp4|aac/.test(mime) ? 4 : /mpeg/.test(mime) ? 3 : 1); }
          list.sort(function (a, b) { return score(b) - score(a); });
          if (!list.length) throw error('No public SoundCloud audio stream is available', 404);
          // SoundCloud rejects media requests that omit the track's authorization token.
          var auth = track.track_authorization ? 'track_authorization=' + encodeURIComponent(track.track_authorization) : '';
          function resolve(selected) {
            var endpoint = selected.url.substring(API.length); if (auth) endpoint += (endpoint.indexOf('?') >= 0 ? '&' : '?') + auth;
            return api(endpoint).then(function (response) {
              if (!/^https:\/\/[a-z0-9.-]+\/(?!.*[\r\n])/.test(response.url || '')) throw error('Invalid SoundCloud media URL');
              return { url: response.url, manifest: (selected.format || {}).protocol === 'hls' ? 'hls' : 'none', format: /mp4/.test((selected.format || {}).mime_type || '') ? 'aac' : 'mp3', encrypted: false };
            }).then(null, function (e) { return { failed: e }; });
          }
          // The player tries the best stream first and falls back to the others if the TV cannot decode it.
          return Promise.all(list.slice(0, 4).map(resolve)).then(function (all) {
            var ok = all.filter(function (item) { return !item.failed; });
            if (!ok.length) throw error('SoundCloud refused the available streams', 403);
            var result = ok[0]; result.alternates = ok.slice(1); streams[id] = { at: Date.now(), data: result }; return result;
          });
        });
      }
    };
  }
  return { create: create, browserRequest: browserRequest };
}));
