(function () {
  document.addEventListener('contextmenu', e => e.preventDefault());

  const bridge    = document.getElementById('dashboard-data');
  const allFolders = JSON.parse(bridge.dataset.folders || '[]');
  const allServers = JSON.parse(bridge.dataset.servers || '[]');

  function openOverlay(overlay, panel) {
    overlay.setAttribute('data-open', '');
    Animate.openModal(overlay, panel);
  }

  function closeOverlay(overlay, panel, after) {
    const done = function () {
      overlay.removeAttribute('data-open');
      if (after) after();
    };
    Animate.closeModal(overlay, panel, done);
  }

  // ── View toggle ───────────────────────────────────────────
  const gridView    = document.getElementById('gridView');
  const listView    = document.getElementById('listView');
  const gridViewBtn = document.getElementById('gridViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  if (gridView && listView && gridViewBtn && listViewBtn) {
    if (localStorage.getItem('serverViewPreference') === 'list') switchView('list');
    gridViewBtn.addEventListener('click', () => { switchView('grid'); localStorage.setItem('serverViewPreference', 'grid'); });
    listViewBtn.addEventListener('click', () => { switchView('list'); localStorage.setItem('serverViewPreference', 'list'); });
    function switchView(which) {
      const target = which === 'grid' ? gridView : listView;
      gridView.classList.toggle('hidden', which !== 'grid');
      listView.classList.toggle('hidden', which !== 'list');
      gridViewBtn.classList.toggle('vt-active', which === 'grid');
      listViewBtn.classList.toggle('vt-active', which === 'list');
      gridViewBtn.setAttribute('aria-pressed', String(which === 'grid'));
      listViewBtn.setAttribute('aria-pressed', String(which === 'list'));
      target.classList.remove('al-view-entering');
      void target.offsetWidth;
      target.classList.add('al-view-entering');
    }
  }

  document.querySelectorAll('tr[data-href]').forEach(row => {
    row.addEventListener('click', () => {
      window.location.href = row.dataset.href;
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = row.dataset.href;
      }
    });
  });

  // ── New folder dialog ─────────────────────────────────────
  const newFolderOverlay  = document.getElementById('newFolderOverlay');
  const newFolderPanel    = document.getElementById('newFolderPanel');
  const newFolderName     = document.getElementById('newFolderName');
  const cancelNewFolder   = document.getElementById('cancelNewFolder');
  const confirmNewFolder  = document.getElementById('confirmNewFolder');

  document.getElementById('newFolderBtn').addEventListener('click', () => {
    newFolderName.value = '';
    openOverlay(newFolderOverlay, newFolderPanel);
    setTimeout(() => newFolderName.focus(), 80);
  });
  cancelNewFolder.addEventListener('click', () => closeOverlay(newFolderOverlay, newFolderPanel));
  newFolderOverlay.addEventListener('click', e => { if (e.target === newFolderOverlay) closeOverlay(newFolderOverlay, newFolderPanel); });
  newFolderName.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmNewFolder.click();
    if (e.key === 'Escape') closeOverlay(newFolderOverlay, newFolderPanel);
  });
  confirmNewFolder.addEventListener('click', async () => {
    const name = newFolderName.value.trim();
    if (!name) return;
    confirmNewFolder.disabled = true;
    const r = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await r.json();
    confirmNewFolder.disabled = false;
    if (d.success) { showToast('Folder created.', 'success'); location.reload(); }
    else showToast(d.error || 'Something went wrong.', 'error');
  });

  // ── Folder popup (click to open) ──────────────────────────
  const folderPopupOverlay = document.getElementById('folderPopupOverlay');
  const folderPopupPanel   = document.getElementById('folderPopupPanel');
  const folderPopupTitle   = document.getElementById('folderPopupTitle');
  const folderPopupContent = document.getElementById('folderPopupContent');
  const deleteFolderBtn    = document.getElementById('deleteFolderBtn');

  let activeFolderId = null;

  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    card.addEventListener('click', e => {
      if (e.target.closest('.folder-delete-btn')) return;
      const memberUUIDs = JSON.parse(card.dataset.folderMembers || '[]');
      activeFolderId = card.dataset.folderId;
      folderPopupTitle.textContent = card.dataset.folderName;
      folderPopupContent.innerHTML = '';
      const serversIn = allServers.filter(s => memberUUIDs.includes(s.UUID));
      if (serversIn.length === 0) {
        folderPopupContent.innerHTML = '<p class="text-sm text-neutral-400 col-span-2">No servers — drag a card here to add one.</p>';
      } else {
        serversIn.forEach(s => {
          const row = document.createElement('div');
          row.className = 'flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700/40 transition';
          const running = s.status === 'running';
          row.innerHTML = `
            <a href="/server/${s.UUID}" class="flex items-center gap-2 flex-1 min-w-0">
              <span class="text-sm font-medium text-neutral-800 dark:text-white truncate">${s.name}</span>
              <span class="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md ${running ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'}">
                ${running ? 'Running' : 'Stopped'}
              </span>
            </a>
            <button data-uuid="${s.UUID}" class="remove-from-folder-btn shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Remove from folder" aria-label="Remove server from folder">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd"/>
              </svg>
            </button>`;
          row.querySelector('.remove-from-folder-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            const uuid = e.currentTarget.dataset.uuid;
            const r = await fetch('/api/folders/servers/' + uuid, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { showToast('Removed from folder.', 'success'); setTimeout(() => location.reload(), 600); }
            else showToast(d.error || 'Something went wrong.', 'error');
          });
          folderPopupContent.appendChild(row);
        });
      }
      openOverlay(folderPopupOverlay, folderPopupPanel);
    });
  });

  document.getElementById('closeFolderPopup').addEventListener('click', () => {
    closeOverlay(folderPopupOverlay, folderPopupPanel, () => { deleteFolderBtn.style.display = ''; });
  });
  folderPopupOverlay.addEventListener('click', e => {
    if (e.target === folderPopupOverlay) {
      closeOverlay(folderPopupOverlay, folderPopupPanel, () => { deleteFolderBtn.style.display = ''; });
    }
  });

  // ── Delete folder (custom confirm dialog) ─────────────────
  const deleteFolderOverlay  = document.getElementById('deleteFolderOverlay');
  const deleteFolderPanel    = document.getElementById('deleteFolderPanel');
  const cancelDeleteFolder   = document.getElementById('cancelDeleteFolder');
  const confirmDeleteFolder  = document.getElementById('confirmDeleteFolder');

  deleteFolderBtn.addEventListener('click', () => {
    closeOverlay(folderPopupOverlay, folderPopupPanel);
    openOverlay(deleteFolderOverlay, deleteFolderPanel);
  });

  cancelDeleteFolder.addEventListener('click', () => closeOverlay(deleteFolderOverlay, deleteFolderPanel));
  deleteFolderOverlay.addEventListener('click', e => { if (e.target === deleteFolderOverlay) closeOverlay(deleteFolderOverlay, deleteFolderPanel); });

  confirmDeleteFolder.addEventListener('click', async () => {
    if (!activeFolderId) return;
    confirmDeleteFolder.disabled = true;
    const r = await fetch('/api/folders/' + activeFolderId, { method: 'DELETE' });
    const d = await r.json();
    confirmDeleteFolder.disabled = false;
    closeOverlay(deleteFolderOverlay, deleteFolderPanel);
    if (d.success) { showToast('Folder deleted.', 'success'); location.reload(); } else showToast(d.error || 'Couldn\'t delete the folder.', 'error');
  });

  // ── Drag-and-drop: server card → folder ───────────────────
  let dragUUID = null;
  let dragName = null;
  const ghost  = document.getElementById('drag-ghost');
  const ghostName = document.getElementById('drag-ghost-name');

  function moveMouse(e) {
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top  = (e.clientY + 10) + 'px';
  }

  document.querySelectorAll('.server-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragUUID = card.dataset.serverUuid;
      dragName = card.dataset.serverName;
      ghostName.textContent = dragName;
      ghost.style.display = 'flex';
      card.classList.add('sc-dragging');
      card.dataset.dragging = '1';
      const blank = document.createElement('canvas');
      blank.width = blank.height = 1;
      e.dataTransfer.setDragImage(blank, 0, 0);
      e.dataTransfer.effectAllowed = 'move';
      document.addEventListener('mousemove', moveMouse);
    });

    card.addEventListener('dragend', () => {
      ghost.style.display = 'none';
      card.classList.remove('sc-dragging');
      document.querySelectorAll('.folder-card').forEach(f => f.classList.remove('fc-drag-over'));
      document.removeEventListener('mousemove', moveMouse);
      setTimeout(() => { delete card.dataset.dragging; }, 50);
      dragUUID = null; dragName = null;
    });

    card.querySelector('a')?.addEventListener('click', e => {
      if (card.dataset.dragging) e.preventDefault();
    });

    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      document.querySelectorAll('.server-ctx-menu').forEach(m => m.classList.add('hidden'));
      const menu = card.querySelector('.server-ctx-menu');
      if (menu) menu.classList.remove('hidden');
    });

    card.querySelector('a')?.addEventListener('keydown', e => {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        document.querySelectorAll('.server-ctx-menu').forEach(m => m.classList.add('hidden'));
        const menu = card.querySelector('.server-ctx-menu');
        if (menu) {
          menu.classList.remove('hidden');
          const first = menu.querySelector('button');
          if (first && first.offsetParent !== null) first.focus();
        }
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.server-ctx-menu').forEach(m => m.classList.add('hidden'));
  });

  document.querySelectorAll('.folder-card').forEach(folderCard => {
    folderCard.addEventListener('dragover', e => {
      if (!dragUUID) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      folderCard.classList.add('fc-drag-over');
    });
    folderCard.addEventListener('dragleave', () => folderCard.classList.remove('fc-drag-over'));
    folderCard.addEventListener('drop', async e => {
      e.preventDefault();
      folderCard.classList.remove('fc-drag-over');
      if (!dragUUID) return;
      const folderId = folderCard.dataset.folderId;
      const r = await fetch('/api/folders/' + folderId + '/servers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUUID: dragUUID }),
      });
      const d = await r.json();
      if (d.success) { showToast('"' + dragName + '" added to folder.', 'success'); setTimeout(() => location.reload(), 700); }
      else showToast(d.error || 'Something went wrong.', 'error');
    });
  });

  // ── Right-click context menu: add/remove from folder ──────
  document.querySelectorAll('.ctx-add-to-folder').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const uuid = btn.dataset.uuid;
      if (allFolders.length === 0) { showToast('Create a folder first.', 'error'); return; }
      if (allFolders.length === 1) {
        const r = await fetch('/api/folders/' + allFolders[0].id + '/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverUUID: uuid }) });
        const d = await r.json();
        if (d.success) { showToast('Added to folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
        return;
      }
      openFolderPicker(uuid);
    });
  });

  document.querySelectorAll('.ctx-remove-from-folder').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const r = await fetch('/api/folders/servers/' + btn.dataset.uuid, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { showToast('Removed from folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
    });
  });

  function openFolderPicker(serverUUID) {
    deleteFolderBtn.style.display = 'none';
    activeFolderId = null;
    folderPopupTitle.textContent = 'Choose folder';
    folderPopupContent.innerHTML = '';
    allFolders.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'flex items-center gap-2.5 w-full text-left bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700/40 transition';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-amber-500 shrink-0"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 12h-15a4.483 4.483 0 0 0-3 1.146Z"/></svg><span class="text-sm text-neutral-800 dark:text-white">${f.name}</span>`;
      btn.addEventListener('click', async () => {
        const r = await fetch('/api/folders/' + f.id + '/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverUUID }) });
        const d = await r.json();
        if (d.success) { showToast('Added to folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
      });
      folderPopupContent.appendChild(btn);
    });
    openOverlay(folderPopupOverlay, folderPopupPanel);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.server-ctx-menu').forEach(m => m.classList.add('hidden'));
      closeOverlay(folderPopupOverlay, folderPopupPanel);
      closeOverlay(newFolderOverlay, newFolderPanel);
      closeOverlay(deleteFolderOverlay, deleteFolderPanel);
    }
  });

  // ── Live status polling ────────────────────────────────────
  var serverUUIDs = allServers.map(function(s) { return s.UUID; });
  var lastPollAt = null;

  function fmtUptime(sec) {
    if (sec === null || typeof sec === 'undefined') return '';
    sec = Math.max(0, Math.floor(sec));
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  function applyServerStatus(uuid, status) {
    var card = document.querySelector('[data-server-uuid="' + uuid + '"]');
    if (!card) return;

    var badge = card.querySelector('.al-badge-online, .al-badge-offline, .al-badge-warning, .al-badge-info');
    if (!badge) return;

    var ago = lastPollAt ? Math.max(0, Math.round((Date.now() - lastPollAt) / 1000)) + 's ago' : '';
    var liveTitle = 'Live · updated ' + ago;

    if (status.daemonOffline) {
      badge.className = 'al-badge-offline';
      badge.innerHTML = '<span class="al-dot-offline"></span> Daemon offline';
      badge.title = status.error || 'Daemon unreachable';
      return;
    }
    if (status.starting) {
      badge.className = 'al-badge-warning';
      badge.innerHTML = '<span class="al-dot-warning"></span> Starting';
      return;
    }
    if (status.stopping) {
      badge.className = 'al-badge-warning';
      badge.innerHTML = '<span class="al-dot-warning"></span> Stopping';
      return;
    }
    if (status.online) {
      var uptime = fmtUptime(status.uptime);
      badge.className = 'al-badge-online';
      badge.innerHTML = '<span class="al-dot-online"></span> Online' + (uptime ? ' · ' + uptime : '');
      badge.title = uptime ? 'Up for ' + uptime : 'Online';
      return;
    }
    badge.className = 'al-badge-offline';
    badge.innerHTML = '<span class="al-dot-offline"></span> Offline';
  }

  function pollAllServers() {
    lastPollAt = Date.now();
    Promise.all(serverUUIDs.map(function(uuid) {
      return fetch('/server/' + uuid + '/status')
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    })).then(function(results) {
      results.forEach(function(status, i) {
        var card = document.querySelector('[data-server-uuid="' + serverUUIDs[i] + '"]');
        if (status !== null) {
          applyServerStatus(serverUUIDs[i], status);
        } else if (card) {
        }
      });
    });
  }

  if (serverUUIDs.length > 0) {
    pollAllServers();
    setInterval(pollAllServers, 15000);
  }
})();
