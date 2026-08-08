(function() {
  const pd = document.getElementById('page-data')?.dataset;
  let pendingRejectId = null;

  document.addEventListener('DOMContentLoaded', function() {
    const rejectModal = document.getElementById('rejectModal');
    const openReject = (id, name) => {
      pendingRejectId = id;
      document.getElementById('rejectImageName').textContent = name;
      rejectModal.classList.remove('opacity-0', 'pointer-events-none');
    };
    const closeReject = () => {
      rejectModal.classList.add('opacity-0', 'pointer-events-none');
      pendingRejectId = null;
    };

    document.querySelectorAll('[data-close-reject]').forEach((btn) => {
      btn.addEventListener('click', closeReject);
    });

    document.querySelectorAll('[data-approve-image]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(pd.approveConfirm)) return;
        const id = btn.dataset.approveImage;
        try {
          const response = await fetch('/admin/images/approve/' + id, { method: 'POST' });
          const data = await response.json();
          if (data.error) {
            showToast(data.error, 'error');
          } else {
            showToast(data.message || pd.approved, 'success');
            setTimeout(() => window.location.reload(), 800);
          }
        } catch (error) {
          console.error('Failed to approve image:', error);
          showToast(pd.error, 'error');
        }
      });
    });

    document.querySelectorAll('[data-reject-image]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openReject(btn.dataset.rejectImage, btn.closest('div.rounded-xl')?.querySelector('h3')?.textContent || '');
      });
    });

    document.getElementById('confirmReject').addEventListener('click', async () => {
      if (pendingRejectId == null) return;
      const id = pendingRejectId;
      const reason = document.getElementById('rejectReason').value;
      try {
        const response = await fetch('/admin/images/reject/' + id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        const data = await response.json();
        closeReject();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast(data.message || pd.rejected, 'success');
          setTimeout(() => window.location.reload(), 800);
        }
      } catch (error) {
        closeReject();
        console.error('Failed to reject image:', error);
        showToast(pd.error, 'error');
      }
    });
  });
})();