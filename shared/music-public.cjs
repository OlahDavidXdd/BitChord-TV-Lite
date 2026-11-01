/* Public metadata only. No passwords, account cookies or private libraries. ES5 for Tizen 5. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitChordMusic = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function text(value) {
    return typeof value === 'string' ? value : value && (value.simpleText || (value.runs || []).map(function (r) { return r.text || ''; }).join('')) || '';
  }
  function walk(value, visit) {
    if (!value || typeof value !== 'object') return;
    visit(value);
    Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') walk(value[key], visit); });
  }
  function parseYouTube(data) {
    var rows = [], seen = Object.create(null);
    walk(data, function (node) {
      var item = node.musicResponsiveListItemRenderer || node.videoRenderer || node.playlistVideoRenderer || node.playlistPanelVideoRenderer;
      if (!item) return;
      var cols = item.flexColumns || [], first = cols[0] && cols[0].musicResponsiveListItemFlexColumnRenderer;
      var second = cols[1] && cols[1].musicResponsiveListItemFlexColumnRenderer;
      var title = text(first && first.text || item.title), id = item.videoId || (item.playlistItemData || {}).videoId;
      if (!id) walk(item.overlay || item.navigationEndpoint || {}, function (n) { if (!id && n.watchEndpoint) id = n.watchEndpoint.videoId; });
      if (!/^[A-Za-z0-9_-]{11}$/.test(id || '') || seen[id] || !title) return;
      seen[id] = true;
      var fixed = (item.fixedColumns || [])[0], duration = text(item.lengthText || fixed && fixed.musicResponsiveListItemFixedColumnRenderer.text);
      var thumbs = ((item.thumbnail || {}).musicThumbnailRenderer || {}).thumbnail || item.thumbnail || {};
      var thumbnails = thumbs.thumbnails || [], image = thumbnails[thumbnails.length - 1];
      rows.push({ id: id, videoId: id, title: title, artist: text(second && second.text || item.ownerText || item.shortBylineText), duration: duration.split(':').reduce(function (sum, part) { return sum * 60 + Number(part || 0); }, 0), artworkURL: image && image.url || 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg', source: 'YouTube Music' });
    });
    return rows;
  }
  function parseAlbums(data) {
    var rows = [], seen = Object.create(null);
    walk(data, function (node) {
      var item = node.musicTwoRowItemRenderer;
      if (!item) return;
      var id = ((item.navigationEndpoint || {}).browseEndpoint || {}).browseId;
      if (!/^MPREb_[A-Za-z0-9_-]+$/.test(id || '') || seen[id]) return;
      seen[id] = true;
      var images = (((item.thumbnailRenderer || {}).musicThumbnailRenderer || {}).thumbnail || {}).thumbnails || [];
      rows.push({ id: id, browseId: id, type: 'album', title: text(item.title), artist: text(item.subtitle), artworkURL: (images[images.length - 1] || {}).url || '', source: 'YouTube Music' });
    });
    return rows;
  }
  function spotifyLink(input) {
    var match = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]{22})(?:[?#].*)?$/.exec(String(input || '').trim());
    if (!match) throw new Error('Use a public Spotify track, album or playlist link.');
    return { type: match[1], id: match[2], url: 'https://open.spotify.com/' + match[1] + '/' + match[2] };
  }
  function parseSpotify(html) {
    var match = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (!match) throw new Error('Spotify did not return public playlist metadata. Private playlists require login.');
    var props = ((JSON.parse(match[1]).props || {}).pageProps || {}), entity = (((props.state || {}).data || {}).entity || props.entity);
    if (!entity) throw new Error('This Spotify link is unavailable or private.');
    var input = entity.trackList && entity.trackList.length ? entity.trackList : entity.tracks || (entity.type === 'track' || entity.uri && entity.uri.indexOf('spotify:track:') === 0 ? [entity] : []);
    if (!Array.isArray(input)) input = input.items || input.edges || [];
    var rows = input.map(function (entry, index) {
      var track = entry.track || entry.node || entry;
      var title = track.title || track.name || '', artist = track.subtitle || (track.artists || []).map(function (a) { return a.name; }).join(', ');
      return { id: track.uri || String(index), title: title, artist: artist, duration: Number(track.duration || track.durationMs || 0) / 1000, artworkURL: (((entity.visualIdentity || {}).image || [])[0] || {}).url || '', source: 'Spotify' };
    }).filter(function (row) { return !!row.title; });
    if (!rows.length) throw new Error('Spotify did not expose tracks for this album or playlist. It may be private, unreleased or unavailable in your region; an empty public response does not mean the album has no songs.');
    return { title: entity.name || entity.title || 'Spotify', tracks: rows, limited: rows.length >= 100 };
  }
  function browserRequest(url, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open(body ? 'POST' : 'GET', url); xhr.timeout = 20000;
      if (body) { xhr.setRequestHeader('Content-Type', 'application/json'); var client = (body.context || {}).client; if (client && client.clientName === 'WEB_REMIX') { xhr.setRequestHeader('X-YouTube-Client-Name', '67'); xhr.setRequestHeader('X-YouTube-Client-Version', client.clientVersion); if (client.visitorData) xhr.setRequestHeader('X-Goog-Visitor-Id', client.visitorData); } }
      xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) { resolve(xhr.responseText); return; } var failure = new Error('Music service request failed (' + xhr.status + ').'); failure.status = xhr.status; reject(failure); };
      xhr.onerror = function () { reject(new Error('The TV blocked this service request. Configure the optional music helper in Settings.')); };
      xhr.ontimeout = function () { reject(new Error('The music service timed out. Try again.')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  function normalized(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ').trim().split(/\s+/).filter(Boolean); }
  function matchTrack(track, candidates) {
    var title = normalized(track.title), artist = normalized(track.artist);
    function coverage(needles, haystack) { return needles.length ? needles.filter(function (word) { return haystack.indexOf(word) >= 0; }).length / needles.length : 1; }
    return candidates.map(function (row) {
      var words = normalized(row.title + ' ' + row.artist), t = coverage(title, words), a = coverage(artist, words);
      var delta = track.duration && row.duration ? Math.abs(track.duration - row.duration) : 0;
      var penalty = /\b(cover|karaoke|slowed|sped up|remix|live)\b/i.test(row.title) && !/\b(cover|karaoke|slowed|sped up|remix|live)\b/i.test(track.title) ? 0.35 : 0;
      return { row: row, score: t * 0.65 + a * 0.35 - Math.min(0.3, delta / 100) - penalty, valid: t >= 0.65 && a >= 0.5 };
    }).filter(function (entry) { return entry.valid && entry.score >= 0.65; }).sort(function (a, b) { return b.score - a.score; }).map(function (entry) { return entry.row; })[0] || null;
  }
  function create(options) {
    options = options || {}; var youtubeConfig = { version: '1.20250101.01.00' }, refreshing; var request = options.request || browserRequest, cache = Object.create(null), pending = Object.create(null);
    function cached(key, load) {
      if (cache[key] && Date.now() - cache[key].at < 120000) return Promise.resolve(cache[key].data);
      if (pending[key]) return pending[key];
      pending[key] = load().then(function (data) { if (Object.keys(cache).length > 40) cache = Object.create(null); cache[key] = { at: Date.now(), data: data }; delete pending[key]; return data; }, function (error) { delete pending[key]; throw error; });
      return pending[key];
    }
    function blocked() { var failure = new Error('YouTube refused direct TV search (403). Set up the Music helper in Settings with yt-dlp installed; no phone is required.'); failure.status = 403; failure.code = 'YOUTUBE_DIRECT_FORBIDDEN'; return failure; }
    function refreshYouTube() {
      if (refreshing) return refreshing;
      refreshing = request('https://music.youtube.com/').then(function (html) {
        function value(key) { var source = String(html), marker = '"' + key + '"', at = source.indexOf(marker); if (at < 0) return ''; var match = /^\s*:\s*"([^"\r\n]+)"/.exec(source.slice(at + marker.length)); return match ? JSON.parse('"' + match[1] + '"') : ''; }
        var version = value('INNERTUBE_CLIENT_VERSION'), key = value('INNERTUBE_API_KEY');
        if (!version || !key) throw blocked();
        youtubeConfig = { version: version, key: key, visitor: value('VISITOR_DATA') }; return youtubeConfig;
      }).then(function (config) { refreshing = null; return config; }, function () { refreshing = null; throw blocked(); });
      return refreshing;
    }
    function searchYouTube(query, retry) {
      var client = { clientName: 'WEB_REMIX', clientVersion: youtubeConfig.version, hl: 'en', gl: 'US' };
      if (youtubeConfig.visitor) client.visitorData = youtubeConfig.visitor;
      var endpoint = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false' + (youtubeConfig.key ? '&key=' + encodeURIComponent(youtubeConfig.key) : '');
      return request(endpoint, { context: { client: client }, query: query }).then(function (data) { return { tracks: parseYouTube(typeof data === 'string' ? JSON.parse(data) : data).concat(parseAlbums(typeof data === 'string' ? JSON.parse(data) : data)) }; }).catch(function (error) {
        if (error.status !== 403) throw error;
        if (!retry) throw blocked();
        return refreshYouTube().then(function () { return searchYouTube(query, false); });
      });
    }
    function webSearch(query) {
      return request('https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' music')).then(function (html) {
        var source = String(html), marker = /(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=|ytInitialData\s*=)\s*/g, match = marker.exec(source);
        if (!match) throw blocked();
        var start = source.indexOf('{', marker.lastIndex), depth = 0, quoted = false, escaped = false, end = start;
        if (start < 0) throw blocked();
        for (; end < source.length; end++) {
          var ch = source.charAt(end);
          if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
          else if (ch === '"') quoted = true;
          else if (ch === '{') depth++;
          else if (ch === '}' && --depth === 0) break;
        }
        var rows = parseYouTube(JSON.parse(source.slice(start, end + 1)));
        if (!rows.length) throw blocked();
        return { tracks: rows, searchSource: 'YouTube public web search' };
      }).catch(function () { throw blocked(); });
    }
    return {
      search: function (query) {
        query = String(query || '').trim(); if (!query || query.length > 300) return Promise.reject(new Error('Enter a search of 1–300 characters.'));
        return cached('yt:' + query, function () {
          return searchYouTube(query, true).catch(function (error) { if (error.code !== 'YOUTUBE_DIRECT_FORBIDDEN') throw error; return webSearch(query); });
        });
      },
      album: function (browseId) {
        if (!/^MPREb_[A-Za-z0-9_-]+$/.test(browseId || '')) return Promise.reject(new Error('Invalid YouTube Music album.'));
        function load() {
          var client = { clientName: 'WEB_REMIX', clientVersion: youtubeConfig.version, hl: 'en', gl: 'US' };
          if (youtubeConfig.visitor) client.visitorData = youtubeConfig.visitor;
          return request('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false' + (youtubeConfig.key ? '&key=' + encodeURIComponent(youtubeConfig.key) : ''), { context: { client: client }, browseId: browseId }).then(function (value) {
            var rows = parseYouTube(typeof value === 'string' ? JSON.parse(value) : value);
            if (!rows.length) throw new Error('YouTube did not expose this album’s tracks. It may be unavailable in your region.');
            return { tracks: rows };
          });
        }
        return cached('album:' + browseId, function () { return load().catch(function (error) { if (error.status !== 403) throw error; return refreshYouTube().then(load); }); });
      },
      spotify: function (input) {
        var link; try { link = spotifyLink(input); } catch (e) { return Promise.reject(e); }
        return cached('sp:' + link.url, function () { return request('https://open.spotify.com/embed/' + link.type + '/' + link.id).then(parseSpotify); });
      }
    };
  }
  return { create: create, parseYouTube: parseYouTube, parseAlbums: parseAlbums, parseSpotify: parseSpotify, spotifyLink: spotifyLink, matchTrack: matchTrack };
}));
