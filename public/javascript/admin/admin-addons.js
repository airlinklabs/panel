(function() {
  function toggleAddon(slug, enable) {
    showLoadingPopup('Updating addon…', 'Applying changes…');
    fetch('/admin/addons/toggle/' + slug, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable.toString() }),
    }).then(r => r.json()).then(data => {
      hideLoadingPopup();
      if (data.success) { showToast('Addon updated', 'success'); updateRow(slug, enable); }
      else showToast(data.message || 'Failed', 'error');
      }).catch(() => { hideLoadingPopup(); showToast('Something went wrong.', 'error'); });
  }

  function updateRow(slug, enabled) {
    const row = document.querySelector('[data-slug="' + slug + '"]');
    if (!row) return;
    const badge = row.querySelector('.status-badge');
    if (badge) {
      badge.className = enabled
        ? 'status-badge inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20 dark:ring-emerald-400/20'
        : 'status-badge inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 ring-neutral-300 dark:ring-white/10';
      badge.textContent = enabled ? 'Enabled' : 'Disabled';
    }
    const btn = row.querySelector('.toggle-btn');
    if (btn) { btn.textContent = enabled ? 'Disable' : 'Enable'; btn.onclick = () => toggleAddon(slug, !enabled); }
  }

  window.toggleAddon = toggleAddon;

  window.confirmUninstall = function(slug, name) {
    window.modal && window.modal.confirm
      ? window.modal.confirm({ title: 'Uninstall Addon', body: 'Uninstall "' + name + '"? This cannot be undone.', danger: true, confirmLabel: 'Uninstall', onConfirm: () => uninstall(slug) })
      : uninstall(slug);
  };

  function uninstall(slug) {
    showLoadingPopup('Uninstalling…', 'Removing files…');
    fetch('/admin/addons/store/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) })
      .then(r => r.json()).then(data => {
        hideLoadingPopup();
        if (data.success) { showToast('Uninstalled', 'success'); const r = document.querySelector('[data-slug="' + slug + '"]'); if (r) r.remove(); }
        else showToast(data.message || 'Failed', 'error');
    }).catch(() => { hideLoadingPopup(); showToast('Something went wrong.', 'error'); });
  }

  document.getElementById('reloadBtn').addEventListener('click', () => {
    showLoadingPopup('Reloading addons…', 'Please wait…');
    fetch('/admin/addons/reload', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json()).then(data => { hideLoadingPopup(); showToast(data.message || (data.success ? 'Reloaded' : 'Failed'), data.success ? 'success' : 'error'); })
      .catch(() => { hideLoadingPopup(); showToast('Something went wrong.', 'error'); });
  });

  const addonSearchInput = document.getElementById('addonSearchInput');
  if (addonSearchInput) {
    addonSearchInput.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      let visible = 0;
      document.querySelectorAll('.addon-row').forEach(row => {
        const match = !q || row.dataset.search.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      const noResults = document.getElementById('addonNoResults');
      if (noResults) noResults.classList.toggle('hidden', visible > 0 || !q);
    });
  }
})();
