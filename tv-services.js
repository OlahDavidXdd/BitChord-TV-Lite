/* These open the providers' own TV apps; they do not claim BitChord account sync. */
(function () {
  'use strict';
  var ids = {};
  function notify(message) { window.BitChordPlayer.notify(message); }
  function open(provider) {
    var website = provider === 'spotify' ? 'https://open.spotify.com/' : 'https://music.youtube.com/';
    if (!window.tizen || !tizen.application || !tizen.application.getAppsInfo || !tizen.application.launch) {
      if (!window.tizen) { window.open(website, '_blank', 'noopener'); notify('Opened the official service website. Sign-in there does not sync an account into BitChord.'); }
      else notify('This TV does not expose application launching to this widget. Open the official service from Samsung Smart Hub.');
      return;
    }
    function launch(id) {
      try { tizen.application.launch(id, function () {}, function () { notify('Cannot open the service app. Try opening it from Samsung Smart Hub.'); }); }
      catch (_) { notify('This TV could not launch the service app. Use Samsung Smart Hub.'); }
    }
    if (ids[provider]) { launch(ids[provider]); return; }
    try {
      tizen.application.getAppsInfo(function (apps) {
        var matches = apps.filter(function (app) { return provider === 'spotify' ? /spotify/i.test(app.name || '') : /youtube/i.test(app.name || ''); });
        if (!matches.length) { notify('The official ' + (provider === 'spotify' ? 'Spotify' : 'YouTube') + ' app was not found. Install it from Samsung Apps if your TV supports it.'); return; }
        ids[provider] = matches[0].id; launch(matches[0].id);
      }, function () { notify('Cannot inspect installed TV apps. Open the service from Samsung Smart Hub.'); });
    } catch (_) { notify('Cannot inspect installed TV apps. Use Samsung Smart Hub.'); }
  }
  document.getElementById('open-youtube').onclick = function () { open('youtube'); };
  document.getElementById('open-spotify').onclick = function () { open('spotify'); };
})();
