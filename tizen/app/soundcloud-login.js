/* Browser/device pairing: the TV never collects a SoundCloud password. ES5. */
(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(key) { try { return localStorage.getItem('sc-' + key) || ''; } catch (_) { return ''; } }
  function write(key, value) { try { if (value) localStorage.setItem('sc-' + key, value); else localStorage.removeItem('sc-' + key); } catch (_) {} }
  var service = read('service') || (window.BITCHORD_CONFIG || {}).soundCloudAuthUrl || '';
  var session = read('session'), pair, timer, generation = 0, loginUrl = '';
  try { pair = JSON.parse(read('pair') || 'null'); } catch (_) { pair = null; write('pair', ''); }
  function message(text) { el('sc-status').textContent = text; }
  function origin(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return '';
    var url = document.createElement('a'); url.href = value;
    if (url.protocol !== 'https:' || !url.host || url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) return '';
    return url.protocol + '//' + url.host;
  }
  service = origin(service);
  el('sc-service').value = service;
  function request(path, method, key, callback) {
    var xhr = new XMLHttpRequest(); xhr.open(method, service + path); xhr.timeout = 20000;
    if (key) xhr.setRequestHeader('Authorization', 'Bearer ' + key);
    xhr.onload = function () {
      var data; try { data = JSON.parse(xhr.responseText); } catch (_) { callback('Invalid login service response'); return; }
      if (xhr.status < 200 || xhr.status >= 300) { callback(data.error || 'Login service failed (' + xhr.status + ')', null, xhr.status); return; }
      callback(null, data);
    };
    xhr.onerror = function () { callback('Cannot reach the login service. Check HTTPS and network access.'); };
    xhr.ontimeout = function () { callback('Login service timed out. Try again.'); };
    xhr.send();
  }
  function selectAddon(url) {
    el('addon').value = url;
    var event = document.createEvent('Event'); event.initEvent('submit', true, true); el('settings').dispatchEvent(event);
  }
  function showState() {
    el('sc-disconnect').hidden = !session;
    el('sc-login').textContent = session ? 'Use SoundCloud source' : 'Sign in with SoundCloud';
    el('sc-login').disabled = false;
    if (session) message('Connected to SoundCloud. Your session refreshes automatically.');
  }
  function cancel() {
    ++generation; clearTimeout(timer); pair = null; write('pair', '');
    el('sc-pair').hidden = true; loginUrl = ''; showState();
  }
  function displayPair() {
    if (!pair) return;
    loginUrl = pair.loginUrl; el('sc-pair').hidden = false;
    el('sc-link').textContent = loginUrl;
    var code = qrcode(0, 'M'); code.addData(loginUrl); code.make(); el('sc-qr').src = code.createDataURL(5, 20);
    message('Scan the QR code on your phone and sign in. Waiting for SoundCloud…');
  }
  function poll() {
    clearTimeout(timer); if (!pair || document.hidden) return;
    var current = generation;
    if (Date.now() >= pair.deadline) { cancel(); message('Sign-in expired. Please try again.'); return; }
    request('/pair/' + encodeURIComponent(pair.pairId), 'GET', pair.key, function (error, data, status) {
      if (current !== generation || !pair) return;
      if (status === 401 || (data && data.failed)) { cancel(); message('Sign-in was cancelled or expired. Please try again.'); return; }
      if (error) { message(error + ' Retrying…'); timer = setTimeout(poll, 5000); return; }
      if (data.connected) {
        var expected = service + '/addon/' + pair.key;
        if (data.addonUrl !== expected) { cancel(); message('Unexpected addon address from login service'); return; }
        session = pair.key; write('session', session); cancel(); selectAddon(expected); showState(); return;
      }
      timer = setTimeout(poll, 2000);
    });
  }
  el('sc-login').onclick = function () {
    if (!service) { el('sc-configuration').open = true; el('sc-service').focus(); message('The app publisher must configure a SoundCloud login service first. Enter its HTTPS address in service settings.'); return; }
    if (session) { selectAddon(service + '/addon/' + session); showState(); return; }
    cancel(); var current = generation; el('sc-login').disabled = true; message('Opening SoundCloud sign-in…');
    request('/pair', 'POST', null, function (error, data) {
      if (current !== generation) return;
      el('sc-login').disabled = false;
      if (error) { message(error); return; }
      if (!/^[A-Za-z0-9_-]{43}$/.test(data.key || '') || !/^[A-Za-z0-9_-]{43}$/.test(data.pairId || '') || typeof data.loginUrl !== 'string' || data.loginUrl.indexOf(service + '/authorize?') !== 0) { message('Invalid sign-in response'); return; }
      pair = { pairId: data.pairId, key: data.key, loginUrl: data.loginUrl, deadline: Date.now() + 600000 };
      write('pair', JSON.stringify(pair)); displayPair(); poll();
    });
  };
  el('sc-cancel').onclick = function () { cancel(); message('Sign-in cancelled'); };
  el('sc-open').onclick = function () {
    if (!loginUrl) return;
    try {
      if (window.tizen && tizen.application) {
        var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', loginUrl);
        tizen.application.launchAppControl(control, null, function () {}, function () { message('Use your phone to scan the QR code instead.'); });
      } else window.open(loginUrl, '_blank', 'noopener');
    } catch (_) { message('Use your phone to scan the QR code instead.'); }
  };
  el('sc-disconnect').onclick = function () {
    if (!session) return;
    el('sc-disconnect').disabled = true;
    request('/session', 'DELETE', session, function (error, data, status) {
      el('sc-disconnect').disabled = false;
      if (error && status !== 401) { message(error); return; }
      var addon = service + '/addon/' + session;
      session = ''; write('session', ''); cancel();
      if (el('addon').value === addon) {
        if (window.BitChordPlayer) window.BitChordPlayer.clearAddon();
        else { el('addon').value = ''; try { localStorage.removeItem('bitchord-addon'); } catch (_) {} }
      }
      message('Disconnected from SoundCloud');
    });
  };
  el('sc-service-form').onsubmit = function (event) {
    event.preventDefault(); var value = origin(el('sc-service').value.trim());
    if (!value) { message('Enter an HTTPS origin with no path, query or credentials.'); return; }
    if (session && value !== service) { message('Disconnect SoundCloud before changing the login service.'); return; }
    cancel(); service = value; write('service', service); el('sc-service').value = service; el('sc-configuration').open = false;
    message('Login service saved. Choose Sign in with SoundCloud.'); el('sc-login').focus();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearTimeout(timer); else poll(); });
  showState(); if (pair) { displayPair(); poll(); }
})();
