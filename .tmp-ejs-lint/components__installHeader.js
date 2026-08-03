/* inline script 1 */

(function () {
  var serverUUID = 'null';
  var stateText  = document.getElementById('installStateText');
  var spinnerEl  = document.getElementById('installSpinner');
  var iconWrap   = document.getElementById('installIconWrap');
  var banner     = document.getElementById('installBanner');
  var retryBtn   = document.getElementById('installRetryBtn');

  var startTime = Date.now();
  var finished  = false;

  var proto   = location.protocol === 'https:' ? 'wss' : 'ws';
  var evtWsUrl = proto + '://' + location.host + '/events/' + serverUUID;

  // Short-lived (60s) connect token — the browser never sees the node key.
  fetch('/server/' + encodeURIComponent(serverUUID) + '/ws-token', { credentials: 'same-origin' })
    .then(function(r) { if (!r.ok) throw new Error('ws-token'); return r.json(); })
    .then(function(data) {
      var evtSock = new WebSocket(evtWsUrl + '?token=' + encodeURIComponent(data.token));
      wireEvents(evtSock);
    })
    .catch(function() {});

  function wireEvents(evtSock) {
    evtSock.onmessage = function(msg) {
    var parsed;
    try { parsed = JSON.parse(msg.data); } catch(e) { return; }
    if (parsed.event !== 'lifecycle') return;
    if (parsed.data.message) stateText.textContent = parsed.data.message;
  };

  function setIcon(kind) {
    if (!spinnerEl) return;
    spinnerEl.classList.remove('animate-spin', 'text-neutral-500');
    spinnerEl.setAttribute('stroke', 'currentColor');
    spinnerEl.setAttribute('stroke-width', '2');
    var paths = {
      done: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>',
      fail: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>'
    };
    spinnerEl.innerHTML = paths[kind];
    spinnerEl.classList.add(kind === 'done' ? 'text-emerald-500' : 'text-red-500');
    if (iconWrap) {
      iconWrap.style.background = kind === 'done' ? 'var(--theme-success-bg)' : 'var(--theme-danger-bg)';
      iconWrap.className = 'h-8 w-8 rounded-lg flex items-center justify-center shrink-0';
    }
  }

  function markDone() {
    if (finished) return;
    finished = true;
    stateText.textContent = 'Installation complete';
    setIcon('done');
    setTimeout(function() { window.location.reload(); }, 1600);
  }

  function markFailed(reason) {
    if (finished) return;
    finished = true;
    stateText.textContent = 'Installation failed';
    setIcon('fail');
    if (reason) {
      stateText.textContent = 'Installation failed: ' + reason;
      stateText.classList.remove('truncate');
      stateText.classList.add('whitespace-normal', 'break-words');
    }
    if (retryBtn) retryBtn.classList.remove('hidden');
  }

  // Graduated heartbeat: reassure, then nudge once an install runs long.
  var lastMessage = 'Waiting for daemon…';
  function heartbeat() {
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    var text;
    if (elapsed > 120)      text = 'Taking longer than expected — large images can take a while.';
    else if (elapsed > 30)  text = 'Still installing — most servers are ready in under two minutes.';
    else                    text = lastMessage;
    stateText.textContent = text;
  }

  retryBtn.addEventListener('click', function() {
    retryBtn.disabled = true;
    retryBtn.textContent = 'Retrying…';
    fetch('/server/' + encodeURIComponent(serverUUID) + '/reinstall', { method: 'POST', credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) { return r.json().then(function(d) { throw new Error(d.error || 'Reinstall failed'); }); }
        window.location.reload();
      })
      .catch(function(err) {
        retryBtn.disabled = false;
        retryBtn.textContent = 'Retry install';
        if (window.modal && window.modal.alert) window.modal.alert(String(err.message || err));
      });
  });

  function poll() {
    if (finished) return;
    fetch('/server/' + serverUUID + '/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var state = data.state || (data.installed ? 'installed' : data.failed ? 'failed' : 'installing');
        if (state === 'installed') markDone();
        else if (state === 'failed') markFailed(data.error);
      })
      .catch(function() {});
  }

  var poller = setInterval(function() { poll(); heartbeat(); }, 3000);
  poll();
  heartbeat();
  }
})();
