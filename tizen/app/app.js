/* Android TV shell translated to ES5 and Samsung AVPlay for Tizen 5. */
(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  var shell = el('tv-shell'), view = 'home', lastView = 'home', audio = el('audio');
  var tracks = [], current = -1, generation = 0, searchGeneration = 0, toastTimer, controlsTimer;
  var external = null, publicClient = null;
  var av = window.webapis && window.webapis.avplay, usingAv = false, avPaused = false;
  var base = '', history = read('bitchord-tv-history', []), favorites = read('bitchord-tv-favorites', []), libraryRecent = false;
  try { base = localStorage.getItem('bitchord-addon') || ''; } catch (_) {}
  if (!base) base = 'soundcloud:public';
  el('addon').value = /^https?:/.test(base) ? base : '';
  var audioFail = null, lastTime = '';
  function fit() {
    var scale = Math.min(window.innerWidth / 960, window.innerHeight / 540);
    shell.style.transform = 'scale(' + scale + ')';
    shell.style.left = Math.max(0, (window.innerWidth - 960 * scale) / 2) + 'px';
    shell.style.top = Math.max(0, (window.innerHeight - 540 * scale) / 2) + 'px';
  }
  fit(); window.addEventListener('resize', fit);
  function status(text) { el('status').textContent = text; el('status').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el('status').hidden = true; }, 5500); }
  function show(next, focusContent) {
    if (next === 'playing' && view !== 'playing') lastView = view;
    view = next;
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (page) { page.hidden = page.id !== 'view-' + next; });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (button) {
      var selected = button.getAttribute('data-view') === next; button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    el('topbar').hidden = next === 'playing';
    if (next === 'home' || next === 'library') renderSaved();
    if (next === 'playing') controls();
    if (focusContent) {
      var target = next === 'search' ? el('query') : next === 'playing' ? (current >= 0 ? el('toggle') : el('close-player')) : document.querySelector('#view-' + next + ' button');
      if (target && !target.disabled) target.focus();
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) { button.onclick = function () { show(button.getAttribute('data-view'), false); }; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (button) { button.onclick = function () { show(button.getAttribute('data-go'), true); }; });
  el('account').onclick = function () { show('settings', true); el('open-youtube').focus(); };
  el('open-player').onclick = function () { show('playing', true); };
  el('close-player').onclick = function () { show(lastView, false); var tab = document.querySelector('#tabs [data-view="' + lastView + '"]'); if (tab) tab.focus(); };
  function controls() { el('view-playing').classList.add('controls-on'); clearTimeout(controlsTimer); controlsTimer = setTimeout(function () { if (document.activeElement && !el('transport').contains(document.activeElement)) el('view-playing').classList.remove('controls-on'); }, 6000); }
  function get(path, done) {
    if (base === 'soundcloud:public') {
      if (!publicClient) publicClient = SoundCloudPublic.create(window.SOUNDCLOUD_PUBLIC_BOOTSTRAP || {});
      if (path === '/manifest.json') { done(null, { id: 'soundcloud.public', name: 'SoundCloud Public' }); return; }
      var task = path.indexOf('/search?') === 0 ? publicClient.search(decodeURIComponent(path.split('q=')[1] || '')) : publicClient.stream(decodeURIComponent(path.slice(8)));
      task.then(function (data) { done(null, data); }, function (error) { done(error.message); }); return;
    }
    var xhr = new XMLHttpRequest(); xhr.open('GET', base + path); xhr.timeout = 20000;
    xhr.onload = function () { var data; try { data = JSON.parse(xhr.responseText); } catch (_) { done('Invalid addon response'); return; }
      if (xhr.status < 200 || xhr.status >= 300) { done(data.error || 'Addon request failed (' + xhr.status + ')'); return; } done(null, data); };
    xhr.onerror = function () { done('Cannot reach addon. Check the address, network and HTTPS certificate.'); };
    xhr.ontimeout = function () { done('Addon timed out'); }; xhr.send();
  }
  function closeAv() {
    if (av && usingAv) { try { av.stop(); } catch (_) {} try { av.close(); } catch (_) {} }
    usingAv = false; avPaused = false;
  }
  function stop() {
    if (external) { var old = external; external = null; old.stop(); }
    audioFail = null; audio.pause(); audio.removeAttribute('src'); audio.load();
    closeAv(); el('toggle').textContent = '▶';
  }
  function time(n) { n = Math.max(0, Math.floor(n || 0)); return Math.floor(n / 60) + ':' + ('0' + n % 60).slice(-2); }
  function showTime(position, duration) {
    var label = time(position) + ' / ' + time(duration);
    if (label !== lastTime) { lastTime = label; el('time').textContent = label; }
    el('progress').style.transform = 'scaleX(' + (duration > 0 ? Math.min(1, position / duration) : 0) + ')';
  }
  function bigArt(url) { return url.replace('-t300x300.', '-t500x500.'); }
  function artURL(track) { var url = track.artworkURL || track.albumArtworkURL || ''; return /^https?:\/\//i.test(url) ? url : ''; }
  function record(track) {
    return { id: track.id, title: track.title, artist: track.artist, artworkURL: artURL(track), duration: track.duration, source: track.source, uploader: track.uploader, permalinkURL: track.permalinkURL, _base: base };
  }
  function same(a, b) { return a.id === b.id && a._base === b._base; }
  function isFavorite(track) { var item = record(track); return favorites.some(function (saved) { return same(saved, item); }); }
  function favoriteState() { var saved = current >= 0 && tracks[current] && isFavorite(tracks[current]); el('favorite').textContent = saved ? '♥' : '♡'; el('favorite').classList.toggle('saved', !!saved); el('favorite').setAttribute('aria-label', saved ? 'Remove from favorites' : 'Favorite song'); }
  function remember(track) { var item = record(track); history = [item].concat(history.filter(function (old) { return !same(old, item); })).slice(0, 40); save('bitchord-tv-history', history); if (view === 'home' || view === 'library') renderSaved(); }
  var colorCache = {};
  function artworkColor(url, done) {
    if (colorCache[url]) { done(colorCache[url]); return; }
    var image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = function () {
      try {
        var canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24;
        var context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 24, 24);
        var pixels = context.getImageData(0, 0, 24, 24).data, red = 0, green = 0, blue = 0, weight = 0;
        for (var i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 100) continue;
          var w = 1 + Math.floor((Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2])) / 16);
          red += pixels[i] * w; green += pixels[i + 1] * w; blue += pixels[i + 2] * w; weight += w;
        }
        if (!weight) return;
        var r = Math.floor(red / weight) / 255, g = Math.floor(green / weight) / 255, b = Math.floor(blue / weight) / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, hue = 0;
        if (delta) { if (max === r) hue = ((g - b) / delta + 6) % 6; else if (max === g) hue = (b - r) / delta + 2; else hue = (r - g) / delta + 4; }
        var saturation = Math.max(0.30, Math.min(0.80, (max ? delta / max : 0) * 1.3)), value = 0.38;
        var chroma = value * saturation, x = chroma * (1 - Math.abs(hue % 2 - 1)), m = value - chroma;
        var rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
        var color = 'rgb(' + rgb.map(function (channel) { return Math.round((channel + m) * 255); }).join(',') + ')';
        colorCache[url] = color; done(color);
      } catch (_) { /* Artwork without CORS keeps the original neutral footer. */ }
    };
    image.src = url;
  }
  var imageObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting || entry.intersectionRatio > 0) { var image = entry.target; image.src = image.getAttribute('data-src'); imageObserver.unobserve(image); } });
  }, { rootMargin: '180px' }) : null;
  function renderCards(container, list) {
    container.textContent = '';
    list.forEach(function (track, index) {
      var card = document.createElement('button'); card.className = 'track-card'; card.setAttribute('aria-label', (track.title || 'Untitled') + ' by ' + (track.artist || 'Unknown artist'));
      var art = document.createElement('span'); art.className = 'card-art'; art.textContent = '♫'; var url = artURL(track);
      if (url) { var image = document.createElement('img'); if (imageObserver) image.setAttribute('data-src', url); else image.src = url; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.onerror = function () { image.hidden = true; }; art.appendChild(image); }
      var copy = document.createElement('span'); copy.className = 'card-copy'; var title = document.createElement('strong'); title.textContent = track.title || 'Untitled';
      var artist = document.createElement('small'); artist.textContent = track.artist || ''; copy.appendChild(title); copy.appendChild(artist); card.appendChild(art); card.appendChild(copy);
      card.onclick = function () { tracks = list.slice(); play(index); };
      container.appendChild(card);
      if (url && imageObserver) imageObserver.observe(image);
    });
  }
  function renderSaved() {
    var recent = history.filter(function (track) { return track._base === base; });
    el('home-empty').hidden = !!recent.length; el('home-content').hidden = !recent.length; renderCards(el('home-cards'), recent);
    var saved = (libraryRecent ? history : favorites).filter(function (track) { return track._base === base; });
    el('library-empty').hidden = !!saved.length; renderCards(el('library-cards'), saved);
  }
  function play(index) {
    if (!tracks[index]) return;
    stop(); current = index; var request = ++generation, track = tracks[index];
    el('now').textContent = track.title + ' — ' + track.artist;
    el('player-title').textContent = track.title || ''; el('player-artist').textContent = track.artist || '';
    el('player-empty').hidden = true; el('player-stage').hidden = false; el('transport').hidden = false;
    var artwork = artURL(track); el('player-art').hidden = !artwork; el('player-art-fallback').hidden = !!artwork;
    el('canvas-art').style.backgroundColor = '';
    if (artwork) { el('player-art').src = bigArt(artwork); artworkColor(artwork, function (color) { if (request === generation) el('canvas-art').style.backgroundColor = color; }); }
    else el('player-art').removeAttribute('src');
    var link = el('source-link'), safeLink = /^https:\/\/(www\.)?soundcloud\.com\//.test(track.permalinkURL || '');
    link.hidden = !safeLink; if (safeLink) { link.href = track.permalinkURL; link.textContent = '☁ SoundCloud · ' + (track.uploader || track.artist || '') + ' ↗'; }
    favoriteState(); show('playing', true); status('Resolving stream…'); showTime(0, track.duration);
    function started() { remember(track); el('toggle').textContent = 'Ⅱ'; status('Playing'); }
    function begin(list, i) {
      if (request !== generation) return;
      var item = list[i], last = i + 1 >= list.length;
      function nextStream() {
        if (request !== generation) return;
        closeAv(); audioFail = null; audio.pause(); audio.removeAttribute('src');
        if (last) status('This TV cannot decode any stream for this track. Try another song.'); else begin(list, i + 1);
      }
      function viaAudio() {
        audioFail = nextStream; audio.src = item.url;
        var promise; try { promise = audio.play(); } catch (_) { nextStream(); return; }
        if (promise && promise.then) promise.then(function () { if (request === generation) started(); }, function () { if (audioFail) nextStream(); });
        else started();
      }
      if (!av) { viaAudio(); return; }
      var playing = false, failed = false;
      function avFailed() { if (failed || playing || request !== generation) return; failed = true; closeAv(); viaAudio(); }
      try {
        usingAv = true; av.open(item.url);
        av.setListener({ oncurrentplaytime: function (ms) { if (request === generation) showTime(ms / 1000, av.getDuration() / 1000); },
          onstreamcompleted: function () { if (request === generation) play(current + 1); },
          onerror: function () { if (request !== generation) return; if (playing) status('TV playback error'); else avFailed(); } });
        av.prepareAsync(function () {
          if (request !== generation || failed) return;
          try { av.play(); } catch (_) { avFailed(); return; }
          playing = true; started();
        }, avFailed);
      } catch (_) { avFailed(); }
    }
    function start(err, stream) {
      if (request !== generation) return;
      if (err) { status(err); return; }
      if (!stream.url || !/^https?:\/\//i.test(stream.url) || (stream.encrypted && stream.encrypted !== 'false')) { status('This stream is not supported'); return; }
      var list = [stream].concat(stream.alternates || []).filter(function (item) { return item && /^https?:\/\//i.test(item.url || ''); });
      begin(list, 0);
    }
    if (track.streamURL) start(null, { url: track.streamURL }); else get('/stream/' + encodeURIComponent(track.id), start);
  }
  function toggle() {
    if (external) { external.toggle(); controls(); return; }
    if (usingAv) { try { if (avPaused) av.play(); else av.pause(); avPaused = !avPaused; el('toggle').textContent = avPaused ? '▶' : 'Ⅱ'; } catch (_) {} }
    else if (audio.src) { if (audio.paused) { var p = audio.play(); if (p) p.catch(function () { status('Playback failed'); }); } else audio.pause(); }
    else play(current < 0 ? 0 : current); controls();
  }
  function seek(seconds) { if (external) { external.seek(seconds); controls(); return; } try { if (usingAv) av.seekTo(Math.max(0, Math.min(av.getDuration(), av.getCurrentTime() + seconds * 1000))); else if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds)); } catch (_) {} controls(); }
  function clearQueue() { ++generation; ++searchGeneration; stop(); tracks = []; current = -1; el('results').textContent = ''; el('now').textContent = 'Nothing playing'; el('player-empty').hidden = false; el('player-stage').hidden = true; el('transport').hidden = true; renderSaved(); }
  el('settings').onsubmit = function (event) {
    event.preventDefault(); var value = el('addon').value.trim().replace(/\/manifest\.json\/?$/, '').replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(value)) { status('Enter an http:// or https:// addon URL'); return; }
    base = value; clearQueue(); try { localStorage.setItem('bitchord-addon', base); } catch (_) {}
    var expected = base;
    get('/manifest.json', function (err, data) { if (base === expected) status(err || 'Connected to ' + (data.name || data.id)); });
  };
  el('search').onsubmit = function (event) {
    event.preventDefault(); if (!base) { status('Choose a music source in Settings first'); return; }
    var query = el('query').value.trim(); if (!query) return;
    var request = ++searchGeneration; status('Searching…');
    get('/search?q=' + encodeURIComponent(query), function (err, data) {
      if (request !== searchGeneration) return; if (err) { status(err); return; }
      var results = data.tracks || []; renderCards(el('results'), results); el('search-empty').hidden = !!results.length;
      el('search-heading').textContent = results.length ? 'Songs' : 'No Results'; status(results.length + ' tracks');
      var first = el('results').querySelector('button'); if (first) first.focus();
    });
  };
  el('library-favorites').onclick = function () { libraryRecent = false; this.classList.add('selected'); el('library-recent').classList.remove('selected'); renderSaved(); };
  el('library-recent').onclick = function () { libraryRecent = true; this.classList.add('selected'); el('library-favorites').classList.remove('selected'); renderSaved(); };
  el('favorite').onclick = function () {
    if (current < 0 || !tracks[current]) return; var item = record(tracks[current]);
    if (isFavorite(tracks[current])) favorites = favorites.filter(function (old) { return !same(old, item); }); else favorites.unshift(item);
    favorites = favorites.slice(0, 100); save('bitchord-tv-favorites', favorites); favoriteState(); renderSaved();
  };
  var genres = [['Pop', '#774744'], ['Electronic', '#3b4566'], ['Hip-Hop', '#59476d'], ['Rock', '#465b64'], ['Jazz', '#6c5140'], ['Classical', '#4d5967'], ['Ambient', '#46615b'], ['Soul', '#724d60']];
  genres.forEach(function (genre) { var button = document.createElement('button'); button.className = 'genre-card'; button.style.backgroundColor = genre[1]; button.textContent = genre[0]; button.onclick = function () { show('search', true); el('query').value = genre[0]; var event = document.createEvent('Event'); event.initEvent('submit', true, true); el('search').dispatchEvent(event); }; el('genres').appendChild(button); });
  el('toggle').onclick = toggle; el('next').onclick = function () { if (external) external.next(); else play(current + 1); }; el('previous').onclick = function () { if (external) external.previous(); else play(Math.max(0, current - 1)); };
  el('backward').onclick = function () { seek(-10); }; el('forward').onclick = function () { seek(10); };
  audio.onended = function () { play(current + 1); }; audio.ontimeupdate = function () { showTime(audio.currentTime, audio.duration); };
  audio.onplay = function () { el('toggle').textContent = 'Ⅱ'; }; audio.onpause = function () { el('toggle').textContent = '▶'; };
  audio.onerror = function () { if (!audio.getAttribute('src')) return; if (audioFail) audioFail(); else status('Stream failed or codec is unsupported'); };
  el('player-art').onerror = function () { this.hidden = true; el('player-art-fallback').hidden = false; };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { ++generation; stop(); } });
  try { ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious'].forEach(function (key) { try { tizen.tvinputdevice.registerKey(key); } catch (_) {} }); } catch (_) {}
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode, active = document.activeElement, typing = active && active.tagName === 'INPUT';
    if (key === 10009 || key === 27) {
      event.preventDefault(); if (typing) active.blur(); else if (view === 'playing') el('close-player').click();
      else if (active && !el('tabs').contains(active)) { var tab = document.querySelector('#tabs [data-view="' + view + '"]'); if (tab) tab.focus(); }
      else if (view !== 'home') { show('home', false); document.querySelector('#tabs [data-view="home"]').focus(); }
      else { try { tizen.application.getCurrentApplication().exit(); } catch (_) {} } return;
    }
    if (key === 10252 || key === 415 || key === 19) { event.preventDefault(); if (key === 415 && ((usingAv && !avPaused) || (!usingAv && !audio.paused))) return; if (key === 19 && ((usingAv && avPaused) || (!usingAv && audio.paused))) return; toggle(); }
    if (key === 413) { ++generation; stop(); status('Stopped'); } if (key === 417) seek(10); if (key === 412) seek(-10); if (key === 427) play(current + 1); if (key === 428) play(Math.max(0, current - 1));
    if (typing || key < 37 || key > 40) return;
    event.preventDefault(); if (view === 'playing') controls();
    var selector = ['#topbar', '#view-' + view].map(function (scope) { return scope + ' input,' + scope + ' button,' + scope + ' a,' + scope + ' summary'; }).join(',');
    var items = Array.prototype.slice.call(document.querySelectorAll(selector)), rect = active && active.getBoundingClientRect();
    if (!rect) return; var ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2, best, score = Infinity;
    items.forEach(function (item) { if (item === active || item.disabled || !item.getClientRects().length) return;
      var r = item.getBoundingClientRect(), dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy;
      var horizontal = key === 37 || key === 39, along = horizontal ? dx : dy, across = horizontal ? dy : dx;
      if ((key === 37 || key === 38) ? along >= -1 : along <= 1) return;
      var distance = Math.abs(along) + Math.abs(across) * 3; if (distance < score) { score = distance; best = item; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });
  window.BitChordPlayer = {
    notify: status,
    setSource: function (value, message) {
      base = value; el('addon').value = /^https?:/.test(base) ? base : ''; clearQueue();
      try { localStorage.setItem('bitchord-addon', base); } catch (_) {} show('search', true); status(message);
    },
    enableSoundCloud: function (helper) { window.BitChordPlayer.setSource(helper || 'soundcloud:public', 'SoundCloud public search enabled — no login required'); },
    external: function (controller, title) {
      clearQueue(); external = controller; el('player-empty').hidden = true; el('player-stage').hidden = true; el('transport').hidden = false;
      el('now').textContent = title || 'SoundCloud'; show('playing', true);
    },
    externalTime: showTime,
    clearAddon: function () { base = 'soundcloud:public'; el('addon').value = ''; clearQueue(); try { localStorage.removeItem('bitchord-addon'); } catch (_) {} status('Addon removed'); }, show: show };
  show('home', false); renderSaved(); document.querySelector('#tabs [data-view="home"]').focus();
})();
