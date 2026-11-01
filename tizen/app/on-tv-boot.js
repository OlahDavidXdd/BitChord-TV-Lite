(function () {
  'use strict';
  var config = window.BITCHORD_CONFIG || {};
  if (!config.onTVService) return;
  var origin = 'http://127.0.0.1:8790', attempts = 0, launched = false, stopped = false;
  config.onTVServiceReady = false;
  document.addEventListener('submit', function (event) { if (!config.onTVServiceReady && event.target && /^(search|sc-link-form)$/.test(event.target.id)) { event.preventDefault(); event.stopImmediatePropagation(); if (window.BitChordPlayer) BitChordPlayer.notify('The on-TV service is not ready. Check Music Services in Settings.'); } }, true);
  config.onTVServiceOrigin = origin; config.soundCloudPublicHelperUrl = origin;
  try { localStorage.setItem('sc-public-helper', origin); localStorage.setItem('bitchord-music-helper', origin); } catch (_) {}
  ['yt-enable', 'sp-enable', 'library-service-form'].forEach(function (id) { var element = document.getElementById(id); if (element) element.hidden = true; });
  ['music-helper', 'sc-helper'].forEach(function (id) { var input = document.getElementById(id), details = input && input.closest('details'); if (details) details.hidden = true; });
  function status(message) { var item = document.getElementById('on-tv-status'); if (item) { item.hidden = false; item.textContent = message; } }
  function check() {
    if (stopped) return;
    var completed = false; function failed() { if (!completed) { completed = true; retry(); } }
    var xhr = new XMLHttpRequest(); xhr.open('GET', origin + '/health'); xhr.timeout = 1500;
    xhr.onload = function () {
      try { var data = JSON.parse(xhr.responseText); if (xhr.status === 200 && data.onTV) { completed = true; stopped = true; config.onTVServiceReady = true; status('On-TV service running · ' + data.runtime + ' · no external server'); return; } } catch (_) {}
      failed();
    };
    xhr.onerror = failed; xhr.ontimeout = failed; xhr.send();
  }
  function retry() {
    attempts++;
    if (!launched) {
      launched = true;
      try {
        if (!window.tizen || !tizen.application || !tizen.ApplicationControl) throw new Error('Samsung service APIs are not available in this preview.');
        var packageId = tizen.application.getCurrentApplication().appInfo.packageId;
        tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'), packageId + '.LocalService', function () { status('Starting the service on this TV…'); }, function (error) { stopped = true; status('TV service launch failed: ' + (error.message || error.name || 'unknown error') + '. This build needs Samsung signing with web-service support.'); });
      } catch (error) { stopped = true; status(error.message); return; }
    }
    if (attempts >= 15) { stopped = true; status('The on-TV service did not become ready. Report this status and check the Samsung signing/service permissions.'); return; }
    setTimeout(check, 1000);
  }
  status('Checking the service on this TV…'); check();
}());
