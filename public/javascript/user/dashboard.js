(function () {
  'use strict';

  var FOCUS_DELAY = 80;
  var REMOVE_FOLDER_DELAY = 600;
  var DRAG_END_DELAY = 50;
  var ADD_TO_FOLDER_DELAY = 700;
  var POLL_INTERVAL = 15000;

  var SECONDS_PER_DAY = 86400;
  var SECONDS_PER_HOUR = 3600;
  var SECONDS_PER_MINUTE = 60;

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var bridge = document.getElementById('dashboard-data');
  var allFolders = JSON.parse(bridge.dataset.folders || '[]');
  var allServers = JSON.parse(bridge.dataset.servers || '[]');

  function openOverlay(overlay, panel) {
    overlay.setAttribute('data-open', '');
    Animate.openModal(overlay, panel);
  }

  function closeOverlay(overlay, panel, after) {
    var done = function () {
      overlay.removeAttribute('data-open');
      if (after) after();
    };
    Animate.closeModal(overlay, panel, done);
  }

  var gridView = document.getElementById('gridView');
  var listView = document.getElementById('listView');
  var gridViewBtn = document.getElementById('gridViewBtn');
  var listViewBtn = document.getElementById('listViewBtn');

  if (gridView && listView && gridViewBtn && listViewBtn) {
    if (localStorage.getItem('serverViewPreference') === 'list') switchView('list');
    gridViewBtn.addEventListener('click', function () { switchView('grid'); localStorage.setItem('serverViewPreference', 'grid'); });
    listViewBtn.addEventListener('click', function () { switchView('list'); localStorage.setItem('serverViewPreference', 'list'); });

    function switchView(which) {
      var target = which === 'grid' ? gridView : listView;
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

  document.querySelectorAll('tr[data-href]').forEach(function (row) {
    row.addEventListener('click', function () {
      window.location.href = row.dataset.href;
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = row.dataset.href;
      }
    });
  });

  var newFolderOverlay = document.getElementById('newFolderOverlay');
  var newFolderPanel = document.getElementById('newFolderPanel');
  var newFolderName = document.getElementById('newFolderName');
  var cancelNewFolder = document.getElementById('cancelNewFolder');
  var confirmNewFolder = document.getElementById('confirmNewFolder');

  document.getElementById('newFolderBtn').addEventListener('click', function () {
    newFolderName.value = '';
    openOverlay(newFolderOverlay, newFolderPanel);
    setTimeout(function () { newFolderName.focus(); }, FOCUS_DELAY);
  });
  cancelNewFolder.addEventListener('click', function () { closeOverlay(newFolderOverlay, newFolderPanel); });
  newFolderOverlay.addEventListener('click', function (e) { if (e.target === newFolderOverlay) closeOverlay(newFolderOverlay, newFolderPanel); });
  newFolderName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirmNewFolder.click();
    if (e.key === 'Escape') closeOverlay(newFolderOverlay, newFolderPanel);
  });
  confirmNewFolder.addEventListener('click', async function () {
    var name = newFolderName.value.trim();
    if (!name) return;
    confirmNewFolder.disabled = true;
    try {
      var r = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
      var d = await r.json();
      confirmNewFolder.disabled = false;
      if (d.success) { showToast('Folder created.', 'success'); location.reload(); }
      else showToast(d.error || 'Something went wrong.', 'error');
    } catch (err) {
      console.error('Failed to create folder:', err);
      confirmNewFolder.disabled = false;
      showToast('Network error. Try again.', 'error');
    }
  });

  var folderPopupOverlay = document.getElementById('folderPopupOverlay');
  var folderPopupPanel = document.getElementById('folderPopupPanel');
  var folderPopupTitle = document.getElementById('folderPopupTitle');
  var folderPopupContent = document.getElementById('folderPopupContent');
  var deleteFolderBtn = document.getElementById('deleteFolderBtn');

  var activeFolderId = null;

  document.querySelectorAll('.folder-card').forEach(function (card) {
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    card.addEventListener('click', function (e) {
      if (e.target.closest('.folder-delete-btn') || e.target.closest('.folder-menu-btn')) return;
      var memberUUIDs = JSON.parse(card.dataset.folderMembers || '[]');
      activeFolderId = card.dataset.folderId;
      folderPopupTitle.textContent = card.dataset.folderName;
      folderPopupContent.innerHTML = '';
      var serversIn = allServers.filter(function (s) { return memberUUIDs.includes(s.UUID); });
      if (serversIn.length === 0) {
        folderPopupContent.innerHTML = '<p class="text-sm text-neutral-400 col-span-2">No servers — drag a card here to add one.</p>';
      } else {
        serversIn.forEach(function (s) {
          var row = document.createElement('div');
          row.className = 'flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700/40 transition';
          var running = s.status === 'running';
          row.innerHTML =
            '<a href="/server/' + s.UUID + '" class="flex items-center gap-2 flex-1 min-w-0">' +
              '<span class="text-sm font-medium text-neutral-800 dark:text-white truncate">' + s.name + '</span>' +
              '<span class="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md ' + (running ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400') + '">' +
                (running ? 'Running' : 'Stopped') +
              '</span>' +
            '</a>' +
            '<button data-uuid="' + s.UUID + '" class="remove-from-folder-btn shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Remove from folder" aria-label="Remove server from folder">' +
              alIcon('trash-2', 'w-4 h-4') +
            '</button>';
          row.querySelector('.remove-from-folder-btn').addEventListener('click', async function (e) {
            e.preventDefault();
            var uuid = e.currentTarget.dataset.uuid;
            try {
              var r = await fetch('/api/folders/servers/' + uuid, { method: 'DELETE' });
              var d = await r.json();
              if (d.success) { showToast('Removed from folder.', 'success'); setTimeout(function () { location.reload(); }, REMOVE_FOLDER_DELAY); }
              else showToast(d.error || 'Something went wrong.', 'error');
            } catch (err) {
              console.error('Failed to remove from folder:', err);
              showToast('Network error. Try again.', 'error');
            }
          });
          folderPopupContent.appendChild(row);
        });
      }
      openOverlay(folderPopupOverlay, folderPopupPanel);
    });
  });

  document.getElementById('closeFolderPopup').addEventListener('click', function () {
    closeOverlay(folderPopupOverlay, folderPopupPanel, function () { deleteFolderBtn.style.display = ''; });
  });
  folderPopupOverlay.addEventListener('click', function (e) {
    if (e.target === folderPopupOverlay) {
      closeOverlay(folderPopupOverlay, folderPopupPanel, function () { deleteFolderBtn.style.display = ''; });
    }
  });

  var deleteFolderOverlay = document.getElementById('deleteFolderOverlay');
  var deleteFolderPanel = document.getElementById('deleteFolderPanel');
  var cancelDeleteFolder = document.getElementById('cancelDeleteFolder');
  var confirmDeleteFolder = document.getElementById('confirmDeleteFolder');

  deleteFolderBtn.addEventListener('click', function () {
    closeOverlay(folderPopupOverlay, folderPopupPanel);
    openOverlay(deleteFolderOverlay, deleteFolderPanel);
  });

  cancelDeleteFolder.addEventListener('click', function () { closeOverlay(deleteFolderOverlay, deleteFolderPanel); });
  deleteFolderOverlay.addEventListener('click', function (e) { if (e.target === deleteFolderOverlay) closeOverlay(deleteFolderOverlay, deleteFolderPanel); });

  confirmDeleteFolder.addEventListener('click', async function () {
    if (!activeFolderId) return;
    confirmDeleteFolder.disabled = true;
    try {
      var r = await fetch('/api/folders/' + activeFolderId, { method: 'DELETE' });
      var d = await r.json();
      confirmDeleteFolder.disabled = false;
      closeOverlay(deleteFolderOverlay, deleteFolderPanel);
      if (d.success) { showToast('Folder deleted.', 'success'); location.reload(); } else showToast(d.error || "Couldn't delete the folder.", 'error');
    } catch (err) {
      console.error('Failed to delete folder:', err);
      confirmDeleteFolder.disabled = false;
      closeOverlay(deleteFolderOverlay, deleteFolderPanel);
      showToast('Network error. Try again.', 'error');
    }
  });

  var dragUUID = null;
  var dragName = null;
  var ghost = document.getElementById('drag-ghost');
  var ghostName = document.getElementById('drag-ghost-name');

  var GHOST_OFFSET_X = 14;
  var GHOST_OFFSET_Y = 10;

  function moveMouse(e) {
    ghost.style.left = (e.clientX + GHOST_OFFSET_X) + 'px';
    ghost.style.top = (e.clientY + GHOST_OFFSET_Y) + 'px';
  }

  document.querySelectorAll('.server-card[draggable]').forEach(function (card) {
    card.addEventListener('dragstart', function (e) {
      dragUUID = card.dataset.serverUuid;
      dragName = card.dataset.serverName;
      ghostName.textContent = dragName;
      ghost.style.display = 'flex';
      card.classList.add('sc-dragging');
      card.dataset.dragging = '1';
      var blank = document.createElement('canvas');
      blank.width = blank.height = 1;
      e.dataTransfer.setDragImage(blank, 0, 0);
      e.dataTransfer.effectAllowed = 'move';
      document.addEventListener('mousemove', moveMouse);
    });

    card.addEventListener('dragend', function () {
      ghost.style.display = 'none';
      card.classList.remove('sc-dragging');
      document.querySelectorAll('.folder-card').forEach(function (f) { f.classList.remove('fc-drag-over'); });
      document.removeEventListener('mousemove', moveMouse);
      setTimeout(function () { delete card.dataset.dragging; }, DRAG_END_DELAY);
      dragUUID = null;
      dragName = null;
    });

    card.querySelector('a').addEventListener('click', function (e) {
      if (card.dataset.dragging) e.preventDefault();
    });

    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      document.querySelectorAll('.server-ctx-menu').forEach(function (m) { m.classList.add('hidden'); });
      var menu = card.querySelector('.server-ctx-menu');
      if (menu) menu.classList.remove('hidden');
    });

    card.querySelector('a').addEventListener('keydown', function (e) {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        document.querySelectorAll('.server-ctx-menu').forEach(function (m) { m.classList.add('hidden'); });
        var menu = card.querySelector('.server-ctx-menu');
        if (menu) {
          menu.classList.remove('hidden');
          var first = menu.querySelector('button');
          if (first && first.offsetParent !== null) first.focus();
        }
      }
    });

    var actionsBtn = card.querySelector('.server-actions-btn');
    if (actionsBtn) {
      actionsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasHidden = card.querySelector('.server-ctx-menu').classList.contains('hidden');
        document.querySelectorAll('.server-ctx-menu').forEach(function (m) { m.classList.add('hidden'); });
        if (wasHidden) {
          var menu = card.querySelector('.server-ctx-menu');
          if (menu) {
            menu.classList.remove('hidden');
            var first = menu.querySelector('button');
            if (first && first.offsetParent !== null) first.focus();
          }
        }
      });
    }
  });

  document.addEventListener('click', function () {
    document.querySelectorAll('.server-ctx-menu').forEach(function (m) { m.classList.add('hidden'); });
  });

  document.querySelectorAll('.folder-card').forEach(function (folderCard) {
    folderCard.addEventListener('dragover', function (e) {
      if (!dragUUID) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      folderCard.classList.add('fc-drag-over');
    });
    folderCard.addEventListener('dragleave', function () { folderCard.classList.remove('fc-drag-over'); });
    folderCard.addEventListener('drop', async function (e) {
      e.preventDefault();
      folderCard.classList.remove('fc-drag-over');
      if (!dragUUID) return;
      var folderId = folderCard.dataset.folderId;
      try {
        var r = await fetch('/api/folders/' + folderId + '/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverUUID: dragUUID }),
        });
        var d = await r.json();
        if (d.success) { showToast('"' + dragName + '" added to folder.', 'success'); setTimeout(function () { location.reload(); }, ADD_TO_FOLDER_DELAY); }
        else showToast(d.error || 'Something went wrong.', 'error');
      } catch (err) {
        console.error('Failed to add server to folder:', err);
        showToast('Network error. Try again.', 'error');
      }
    });
  });

  document.querySelectorAll('.ctx-add-to-folder').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var uuid = btn.dataset.uuid;
      if (allFolders.length === 0) { showToast('Create a folder first.', 'error'); return; }
      if (allFolders.length === 1) {
        try {
          var r = await fetch('/api/folders/' + allFolders[0].id + '/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverUUID: uuid }) });
          var d = await r.json();
          if (d.success) { showToast('Added to folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
        } catch (err) {
          console.error('Failed to add to folder:', err);
          showToast('Network error. Try again.', 'error');
        }
        return;
      }
      openFolderPicker(uuid);
    });
  });

  document.querySelectorAll('.ctx-remove-from-folder').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      try {
        var r = await fetch('/api/folders/servers/' + btn.dataset.uuid, { method: 'DELETE' });
        var d = await r.json();
        if (d.success) { showToast('Removed from folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
      } catch (err) {
        console.error('Failed to remove from folder:', err);
        showToast('Network error. Try again.', 'error');
      }
    });
  });

  function openFolderPicker(serverUUID) {
    deleteFolderBtn.style.display = 'none';
    activeFolderId = null;
    folderPopupTitle.textContent = 'Choose folder';
    folderPopupContent.innerHTML = '';
    allFolders.forEach(function (f) {
      var btn = document.createElement('button');
      btn.className = 'flex items-center gap-2.5 w-full text-left bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700/40 transition';
      btn.innerHTML = alIcon('folder', 'h-4 w-4 text-amber-500 shrink-0') + '<span class="text-sm text-neutral-800 dark:text-white">' + f.name + '</span>';
      btn.addEventListener('click', async function () {
        try {
          var r = await fetch('/api/folders/' + f.id + '/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverUUID: serverUUID }) });
          var d = await r.json();
          if (d.success) { showToast('Added to folder.', 'success'); location.reload(); } else showToast(d.error || 'Something went wrong.', 'error');
        } catch (err) {
          console.error('Failed to add to folder:', err);
          showToast('Network error. Try again.', 'error');
        }
      });
      folderPopupContent.appendChild(btn);
    });
    openOverlay(folderPopupOverlay, folderPopupPanel);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.server-ctx-menu').forEach(function (m) { m.classList.add('hidden'); });
      closeOverlay(folderPopupOverlay, folderPopupPanel);
      closeOverlay(newFolderOverlay, newFolderPanel);
      closeOverlay(deleteFolderOverlay, deleteFolderPanel);
    }
  });

  var serverUUIDs = allServers.map(function (s) { return s.UUID; });
  var lastPollAt = null;

  function fmtUptime(sec) {
    if (sec === null || typeof sec === 'undefined') return '';
    sec = Math.max(0, Math.floor(sec));
    var d = Math.floor(sec / SECONDS_PER_DAY);
    var h = Math.floor((sec % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    var m = Math.floor((sec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    var s = sec % SECONDS_PER_MINUTE;
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
    Promise.all(serverUUIDs.map(function (uuid) {
      return fetch('/server/' + uuid + '/status')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function (err) {
          console.warn('Failed to poll status for ' + uuid + ':', err);
          return null;
        });
    })).then(function (results) {
      results.forEach(function (status, i) {
        if (status !== null) {
          applyServerStatus(serverUUIDs[i], status);
        }
      });
    });
  }

  if (serverUUIDs.length > 0) {
    pollAllServers();
    setInterval(pollAllServers, POLL_INTERVAL);
  }
})();
