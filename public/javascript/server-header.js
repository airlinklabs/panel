/**
 * Server Header - WebSocket status updates and uptime tracking
 * Extracted from views/desktop/components/serverHeader.ejs
 */
(function() {
  'use strict';

  const headerEl = document.getElementById('server-header-data');
  if (!headerEl) return;

  const serverUUID = headerEl.dataset.uuid;
  const isDaemonOffline = headerEl.dataset.daemonOffline === 'true';
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const shouldLog = isDevelopment && !isDaemonOffline;

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  const startedAtElement = document.getElementById('server-started-at');
  let startTime = null;
  if (startedAtElement && startedAtElement.textContent) {
    startTime = new Date(startedAtElement.textContent).getTime();
    if (shouldLog) console.log('Server start time:', new Date(startTime).toLocaleString());
  }

  let uptimeInterval = null;
  let backendFetchInterval = null;
  let lastBackendFetch = 0;
  let localUptimeSeconds = 0;

  function updateUptime(uptimeValue) {
    if (isDevelopment) console.log('Updating uptime display with value:', uptimeValue);
    const uptimeDisplay = document.getElementById('uptime-display');
    if (!uptimeDisplay) {
      if (isDevelopment) console.error('Uptime display element not found!');
      return;
    }
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
    if (shouldLog) console.log('Updating server header status:', statusData);
    const statusContainer = document.querySelector('[data-server-status-container]');
    const statusText = document.getElementById('server-status-text');
    if (!statusContainer || !statusText) return;

    if (statusData && statusData.online) {
      statusContainer.innerHTML = `
        <div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <span class="relative flex h-2 w-2 mr-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            ${statusData.uptime != null ? 'Uptime: <span id="uptime-display">' + formatUptime(statusData.uptime) + '</span>' : 'Online'}
          </span>
        </div>`;
      if (statusData.uptime != null) updateUptime(statusData.uptime);
    } else {
      statusContainer.innerHTML = `
        <div class="flex items-center px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <span class="inline-flex h-2 w-2 rounded-full bg-red-500 mr-2"></span>
          <span id="server-status-text" class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Offline</span>
        </div>`;
    }
  }

  function startLocalUptimeTicker() {
    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(() => {
      if (startTime) {
        const now = Date.now();
        localUptimeSeconds = Math.floor((now - startTime) / 1000);
        updateUptime(localUptimeSeconds);
      }
    }, 1000);
  }

  function fetchUptimeFromBackend() {
    if (!serverUUID) return;
    fetch(`/api/client/servers/${serverUUID}/uptime`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data.uptime === 'number') {
          updateUptime(data.uptime);
          lastBackendFetch = Date.now();
        }
      })
      .catch(() => {});
  }

  function connectWebSocket() {
    if (!serverUUID) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/server/${serverUUID}`;
    if (shouldLog) console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (shouldLog) console.log('WebSocket connected for server header');
      startLocalUptimeTicker();
      backendFetchInterval = setInterval(fetchUptimeFromBackend, 5000);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (shouldLog) console.log('Server header status update received:', data);
        let statusData = data;
        if (data.event === 'status' && data.data) statusData = data.data;
        updateServerHeaderStatus(statusData);
        fetchUptimeFromBackend();
      } catch (error) {
        console.error('Error processing server header status message:', error);
      }
    };
    ws.onclose = () => {
      if (shouldLog) console.log('WebSocket disconnected, reconnecting in 5s...');
      setTimeout(connectWebSocket, 5000);
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  connectWebSocket();
})();
