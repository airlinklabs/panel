(function() {
  const pd = document.getElementById('page-data')?.dataset;
  let pendingRejectId = null;

  window.ALMount(function() {
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

    function emptyApprovalsHtml() {
      return '<div class="flex flex-col items-center justify-center py-20 text-center">' +
        '<div class="w-12 h-12 rounded-full bg-emerald-600/10 flex items-center justify-center mb-4">' +
        (window.alIcon ? alIcon('check', 'w-6 h-6') : '') +
        '</div>' +
        '<p class="text-sm font-medium" style="color:var(--theme-text-strong)">No images waiting for review.</p>' +
        '<p class="text-sm mt-1" style="color:var(--theme-text-muted)">User submissions will appear here for approval.</p>' +
        '</div>';
    }

    function removePendingCard(id, card) {
      const list = document.getElementById('pendingApprovalsList');
      const remaining = list ? Math.max(0, list.querySelectorAll('.pending-card').length - 1) : 0;
      if (card && window.al) al.removeRow(card);
      else if (card) card.remove();
      const badge = document.getElementById('tabCountApprovals');
      if (badge) {
        if (remaining > 0) badge.textContent = remaining;
        else badge.remove();
      }
      if (list && remaining === 0 && !list.querySelector('.pending-card')) {
        list.innerHTML = emptyApprovalsHtml();
      }
    }

    document.querySelectorAll('[data-close-reject]').forEach((btn) => {
      btn.addEventListener('click', closeReject);
    });

    document.querySelectorAll('[data-approve-image]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        window.modal.confirm({
          title: pd.approveConfirm,
          body: pd.approveConfirm,
          danger: false,
          confirmLabel: 'Approve',
          onConfirm: async () => {
            const id = btn.dataset.approveImage;
            const card = btn.closest('.pending-card');
            try {
              const response = await fetch('/admin/images/approve/' + id, { method: 'POST' });
              const data = await response.json();
              if (data.error) {
                showToast(data.error, 'error');
              } else {
                showToast(data.message || pd.approved, 'success');
                removePendingCard(id, card);
                if (window.renderImageTable) renderImageTable();
              }
            } catch (error) {
              console.error('Failed to approve image:', error);
              showToast(pd.error, 'error');
            }
          }
        });
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
      const card = document.querySelector('[data-pending-image="' + id + '"]');
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
          removePendingCard(id, card);
        }
      } catch (error) {
        closeReject();
        console.error('Failed to reject image:', error);
        showToast(pd.error, 'error');
      }
    });
  });
})();