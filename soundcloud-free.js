(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  var helper = read('sc-public-helper') || (window.BITCHORD_CONFIG || {}).soundCloudPublicHelperUrl || '';
  el('sc-helper').value = helper;
  el('sc-free-enable').onclick = function () { BitChordPlayer.enableSoundCloud(helper); };
  el('sc-helper-form').onsubmit = function (event) {
    event.preventDefault(); var value = el('sc-helper').value.trim().replace(/\/+$/, '');
    if (value && !/^https?:\/\/[^\s]+$/i.test(value)) { el('sc-status').textContent = 'Enter an http:// or https:// helper URL, or leave blank for direct mode.'; return; }
    helper = value; write('sc-public-helper', helper); BitChordPlayer.enableSoundCloud(helper);
    el('sc-status').textContent = helper ? 'Free helper saved. It needs no account credentials.' : 'Direct public SoundCloud enabled.';
  };
  function glass(on) {
    el('tv-shell').classList.toggle('glass-on', on); el('glass-toggle').setAttribute('aria-pressed', String(on)); el('glass-value').textContent = on ? 'On' : 'Off'; write('bitchord-tv-glass', on ? 'on' : 'off');
  }
  glass(read('bitchord-tv-glass') === 'on');
  el('glass-toggle').onclick = function () { glass(el('glass-toggle').getAttribute('aria-pressed') !== 'true'); };

  var widgetPromise;
  function widgetAPI() {
    if (window.SC && SC.Widget) return Promise.resolve(SC);
    if (widgetPromise) return widgetPromise;
    widgetPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = 'https://w.soundcloud.com/player/api.js';
      script.onload = function () { if (window.SC && SC.Widget) resolve(SC); else { widgetPromise = null; reject(new Error('SoundCloud player failed to load')); } };
      script.onerror = function () { widgetPromise = null; reject(new Error('Cannot load the SoundCloud player')); };
      document.head.appendChild(script);
    }); return widgetPromise;
  }
  window.openSoundCloudTrack = function (url) { el('sc-track-link').value = url; var event = document.createEvent('Event'); event.initEvent('submit', true, true); el('sc-link-form').dispatchEvent(event); };
  el('sc-link-form').onsubmit = function (event) {
    event.preventDefault(); var link = document.createElement('a'); link.href = el('sc-track-link').value.trim();
    if (link.protocol !== 'https:' || !/^(www\.)?soundcloud\.com$/.test(link.hostname) || link.pathname.split('/').filter(Boolean).length < 2 || link.username || link.password) {
      el('sc-status').textContent = 'Use a full https://soundcloud.com/artist/track or playlist link.'; return;
    }
    var url = 'https://soundcloud.com' + link.pathname;
    BitChordPlayer.notify('Loading the official SoundCloud player…');
    widgetAPI().then(function (SC) {
      var host = el('soundcloud-embed'), frame = document.createElement('iframe'); frame.title = 'SoundCloud player'; frame.allow = 'autoplay';
      frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&auto_play=true&show_user=true&show_artwork=true';
      var widget, active = true;
      var controller = {
        stop: function () { active = false; try { if (widget) widget.pause(); } catch (_) {} host.hidden = true; host.textContent = ''; el('favorite').disabled = false; },
        toggle: function () { if (widget) widget.toggle(); },
        next: function () { if (widget) widget.next(); }, previous: function () { if (widget) widget.prev(); },
        seek: function (seconds) { if (widget) widget.getPosition(function (ms) { if (active) widget.seekTo(Math.max(0, ms + seconds * 1000)); }); }
      };
      BitChordPlayer.external(controller, 'SoundCloud'); host.textContent = ''; host.appendChild(frame); host.hidden = false; el('favorite').disabled = true;
      widget = SC.Widget(frame);
      widget.bind(SC.Widget.Events.READY, function () { if (active) { widget.play(); BitChordPlayer.notify('SoundCloud player ready. Use Play if playback does not start automatically.'); } });
      widget.bind(SC.Widget.Events.PLAY, function () { if (active) el('toggle').textContent = 'Ⅱ'; });
      widget.bind(SC.Widget.Events.PAUSE, function () { if (active) el('toggle').textContent = '▶'; });
      widget.bind(SC.Widget.Events.PLAY_PROGRESS, function (data) { if (active) widget.getDuration(function (duration) { if (active) BitChordPlayer.externalTime(data.currentPosition / 1000, duration / 1000); }); });
      widget.bind(SC.Widget.Events.ERROR, function () { if (active) BitChordPlayer.notify('SoundCloud cannot play this link here. The uploader may restrict embedding or availability.'); });
    }).catch(function (error) { BitChordPlayer.notify(error.message); });
  };
})();
