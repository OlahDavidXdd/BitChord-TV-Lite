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
    function playable(track) { return track && track.streamable !== false && track.policy !== 'BLOCK' && track.policy !== 'SNIP' && track.access !== 'blocked' && track.access !== 'preview'; }
    function mapped(track) {
      return { id: String(track.id), title: track.title || '', artist: (track.publisher_metadata || {}).artist || (track.user || {}).username || '',
        duration: Number(track.duration || 0) / 1000, artworkURL: (track.artwork_url || (track.user || {}).avatar_url || '').replace('-large.', '-t500x500.'),
        permalinkURL: track.permalink_url, uploader: (track.user || {}).username || '', source: 'SoundCloud' };
    }
    return {
      search: function (query, offset) {
        query = String(query || '').trim(); offset = Math.max(0, Math.min(1000, Number(offset) || 0)); var cacheKey = query + ':' + offset; if (!query) return Promise.resolve({ tracks: [] });
        if (query.length > 300) return Promise.reject(error('Query too long', 400));
        if (searches[cacheKey] && Date.now() - searches[cacheKey].at < 120000) return Promise.resolve(searches[cacheKey].data);
        if (pending[cacheKey]) return pending[cacheKey];
        pending[cacheKey] = api('/search/tracks?q=' + encodeURIComponent(query) + '&limit=50&offset=' + offset).then(function (data) {
          var result = { nextOffset: data.next_href ? offset + 50 : null, tracks: (data.collection || []).filter(playable).map(function (track) { tracks[String(track.id)] = { at: Date.now(), data: track }; return mapped(track); }) };
          if (Object.keys(searches).length >= 40) searches = Object.create(null);
          searches[cacheKey] = { at: Date.now(), data: result }; delete pending[cacheKey]; return result;
        }, function (e) { delete pending[cacheKey]; throw e; }); return pending[cacheKey];
      },
      stream: function (id) {
        id = String(id); if (!/^\d+$/.test(id)) return Promise.reject(error('Invalid SoundCloud track id', 400));
        if (streams[id] && Date.now() - streams[id].at < 45000) return Promise.resolve(streams[id].data);
        var cached = tracks[id];
        return (cached && Date.now() - cached.at < 300000 ? Promise.resolve(cached.data) : api('/tracks/' + id)).then(function (track) {
          if (!playable(track)) throw error('This track is restricted or preview-only on SoundCloud', 403);
          var list = ((track.media || {}).transcodings || []).filter(function (t) { var mime = (t.format || {}).mime_type || '', preset = t.preset || ''; return !/opus|ogg/i.test(mime + ' ' + preset + ' ' + (t.url || '')) && t.snipped !== true && t.quality !== 'hq' && /^(progressive|hls)$/.test((t.format || {}).protocol || '') && /^https:\/\/api-v2\.soundcloud\.com\/media\//.test(t.url || ''); });
          var known = list.filter(function (t) { return /mp3|aac|audio\/mp4|^audio\/mpeg(?:;|$)/.test((t.preset || '') + ' ' + ((t.format || {}).mime_type || '')); });
          if (known.length) list = known;
          list.sort(function (a, b) {
            function score(t) { var format = t.format || {}; return (format.protocol === 'progressive' ? 10 : 0) + (/^audio\/mpeg(?:;|$)/.test(format.mime_type || '') ? 6 : 0) + (/mp4|aac/.test((format.mime_type || '') + ' ' + (t.preset || '')) ? 4 : 0); }
            return score(b) - score(a);
          });
          if (!list.length) throw error('No public SoundCloud audio stream is available', 404);
          return Promise.all(list.slice(0, 4).map(function (selected) {
            var endpoint = selected.url.substring(API.length);
            if (track.track_authorization) endpoint += (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'track_authorization=' + encodeURIComponent(track.track_authorization);
            return api(endpoint).then(function (response) {
              if (!/^https:\/\/[a-z0-9.-]+\/(?!.*[\r\n])/.test(response.url || '')) return null;
              return { url: response.url, manifest: (selected.format || {}).protocol === 'hls' ? 'hls' : 'none', format: /mp4|aac/.test(((selected.format || {}).mime_type || '') + ' ' + (selected.preset || '') + ' ' + selected.url) ? 'aac' : 'mp3', encrypted: false };
            }).catch(function () { return null; });
          })).then(function (resolved) {
            var choices = resolved.filter(function (item) { return !!item; });
            if (!choices.length) throw error('SoundCloud refused the available MP3/AAC streams. Try the official player.', 403);
            var result = choices[0]; if (choices.length > 1) result.alternatives = choices.slice(1);
            streams[id] = { at: Date.now(), data: result }; return result;
          });
        });
      }
    };
  }
  return { create: create, browserRequest: browserRequest };
}));
