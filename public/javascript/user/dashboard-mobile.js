(function () {
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Grid / List view toggle ──────────────────────────────────────────
  const gridView  = document.getElementById('gridView');
  const listView  = document.getElementById('listView');
  const gridBtn   = document.getElementById('gridViewBtn');
  const listBtn   = document.getElementById('listViewBtn');

  if (gridView && listView && gridBtn && listBtn) {
    const saved = localStorage.getItem('mobServerView') || 'grid';
    function switchView(mode) {
      gridView.classList.toggle('hidden', mode !== 'grid');
      listView.classList.toggle('hidden', mode !== 'list');
      gridBtn.classList.toggle('bg-white', mode === 'grid');
      gridBtn.classList.toggle('dark:bg-neutral-700', mode === 'grid');
      gridBtn.classList.toggle('text-neutral-900', mode === 'grid');
      gridBtn.classList.toggle('dark:text-white', mode === 'grid');
      gridBtn.classList.toggle('shadow-sm', mode === 'grid');
      listBtn.classList.toggle('bg-white', mode === 'list');
      listBtn.classList.toggle('dark:bg-neutral-700', mode === 'list');
      listBtn.classList.toggle('text-neutral-900', mode === 'list');
      listBtn.classList.toggle('dark:text-white', mode === 'list');
      listBtn.classList.toggle('shadow-sm', mode === 'list');
    }
    gridBtn.addEventListener('click', () => { switchView('grid'); localStorage.setItem('mobServerView', 'grid'); });
    listBtn.addEventListener('click', () => { switchView('list'); localStorage.setItem('mobServerView', 'list'); });
    switchView(saved);
  }

  const bridge    = document.getElementById('dashboard-data');
  const allFolders = JSON.parse(bridge.dataset.folders || '[]');
  const allServers = JSON.parse(bridge.dataset.servers || '[]');

  const newFolderBtn     = document.getElementById('newFolderBtn');
  const newFolderDialog  = document.getElementById('newFolderDialog');
  const newFolderName    = document.getElementById('newFolderName');
  const cancelNewFolder  = document.getElementById('cancelNewFolder');
  const confirmNewFolder = document.getElementById('confirmNewFolder');

  newFolderBtn?.addEventListener('click', () => { newFolderName.value = ''; newFolderDialog.classList.remove('hidden'); setTimeout(() => newFolderName.focus(), 80); });
  cancelNewFolder?.addEventListener('click', () => newFolderDialog.classList.add('hidden'));
  newFolderName?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewFolder.click(); });

  confirmNewFolder?.addEventListener('click', async () => {
    const name = newFolderName.value.trim();
    if (!name) return;
    confirmNewFolder.disabled = true;
    const r = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await r.json();
    confirmNewFolder.disabled = false;
    if (d.success) location.reload(); else showToast(d.error || 'Something went wrong.', 'error');
  });

  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      const memberUUIDs = JSON.parse(card.dataset.folderMembers || '[]');
      const folderName  = card.dataset.folderName;
      activeFolderId    = card.dataset.folderId;
      const serversIn   = allServers.filter(s => memberUUIDs.includes(s.UUID));

      document.getElementById('folderOverlayTitle').textContent = folderName;
      const content = document.getElementById('folderOverlayContent');
      content.innerHTML = '';

      if (serversIn.length === 0) {
        content.innerHTML = '<p class="text-sm text-neutral-500">No servers in this folder.</p>';
      } else {
        serversIn.forEach(s => {
          const row = document.createElement('div');
          row.className = 'flex items-center gap-2 bg-neutral-50 dark:bg-neutral-700/30 border border-neutral-200 dark:border-white/5 rounded-xl px-3 py-2.5';
          const running = s.status === 'running';
          row.innerHTML = `
            <a href="/server/${s.UUID}" class="flex items-center gap-2 flex-1 min-w-0 active:opacity-60">
              <span class="text-sm font-medium text-neutral-800 dark:text-white truncate">${s.name}</span>
              <span class="ml-auto shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-md ${running ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400'}">${running ? 'Running' : 'Stopped'}</span>
            </a>
            <button data-uuid="${s.UUID}" class="mob-remove-btn shrink-0 p-2 rounded-lg text-neutral-400 active:bg-red-50 dark:active:bg-red-500/10 active:text-red-500 transition">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd"/>
              </svg>
            </button>`;
          row.querySelector('.mob-remove-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            const uuid = e.currentTarget.dataset.uuid;
            const r = await fetch('/api/folders/servers/' + uuid, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { document.getElementById('folderOverlay').classList.add('hidden'); showToast('Removed.', 'success'); setTimeout(() => location.reload(), 600); }
            else showToast(d.error || 'Something went wrong.', 'error');
          });
          content.appendChild(row);
        });
      }

      document.getElementById('folderOverlay').classList.remove('hidden');
    });
  });

  document.getElementById('closeFolderOverlay')?.addEventListener('click', () => document.getElementById('folderOverlay').classList.add('hidden'));

  let activeFolderId = null;

  document.getElementById('deleteFolderBtn')?.addEventListener('click', () => {
    document.getElementById('folderOverlay').classList.add('hidden');
    document.getElementById('deleteFolderSheet').classList.remove('hidden');
  });

  document.getElementById('cancelDeleteFolder')?.addEventListener('click', () => {
    document.getElementById('deleteFolderSheet').classList.add('hidden');
  });

  document.getElementById('confirmDeleteFolder')?.addEventListener('click', async () => {
    if (!activeFolderId) return;
    const btn = document.getElementById('confirmDeleteFolder');
    btn.disabled = true;
    const r = await fetch('/api/folders/' + activeFolderId, { method: 'DELETE' });
    const d = await r.json();
    btn.disabled = false;
    document.getElementById('deleteFolderSheet').classList.add('hidden');
    if (d.success) location.reload(); else showToast(d.error || "Couldn't delete the folder.", 'error');
  });

  let longPressTimer = null;
  let activeServerUUID = null;
  let activeServerName = null;

  function showLongPressSheet(uuid, name) {
    activeServerUUID = uuid;
    activeServerName = name;
    document.getElementById('longPressServerName').textContent = name;

    const inFolder = allFolders.some(f => f.members.some(m => m.serverUUID === uuid));
    document.getElementById('lpRemoveFromFolder').classList.toggle('hidden', !inFolder);

    document.getElementById('longPressSheet').classList.remove('hidden');
  }

  document.querySelectorAll('.server-card').forEach(card => {
    const uuid = card.dataset.serverUuid;
    const name = card.dataset.serverName;

    card.addEventListener('touchstart', e => {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        showLongPressSheet(uuid, name);
      }, 500);
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });

    card.addEventListener('touchmove', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
  });

  document.getElementById('lpCancel')?.addEventListener('click', () => document.getElementById('longPressSheet').classList.add('hidden'));

  document.getElementById('lpMoveToFolder')?.addEventListener('click', () => {
    document.getElementById('longPressSheet').classList.add('hidden');
    showFolderPickDialog(activeServerUUID);
  });

  document.getElementById('lpRemoveFromFolder')?.addEventListener('click', async () => {
    document.getElementById('longPressSheet').classList.add('hidden');
    const r = await fetch('/api/folders/servers/' + activeServerUUID, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) location.reload(); else showToast(d.error || 'Something went wrong.', 'error');
  });

  function showFolderPickDialog(uuid) {
    const list = document.getElementById('folderPickList');
    list.innerHTML = '';
    if (allFolders.length === 0) {
      list.innerHTML = '<p class="text-sm text-neutral-500">No folders yet. Create one first.</p>';
    } else {
      allFolders.forEach(f => {
        const b = document.createElement('button');
        b.className = 'w-full flex items-center gap-2.5 px-3 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-700/30 border border-neutral-200 dark:border-white/5 text-left active:scale-[0.98] transition-transform';
        b.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-amber-500 shrink-0"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 12h-15a4.483 4.483 0 0 0-3 1.146Z"/></svg><span class="text-sm text-neutral-800 dark:text-white">${f.name}</span>`;
        b.addEventListener('click', async () => {
          const r = await fetch('/api/folders/' + f.id + '/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverUUID: uuid }) });
          const d = await r.json();
          if (d.success) location.reload(); else showToast(d.error || 'Something went wrong.', 'error');
        });
        list.appendChild(b);
      });
    }
    document.getElementById('addToFolderDialog').classList.remove('hidden');
  }

  document.getElementById('cancelAddToFolder')?.addEventListener('click', () => document.getElementById('addToFolderDialog').classList.add('hidden'));
})();
