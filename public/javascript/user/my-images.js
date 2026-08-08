(function() {
  const pd = document.getElementById('page-data')?.dataset;

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-delete-image]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        const id = btn.dataset.deleteImage;
        if (!confirm(pd.deleteConfirm)) return;
        try {
          const response = await fetch('/my-images/' + id, { method: 'DELETE' });
          const data = await response.json();
          if (data.error) {
            showToast(data.error, 'error');
          } else {
            showToast(pd.deleted, 'success');
            setTimeout(() => window.location.reload(), 800);
          }
        } catch (error) {
          console.error('Failed to delete image:', error);
          showToast(pd.error, 'error');
        }
      });
    });
  });
})();