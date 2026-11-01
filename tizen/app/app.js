/* ES5 syntax and XHR for the Tizen 5 TV web engine. No frameworks or models. */
(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  var audio = el('audio'), tracks = [], current = -1, generation = 0, searchGeneration = 0;
  var av = window.webapis && window.webapis.avplay, usingAv = false, avPaused = false;
  var base = '';
  try { base = localStorage.getItem('bitchord-addon') || ''; } catch (_) {}
  el('addon').value = base;
  function status(s) { el('status').textContent = s; }
  function get(path, done) {
    var xhr = new XMLHttpRequest(); xhr.open('GET', base + path); xhr.timeout = 20000;
    xhr.onload = function () {
      var data; try { data = JSON.parse(xhr.responseText); } catch (_) { done('Invalid addon response'); return; }
      if (xhr.status < 200 || xhr.status >= 300) { done(data.error || 'Addon request failed (' + xhr.status + ')'); return; }
      done(null, data);
    };
    xhr.onerror = function () { done('Cannot reach addon. Check the URL, network and HTTPS certificate.'); };
    xhr.ontimeout = function () { done('Addon timed out'); }; xhr.send();
  }
  function stop() {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (av && usingAv) { try { av.stop(); av.close(); } catch (_) {} }
    usingAv = false; avPaused = false;
  }
  function time(n) { n = Math.max(0, Math.floor(n || 0)); return Math.floor(n / 60) + ':' + ('0' + n % 60).slice(-2); }
  function showTime(position, duration) { el('time').textContent = time(position) + ' / ' + time(duration); }
  function play(index) {
    if (!tracks[index]) return;
    stop(); current = index; var request = ++generation, track = tracks[index];
    el('now').textContent = track.title + ' — ' + track.artist;
    status('Resolving stream…'); showTime(0, track.duration);
    function start(err, stream) {
      if (request !== generation) return;
      if (err) { status(err); return; }
      if (!stream.url || !/^https?:\/\//i.test(stream.url) || (stream.encrypted && stream.encrypted !== 'false')) { status('This stream is not supported'); return; }
      try {
        if (av) {
          usingAv = true; av.open(stream.url);
          av.setListener({
            oncurrentplaytime: function (ms) { showTime(ms / 1000, av.getDuration() / 1000); },
            onstreamcompleted: function () { play(current + 1); },
            onerror: function () { status('TV could not decode this stream'); }
          });
          av.prepareAsync(function () { if (request === generation) { av.play(); status('Playing'); } }, function () { status('TV could not prepare this stream'); });
        } else {
          audio.src = stream.url; var promise = audio.play();
          if (promise) promise.catch(function () { status('Playback failed; this browser may not support the stream codec'); });
          status('Playing');
        }
      } catch (_) { status('Unable to play this stream on this TV'); }
    }
    if (track.streamURL) start(null, { url: track.streamURL });
    else get('/stream/' + encodeURIComponent(track.id), start);
  }
  function toggle() {
    if (usingAv) { try { if (avPaused) av.play(); else av.pause(); avPaused = !avPaused; status(avPaused ? 'Paused' : 'Playing'); } catch (_) {} }
    else if (audio.src) { if (audio.paused) { var p = audio.play(); if (p) p.catch(function () { status('Playback failed'); }); } else audio.pause(); }
    else play(current < 0 ? 0 : current);
  }
  function seek(seconds) {
    try { if (usingAv) av.seekTo(Math.max(0, Math.min(av.getDuration(), av.getCurrentTime() + seconds * 1000)));
      else if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds)); } catch (_) {}
  }
  el('settings').onsubmit = function (e) {
    e.preventDefault(); var value = el('addon').value.trim().replace(/\/manifest\.json\/?$/, '').replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(value)) { status('Enter an http:// or https:// addon URL'); return; }
    base = value; ++generation; ++searchGeneration; stop(); tracks = []; current = -1; el('results').textContent = ''; el('now').textContent = 'Nothing playing';
    try { localStorage.setItem('bitchord-addon', base); } catch (_) {}
    get('/manifest.json', function (err, data) { status(err || 'Connected to ' + (data.name || data.id)); });
  };
  el('search').onsubmit = function (e) {
    e.preventDefault(); if (!base) { status('Save an addon URL first'); return; }
    var request = ++searchGeneration; status('Searching…');
    get('/search?q=' + encodeURIComponent(el('query').value.trim()), function (err, data) {
      if (request !== searchGeneration) return;
      if (err) { status(err); return; }
      ++generation; stop(); current = -1; tracks = data.tracks || []; el('results').textContent = ''; el('now').textContent = 'Nothing playing';
      tracks.forEach(function (track, index) {
        var button = document.createElement('button'); button.className = 'track'; button.textContent = track.title || 'Untitled';
        var artist = document.createElement('small'); artist.textContent = track.artist || ''; button.appendChild(artist);
        button.onclick = function () { play(index); }; el('results').appendChild(button);
        if (track.source === 'SoundCloud') {
          var credit = document.createElement('div'); credit.className = 'source'; credit.textContent = '☁ SoundCloud · ' + (track.uploader || track.artist || '');
          if (/^https:\/\/(www\.)?soundcloud\.com\//.test(track.permalinkURL || '')) {
            var link = document.createElement('a'); link.href = track.permalinkURL; link.textContent = ' · View track on SoundCloud'; credit.appendChild(link);
          }
          el('results').appendChild(credit);
        }
      });
      status(tracks.length + ' tracks'); var first = el('results').querySelector('button'); if (first) first.focus();
    });
  };
  el('toggle').onclick = toggle; el('next').onclick = function () { play(current + 1); };
  el('previous').onclick = function () { play(Math.max(0, current - 1)); };
  el('backward').onclick = function () { seek(-10); }; el('forward').onclick = function () { seek(10); };
  audio.onended = function () { play(current + 1); };
  audio.ontimeupdate = function () { showTime(audio.currentTime, audio.duration); };
  audio.onerror = function () { if (audio.getAttribute('src')) status('Stream failed or codec is unsupported'); };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { ++generation; stop(); } });
  try { ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious'].forEach(function (key) { try { tizen.tvinputdevice.registerKey(key); } catch (_) {} }); } catch (_) {}
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode, active = document.activeElement, typing = active && active.tagName === 'INPUT';
    if (key === 10009 || key === 27) {
      event.preventDefault(); if (typing) active.blur(); else if (current >= 0) { ++generation; stop(); current = -1; status('Stopped'); } else { try { tizen.application.getCurrentApplication().exit(); } catch (_) {} } return;
    }
    if (key === 10252 || key === 415 || key === 19) { event.preventDefault(); if (key === 415 && ((usingAv && !avPaused) || (!usingAv && !audio.paused))) return; if (key === 19 && ((usingAv && avPaused) || (!usingAv && audio.paused))) return; toggle(); }
    if (key === 413) { ++generation; stop(); status('Stopped'); }
    if (key === 417) seek(10); if (key === 412) seek(-10);
    if (key === 427) play(current + 1); if (key === 428) play(Math.max(0, current - 1));
    if (typing || key < 37 || key > 40) return;
    event.preventDefault();
    var items = Array.prototype.slice.call(document.querySelectorAll('input,button,a')), origin = active && active.getBoundingClientRect();
    if (!origin) { items[0].focus(); return; }
    var ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2, best, score = Infinity;
    items.forEach(function (item) {
      if (item === active) return; var r = item.getBoundingClientRect(), dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy;
      var horizontal = key === 37 || key === 39, along = horizontal ? dx : dy, across = horizontal ? dy : dx;
      if ((key === 37 || key === 38) ? along >= -1 : along <= 1) return;
      var distance = Math.abs(along) + Math.abs(across) * 3; if (distance < score) { score = distance; best = item; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  });
  el(base ? 'query' : 'addon').focus();
})();
