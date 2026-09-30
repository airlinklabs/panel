const BASE = window.location.pathname
  .replace(/\/$/, '')
  .replace(/\/backups$/, '');

let polling = false;
let pollTimer = null;

function showToast(msg, type = 'success') {
  if (window.showToast) {return window.showToast(msg, type);}
  const el = document.createElement('div');
  el.className =
    'fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg';
  el.style.cssText =
    type === 'error'
      ? 'background:var(--theme-danger);color:#fff;'
      : 'background:var(--theme-success);color:#fff;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) {opts.body = JSON.stringify(body);}
  const res = await fetch(path, opts);
  return res.json();
}

function showProgress(label, el) {
  el.classList.remove('hidden');
  el.querySelector('[id$="-label"]').textContent = label;
}

function updateProgress(el, percent) {
  const bar = el.querySelector('[id$="-bar"]');
  const pct = el.querySelector('[id$="-percent"]');
  if (bar) {bar.style.width = `${percent  }%`;}
  if (pct) {pct.textContent = `${percent  }%`;}
}

function hideProgress(el) {
  el.classList.add('hidden');
  const bar = el.querySelector('[id$="-bar"]');
  const pct = el.querySelector('[id$="-percent"]');
  if (bar) {bar.style.width = '0%';}
  if (pct) {pct.textContent = '0%';}
}

async function pollBackupProgress() {
  const progressEl = document.getElementById('backup-progress');
  if (polling) {return;}
  polling = true;

  const check = async () => {
    try {
      const data = await api('GET', `${BASE}/backups/progress`);
      const d = data.data || data;
      if (d && d.running) {
        updateProgress(progressEl, d.percent || 0);
        progressEl.querySelector('[id$="-label"]').textContent =
          d.status || 'Creating backup...';
        pollTimer = setTimeout(check, 2000);
      } else {
        hideProgress(progressEl);
        polling = false;
        window.location.reload();
      }
    } catch {
      hideProgress(progressEl);
      polling = false;
    }
  };
  await check();
}

async function pollRestoreProgress() {
  const restoreEl = document.getElementById('restore-progress');
  if (polling) {return;}
  polling = true;

  const check = async () => {
    try {
      const data = await api('GET', `${BASE}/backups/restore/progress`);
      const d = data.data || data;
      if (d && d.running) {
        updateProgress(restoreEl, d.percent || 0);
        restoreEl.querySelector('[id$="-label"]').textContent =
          d.status || 'Restoring backup...';
        pollTimer = setTimeout(check, 2000);
      } else {
        hideProgress(restoreEl);
        polling = false;
        window.location.reload();
      }
    } catch {
      hideProgress(restoreEl);
      polling = false;
    }
  };
  await check();
}

export function mount(root) {
  const serverUUID = root.dataset.serverUuid;

  // Create backup
  document
    .getElementById('createBackupBtn')
    ?.addEventListener('click', async () => {
      const btn = document.getElementById('createBackupBtn');
      btn.disabled = true;
      btn.style.opacity = '0.6';

      try {
        const data = await api('POST', `${BASE}/backups/create`, {});
        if (data.success !== false) {
          showProgress(
            'Creating backup...',
            document.getElementById('backup-progress'),
          );
          pollBackupProgress();
        } else {
          showToast(data.error || 'Failed to create backup', 'error');
        }
      } catch (e) {
        showToast('Failed to create backup', 'error');
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

  // Lock/unlock
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.lock-btn');
    if (!btn) {return;}

    const backupId = btn.dataset.backupId;
    const locked = btn.dataset.locked === 'true';

    try {
      const data = await api('PATCH', `${BASE}/backups/${backupId}/lock`, {
        locked: !locked,
      });
      if (data.success !== false) {
        showToast(locked ? 'Backup unlocked' : 'Backup locked');
        window.location.reload();
      } else {
        showToast(data.error || 'Failed to toggle lock', 'error');
      }
    } catch {
      showToast('Failed to toggle lock', 'error');
    }
  });

  // Restore
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.restore-btn');
    if (!btn) {return;}

    const backupId = btn.dataset.backupId;
    if (!confirm('Restore this backup? Current data will be overwritten.'))
    {return;}

    try {
      const data = await api('POST', `${BASE}/backups/${backupId}/restore`, {});
      if (data.success !== false) {
        showProgress(
          'Restoring backup...',
          document.getElementById('restore-progress'),
        );
        pollRestoreProgress();
      } else {
        showToast(data.error || 'Failed to restore backup', 'error');
      }
    } catch {
      showToast('Failed to restore backup', 'error');
    }
  });

  // Delete
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) {return;}

    const backupId = btn.dataset.backupId;
    if (!confirm('Permanently delete this backup?')) {return;}

    try {
      const data = await api('DELETE', `${BASE}/backups/${backupId}`);
      if (data.success !== false) {
        btn.closest('[data-backup-id]')?.remove();
        showToast('Backup deleted');
        // Check if list is now empty
        if (!root.querySelector('[data-backup-id]')) {
          const list = document.getElementById('backup-list');
          list.innerHTML = `
            <div class="al-card p-8 text-center">
              <p class="text-sm mb-1" style="color:var(--theme-text-strong);">No backups yet</p>
              <p class="text-xs" style="color:var(--theme-text-muted);">Create your first backup above.</p>
            </div>`;
        }
      } else {
        showToast(data.error || 'Failed to delete backup', 'error');
      }
    } catch {
      showToast('Failed to delete backup', 'error');
    }
  });
}
