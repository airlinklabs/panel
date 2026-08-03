/* inline script 1 */

(function () {
  const toast = window.showToast || function (m) { console.warn('[locations]', m); };

  document.getElementById('createLocationBtn').addEventListener('click', async () => {
    const name = document.getElementById('locName').value.trim();
    const shortCode = document.getElementById('locCode').value.trim().toLowerCase();
    if (!name || !shortCode) { toast('Name and short code are required.', 'error'); return; }

    const r = await fetch('/admin/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shortCode }),
    });
    const d = await r.json();
    if (r.ok) {
      toast('Location created.', 'success');
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast(d.message || 'Failed to create location.', 'error');
    }
  });

  document.querySelectorAll('.delete-location-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await new Promise(resolve => {
        window.modal.confirm({
          title: req.translations.deleteLocationTitle || 'Delete location',
          body: (req.translations.deleteLocationBodyBefore || 'Delete "') + btn.dataset.name + (req.translations.deleteLocationBodyAfter || '"? Servers in it will lose their grouping.'),
          danger: true,
          confirmLabel: req.translations.deleteLabel || 'Delete',
          onConfirm: resolve,
        });
      });
      const r = await fetch('/admin/location/' + btn.dataset.id, { method: 'DELETE' });
      const d = await r.json();
      if (r.ok) {
        toast('Location deleted.', 'success');
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast(d.message || 'Failed to delete location.', 'error');
      }
    });
  });
})();
