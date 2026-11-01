/* Android TV shell translated to ES5 and Samsung AVPlay for Tizen 5. */
(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  var shell = el('tv-shell'), view = 'home', lastView = 'home', audio = el('audio');
  var tracks = [], current = -1, generation = 0, searchGeneration = 0, toastTimer, controlsTimer;
  var nativeNavigation = null;
  var external = null, publicClient = null, playbackFailed = null, preparingTimer, pageQuery = '', pageRows = [], pageOffset = null;
  var av = window.webapis && window.webapis.avplay, usingAv = false, avPaused = false;
  var base = '', history = read('bitchord-tv-history', []), favorites = read('bitchord-tv-favorites', []), libraryRecent = false;
  try { base = localStorage.getItem('bitchord-addon') || ''; } catch (_) {}
  el('addon').value = base;
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
  el('account').onclick = function () { show('settings', true); el('music-youtube').focus(); };
  el('open-player').onclick = function () { show('playing', true); };
  function closePlayer() { if (external) { ++generation; stop(); } show(lastView === 'playing' ? 'search' : lastView, false); var tab = document.querySelector('#tabs [data-view="' + view + '"]'); if (tab) tab.focus(); }
  el('close-player').onclick = closePlayer;
  el('exit-embedded').onclick = closePlayer;
  function controls() { el('view-playing').classList.add('controls-on'); clearTimeout(controlsTimer); controlsTimer = setTimeout(function () { if (document.activeElement && !el('transport').contains(document.activeElement)) el('view-playing').classList.remove('controls-on'); }, 6000); }
  function get(path, done) {
    if (base === 'soundcloud:public') {
      if (!publicClient) publicClient = SoundCloudPublic.create(window.SOUNDCLOUD_PUBLIC_BOOTSTRAP || {});
      if (path === '/manifest.json') { done(null, { id: 'soundcloud.public', name: 'SoundCloud Public' }); return; }
      var task = path.indexOf('/search?') === 0 ? publicClient.search(decodeURIComponent((/[?&]q=([^&]*)/.exec(path) || [])[1] || ''), Number((/[?&]offset=(\d+)/.exec(path) || [])[1] || 0)) : publicClient.stream(decodeURIComponent(path.slice(8)));
      task.then(function (data) { done(null, data); }, function (error) { done(error.message); }); return;
    }
    var xhr = new XMLHttpRequest(); xhr.open('GET', base + path); xhr.timeout = 20000;
    xhr.onload = function () { var data; try { data = JSON.parse(xhr.responseText); } catch (_) { done('Invalid addon response'); return; }
      if (xhr.status < 200 || xhr.status >= 300) { done(data.error || 'Addon request failed (' + xhr.status + ')'); return; } done(null, data); };
    xhr.onerror = function () { done('Cannot reach addon. Check the address, network and HTTPS certificate.'); };
    xhr.ontimeout = function () { done('Addon timed out'); }; xhr.send();
  }
  function stop() {
    document.dispatchEvent(new Event('bitchord-playback-stop'));
    nativeNavigation = null; playbackFailed = null; clearTimeout(preparingTimer);
    if (external) { var old = external; external = null; old.stop(); }
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (av && usingAv) { try { av.stop(); } catch (_) {} try { av.close(); } catch (_) {} }
    usingAv = false; avPaused = false; el('toggle').textContent = '▶';
  }
  function time(n) { n = Math.max(0, Math.floor(n || 0)); return Math.floor(n / 60) + ':' + ('0' + n % 60).slice(-2); }
  function showTime(position, duration) { var label = time(position) + ' / ' + time(duration); if (el('time').textContent !== label) el('time').textContent = label; el('progress').style.transform = 'scaleX(' + (duration > 0 ? Math.min(1, position / duration) : 0) + ')'; }
  function artURL(track) { var url = track.artworkURL || track.albumArtworkURL || ''; return /^https?:\/\//i.test(url) ? url : ''; }
  function record(track) {
    return { id: track.id, title: track.title, artist: track.artist, artworkURL: artURL(track), duration: track.duration, source: track.source, uploader: track.uploader, permalinkURL: track.permalinkURL, artistId: track.artistId, artistURL: track.artistURL, _base: base };
  }
  function same(a, b) { return a.id === b.id && a._base === b._base; }
  function isFavorite(track) { var item = record(track); return favorites.some(function (saved) { return same(saved, item); }); }
  function favoriteState() { var saved = current >= 0 && tracks[current] && isFavorite(tracks[current]); el('favorite').textContent = saved ? '♥' : '♡'; el('favorite').classList.toggle('saved', !!saved); el('favorite').setAttribute('aria-label', saved ? 'Remove from favorites' : 'Favorite song'); }
  function remember(track) { var item = record(track); history = [item].concat(history.filter(function (old) { return !same(old, item); })).slice(0, 40); save('bitchord-tv-history', history); renderSaved(); }
  var imageObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting || entry.intersectionRatio > 0) { var image = entry.target; image.src = image.getAttribute('data-src'); imageObserver.unobserve(image); } });
  }, { rootMargin: '180px' }) : null;
  function renderCards(container, list, onSelect) {
    if (imageObserver) Array.prototype.forEach.call(container.querySelectorAll('img'), function (img) { imageObserver.unobserve(img); });
    container.textContent = '';
    list.forEach(function (track, index) {
      var card = document.createElement('button'); card.className = 'track-card'; card.setAttribute('aria-label', (track.title || 'Untitled') + ' by ' + (track.artist || 'Unknown artist'));
      var art = document.createElement('span'); art.className = 'card-art'; art.textContent = '♫'; var url = artURL(track);
      if (url) { var image = document.createElement('img'); if (imageObserver) image.setAttribute('data-src', url); else image.src = url; image.alt = ''; image.loading = 'lazy'; image.onerror = function () { image.hidden = true; }; art.appendChild(image); }
      var copy = document.createElement('span'); copy.className = 'card-copy'; var title = document.createElement('strong'); title.textContent = track.title || 'Untitled';
      var artist = document.createElement('small'); artist.textContent = track.artist || ''; copy.appendChild(title); copy.appendChild(artist); card.appendChild(art); card.appendChild(copy);
      card.onclick = function () { if (onSelect) onSelect(index); else { tracks = list.slice(); play(index); } };
      container.appendChild(card);
      if (url && imageObserver) imageObserver.observe(image);
      // Keep neutral card footers: per-card canvas sampling causes extra downloads and main-thread stalls on older TVs.
    });
  }
  function renderSaved() {
    if (view !== 'home' && view !== 'library') return;
    var recent = history.filter(function (track) { return track._base === base; });
    if (view === 'home') { el('home-empty').hidden = !!recent.length; el('home-content').hidden = !recent.length; renderCards(el('home-cards'), recent); }
    var saved = (libraryRecent ? history : favorites).filter(function (track) { return track._base === base; });
    if (view === 'library') { el('library-empty').hidden = !!saved.length; renderCards(el('library-cards'), saved); }
  }
  function play(index) {
    if (!tracks[index]) return;
    stop(); current = index; var request = ++generation, track = tracks[index];
    el('now').textContent = track.title + ' — ' + track.artist;
    el('player-title').textContent = track.title || ''; el('player-artist').textContent = track.artist || '';
    el('player-empty').hidden = true; el('player-stage').hidden = false; el('transport').hidden = false;
    var artwork = artURL(track); el('player-art').hidden = !artwork; el('player-art-fallback').hidden = !!artwork;
    if (artwork) { el('player-art').src = artwork; el('canvas-art').style.backgroundImage = 'url("' + encodeURI(artwork).replace(/"/g, '%22') + '")'; }
    else { el('player-art').removeAttribute('src'); el('canvas-art').style.backgroundImage = ''; }
    var link = el('source-link'), safeLink = /^https:\/\/(www\.)?soundcloud\.com\//.test(track.permalinkURL || '');
    link.hidden = !safeLink; if (safeLink) { link.href = track.permalinkURL; link.textContent = '☁ SoundCloud · ' + (track.uploader || track.artist || '') + ' ↗'; }
    el('artist-page').hidden = !(track.source === 'SoundCloud' && track.artistId); el('artist-page').onclick = function () { if (window.SoundCloudBrowse) SoundCloudBrowse.artist(track.artistId); };
    favoriteState(); show('playing', true); status('Resolving stream…'); showTime(0, track.duration);
    function started() { clearTimeout(preparingTimer); if (usingAv) preparingTimer = setTimeout(function () { failed(); }, 20000); remember(track); el('toggle').textContent = 'Ⅱ'; status('Playing'); }
    var candidates = [], candidateIndex = 0, fallbackUsed = false, failing = false, streamTicket = 0;
    function failed(ticket) {
      if (request !== generation || failing || (ticket != null && ticket !== streamTicket)) return;
      failing = true; playbackFailed = null; clearTimeout(preparingTimer);
      if (av && usingAv) try { av.stop(); } catch (_) {} try { av.close(); } catch (_) {}
      usingAv = false; audio.pause(); audio.removeAttribute('src'); audio.load();
      setTimeout(function () {
        if (request !== generation) return; failing = false;
        if (candidateIndex < candidates.length) { status('Trying another TV-compatible stream…'); start(null, candidates[candidateIndex++], true); }
        else if (!fallbackUsed && track.source === 'SoundCloud' && track.permalinkURL && window.openSoundCloudTrack) {
          fallbackUsed = true; status('Opening SoundCloud’s official player…');
          var savedQueue = tracks.slice(), savedIndex = current, savedBase = base;
          function fromFallback(index) { if (!savedQueue[index]) { el('toggle').textContent = '▶'; status('End of playlist'); return false; } savedIndex = index; base = savedBase; tracks = savedQueue; play(index); return true; }
          window.openSoundCloudTrack(track.permalinkURL, { next: function () { return fromFallback(savedIndex + 1); }, previous: function () { return fromFallback(Math.max(0, savedIndex - 1)); } }, track);
        } else status('No compatible MP3/AAC stream played. This track may be restricted or unsupported on this TV.');
      }, 0);
    }
    function start(err, stream, retry) {
      if (request !== generation) return;
      if (err) { if (track.source === 'SoundCloud' && track.permalinkURL) failed(); else status(err); return; }
      if (!retry) { candidates = stream.alternatives || stream.alternates || []; candidateIndex = 0; }
      var ticket = ++streamTicket; playbackFailed = function () { failed(ticket); };
      if (!stream.url || !/^https?:\/\//i.test(stream.url) || (stream.encrypted && stream.encrypted !== 'false')) { status('This stream is not supported'); return; }
      try {
        if (av) {
          usingAv = true; av.open(stream.url); clearTimeout(preparingTimer); preparingTimer = setTimeout(function () { failed(ticket); }, 15000);
          av.setListener({ oncurrentplaytime: function (ms) { if (request === generation) { if (ms > 0) clearTimeout(preparingTimer); showTime(ms / 1000, av.getDuration() / 1000); } },
            onstreamcompleted: function () { if (request === generation) { if (nativeNavigation) nativeNavigation.next(); else play(current + 1); } }, onerror: function () { if (request === generation) failed(ticket); } });
          av.prepareAsync(function () { if (request === generation && ticket === streamTicket) { av.play(); started(); } }, function () { if (request === generation) failed(ticket); });
        } else {
          audio.src = stream.url; var promise = audio.play();
          if (promise) promise.then(function () { if (request === generation) started(); }).catch(function () { if (request === generation) failed(ticket); });
          else started();
        }
      } catch (_) { failed(); }
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
    event.preventDefault(); if (!base) { status('Connect an addon or sign in from Settings first'); return; }
    var query = el('query').value.trim(); if (!query) return;
    var request = ++searchGeneration; status('Searching…');
    get('/search?q=' + encodeURIComponent(query), function (err, data) {
      if (request !== searchGeneration) return; if (err) { status(err); return; }
      var results = data.tracks || []; pageQuery = query; pageRows = results; pageOffset = data.nextOffset; el('more-results').hidden = pageOffset == null; renderCards(el('results'), results); el('search-empty').hidden = !!results.length;
      el('search-heading').textContent = results.length ? 'Songs' : 'No Results'; status(results.length + ' tracks');
      var first = el('results').querySelector('button'); if (first) first.focus();
    });
  };
  el('more-results').onclick = function () {
    if (pageOffset == null) return; var request = ++searchGeneration, button = el('more-results'); button.disabled = true;
    get('/search?q=' + encodeURIComponent(pageQuery) + '&offset=' + pageOffset, function (err, data) {
      button.disabled = false; if (request !== searchGeneration) return; if (err) { status(err); return; }
      var seen = {}; pageRows.forEach(function (track) { seen[track.id] = true; });
      pageRows = pageRows.concat((data.tracks || []).filter(function (track) { return !seen[track.id]; }));
      pageOffset = data.nextOffset; button.hidden = pageOffset == null;
      renderCards(el('results'), pageRows); status(pageRows.length + ' tracks');
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
  el('toggle').onclick = toggle; el('next').onclick = function () { if (external) external.next(); else if (nativeNavigation) nativeNavigation.next(); else play(current + 1); }; el('previous').onclick = function () { if (external) external.previous(); else if (nativeNavigation) nativeNavigation.previous(); else play(Math.max(0, current - 1)); };
  el('backward').onclick = function () { seek(-10); }; el('forward').onclick = function () { seek(10); };
  audio.onended = function () { if (nativeNavigation) nativeNavigation.next(); else play(current + 1); }; audio.ontimeupdate = function () { showTime(audio.currentTime, audio.duration); };
  audio.onplay = function () { el('toggle').textContent = 'Ⅱ'; }; audio.onpause = function () { el('toggle').textContent = '▶'; };
  audio.onerror = function () { if (audio.getAttribute('src') && playbackFailed) playbackFailed(); };
  el('player-art').onerror = function () { this.hidden = true; el('player-art-fallback').hidden = false; };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { ++generation; stop(); } });
  try { ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious'].forEach(function (key) { try { tizen.tvinputdevice.registerKey(key); } catch (_) {} }); } catch (_) {}
  var lastBackAt = 0, lastBackType = '';
  function back(event) {
    event.preventDefault(); if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    if (event.repeat || (Date.now() - lastBackAt < 250 && event.type !== lastBackType)) return;
    lastBackAt = Date.now(); lastBackType = event.type;
    var active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
      active.blur(); var selected = document.querySelector('#tabs [data-view="' + view + '"]'); if (selected) selected.focus(); return;
    }
    if (view === 'playing') { closePlayer(); return; }
    if (active && !el('tabs').contains(active)) { var tab = document.querySelector('#tabs [data-view="' + view + '"]'); if (tab) tab.focus(); }
    else if (view !== 'home') { show('home', false); document.querySelector('#tabs [data-view="home"]').focus(); }
    else try { tizen.application.getCurrentApplication().exit(); } catch (_) {}
  }
  document.addEventListener('keydown', function (event) { if (event.keyCode === 10009 || event.keyCode === 27 || event.key === 'Escape' || event.key === 'BrowserBack') back(event); }, true);
  document.addEventListener('tizenhwkey', function (event) { if (event.keyName === 'back') back(event); });
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode, active = document.activeElement, typing = active && active.tagName === 'INPUT';

    if (key === 10252 || key === 415 || key === 19) { event.preventDefault(); if (key === 415 && ((usingAv && !avPaused) || (!usingAv && !audio.paused))) return; if (key === 19 && ((usingAv && avPaused) || (!usingAv && audio.paused))) return; toggle(); }
    if (key === 413) { ++generation; stop(); status('Stopped'); } if (key === 417) seek(10); if (key === 412) seek(-10); if (key === 427) el('next').click(); if (key === 428) el('previous').click();
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
    refreshCatalog: function (rows, heading, selected) { if (view === 'search') { renderCards(el('results'), rows, selected); el('search-heading').textContent = heading; } },
    collectionCards: function (container, rows, selected) { renderCards(el(container), rows, selected); },
    nativeTrack: function (track, endpoint, navigation) {
      base = endpoint; try { localStorage.setItem('bitchord-addon', base); } catch (_) {}
      tracks = [track]; play(0); nativeNavigation = navigation;
    },
    setSource: function (value, message) { base = value; el('addon').value = /^https?:/.test(base) ? base : ''; clearQueue(); try { localStorage.setItem('bitchord-addon', base); } catch (_) {} show('search', true); status(message); },
    cancelSearch: function () { ++searchGeneration; el('more-results').hidden = true; },
    catalog: function (list, heading, onSelect) {
      ++searchGeneration; el('more-results').hidden = true; show('search', false); renderCards(el('results'), list, onSelect);
      el('search-empty').hidden = !!list.length; el('search-heading').textContent = heading || 'Songs';
      var first = el('results').querySelector('button'); if (first) first.focus();
    },
    enableSoundCloud: function (helper) {
      base = helper || 'soundcloud:public'; el('addon').value = helper || ''; clearQueue();
      try { localStorage.setItem('bitchord-addon', base); } catch (_) {} show('search', true); status('SoundCloud public search enabled — no login required');
    },
    externalMetadata: function (track) {
      el('player-stage').hidden = false; el('player-title').textContent = track.title || 'SoundCloud'; el('player-artist').textContent = track.artist || '';
      var art = artURL(track); el('player-art').hidden = !art; el('player-art-fallback').hidden = !!art;
      if (art) el('player-art').src = art; else el('player-art').removeAttribute('src');
      el('source-link').hidden = true; el('now').textContent = track.title || 'SoundCloud';
    },
    external: function (controller, title) {
      clearQueue(); el('artist-page').hidden = true; external = controller; el('player-empty').hidden = true; el('player-stage').hidden = true; el('transport').hidden = false;
      el('now').textContent = title || 'SoundCloud'; show('playing', true);
    },
    externalTime: showTime,
    clearAddon: function () { base = ''; el('addon').value = ''; clearQueue(); try { localStorage.removeItem('bitchord-addon'); } catch (_) {} status('Addon removed'); }, show: show };
  show('home', false); renderSaved(); document.querySelector('#tabs [data-view="home"]').focus();
})();
