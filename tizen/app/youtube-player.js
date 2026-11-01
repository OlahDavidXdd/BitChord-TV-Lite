/* Runs at the real loopback HTTP origin, giving the official player an HTTP referrer. */
(function () {
  'use strict';
  var match = /[?&]video=([A-Za-z0-9_-]{11})(?:&|$)/.exec(window.location.search), player;
  function report(type, data) { window.parent.postMessage({ bitChordPlayer: true, type: type, data: data }, '*'); }
  window.onYouTubeIframeAPIReady = function () {
    if (!match) { report('error', 'Invalid video id'); return; }
    player = new YT.Player('player', { videoId: match[1], width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 1, playsinline: 1, origin: window.location.origin, rel: 0 }, events: {
      onReady: function (event) { report('ready'); event.target.playVideo(); },
      onStateChange: function (event) { report('state', event.data); }, onError: function (event) { report('error', event.data); }
    } });
  };
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data || event.data.bitChordCommand !== true || !player) return;
    var data = event.data;
    if (data.type === 'play') player.playVideo(); else if (data.type === 'pause') player.pauseVideo();
    else if (data.type === 'toggle') { if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); }
    else if (data.type === 'seek') player.seekTo(Math.max(0, player.getCurrentTime() + Math.max(-60, Math.min(60, Number(data.seconds) || 0))), true);
  });
  setInterval(function () { if (player && player.getCurrentTime) report('time', { position: player.getCurrentTime(), duration: player.getDuration() }); }, 1000);
}());
