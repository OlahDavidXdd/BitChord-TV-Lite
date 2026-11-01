(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function write(key, value) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (_) {} }
  var origin = read('bitchord-library-service'), current = 'spotify', kind = 'playlists', generation = 0, polling = {};
  el('library-service').value = origin;
  function status(message) { el('library-account-status').textContent = message; BitChordPlayer.notify(message); }
  function token(provider) { return read('bitchord-library-token-' + provider); }
  function api(path, provider, method) {
    if (!origin) return Promise.reject(new Error('Save the publisher’s configured HTTPS library service in Settings first.'));
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open(method || 'GET', origin + path); xhr.timeout = 20000;
      if (provider && token(provider)) xhr.setRequestHeader('Authorization', 'Bearer ' + token(provider));
      xhr.onload = function () { try { var data = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || 'Library request failed (' + xhr.status + ')'); resolve(data); } catch (error) { reject(error); } };
      xhr.onerror = function () { reject(new Error('Cannot reach the library service. Check its address and HTTPS certificate.')); };
      xhr.ontimeout = function () { reject(new Error('Library service timed out.')); }; xhr.send();
    });
  }
  el('library-service-form').onsubmit = function (event) {
    event.preventDefault(); var link = document.createElement('a'); link.href = el('library-service').value.trim();
    if (link.protocol !== 'https:' || !link.hostname || link.username || link.password || (link.pathname && link.pathname !== '/') || link.search || link.hash) { status('Use an HTTPS library-service origin without a path or embedded password.'); return; }
    var next = link.protocol + '//' + link.host;
    if (origin !== next) { ['spotify', 'youtube'].forEach(function (provider) { clearTimeout(polling[provider]); write('bitchord-library-token-' + provider, ''); }); }
    origin = next; write('bitchord-library-service', origin); status('Library service saved. Connect an account below.');
  };
  function poll(provider, remaining) {
    clearTimeout(polling[provider]); if (!token(provider) || document.hidden) return;
    api('/library/session', provider).then(function (data) {
      if (data.error) { status(data.error); return; }
      if (data.connected) { status((provider === 'spotify' ? 'Spotify' : 'YouTube') + ' connected. Open Library to sync.'); return; }
      if (data.expired || remaining <= 0) { status('Sign-in expired. Connect the account again.'); return; }
      polling[provider] = setTimeout(function () { poll(provider, remaining - 1); }, 3000);
    }).catch(function (error) { status(error.message); });
  }
  function connect(provider) {
    api('/library/config').then(function (config) {
      if (!config[provider]) throw new Error('The publisher has not configured ' + (provider === 'spotify' ? 'Spotify' : 'Google') + ' OAuth credentials on this library service.');
      var forget = token(provider) ? api('/library/session', provider, 'DELETE').catch(function () {}) : Promise.resolve();
      return forget.then(function () { write('bitchord-library-token-' + provider, ''); return api('/library/connect/' + provider, null, 'POST'); });
    }).then(function (data) {
      var link = document.createElement('a'); link.href = data.authorizeUrl;
      var expected = provider === 'spotify' ? 'accounts.spotify.com' : 'accounts.google.com';
      if (link.protocol !== 'https:' || link.hostname !== expected || link.username || link.password || !/^[A-Za-z0-9_-]{43}$/.test(data.device || '')) throw new Error('The library service returned an invalid sign-in response.');
      write('bitchord-library-token-' + provider, data.device);
      var launched = false;
      try { if (window.tizen && tizen.application.launchAppControl) { tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', link.href), null, function () {}, function () { status('This TV could not open its browser for sign-in.'); }); launched = true; } } catch (_) {}
      if (!launched) window.open(link.href, '_blank', 'noopener');
      status('Finish sign-in in the provider’s website on this TV, then return to BitChord.'); poll(provider, 200);
    }).catch(function (error) { status(error.message); });
  }
  ['spotify', 'youtube'].forEach(function (provider) {
    el('connect-' + provider).onclick = function () { connect(provider); };
    el('disconnect-' + provider).onclick = function () {
      clearTimeout(polling[provider]);
      api('/library/session', provider, 'DELETE').then(function () { write('bitchord-library-token-' + provider, ''); ++generation; el('account-library-cards').textContent = ''; status('Library disconnected from this TV.'); }).catch(function (error) { status(error.message); });
    };
    el('library-' + provider).onclick = function () { current = provider; kind = 'playlists'; sync(); };
  });
  function showAccount() {
    BitChordPlayer.show('library', false); el('library-cards').hidden = true; el('library-empty').hidden = true; el('account-library').hidden = false;
    el('account-library-title').textContent = current === 'spotify' ? 'Spotify library' : 'YouTube playlists & likes'; el('account-library-albums').hidden = current !== 'spotify';
  }
  function tracks(item) {
    var request = ++generation, rows = [], first = true; el('account-library-status').textContent = 'Loading ' + item.title + '…';
    function page(cursor) {
      return api('/library/tracks?id=' + encodeURIComponent(item.id) + '&type=' + encodeURIComponent(item.type || 'playlist') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), current).then(function (data) {
        if (request !== generation) return;
        Array.prototype.push.apply(rows, data.tracks || []);
        var selected = function (index) { BitChordMusicPlayer.playRows(rows, index); };
        if (first) { first = false; BitChordPlayer.catalog(rows, item.title, selected); } else BitChordPlayer.refreshCatalog(rows, item.title, selected);
        if (data.cursor && data.cursor !== cursor) return page(data.cursor);
      });
    }
    page('').catch(function (error) { if (request === generation) status(error.message); });
  }
  function sync() {
    showAccount(); var request = ++generation, rows = []; el('account-library-cards').textContent = '';
    if (!token(current)) { el('account-library-status').textContent = 'Connect this account under Settings → Library accounts first.'; return; }
    el('account-library-status').textContent = 'Syncing…';
    function page(cursor) {
      return api('/library/collections?type=' + kind + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), current).then(function (data) {
        if (request !== generation) return; rows = rows.concat(data.items || []);
        BitChordPlayer.collectionCards('account-library-cards', rows, function (index) { tracks(rows[index]); });
        el('account-library-status').textContent = rows.length + ' collections' + (data.cursor ? ' · loading more…' : ' · synced');
        if (data.cursor && data.cursor !== cursor) return page(data.cursor);
      });
    }
    page('').catch(function (error) { if (request === generation) el('account-library-status').textContent = error.message; });
  }
  el('account-library-refresh').onclick = sync;
  el('account-library-albums').onclick = function () { kind = 'albums'; sync(); };
  el('account-library-playlists').onclick = function () { kind = 'playlists'; sync(); };
  ['library-favorites', 'library-recent'].forEach(function (id) { el(id).addEventListener('click', function () { ++generation; el('account-library').hidden = true; el('library-cards').hidden = false; }); });
  document.addEventListener('visibilitychange', function () { ['spotify', 'youtube'].forEach(function (provider) { clearTimeout(polling[provider]); if (!document.hidden && token(provider)) poll(provider, 200); }); });
}());
