(function() {
  'use strict';

  const headerEl = document.getElementById('server-header-data');
  if (!headerEl) return;

  const serverUUID = headerEl.dataset.uuid;
  if (!serverUUID) return;

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm ' + secs + 's';
    return secs + 's';
  }

  const startedAtElement = document.querySelector('[data-server-started-time]');
  let startTime = null;
  if (startedAtElement && startedAtElement.dataset.startedAt) {
    const t = new Date(startedAtElement.dataset.startedAt).getTime();
    if (!isNaN(t)) startTime = t;
  }

  let uptimeInterval = null;
  let localUptimeSeconds = 0;
  let lastOnline = false;

  function updateUptime(uptimeValue) {
    const uptimeDisplay = document.getElementById('uptime-display');
    if (!uptimeDisplay) return;
    if (typeof uptimeValue === 'number') {
      uptimeDisplay.textContent = formatUptime(uptimeValue);
      localUptimeSeconds = uptimeValue;
    } else if (startTime) {
      const now = Date.now();
      localUptimeSeconds = Math.floor((now - startTime) / 1000);
      uptimeDisplay.textContent = formatUptime(localUptimeSeconds);
    }
  }

  function updateServerHeaderStatus(statusData) {
    const statusContainer = document.querySelector('[data-server-status-container]');
    if (!statusContainer) return;

    if (statusData && statusData.online) {
      if (!lastOnline) {
        statusContainer.innerHTML =
          '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
            '<span class="relative flex h-2 w-2 mr-2">' +
              '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>' +
              '<span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>' +
            '</span>' +
            '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">' +
              (statusData.uptime != null ? 'Uptime: <span id="uptime-display">' + formatUptime(statusData.uptime) + '</span>' : 'Online') +
            '</span>' +
          '</div>';
        if (statusData.uptime != null) updateUptime(statusData.uptime);
        startLocalUptimeTicker();
      } else {
        if (statusData.uptime != null) updateUptime(statusData.uptime);
      }
      lastOnline = true;
    } else if (statusData && statusData.starting) {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML =
        '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
          '<span class="relative flex h-2 w-2 mr-2">' +
            '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>' +
            '<span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>' +
          '</span>' +
          '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Starting</span>' +
        '</div>';
    } else {
      lastOnline = false;
      if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
      statusContainer.innerHTML =
        '<div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">' +
          '<span class="inline-flex h-2 w-2 rounded-full bg-red-500 mr-2"></span>' +
          '<span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Offline</span>' +
        '</div>';
    }
  }

  function startLocalUptimeTicker() {
    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(function() {
      if (startTime) {
        const now = Date.now();
        localUptimeSeconds = Math.floor((now - startTime) / 1000);
        updateUptime(localUptimeSeconds);
      }
    }, 1000);
  }

  function pollServerStatus() {
    fetch('/server/' + serverUUID + '/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        updateServerHeaderStatus(data);
      })
      .catch(function() {});
  }

  pollServerStatus();
  setInterval(pollServerStatus, 10000);
})();
