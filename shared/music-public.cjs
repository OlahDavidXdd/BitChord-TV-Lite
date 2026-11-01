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
      var item = node.musicResponsiveListItemRenderer || node.videoRenderer || node.playlistVideoRenderer;
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
    var input = entity.trackList || entity.tracks || (entity.type === 'track' || entity.uri && entity.uri.indexOf('spotify:track:') === 0 ? [entity] : []);
    var rows = input.map(function (track, index) {
      var title = track.title || track.name || '', artist = track.subtitle || (track.artists || []).map(function (a) { return a.name; }).join(', ');
      return { id: track.uri || String(index), title: title, artist: artist, duration: Number(track.duration || track.durationMs || 0) / 1000, artworkURL: (((entity.visualIdentity || {}).image || [])[0] || {}).url || '', source: 'Spotify' };
    }).filter(function (row) { return !!row.title; });
    if (!rows.length) throw new Error('No public tracks were returned by Spotify.');
    return { title: entity.name || entity.title || 'Spotify', tracks: rows, limited: rows.length >= 100 };
  }
  function browserRequest(url, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open(body ? 'POST' : 'GET', url); xhr.timeout = 20000;
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText); else reject(new Error('Music service request failed (' + xhr.status + ').')); };
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
    options = options || {}; var request = options.request || browserRequest, cache = Object.create(null), pending = Object.create(null);
    function cached(key, load) {
      if (cache[key] && Date.now() - cache[key].at < 120000) return Promise.resolve(cache[key].data);
      if (pending[key]) return pending[key];
      pending[key] = load().then(function (data) { if (Object.keys(cache).length > 40) cache = Object.create(null); cache[key] = { at: Date.now(), data: data }; delete pending[key]; return data; }, function (error) { delete pending[key]; throw error; });
      return pending[key];
    }
    return {
      search: function (query) {
        query = String(query || '').trim(); if (!query || query.length > 300) return Promise.reject(new Error('Enter a search of 1–300 characters.'));
        return cached('yt:' + query, function () {
          return request('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20261028.01.00', hl: 'en', gl: 'US' } }, query: query, params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D' }).then(function (data) { return { tracks: parseYouTube(typeof data === 'string' ? JSON.parse(data) : data) }; });
        });
      },
      spotify: function (input) {
        var link; try { link = spotifyLink(input); } catch (e) { return Promise.reject(e); }
        return cached('sp:' + link.url, function () { return request('https://open.spotify.com/embed/' + link.type + '/' + link.id).then(parseSpotify); });
      }
    };
  }
  return { create: create, parseYouTube: parseYouTube, parseSpotify: parseSpotify, spotifyLink: spotifyLink, matchTrack: matchTrack };
}));
