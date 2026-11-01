(function () {
  'use strict';
  window.OnTVPlayer = { play: function (resolved, track, navigation) {
    var origin = (window.BITCHORD_CONFIG || {}).onTVServiceOrigin || 'http://127.0.0.1:8790';
    var host = document.getElementById('youtube-embed'), frame = document.createElement('iframe'), active = true, focusTimer;
    var id = resolved.videoId || resolved.id;
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) { BitChordPlayer.notify('Invalid YouTube video id'); return; }
    frame.title = 'YouTube player'; frame.allow = 'autoplay; fullscreen'; frame.tabIndex = -1; frame.style.pointerEvents = 'none';
    function command(type, seconds) { if (active && frame.contentWindow) frame.contentWindow.postMessage({ bitChordCommand: true, type: type, seconds: seconds }, origin); }
    function message(event) {
      if (!active || event.source !== frame.contentWindow || event.origin !== origin || !event.data || !event.data.bitChordPlayer) return;
      var data = event.data;
      if (data.type === 'ready') BitChordPlayer.notify('YouTube player ready · served by this TV');
      else if (data.type === 'time') BitChordPlayer.externalTime(data.data.position, data.data.duration);
      else if (data.type === 'state') { document.getElementById('toggle').textContent = data.data === 1 ? 'Ⅱ' : '▶'; if (data.data === 0) navigation.next(); }
      else if (data.type === 'error') BitChordPlayer.notify('YouTube player rejected this recording on this TV (error ' + data.data + '). The service is running locally, but YouTube still controls availability.');
    }
    var controller = {
      stop: function () { active = false; clearInterval(focusTimer); window.removeEventListener('message', message); host.hidden = true; host.textContent = ''; document.getElementById('exit-embedded').hidden = true; document.getElementById('favorite').disabled = false; },
      toggle: function () { command('toggle'); }, seek: function (seconds) { command('seek', seconds); }, next: navigation.next, previous: navigation.previous
    };
    BitChordPlayer.external(controller, track.title + ' — ' + track.artist); window.addEventListener('message', message);
    host.textContent = ''; host.hidden = false; host.appendChild(frame); frame.src = origin + '/youtube-player.html?video=' + encodeURIComponent(id);
    document.getElementById('favorite').disabled = true; document.getElementById('exit-embedded').hidden = false; document.getElementById('exit-embedded').focus();
    focusTimer = setInterval(function () { if (active && document.activeElement === frame) document.getElementById('exit-embedded').focus(); }, 200);
  } };
}());
