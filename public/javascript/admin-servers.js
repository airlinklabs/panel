(function () {
  var vtEnabled = false;
  var scanMode = 'builtin';
  var currentServerIds = [];
  var radarServerNames = {};
  var availableScripts = [];

  function getChecked() {
    return Array.from(document.querySelectorAll('.server-checkbox:checked'));
  }

  var sentinelVisible = true;

  function setFloatingVisible(show) {
    var el = document.getElementById('floatingToolbar');
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
    var table = document.getElementById('serverTable');
    if (!table || !before) return;
    var after = table.getBoundingClientRect();
    var dy = before.top - after.top;
    if (Math.abs(dy) < 1) return;
    table.style.transition = 'none';
    table.style.transform = 'translateY(' + dy + 'px)';
    requestAnimationFrame(function () {
      table.style.transition = 'transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)';
      table.style.transform = 'translateY(0)';
      table.addEventListener('transitionend', function cleanup() {
        table.style.transition = '';
        table.style.transform = '';
        table.removeEventListener('transitionend', cleanup);
      });
    });
  }

  function showInlineToolbar() {
    var row     = document.getElementById('bulkToolbarRow');
    var content = document.getElementById('bulkToolbarContent');
    var table   = document.getElementById('serverTable');
    var before  = table ? table.getBoundingClientRect() : null;
    row.style.gridTemplateRows = '1fr';
    requestAnimationFrame(function () {
      flipSiblings(before);
      setTimeout(function () { content.style.opacity = '1'; }, 40);
    });
  }

  function hideInlineToolbar() {
    var row     = document.getElementById('bulkToolbarRow');
    var content = document.getElementById('bulkToolbarContent');
    var table   = document.getElementById('serverTable');
    var before  = table ? table.getBoundingClientRect() : null;
    content.style.opacity = '0';
    setTimeout(function () {
      row.style.gridTemplateRows = '0fr';
      requestAnimationFrame(function () {
        flipSiblings(before);
      });
    }, 80);
  }

  function updateToolbar() {
    var checked = getChecked();

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

  var observer = new IntersectionObserver(function (entries) {
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
    var checked = getChecked();
    if (!checked.length) return;
    var ids = checked.map(function (cb) { return cb.value; });
    var names = {};
    checked.forEach(function (cb) { names[cb.value] = cb.dataset.name || cb.value; });
    radarServerNames = names;
    var label = checked.length === 1 ? names[ids[0]] : checked.length + ' servers';
    openRadarScanModal(ids, label);
  }

  function bulkDelete() {
    var checked = getChecked();
    if (!checked.length) return;
    var msg = checked.length === 1
      ? 'Delete this server? All data will be permanently removed.'
      : 'Delete ' + checked.length + ' servers? All data will be permanently removed.';
    window.modal.confirm({
      title: checked.length === 1 ? 'Delete Server' : 'Delete ' + checked.length + ' Servers',
      body: msg,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: function () {
        var ids = checked.map(function (cb) { return cb.value; });
        var chain = Promise.resolve();
        ids.forEach(function (id) {
          chain = chain.then(function () {
            return fetch('/admin/server/delete/' + id, { method: 'POST' });
          });
        });
        chain.then(function () { window.location.reload(); })
             .catch(function () { window.location.reload(); });
      }
    });
  }

  function deleteServer(id, name) {
    window.modal.confirm({
      title: 'Delete Server',
      body: 'Delete "' + name + '"? All data will be permanently removed.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: function () {
        fetch('/admin/server/delete/' + id, { method: 'POST' })
          .then(function() { window.location.reload(); })
          .catch(function() { window.location.reload(); });
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
    .catch(function () {});

  function setScanMode(mode) {
    scanMode = mode;
    var builtinBtn = document.getElementById('modeBuiltin');
    var vtBtn = document.getElementById('modeVT');
    var active   = 'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-neutral-800 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium transition-all';
    var inactive = 'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium transition-all hover:border-neutral-400 dark:hover:border-neutral-500';
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
    document.getElementById('radarScanModal').classList.remove('hidden');
    fetchRadarScripts();
  }

  function closeRadarScanModal() {
    document.getElementById('radarScanModal').classList.add('hidden');
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
    var select = document.getElementById('scriptSelect');
    var runBtn = document.getElementById('runScanButton');
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
          var opt = document.createElement('option');
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
    var id = document.getElementById('scriptSelect').value;
    var script = availableScripts.find(function (s) { return s.id === id; });
    document.getElementById('scriptDescription').textContent = script ? script.description : '';
  }

  document.getElementById('scriptSelect').addEventListener('change', updateScriptDescription);

  function runRadarScan() {
    if (!currentServerIds.length) return;
    var scriptId = document.getElementById('scriptSelect').value;
    if (!scriptId) { showToast('Select a script first', 'error'); return; }

    var btn = document.getElementById('runScanButton');
    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Scanning...';

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
            var name = radarServerNames[r.id] || r.id;
            if (!r.data.success) {
              showToast(name + ': scan failed', 'error');
            } else {
              var count = (r.data.results && r.data.results.results || []).reduce(function (s, x) { return s + (x.matches ? x.matches.length : 0); }, 0);
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
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg> Run Scan';
      });
  }

  function runVtFileScan() {
    if (!currentServerIds.length) return;
    var serverId = currentServerIds[0];
    var btn = document.getElementById('runVtScanButton');

    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Starting...';

    closeRadarScanModal();

    var p = window.loadingPopupSystem;
    p.open('VirusTotal Scan', 'default');
    p.setProgress(5, 'Requesting file archive from node...');
    p.addStep('Connecting to node');

    var steps = [
      { at: 3000,  pct: 12, msg: 'Node zipping plugins, mods and config...',    step: 'Archiving server files' },
      { at: 9000,  pct: 24, msg: 'Uploading archive to VirusTotal...',          step: 'Archive ready — uploading' },
      { at: 16000, pct: 36, msg: 'VirusTotal queuing analysis...',               step: 'Upload complete' },
      { at: 26000, pct: 48, msg: 'Analysis in progress — checking signatures...', step: 'VT analysis started' },
      { at: 40000, pct: 60, msg: 'Running 70+ antivirus engines...',             step: 'Scanning with multiple engines' },
      { at: 56000, pct: 72, msg: 'Collecting results...',                        step: 'Engines finishing up' },
      { at: 75000, pct: 82, msg: 'Waiting for final verdicts...',                step: 'Collecting final results' },
    ];
    var timers = steps.map(function (s) {
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
          document.getElementById('radarScanModal').classList.remove('hidden');
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
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Z"/></svg> Upload to VirusTotal';
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
    var summaryEl = document.getElementById('radarSummaryBar');
    var bodyEl = document.getElementById('radarResultsBody');
    document.getElementById('radarServerTabs').classList.add('hidden');

    if (data.pending) {
      summaryEl.innerHTML = '<span class="text-sm text-amber-600 dark:text-amber-400 font-medium">Analysis still processing on VT</span>';
      bodyEl.innerHTML = '<div class="py-6 text-center"><p class="text-sm text-neutral-600 dark:text-neutral-300 mb-3">VT is still analysing. Check directly:</p><a href="' + data.vtLink + '" target="_blank" rel="noopener" class="text-sm text-blue-500 hover:underline break-all">' + escapeHtml(data.vtLink) + '</a></div>';
      return;
    }

    var malCount = (data.maliciousEngines && data.maliciousEngines.length) || 0;
    var total = data.totalEngines || 0;

    if (malCount === 0) {
      summaryEl.innerHTML =
        '<span class="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/></svg>' +
        'Clean — 0/' + total + ' engines flagged</span>' +
        '<a href="' + data.vtLink + '" target="_blank" rel="noopener" class="ml-auto text-xs text-blue-500 hover:underline">Full report →</a>';
      bodyEl.innerHTML =
        '<div class="py-8 text-center">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="w-8 h-8 mx-auto mb-3 text-emerald-400"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>' +
        '<p class="text-sm font-medium text-neutral-600 dark:text-neutral-300">No engines flagged anything</p>' +
        '<p class="text-xs text-neutral-400 mt-1">' + total + ' engines scanned the zip</p>' +
        '</div>';
      return;
    }

    summaryEl.innerHTML =
      '<span class="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>' +
      malCount + '/' + total + ' engines flagged</span>' +
      '<a href="' + data.vtLink + '" target="_blank" rel="noopener" class="ml-auto text-xs text-blue-500 hover:underline">Full report →</a>';

    var html = '<div class="space-y-1">';
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
    var tabsEl = document.getElementById('radarServerTabs');
    var bodyEl = document.getElementById('radarResultsBody');
    var summaryEl = document.getElementById('radarSummaryBar');

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
        var name = radarServerNames[r.id] || ('Server ' + r.id);
        var count = countFindings(r.data.results);
        var tab = document.createElement('button');
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
          renderSingleServerResults(results[parseInt(tab.dataset.tabIndex)].data.results, bodyEl, summaryEl);
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
    var total = countFindings(scanResults);
    var sevStyles = {
      critical: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
      high:     'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
      medium:   'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
      low:      'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    };

    if (total === 0) {
      summaryEl.innerHTML =
        '<span class="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/></svg>' +
        'No suspicious files found</span>';
      bodyEl.innerHTML =
        '<div class="py-8 text-center">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="w-8 h-8 mx-auto mb-3 text-emerald-400"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>' +
        '<p class="text-sm font-medium text-neutral-600 dark:text-neutral-300">All clear</p>' +
        '<p class="text-xs text-neutral-400 mt-1">No matches found for any pattern in this script</p>' +
        '</div>';
      return;
    }

    var patternCount = scanResults.results.length;
    summaryEl.innerHTML =
      '<span class="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>' +
      total + ' finding' + (total !== 1 ? 's' : '') + ' across ' + patternCount + ' pattern' + (patternCount !== 1 ? 's' : '') + '</span>';

    var html = '<div class="space-y-3">';
    scanResults.results.forEach(function (result) {
      var sev = result.severity || 'low';
      var count = result.matches ? result.matches.length : 0;
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
        var matchId = 'match-' + Math.random().toString(36).slice(2, 9);
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
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  (function () {
    var rows = document.querySelectorAll('#serverTable tbody tr');
    rows.forEach(function (row, i) {
      row.style.opacity = '0';
      row.style.transform = 'translateY(4px)';
      row.style.transition = 'none';
      setTimeout(function () {
        row.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
        setTimeout(function () {
          row.style.transition = '';
          row.style.opacity = '';
          row.style.transform = '';
        }, 240);
      }, 60 + i * 28);
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
