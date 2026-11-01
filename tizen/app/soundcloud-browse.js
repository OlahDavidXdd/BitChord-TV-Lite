(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  var mode = 'tracks', page = null, generation = 0, client = SoundCloudPublic.create(window.SOUNDCLOUD_PUBLIC_BOOTSTRAP || {});
  var originalSearch = el('search').onsubmit;
  function call(path, direct) {
    var helper = el('sc-helper').value.trim().replace(/\/+$/, '');
    if (!helper) return direct();
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open('GET', helper + path); xhr.timeout = 20000;
      xhr.onload = function () { try { var data = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || 'SoundCloud page failed'); resolve(data); } catch (error) { reject(error); } };
      xhr.onerror = function () { reject(new Error('Cannot reach the SoundCloud helper.')); };
      xhr.ontimeout = function () { reject(new Error('SoundCloud page timed out.')); }; xhr.send();
    });
  }
  function collections(items, title) {
    BitChordPlayer.catalog(items, title, function (index) {
      var item = items[index];
      if (item.type === 'artist') artist(item.id); else playlist(item.id);
    });
  }
  function show(data) {
    page = data; BitChordPlayer.catalog(data.tracks || [], data.title);
    el('sc-page-actions').hidden = false;
    el('sc-page-albums').hidden = !(data.collections || []).length;
    BitChordPlayer.notify((data.tracks || []).length + ' public tracks');
  }
  function load(task) {
    var request = ++generation; BitChordPlayer.notify('Loading SoundCloud page…');
    task.then(function (data) { if (request === generation) show(data); }).catch(function (error) { if (request === generation) BitChordPlayer.notify(error.message); });
  }
  function prepare() { var helper = el('sc-helper').value.trim().replace(/\/+$/, ''), current = ''; try { current = localStorage.getItem('bitchord-addon') || ''; } catch (_) {} if (current !== (helper || 'soundcloud:public')) BitChordPlayer.enableSoundCloud(helper); else { BitChordPlayer.chooseSearchSource('addon'); BitChordPlayer.show('search', false); } }
  function artist(id) { prepare(); load(call('/artist/' + encodeURIComponent(id), function () { return client.artist(id); })); }
  function playlist(id) { prepare(); load(call('/playlist/' + encodeURIComponent(id), function () { return client.playlist(id); })); }
  ['tracks', 'albums', 'artists'].forEach(function (name) {
    el('sc-mode-' + name).onclick = function () {
      prepare(); mode = name; ++generation; el('sc-page-actions').hidden = true;
      ['tracks', 'albums', 'artists'].forEach(function (value) { el('sc-mode-' + value).classList.toggle('selected', value === mode); });
      if (el('query').value.trim()) { var event = document.createEvent('Event'); event.initEvent('submit', true, true); el('search').dispatchEvent(event); }
    };
  });
  el('search').onsubmit = function (event) {
    el('sc-page-actions').hidden = true;
    if (mode === 'tracks' || !el('source-addon').classList.contains('selected')) { ++generation; originalSearch(event); return; }
    event.preventDefault(); var query = el('query').value.trim(); if (!query) return;
    var request = ++generation; BitChordPlayer.notify('Searching SoundCloud ' + mode + '…');
    call('/catalog/search?type=' + mode + '&q=' + encodeURIComponent(query), function () { return client.browse(query, mode); }).then(function (data) {
      if (request === generation) { collections(data.items || [], data.title); BitChordPlayer.notify((data.items || []).length + ' results'); }
    }).catch(function (error) { if (request === generation) BitChordPlayer.notify(error.message); });
  };
  el('sc-page-tracks').onclick = function () { if (page) show(page); };
  el('sc-page-albums').onclick = function () { if (page) collections(page.collections || [], page.title + ' · Albums & Playlists'); };
  window.SoundCloudBrowse = { artist: artist, playlist: playlist };
}());
