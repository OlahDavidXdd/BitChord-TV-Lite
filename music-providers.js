(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  var api = BitChordMusic.create(), helper = read('bitchord-music-helper') || '', source = read('bitchord-music-source') || 'addon';
  var searchGeneration = 0, queue = [], position = 0, playbackGeneration = 0, ytPromise;
  var originalSearch = el('search').onsubmit, originalSoundCloud = el('sc-free-enable').onclick;
  el('music-helper').value = helper;
  function searchError(error) { el('music-problem').textContent = error.message; el('music-error').hidden = false; el('music-helper-open').hidden = error.code !== 'YOUTUBE_DIRECT_FORBIDDEN'; notify(error.message); }
  el('music-helper-open').onclick = function () { BitChordPlayer.show('settings', false); var details = el('music-helper').closest('details'); if (details) details.open = true; el('music-helper').focus(); };
  function notify(message) { BitChordPlayer.notify(message); }
  function choose(next, open) {
    source = next; ++searchGeneration; BitChordPlayer.cancelSearch(); save('bitchord-music-source', source);
    ['addon', 'youtube', 'spotify'].forEach(function (name) { el('source-' + name).classList.toggle('selected', name === source); });
    el('query').placeholder = source === 'spotify' ? 'https://open.spotify.com/playlist/…' : 'Artists, Songs, Albums and More';
    if (open) BitChordPlayer.show('search', true);
  }
  ['addon', 'youtube', 'spotify'].forEach(function (name) { el('source-' + name).onclick = function () { choose(name, true); }; });
  BitChordPlayer.chooseSearchSource = function (name) { choose(name, false); };
  el('music-youtube').onclick = function () { choose('youtube', true); };
  el('music-spotify').onclick = function () { choose('spotify', true); notify('Paste a public Spotify playlist, album or track link. Account login is coming later.'); };
  var enableSoundCloud = BitChordPlayer.enableSoundCloud;
  BitChordPlayer.enableSoundCloud = function (helperUrl) { choose('addon', false); enableSoundCloud(helperUrl); };
  var setSource = BitChordPlayer.setSource;
  BitChordPlayer.setSource = function (url, message) { choose('addon', false); setSource(url, message); };
  var addonSettings = el('settings').onsubmit;
  el('settings').onsubmit = function (event) { choose('addon', false); addonSettings(event); };
  el('sc-free-enable').onclick = function () { choose('addon', false); originalSoundCloud(); };
  el('music-helper-form').onsubmit = function (event) {
    event.preventDefault(); var value = el('music-helper').value.trim().replace(/\/+$/, '');
    if (value && !/^https?:\/\/[^\s?#@]+$/i.test(value)) { notify('Enter an http:// or https:// helper URL, or leave it blank.'); return; }
    helper = value; save('bitchord-music-helper', helper); ++searchGeneration; notify(helper ? 'Music helper saved.' : 'Direct music requests enabled.');
  };
  function call(path, direct) {
    if (!helper) return direct();
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open('GET', helper + path); xhr.timeout = 20000;
      xhr.onload = function () { try { var data = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || 'Music helper request failed.'); resolve(data); } catch (error) { reject(error); } };
      xhr.onerror = function () { reject(new Error('Cannot reach the music helper. Check Settings and its HTTPS certificate.')); };
      xhr.ontimeout = function () { reject(new Error('Music helper timed out.')); }; xhr.send();
    });
  }
  function search(query) { helper = read('bitchord-music-helper') || ''; return call('/yt/search?q=' + encodeURIComponent(query), function () { return api.search(query); }).then(function (data) { (data.tracks || []).forEach(function (track) { if (/^[A-Za-z0-9_-]{11}$/.test(track.id || '')) track.videoId = track.id; }); return data; }); }
  function spotify(link) { return call('/spotify/public?url=' + encodeURIComponent(link), function () { return api.spotify(link); }); }
  function playerAPI() {
    if (window.YT && YT.Player) return Promise.resolve(YT);
    if (ytPromise) return ytPromise;
    ytPromise = new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { ytPromise = null; reject(new Error('YouTube player timed out. Check the TV connection.')); }, 20000);
      window.onYouTubeIframeAPIReady = function () { clearTimeout(timer); resolve(window.YT); };
      var script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = function () { clearTimeout(timer); ytPromise = null; reject(new Error('Cannot load the official YouTube player.')); }; document.head.appendChild(script);
    }); return ytPromise;
  }
  function play(index) {
    if (!queue[index]) { notify('End of playlist.'); return; }
    position = index; var track = queue[index], attempt = ++playbackGeneration;
    notify(track.source === 'Spotify' ? 'Matching Spotify track on YouTube Music…' : 'Loading YouTube Music…');
    var matching = track.videoId ? Promise.resolve(track) : search(track.title + ' ' + track.artist).then(function (data) {
      var match = BitChordMusic.matchTrack(track, data.tracks || []);
      if (!match) throw new Error('No confident YouTube match for this Spotify track. Try the next song or search manually.');
      return match;
    });
    matching.then(function (resolved) {
      if (attempt !== playbackGeneration) return;
      if (helper) {
        var row = {}; Object.keys(resolved).forEach(function (key) { row[key] = resolved[key]; }); row.id = resolved.videoId || resolved.id;
        BitChordPlayer.nativeTrack(row, helper + '/yt', { next: function () { play(position + 1); }, previous: function () { play(Math.max(0, position - 1)); } });
        notify(track.source === 'Spotify' ? 'Playing Spotify selection through matched YouTube audio' : 'Playing native TV audio');
        return;
      }
      return playerAPI().then(function (YT) {
        if (attempt !== playbackGeneration) return;
        var host = el('youtube-embed'), player, active = true, timer;
        var controller = {
          stop: function () { active = false; clearInterval(timer); if (player) try { player.destroy(); } catch (_) {} host.hidden = true; host.textContent = ''; el('favorite').disabled = false; },
          toggle: function () { if (player) { if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); } },
          seek: function (seconds) { if (player) player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true); },
          next: function () { play(position + 1); }, previous: function () { play(Math.max(0, position - 1)); }
        };
        BitChordPlayer.external(controller, track.title + ' — ' + track.artist);
        el('favorite').disabled = true; host.hidden = false; host.textContent = '';
        var mount = document.createElement('div'); host.appendChild(mount);
        var vars = { autoplay: 1, controls: 1, playsinline: 1, rel: 0, widget_referrer: 'https://olahdavidxdd.github.io/BitChord-TV-Lite/' };
        if (/^https?:$/.test(window.location.protocol)) vars.origin = window.location.origin;
        player = new YT.Player(mount, { host: 'https://www.youtube.com', width: 560, height: 315, videoId: resolved.videoId, playerVars: vars,
          events: {
            onReady: function (event) { if (active) { event.target.playVideo(); notify(track.source === 'Spotify' ? 'Spotify selection · playing the matched YouTube recording' : 'YouTube Music'); } },
            onStateChange: function (event) { if (!active) return; el('toggle').textContent = event.data === 1 ? 'Ⅱ' : '▶'; if (event.data === 0) controller.next(); },
            onError: function (event) { if (active) notify(event.data === 101 || event.data === 150 ? 'The uploader disabled embedded playback. Choose another recording.' : event.data === 153 ? 'YouTube rejected this TV widget identity. Playback needs a supported web origin.' : 'YouTube cannot play this recording on this TV (error ' + event.data + ').'); }
          }
        });
        timer = setInterval(function () { if (active && player && player.getCurrentTime) BitChordPlayer.externalTime(player.getCurrentTime(), player.getDuration()); }, 1000);
      });
    }).catch(function (error) { if (attempt === playbackGeneration) notify(error.message); });
  }
  window.BitChordMusicPlayer = { playRows: function (rows, index) { queue = rows; play(index); } };
  el('search').onsubmit = function (event) {
    if (source === 'addon') { ++searchGeneration; originalSearch(event); return; }
    event.preventDefault(); el('music-error').hidden = true; var query = el('query').value.trim(), request = ++searchGeneration;
    if (!query) return; notify('Searching ' + (source === 'spotify' ? 'Spotify playlist…' : 'YouTube Music…'));
    var task = source === 'spotify' ? spotify(query) : search(query);
    task.then(function (data) {
      if (request !== searchGeneration) return;
      var rows = data.tracks || [];
      BitChordPlayer.catalog(rows, data.title || 'YouTube Music', function (index) { queue = rows.slice(); play(index); });
      notify(rows.length + ' tracks' + (data.limited ? ' · Spotify exposes up to 100 tracks publicly; account login is needed for complete libraries.' : ''));
    }).catch(function (error) { if (request === searchGeneration) searchError(error); });
  };
  document.addEventListener('bitchord-playback-stop', function () { ++playbackGeneration; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) ++playbackGeneration; });
  choose(/^(addon|youtube|spotify)$/.test(source) ? source : 'addon', false);
}());
