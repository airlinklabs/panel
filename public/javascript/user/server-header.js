(function () {
  'use strict';

  var SECONDS_PER_DAY = 86400;
  var SECONDS_PER_HOUR = 3600;
  var SECONDS_PER_MINUTE = 60;
  var TICK_INTERVAL = 1000;

  var headerEl = document.getElementById('server-header-data');
  if (!headerEl) return;

  var serverUUID = headerEl.dataset.uuid;
  if (!serverUUID) return;

  function formatUptime(seconds) {
    var days = Math.floor(seconds / SECONDS_PER_DAY);
    var hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    var minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    var secs = Math.floor(seconds % SECONDS_PER_MINUTE);
    if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm ' + secs + 's';
    return secs + 's';
  }

  var startedAtElement = document.querySelector('[data-server-started-time]');
  var startTime = null;
  if (startedAtElement && startedAtElement.dataset.startedAt) {
    var t = new Date(startedAtElement.dataset.startedAt).getTime();
    if (!isNaN(t)) startTime = t;
  }

  var uptimeInterval = null;
  var localUptimeSeconds = 0;
  var lastOnline = false;

  function updateUptime(uptimeValue) {
    var uptimeDisplay = document.getElementById('uptime-display');
    if (!uptimeDisplay) return;
    if (typeof uptimeValue === 'number') {
      uptimeDisplay.textContent = formatUptime(uptimeValue);
      localUptimeSeconds = uptimeValue;
    } else if (startTime) {
      var now = Date.now();
      localUptimeSeconds = Math.floor((now - startTime) / 1000);
      uptimeDisplay.textContent = formatUptime(localUptimeSeconds);
    }
  }

  var STATUS_HTML = {
    online: function (uptimeText) {
      return '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
        '<span class="relative flex h-2 w-2 mr-2">' +
          '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>' +
          '<span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>' +
        '</span>' +
        '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">' +
          uptimeText +
        '</span>' +
      '</div>';
    },
    starting: '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
      '<span class="relative flex h-2 w-2 mr-2">' +
        '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>' +
        '<span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>' +
      '</span>' +
      '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Starting</span>' +
    '</div>',
    stopping: '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
      '<span class="relative flex h-2 w-2 mr-2">' +
        '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>' +
        '<span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>' +
      '</span>' +
      '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Stopping</span>' +
    '</div>',
    offline: '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
      '<span class="inline-flex h-2 w-2 rounded-full bg-red-500 mr-2"></span>' +
      '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Offline</span>' +
    '</div>'
  };

  function updateServerHeaderStatus(statusData) {
    var statusContainer = document.querySelector('[data-server-status-container]');
    if (!statusContainer) return;

    if (statusData && statusData.online) {
      if (!lastOnline) {
        var uptimeText = statusData.uptime != null ? 'Uptime: <span id="uptime-display">' + formatUptime(statusData.uptime) + '</span>' : 'Online';
        statusContainer.innerHTML = STATUS_HTML.online(uptimeText);
        if (statusData.uptime != null) updateUptime(statusData.uptime);
        startLocalUptimeTicker();
      } else {
        if (statusData.uptime != null) updateUptime(statusData.uptime);
      }
      lastOnline = true;
    } else if (statusData && statusData.stopping) {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML = STATUS_HTML.stopping;
    } else if (statusData && statusData.starting) {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML = STATUS_HTML.starting;
    } else if (statusData && statusData.daemonOffline) {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML = STATUS_HTML.offline;
    } else {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML = STATUS_HTML.offline;
    }
  }

  function startLocalUptimeTicker() {
    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(function () {
      if (startTime) {
        var now = Date.now();
        localUptimeSeconds = Math.floor((now - startTime) / 1000);
        updateUptime(localUptimeSeconds);
      }
    }, TICK_INTERVAL);
  }

  // Live status over the shared /ws/realtime socket (bootstrapped in
  // footer.ejs). There is no poll loop; the socket is the single source of
  // truth and every status.changed refresh reloads the freshest snapshot.
  var realtimeWired = false;
  var stopStatusObserver = null;

  function onRealtimeStatus(snap) {
    if (!snap || snap.status !== 'success' || !snap.data) return;
    var s = snap.data;
    updateServerHeaderStatus({
      online: s.running === true,
      starting: s.starting === true || s.status === 'starting' || s.status === 'restarting',
      stopping: s.stopping === true || s.status === 'stopping',
      daemonOffline: s.daemonOffline === true,
      uptime: typeof s.uptime === 'number' ? s.uptime : null,
      startedAt: s.startedAt || null,
    });
  }

  function wireRealtime() {
    if (realtimeWired) return;
    var rt = window.alRealtime;
    var st = window.alState;
    if (!rt || !st) return;
    realtimeWired = true;

    stopStatusObserver = st.observe('server:status:' + serverUUID, onRealtimeStatus);
    rt.watch(serverUUID);
    rt.watchEvents(serverUUID);

    function teardownRealtime() {
      if (stopStatusObserver) {
        stopStatusObserver();
        stopStatusObserver = null;
      }
      try {
        window.alRealtime.unwatch(serverUUID);
        window.alRealtime.unwatchEvents(serverUUID);
      } catch (e) {
        /* already closed */
      }
    }

    // Turbo navigation does not fire pagehide. Release on its cache boundary
    // too, otherwise each visited server leaves daemon watchers behind.
    window.alListener(document, 'turbo:before-cache', 'server-header-realtime-teardown', teardownRealtime);
    window.alListener(window, 'pagehide', 'server-header-realtime-teardown', teardownRealtime);
  }

  if (window.alRealtime) wireRealtime();
  else window.alListener(window, 'al:realtime-ready', 'server-header-realtime-ready', wireRealtime);
})();
