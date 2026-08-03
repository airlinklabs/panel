/* inline script 1 */

  document.addEventListener('DOMContentLoaded', function() {
    const serverSettingsForm = document.getElementById('serverSettingsForm');
    const reinstallButton = document.getElementById('reinstallButton');

    serverSettingsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(serverSettingsForm);
      const settings = { name: formData.get('name'), description: formData.get('description') };
      const loader = showLoadingPopup('Updating Server Settings', 'Saving your changes...');
      fetch(`/server/null/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      })
      .then(response => response.json())
      .then(data => {
        loader.close();
        if (data.success) { showToast('Server settings saved.', 'success'); setTimeout(() => window.location.reload(), 1500); }
        else { showToast('Failed to update server settings: ' + (data.error || 'Unknown error'), 'error'); }
      })
      .catch(error => { loader.close(); console.error('Error:', error); showToast('Something went wrong.', 'error'); });
    });

    const deleteServerButton = document.getElementById('deleteServerButton');
    if (deleteServerButton) {
      deleteServerButton.addEventListener('click', () => {
        window.modal.confirm({
          title: 'Delete Server', body: 'This will permanently delete the server and all its data. This cannot be undone.',
          danger: true, confirmLabel: 'Delete Server',
          onConfirm: () => {
            window.modal.confirm({
              title: 'Final Warning', body: 'All server data will be permanently lost. Are you absolutely sure?',
              danger: true, confirmLabel: 'Yes, Delete',
              onConfirm: () => {
                const loader = showLoadingPopup('Deleting Server', 'Removing server and all data...');
                loader.updateProgress(20, 'Contacting node...');
                ;
                window.location.href = '/admin/server/delete/null';
                ;
                fetch('/user/server/null', { method: 'DELETE' })
                  .then(r => r.json())
                  .then(d => { loader.close(); if (d.success) window.location.href = '/'; else showToast(d.error || "Couldn't delete the server.", 'error'); })
                  .catch(() => { loader.close(); showToast('Something went wrong.', 'error'); });
                ;
              }
            });
          }
        });
      });
    }

    reinstallButton.addEventListener('click', () => {
      window.modal.confirm({
        title: 'null',
        body: 'null',
        danger: true, confirmLabel: 'null',
        onConfirm: () => {
          window.modal.confirm({
            title: 'Final Warning', body: 'All server data will be permanently deleted. There is no recovery. Continue?',
            danger: true, confirmLabel: 'Proceed',
            onConfirm: () => {
              const loader = showLoadingPopup('Reinstalling Server', 'Initiating server reinstallation...');
              loader.updateProgress(10, 'Preparing for reinstallation...');
              fetch(`/server/null/reinstall`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                  loader.updateProgress(100, 'Reinstallation initiated!');
                  setTimeout(() => { loader.close(); if (data.success) showToast('Server reinstalling. This may take a while.', 'success'); else showToast('Failed to reinstall server: ' + (data.error || 'Unknown error'), 'error'); }, 1000);
                })
                .catch(() => { loader.close(); showToast('Something went wrong.', 'error'); });
            }
          });
        }
      });
    });

    // ── Allocations management ─────────────────────────────────────────────
    const allocList = document.getElementById('allocationsList');
    const availSelect = document.getElementById('availPortSelect');
    const addBtn = document.getElementById('addAllocationBtn');
    const serverUuid = 'null';

    function renderAllocations(data) {
      if (!allocList) return;

      const chips = data.allocated;
      if (!chips.length) {
        allocList.innerHTML = '<p class="text-xs" style="color:var(--theme-text-muted)">No ports assigned yet.</p>';
      } else {
        allocList.innerHTML = chips.map(p =>
          '<div class="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style="background:var(--theme-bg-secondary);border:1px solid var(--theme-border)">' +
            '<span>' + (p.primary ? '<strong>' + p.external + '</strong> <em>(primary)</em>' : p.external + ':' + p.internal) + '</span>' +
            (p.primary ? '' : '<button type="button" class="al-btn-ghost text-xs" onclick="releaseAllocation(' + p.external + ')">Remove</button>') +
          '</div>'
        ).join('');
      }

      if (availSelect) {
        availSelect.innerHTML = '<option value="">Select an available port...</option>' +
          data.available.map(p => '<option value="' + p + '">' + p + '</option>').join('');
      }
    }

    async function loadAllocations() {
      try {
        const r = await fetch('/server/' + serverUuid + '/settings/allocations');
        const data = await r.json();
        if (data.allocated) renderAllocations(data);
      } catch { if (allocList) allocList.innerHTML = '<p class="text-xs" style="color:var(--theme-text-muted)">Could not load allocations.</p>'; }
    }

    window.releaseAllocation = async function(port) {
      const r = await fetch('/server/' + serverUuid + '/settings/allocations/' + port, { method: 'DELETE' });
      const d = await r.json();
      if (r.ok) { showToast('Port ' + port + ' released.', 'success'); loadAllocations(); }
      else showToast(d.error || 'Failed to release port.', 'error');
    };

    if (addBtn) addBtn.addEventListener('click', async () => {
      const port = availSelect.value;
      if (!port) { showToast('Select a port first.', 'error'); return; }
      const r = await fetch('/server/' + serverUuid + '/settings/allocations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: Number(port) }),
      });
      const d = await r.json();
      if (r.ok) { showToast('Port ' + port + ' added.', 'success'); loadAllocations(); }
      else showToast(d.error || 'Failed to add port.', 'error');
    });

    if (document.getElementById('allocationsList')) loadAllocations();
  });
