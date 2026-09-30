/**
 * user/server/logs.js — Log viewer interactions
 *
 * Vanilla JS, no framework. Reads window.__serverUUID set by the EJS template.
 */
(function () {
  const serverId = window.__serverUUID;

  const logsViewer = document.getElementById('logsViewer');
  const logsArchiveList = document.getElementById('logsArchiveList');
  const logsRefreshBtn = document.getElementById('logsRefreshBtn');

  function notify(type, message) {
    if (typeof window.showToast === 'function') {window.showToast(message, type);}
  }

  function setViewerError(message) {
    if (!logsViewer) {return;}
    logsViewer.textContent =
      `${window.__i18n.failedToLoadLogs || 'Failed to load logs' 
      }: ${ 
        message}`;
  }

  async function loadRecent() {
    if (!logsViewer) {return;}
    logsViewer.textContent =
      window.__i18n.loadingRecentOutput || 'Loading recent output…';
    try {
      const r = await fetch(
        `/api/v2/servers/${  encodeURIComponent(serverId)  }/logs/history`,
        { credentials: 'same-origin' },
      );
      const d = await r.json().catch(function () {
        return null;
      });
      if (!r.ok)
      {throw new Error(
        (d && d.error) || window.__i18n.requestFailed || 'request failed',
      );}
      const lines = d && Array.isArray(d.logs) ? d.logs : [];
      logsViewer.textContent =
        lines.length > 0
          ? lines.join('\n')
          : window.__i18n.noRecentOutput ||
            'No recent output saved to disk yet.';
    } catch (err) {
      setViewerError(
        (err && err.message) || window.__i18n.requestFailed || 'request failed',
      );
      notify(
        'error',
        window.__i18n.failedToLoadRecentOutput ||
          'Failed to load recent output.',
      );
    }
  }

  function formatBytes(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes))
    {return window.__i18n.unknown || 'Unknown';}
    if (bytes === 0) {return '0 B';}
    const k = 1024;
    const sizes = [
      'B',
      window.__i18n.kilobytes || 'KB',
      window.__i18n.megabytes || 'MB',
      window.__i18n.gigabytes || 'GB',
      window.__i18n.terabytes || 'TB',
    ];
    const i = Math.min(
      sizes.length - 1,
      Math.floor(Math.log(bytes) / Math.log(k)),
    );
    return `${(bytes / Math.pow(k, i)).toFixed(1)  } ${  sizes[i]}`;
  }

  function renderArchives(logs) {
    if (!logsArchiveList) {return;}
    logsArchiveList.textContent = '';

    if (!logs || logs.length === 0) {
      const li = document.createElement('li');
      li.className = 'p-8 text-center';
      li.style.color = 'var(--theme-text-muted)';
      li.textContent = window.__i18n.noSavedLogs || 'No saved logs yet.';
      logsArchiveList.appendChild(li);
      return;
    }

    logs.forEach(function (log) {
      const name = String((log && log.fileName) || '');
      const li = document.createElement('li');
      li.className = 'flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'flex items-center gap-2 min-w-0 flex-1';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'truncate text-sm font-medium';
      nameSpan.style.color = 'var(--theme-text-strong)';
      nameSpan.title = name;
      nameSpan.textContent = name;
      nameWrap.appendChild(nameSpan);
      li.appendChild(nameWrap);

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'text-xs whitespace-nowrap';
      sizeSpan.style.color = 'var(--theme-text-muted)';
      sizeSpan.textContent = formatBytes(log.size);
      li.appendChild(sizeSpan);

      const createdSpan = document.createElement('span');
      createdSpan.className = 'text-xs whitespace-nowrap';
      createdSpan.style.color = 'var(--theme-text-muted)';
      let createdText = 'Unknown';
      if (log && log.createdAt) {
        const date = new Date(log.createdAt);
        if (!isNaN(date.getTime())) {createdText = date.toLocaleString();}
      }
      createdSpan.textContent = createdText;
      li.appendChild(createdSpan);

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2 shrink-0';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className =
        'inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors';
      viewBtn.style.cssText =
        'color:var(--theme-accent);background:var(--theme-accent-subtle)';
      viewBtn.textContent = window.__i18n.view || 'View';
      viewBtn.addEventListener('click', function () {
        loadArchiveFile(name);
      });
      actions.appendChild(viewBtn);

      const downloadLink = document.createElement('a');
      downloadLink.href =
        `/server/${ 
          encodeURIComponent(serverId) 
        }/logs/archives/download?file=${ 
          encodeURIComponent(name)}`;
      downloadLink.download = name;
      downloadLink.className =
        'inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors';
      downloadLink.style.cssText =
        'color:var(--theme-success);background:var(--theme-success-bg)';
      downloadLink.textContent = window.__i18n.download || 'Download';
      actions.appendChild(downloadLink);

      li.appendChild(actions);
      logsArchiveList.appendChild(li);
    });
  }

  async function loadArchives() {
    try {
      const r = await fetch(
        `/api/v2/servers/${  encodeURIComponent(serverId)  }/logs/archives`,
        { credentials: 'same-origin' },
      );
      const d = await r.json().catch(function () {
        return null;
      });
      if (!r.ok)
      {throw new Error(
        (d && d.error) || window.__i18n.requestFailed || 'request failed',
      );}
      renderArchives((d && d.logs) || []);
    } catch {
      renderArchives([]);
      notify(
        'error',
        window.__i18n.failedToLoadSavedLogs || 'Failed to load saved logs.',
      );
    }
  }

  async function loadArchiveFile(file) {
    if (!logsViewer) {return;}
    logsViewer.textContent =
      `${window.__i18n.loading || 'Loading'  } ${  file  }…`;
    try {
      const r = await fetch(
        `/api/v2/servers/${ 
          encodeURIComponent(serverId) 
        }/logs/archives/read?file=${ 
          encodeURIComponent(file)}`,
        { credentials: 'same-origin' },
      );
      const d = await r.json().catch(function () {
        return null;
      });
      if (!r.ok)
      {throw new Error(
        (d && d.error) || window.__i18n.requestFailed || 'request failed',
      );}
      const lines = d && Array.isArray(d.lines) ? d.lines : [];
      logsViewer.textContent =
        lines.length > 0
          ? lines.join('\n')
          : window.__i18n.archiveEmpty || '(archive is empty)';
    } catch (err) {
      setViewerError(
        (err && err.message) || window.__i18n.requestFailed || 'request failed',
      );
      notify(
        'error',
        window.__i18n.failedToReadArchive || 'Failed to read archive.',
      );
    }
  }

  function refreshLogs() {
    return Promise.all([loadRecent(), loadArchives()]);
  }

  if (logsRefreshBtn) {
    logsRefreshBtn.addEventListener('click', function () {
      refreshLogs().catch(function () {});
    });
  }

  refreshLogs().catch(function () {});
})();
