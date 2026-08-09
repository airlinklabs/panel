(function() {
  const pd = document.getElementById('page-data')?.dataset;

  function syncEmptyState() {
    const tbody = document.querySelector('#myImagesTable tbody');
    const hasRows = tbody ? !!tbody.querySelector('[data-image-id]') : false;
    const empty = document.getElementById('myImagesEmpty');
    const table = document.getElementById('myImagesTable');
    if (empty) empty.classList.toggle('hidden', hasRows);
    if (table) table.classList.toggle('hidden', !hasRows);
  }

  window.ALMount(function() {
    document.querySelectorAll('[data-delete-image]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        const id = btn.dataset.deleteImage;
        if (!confirm(pd.deleteConfirm)) return;
        const row = btn.closest('[data-image-id]');
        try {
          const response = await fetch('/my-images/' + id, { method: 'DELETE' });
          const data = await response.json();
          if (data.error) {
            showToast(data.error, 'error');
          } else {
            showToast(pd.deleted, 'success');
            if (row && window.al) al.removeRow(row).then(syncEmptyState);
            else if (row) { row.remove(); syncEmptyState(); }
            else syncEmptyState();
          }
        } catch (error) {
          console.error('Failed to delete image:', error);
          showToast(pd.error, 'error');
        }
      });
    });
  });
})();