(function () {
  const BYTES_PER_KB = 1024;
  const BYTES_PER_MB = 1048576;
  const BYTES_PER_GB = 1073741824;
  var _rootStyle = getComputedStyle(document.documentElement);
  const STAGGER_DELAY_MS = 28;
  const STAGGER_INITIAL_DELAY_MS = 60;
  const ROW_ANIMATION_DURATION_MS = 240;
  const TOOLBAR_HIDE_DELAY_MS = 80;
  var TOOLBAR_TRANSITION_MS = '0.36s ' + (_rootStyle.getPropertyValue('--ease-standard').trim() || 'cubic-bezier(0.4, 0, 0.2, 1)');
  const FLIP_THRESHOLD = 1;

  let vtEnabled = false;
  let scanMode = 'builtin';
  let currentServerIds = [];
  let radarServerNames = {};
  let availableScripts = [];

  function getChecked() {
    return Array.from(document.querySelectorAll('.server-checkbox:checked'));
  }

  let sentinelVisible = true;

  function setFloatingVisible(show) {
    const el = document.getElementById('floatingToolbar');
    if (show) {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
      el.style.pointerEvents = 'auto';
    } else {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-10px)';
      el.style.pointerEvents = 'none';
    }
  }

  function flipSiblings(before) {
    const table = document.getElementById('serverTable');
    if (!table || !before) return;
    const after = table.getBoundingClientRect();
    const dy = before.top - after.top;
    if (Math.abs(dy) < FLIP_THRESHOLD) return;
    table.style.transition = 'none';
    table.style.transform = 'translateY(' + dy + 'px)';
    requestAnimationFrame(function () {
      table.style.transition = 'transform ' + TOOLBAR_TRANSITION_MS;
      table.style.transform = 'translateY(0)';
      table.addEventListener('transitionend', function cleanup() {
        table.style.transition = '';
        table.style.transform = '';
        table.removeEventListener('transitionend', cleanup);
      });
    });
  }

  function showInlineToolbar() {
    const row     = document.getElementById('bulkToolbarRow');
    const content = document.getElementById('bulkToolbarContent');
    const table   = document.getElementById('serverTable');
    const before  = table ? table.getBoundingClientRect() : null;
    row.style.gridTemplateRows = '1fr';
    requestAnimationFrame(function () {
      flipSiblings(before);
      setTimeout(function () { content.style.opacity = '1'; }, 40);
    });
  }

  function hideInlineToolbar() {
    const row     = document.getElementById('bulkToolbarRow');
    const content = document.getElementById('bulkToolbarContent');
    const table   = document.getElementById('serverTable');
    const before  = table ? table.getBoundingClientRect() : null;
    content.style.opacity = '0';
    setTimeout(function () {
      row.style.gridTemplateRows = '0fr';
      requestAnimationFrame(function () {
        flipSiblings(before);
      });
    }, TOOLBAR_HIDE_DELAY_MS);
  }

  function updateToolbar() {
    const checked = getChecked();

    document.querySelectorAll('.selection-count').forEach(function (el) {
      el.textContent = checked.length + ' selected';
    });

    if (checked.length > 0) {
      showInlineToolbar();
      setFloatingVisible(!sentinelVisible);
    } else {
      hideInlineToolbar();
      setFloatingVisible(false);
    }
  }

  const observer = new IntersectionObserver(function (entries) {
    sentinelVisible = entries[0].isIntersecting;
    if (getChecked().length > 0) {
      setFloatingVisible(!sentinelVisible);
    }
  }, { threshold: 0 });
  observer.observe(document.getElementById('toolbarSentinel'));

  function animateCheckbox(cb) {
    if (window.animateCheckbox) window.animateCheckbox(cb);
  }

  document.querySelectorAll('.server-checkbox').forEach(function (cb) {
    cb.addEventListener('change', function () {
      animateCheckbox(this);
      updateToolbar();
    });
  });

  document.querySelectorAll('.server-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (['A', 'BUTTON', 'INPUT'].includes(e.target.tagName) || e.target.closest('a, button')) return;
      var cb = row.querySelector('.server-checkbox');
      cb.checked = !cb.checked;
      animateCheckbox(cb);
      updateToolbar();
    });
  });

  function bulkRadarScan() {
    const checked = getChecked();
    if (!checked.length) return;
    const ids = checked.map(function (cb) { return cb.value; });
    const names = {};
    checked.forEach(function (cb) { names[cb.value] = cb.dataset.name || cb.value; });
    radarServerNames = names;
    const label = checked.length === 1 ? names[ids[0]] : checked.length + ' servers';
    openRadarScanModal(ids, label);
  }

  function removeServerRows(ids) {
    const tbody = document.querySelector('#serverTable tbody');
    const rows = [];
    ids.forEach(function (id) {
      const row = document.querySelector('#serverTable .server-row[data-id="' + id + '"]');
      if (row) rows.push(row);
    });
    const chain = rows.reduce(function (p, row) {
      return p.then(function () { return al.removeRow(row); });
    }, Promise.resolve());
    chain.then(function () {
      updateToolbar();
      if (tbody && !tbody.querySelector('.server-row')) al.showEmpty(tbody, 'No servers yet.', 7);
    });
  }

  function bulkDelete() {
    const checked = getChecked();
    if (!checked.length) return;
    const msg = checked.length === 1
      ? 'Delete this server? All data will be permanently removed.'
      : 'Delete ' + checked.length + ' servers? All data will be permanently removed.';
    window.modal.confirm({
      title: checked.length === 1 ? 'Delete Server' : 'Delete ' + checked.length + ' Servers',
      body: msg,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: function () {
        const ids = checked.map(function (cb) { return cb.value; });
        let chain = Promise.resolve();
        let failed = false;
        ids.forEach(function (id) {
          chain = chain.then(function () {
            return fetch('/admin/server/delete/' + id, { method: 'POST' })
              .then(function (r) { if (!r.ok) failed = true; });
          });
        });
        chain.then(function () {
          if (failed) { showToast('Some servers failed to delete.', 'error'); return; }
          showToast('Servers deleted.', 'success');
          removeServerRows(ids);
        })
             .catch(function (err) { console.error('Bulk delete error:', err); showToast('Failed to delete servers.', 'error'); });
      }
    });
  }

  function deleteServer(id, name) {
    window.modal.confirm({
      title: 'Delete Server',
      body: 'Delete "' + name + '"? All data will be permanently removed.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async function () {
        const d = await window.api('/admin/server/delete/' + id, 'POST');
        if (d !== null) {
          showToast('Server deleted.', 'success');
          removeServerRows([String(id)]);
        }
      }
    });
  }
  window.deleteServer = deleteServer;

  fetch('/admin/radar/virustotal-enabled')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      vtEnabled = d.enabled;
      if (vtEnabled) document.getElementById('scanModeToggle').classList.remove('hidden');
    })
    .catch(function (err) { console.error('Failed to fetch VT status:', err); });

  function setScanMode(mode) {
    scanMode = mode;
    const builtinBtn = document.getElementById('modeBuiltin');
    const vtBtn = document.getElementById('modeVT');
    const active   = 'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-neutral-800 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium transition-all';
    const inactive = 'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium transition-all hover:border-neutral-400 dark:hover:border-neutral-500';
    if (mode === 'builtin') {
      builtinBtn.className = active;
      vtBtn.className = inactive;
      document.getElementById('builtinPickerSection').classList.remove('hidden');
      document.getElementById('vtScanSection').classList.add('hidden');
    } else {
      vtBtn.className = active;
      builtinBtn.className = inactive;
      document.getElementById('vtScanSection').classList.remove('hidden');
      document.getElementById('builtinPickerSection').classList.add('hidden');
    }
  }

  function openRadarScanModal(serverId, serverName) {
    currentServerIds = Array.isArray(serverId) ? serverId : [serverId];
    if (!Array.isArray(serverId)) radarServerNames = {};
    radarServerNames[Array.isArray(serverId) ? serverId[0] : serverId] = serverName;

    document.getElementById('radarScanModalTitle').textContent = currentServerIds.length === 1
      ? 'Radar Scan: ' + serverName
      : 'Radar Scan: ' + currentServerIds.length + ' servers';
    document.getElementById('radarScanModalSubtitle').textContent = 'Pick a script and run a scan against the server volume';
    document.getElementById('radarResultsPhase').classList.add('hidden');
    document.getElementById('radarRescanBtn').classList.add('hidden');
    document.getElementById('radarPickerPhase').classList.remove('hidden');
    setScanMode('builtin');
    const radarScanModal = document.getElementById('radarScanModal');
    radarScanModal.classList.remove('hidden');
    radarScanModal.classList.add('flex');
    const radarScanPanel = document.getElementById('radarScanPanel');
    Animate.openModal(radarScanModal, radarScanPanel);
    fetchRadarScripts();
  }

  function closeRadarScanModal() {
    const radarScanModal = document.getElementById('radarScanModal');
    const radarScanPanel = document.getElementById('radarScanPanel');
    var done = function () {
      radarScanModal.classList.add('hidden');
      radarScanModal.classList.remove('flex');
    };
    Animate.closeModal(radarScanModal, radarScanPanel, done);
    currentServerIds = [];
    radarServerNames = {};
  }

  function resetRadarToPickerPhase() {
    document.getElementById('radarResultsPhase').classList.add('hidden');
    document.getElementById('radarRescanBtn').classList.add('hidden');
    document.getElementById('radarPickerPhase').classList.remove('hidden');
    setScanMode(scanMode);
  }

  document.getElementById('radarScanModalBackdrop').addEventListener('click', closeRadarScanModal);

  function fetchRadarScripts() {
    const select = document.getElementById('scriptSelect');
    const runBtn = document.getElementById('runScanButton');
    select.innerHTML = '<option value="">Loading...</option>';
    runBtn.disabled = true;

    fetch('/admin/radar/scripts')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) { showToast('Failed to fetch scripts', 'error'); return; }
        availableScripts = data.scripts || [];
        select.innerHTML = '';
        if (!availableScripts.length) {
          select.innerHTML = '<option value="">No scripts available</option>';
          document.getElementById('scriptDescription').textContent = 'No radar scripts found in storage/radar/';
          return;
        }
        availableScripts.forEach(function (s) {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          select.appendChild(opt);
        });
        updateScriptDescription();
        runBtn.disabled = false;
      })
      .catch(function () { showToast('Failed to fetch scripts', 'error'); });
  }

  function updateScriptDescription() {
    const id = document.getElementById('scriptSelect').value;
    const script = availableScripts.find(function (s) { return s.id === id; });
    document.getElementById('scriptDescription').textContent = script ? script.description : '';
  }

  document.getElementById('scriptSelect').addEventListener('change', updateScriptDescription);

  function runRadarScan() {
    if (!currentServerIds.length) return;
    const scriptId = document.getElementById('scriptSelect').value;
    if (!scriptId) { showToast('Select a script first', 'error'); return; }

    const btn = document.getElementById('runScanButton');
    btn.disabled = true;
    btn.innerHTML = alIcon('loader-circle', 'animate-spin h-4 w-4') + ' Scanning...';

    Promise.all(currentServerIds.map(function (id) {
      return fetch('/admin/radar/scan/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: scriptId }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) { return { id: id, data: data }; });
    }))
      .then(function (allResults) {
        if (currentServerIds.length > 1) {
          allResults.forEach(function (r) {
            const name = radarServerNames[r.id] || r.id;
            if (!r.data.success) {
              showToast(name + ': scan failed', 'error');
            } else {
              const count = (r.data.results && r.data.results.results || []).reduce(function (s, x) { return s + (x.matches ? x.matches.length : 0); }, 0);
              showToast(name + ': ' + (count > 0 ? count + ' finding(s)' : 'clean'), count > 0 ? 'error' : 'success');
            }
          });
          closeRadarScanModal();
          return;
        }

        var single = allResults[0];
        if (!single.data.success) {
          showToast('Scan failed: ' + (single.data.error || 'Unknown error'), 'error');
        } else {
          document.getElementById('radarPickerPhase').classList.add('hidden');
          document.getElementById('radarResultsPhase').classList.remove('hidden');
          document.getElementById('radarRescanBtn').classList.remove('hidden');
          renderRadarResults(allResults);
        }
      })
      .catch(function (err) {
        console.error('Radar scan error:', err);
        showToast('Failed to run radar scan', 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = alIcon('scan-search', 'w-4 h-4', { strokeWidth: 1.5 }) + ' Run Scan';
      });
  }

  function runVtFileScan() {
    if (!currentServerIds.length) return;
    const serverId = currentServerIds[0];
    const btn = document.getElementById('runVtScanButton');

    btn.disabled = true;
    btn.innerHTML = alIcon('loader-circle', 'animate-spin h-4 w-4') + ' Starting...';

    closeRadarScanModal();

    const p = window.loadingPopupSystem;
    p.open('VirusTotal Scan', 'default');
    p.setProgress(5, 'Requesting file archive from node...');
    p.addStep('Connecting to node');

    const steps = [
      { at: 3000,  pct: 12, msg: 'Node zipping plugins, mods and config...',    step: 'Archiving server files' },
      { at: 9000,  pct: 24, msg: 'Uploading archive to VirusTotal...',          step: 'Archive ready — uploading' },
      { at: 16000, pct: 36, msg: 'VirusTotal queuing analysis...',               step: 'Upload complete' },
      { at: 26000, pct: 48, msg: 'Analysis in progress — checking signatures...', step: 'VT analysis started' },
      { at: 40000, pct: 60, msg: 'Running 70+ antivirus engines...',             step: 'Scanning with multiple engines' },
      { at: 56000, pct: 72, msg: 'Collecting results...',                        step: 'Engines finishing up' },
      { at: 75000, pct: 82, msg: 'Waiting for final verdicts...',                step: 'Collecting final results' },
    ];
    const timers = steps.map(function (s) {
      return setTimeout(function () { p.setProgress(s.pct, s.msg); p.addStep(s.step); }, s.at);
    });

    fetch('/admin/radar/vtscan/' + serverId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        timers.forEach(function (t) { clearTimeout(t); });

        if (!data.success) {
          p.setProgress(100, 'Scan failed');
          p.addStep(data.error || 'VT scan failed', 'error');
          p.setIcon('error');
          showToast(data.error || 'VT scan failed', 'error');
          setTimeout(function () { p.close(); }, 3000);
          return;
        }

        p.setProgress(100, 'Scan complete');
        p.addStep('Analysis complete', 'done');
        p.setIcon('done');

        setTimeout(function () {
          p.close();
          document.getElementById('radarScanModalTitle').textContent = 'VirusTotal Scan: ' + (data.serverName || 'Server');
          document.getElementById('radarScanModalSubtitle').textContent = 'Results from VirusTotal analysis';
          document.getElementById('radarPickerPhase').classList.add('hidden');
          document.getElementById('radarResultsPhase').classList.remove('hidden');
          document.getElementById('radarRescanBtn').classList.remove('hidden');
          var radarScanModal = document.getElementById('radarScanModal');
          radarScanModal.classList.remove('hidden');
          radarScanModal.classList.add('flex');
          var radarScanPanel = document.getElementById('radarScanPanel');
          Animate.openModal(radarScanModal, radarScanPanel);
          renderVtFileScanResults(data);
        }, 800);
      })
      .catch(function (err) {
        timers.forEach(function (t) { clearTimeout(t); });
        console.error('VT scan error:', err);
        p.setProgress(100, 'Request failed');
        p.addStep('Network error', 'error');
        p.setIcon('error');
        showToast('VT file scan failed', 'error');
        setTimeout(function () { p.close(); }, 3000);
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = alIcon('shield-check', 'w-4 h-4', { strokeWidth: 1.5 }) + ' Upload to VirusTotal';
      });
  }

  function checkVirusTotal(hash, matchId) {
    var btn = document.querySelector('#' + matchId + ' .vt-btn');
    var resultEl = document.querySelector('.vt-result-' + matchId);
    if (!btn || !resultEl) return;

    btn.disabled = true;
    btn.textContent = '...';

    fetch('/admin/radar/virustotal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: hash }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) {
          resultEl.innerHTML = '<span class="text-xs text-red-500">VT error: ' + escapeHtml(data.error) + '</span>';
        } else if (!data.found) {
          resultEl.innerHTML = '<span class="text-xs text-neutral-400">Not in VirusTotal database</span>';
        } else {
          var colour = data.malicious > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
          resultEl.innerHTML =
            '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="text-xs font-medium ' + colour + '">' + data.malicious + '/' + data.total + ' engines detected</span>' +
            (data.name ? '<span class="text-xs text-neutral-400">' + escapeHtml(data.name) + '</span>' : '') +
            (data.firstSeen ? '<span class="text-xs text-neutral-400">first seen ' + data.firstSeen + '</span>' : '') +
            '<a href="' + data.vtLink + '" target="_blank" rel="noopener" class="text-xs text-blue-500 hover:underline">View on VT →</a>' +
            '</div>';
          btn.remove();
        }
        resultEl.classList.remove('hidden');
      })
      .catch(function () {
        resultEl.innerHTML = '<span class="text-xs text-red-500">Request failed</span>';
        resultEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'VT';
      });
  }

  function renderVtFileScanResults(data) {
    const summaryEl = document.getElementById('radarSummaryBar');
    const bodyEl = document.getElementById('radarResultsBody');
    document.getElementById('radarServerTabs').classList.add('hidden');

    if (data.pending) {
      summaryEl.innerHTML = '<span class="text-sm text-amber-600 dark:text-amber-400 font-medium">Analysis still processing on VT</span>';
      bodyEl.innerHTML = '<div class="py-6 text-center"><p class="text-sm text-neutral-600 dark:text-neutral-300 mb-3">VT is still analysing. Check directly:</p><a href="' + data.vtLink + '" target="_blank" rel="noopener" class="text-sm text-blue-500 hover:underline break-all">' + escapeHtml(data.vtLink) + '</a></div>';
      return;
    }

    const malCount = (data.maliciousEngines && data.maliciousEngines.length) || 0;
    const total = data.totalEngines || 0;

    if (malCount === 0) {
      summaryEl.innerHTML =
        '<span class="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">' +
        '' + alIcon('circle-check', 'w-4 h-4') + '' +
        'Clean — 0/' + total + ' engines flagged</span>' +
        '<a href="' + data.vtLink + '" target="_blank" rel="noopener" class="ml-auto text-xs text-blue-500 hover:underline">Full report →</a>';
      bodyEl.innerHTML =
        '<div class="py-8 text-center">' +
        '' + alIcon('shield-check', 'w-8 h-8 mx-auto mb-3 text-emerald-400', { strokeWidth: 1 }) + '' +
        '<p class="text-sm font-medium text-neutral-600 dark:text-neutral-300">No engines flagged anything</p>' +
        '<p class="text-xs text-neutral-400 mt-1">' + total + ' engines scanned the zip</p>' +
        '</div>';
      return;
    }

    summaryEl.innerHTML =
      '<span class="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">' +
      '' + alIcon('triangle-alert', 'w-4 h-4') + '' +
      malCount + '/' + total + ' engines flagged</span>' +
      '<a href="' + data.vtLink + '" target="_blank" rel="noopener" class="ml-auto text-xs text-blue-500 hover:underline">Full report →</a>';

    let html = '<div class="space-y-1">';
    data.maliciousEngines.forEach(function (e) {
      html += '<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">';
      html += '<span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">' + escapeHtml(e.engine) + '</span>';
      html += '<span class="text-xs text-red-600 dark:text-red-400 font-mono">' + escapeHtml(e.result || 'flagged') + '</span>';
      html += '</div>';
    });
    html += '</div>';
    bodyEl.innerHTML = html;
  }

  function renderRadarResults(results) {
    const tabsEl = document.getElementById('radarServerTabs');
    const bodyEl = document.getElementById('radarResultsBody');
    const summaryEl = document.getElementById('radarSummaryBar');

    if (!results.length) {
      tabsEl.classList.add('hidden');
      summaryEl.innerHTML = '<span class="text-sm text-neutral-500">No results returned.</span>';
      bodyEl.innerHTML = '';
      return;
    }

    if (results.length === 1) {
      tabsEl.classList.add('hidden');
      renderSingleServerResults(results[0].data.results, bodyEl, summaryEl);
    } else {
      tabsEl.classList.remove('hidden');
      tabsEl.innerHTML = '';
      results.forEach(function (r, i) {
        const name = radarServerNames[r.id] || ('Server ' + r.id);
        const count = countFindings(r.data.results);
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.dataset.tabIndex = i;
        tab.className = 'tab-btn shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors ' +
          (i === 0
            ? 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700/50 text-neutral-800 dark:text-white'
            : 'bg-neutral-50 dark:bg-neutral-800/40 border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300');
        tab.innerHTML = escapeHtml(name) +
          (count > 0
            ? ' <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">' + count + '</span>'
            : ' <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">clean</span>');
        tab.addEventListener('click', function () {
          tabsEl.querySelectorAll('.tab-btn').forEach(function (t) {
            t.className = 'tab-btn shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors bg-neutral-50 dark:bg-neutral-800/40 border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300';
          });
          tab.className = 'tab-btn shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700/50 text-neutral-800 dark:text-white';
          renderSingleServerResults(results[i].data.results, bodyEl, summaryEl);
        });
        tabsEl.appendChild(tab);
      });
      renderSingleServerResults(results[0].data.results, bodyEl, summaryEl);
    }
  }

  function countFindings(scanResults) {
    if (!scanResults || !scanResults.results) return 0;
    return scanResults.results.reduce(function (s, r) { return s + (r.matches ? r.matches.length : 0); }, 0);
  }

  function renderSingleServerResults(scanResults, bodyEl, summaryEl) {
    const total = countFindings(scanResults);
    const sevStyles = {
      critical: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
      high:     'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
      medium:   'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
      low:      'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    };

    if (total === 0) {
      summaryEl.innerHTML =
        '<span class="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">' +
        '' + alIcon('circle-check', 'w-4 h-4') + '' +
        'No suspicious files found</span>';
      bodyEl.innerHTML =
        '<div class="py-8 text-center">' +
        '' + alIcon('shield-check', 'w-8 h-8 mx-auto mb-3 text-emerald-400', { strokeWidth: 1 }) + '' +
        '<p class="text-sm font-medium text-neutral-600 dark:text-neutral-300">All clear</p>' +
        '<p class="text-xs text-neutral-400 mt-1">No matches found for any pattern in this script</p>' +
        '</div>';
      return;
    }

    const patternCount = scanResults.results.length;
    summaryEl.innerHTML =
      '<span class="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">' +
      '' + alIcon('triangle-alert', 'w-4 h-4') + '' +
      total + ' finding' + (total !== 1 ? 's' : '') + ' across ' + patternCount + ' pattern' + (patternCount !== 1 ? 's' : '') + '</span>';

    let html = '<div class="space-y-3">';
    scanResults.results.forEach(function (result) {
      const sev = result.severity || 'low';
      const count = result.matches ? result.matches.length : 0;
      html += '<div class="rounded-lg border border-neutral-200 dark:border-neutral-700/50 overflow-hidden">';
      html += '<div class="flex items-center justify-between px-3 py-2 bg-neutral-50 dark:bg-neutral-800/60">';
      html += '<div class="min-w-0"><p class="text-xs font-medium text-neutral-700 dark:text-neutral-200">' + escapeHtml(result.pattern.description) + '</p>';
      html += '<p class="text-xs text-neutral-400 font-mono mt-0.5 truncate">' + escapeHtml(result.pattern.pattern) + '</p></div>';
      html += '<div class="ml-3 shrink-0 flex items-center gap-1.5">';
      html += '<span class="text-xs font-medium px-2 py-0.5 rounded-full ' + (sevStyles[sev] || sevStyles.low) + '">' + sev + '</span>';
      html += '<span class="text-xs text-neutral-500">' + count + ' match' + (count !== 1 ? 'es' : '') + '</span>';
      html += '</div></div>';
      html += '<ul class="divide-y divide-neutral-100 dark:divide-neutral-700/30">';
      result.matches.forEach(function (match) {
        const matchId = 'match-' + Math.random().toString(36).slice(2, 9);
        html += '<li class="px-3 py-1.5" id="' + matchId + '">';
        html += '<div class="flex items-center justify-between gap-4">';
        html += '<span class="text-xs font-mono text-neutral-600 dark:text-neutral-300 truncate">' + escapeHtml(match.path) + '</span>';
        html += '<div class="flex items-center gap-2 shrink-0">';
        if (match.size) html += '<span class="text-xs text-neutral-400">' + formatBytes(match.size) + '</span>';
        if (match.hash && vtEnabled) {
          html += '<button type="button" onclick="checkVirusTotal(\'' + escapeHtml(match.hash) + '\',\'' + matchId + '\')" class="vt-btn text-xs px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-blue-400 hover:text-blue-500 transition-colors font-medium">VT</button>';
        }
        html += '</div></div>';
        html += '<div class="vt-result-' + matchId + ' mt-1 hidden"></div>';
        html += '</li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    bodyEl.innerHTML = html;
  }

  function formatBytes(bytes) {
    if (bytes < BYTES_PER_KB) return bytes + ' B';
    if (bytes < BYTES_PER_MB) return (bytes / BYTES_PER_KB).toFixed(1) + ' KB';
    if (bytes < BYTES_PER_GB) return (bytes / BYTES_PER_MB).toFixed(1) + ' MB';
    return (bytes / BYTES_PER_GB).toFixed(1) + ' GB';
  }

  function escapeHtml(str) {
    return window.escHtml(str);
  }

  (function () {
    var _dur = _rootStyle.getPropertyValue('--dur-default').trim() || '0.22s';
    var _ease = _rootStyle.getPropertyValue('--ease-standard').trim() || 'ease';
    const rows = document.querySelectorAll('#serverTable tbody tr');
    rows.forEach(function (row, i) {
      row.style.opacity = '0';
      row.style.transform = 'translateY(4px)';
      row.style.transition = 'none';
      setTimeout(function () {
        row.style.transition = 'opacity ' + _dur + ' ' + _ease + ', transform ' + _dur + ' ' + _ease;
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
        setTimeout(function () {
          row.style.transition = '';
          row.style.opacity = '';
          row.style.transform = '';
        }, ROW_ANIMATION_DURATION_MS);
      }, STAGGER_INITIAL_DELAY_MS + i * STAGGER_DELAY_MS);
    });
  })();

  window.openRadarScanModal = openRadarScanModal;
  window.closeRadarScanModal = closeRadarScanModal;
  window.resetRadarToPickerPhase = resetRadarToPickerPhase;
  window.setScanMode = setScanMode;
  window.runRadarScan = runRadarScan;
  window.runVtFileScan = runVtFileScan;
  window.checkVirusTotal = checkVirusTotal;
  window.bulkRadarScan = bulkRadarScan;
  window.bulkDelete = bulkDelete;

})();
