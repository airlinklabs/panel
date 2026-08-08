(function () {
const STAGGER_DELAY_MS = 30;
const ROW_ANIMATION_DURATION_MS = 200;

function showConfirmModal(title, message, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center';
  modal.innerHTML = `
    <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/60 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
      <h2 class="text-sm font-semibold text-neutral-800 dark:text-white mb-1">${title}</h2>
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-5">${message}</p>
      <div class="flex gap-2 justify-end">
        <button id="modalCancel" class="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">Cancel</button>
        <button id="modalConfirm" class="px-4 py-2 text-xs font-medium rounded-xl bg-red-600 hover:bg-red-500 text-white transition">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => { document.body.removeChild(modal); };
  modal.querySelector('#modalCancel').addEventListener('click', close);
  modal.querySelector('#modalConfirm').addEventListener('click', () => { close(); onConfirm(); });
}

function confirmDeleteApiKey(keyId) {
  const doDelete = () => {
    const form = document.getElementById('deleteKeyForm_' + keyId);
    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams(new FormData(form))
    }).then(function(res) {
      if (res.ok) {
        showToast('API key deleted', 'success');
        const card = document.querySelector('[data-api-key-id="' + keyId + '"]');
        if (card && window.al) al.removeRow(card);
        const list = document.querySelector('.al-page-body');
        if (list && !list.querySelector('[data-api-key-id]') && !list.querySelector('[data-al-apikeys-empty]')) {
          const empty = document.createElement('div');
          empty.className = 'flex flex-col items-center justify-center py-24 text-center al-card';
          empty.setAttribute('data-al-apikeys-empty', '');
          empty.innerHTML = '<p class="text-sm" style="color:var(--theme-text-muted)">No API keys yet. The robots can\'t connect without them.</p>';
          list.appendChild(empty);
        }
        return;
      }
      return res.json().then(function(data) {
        showToast(data.error || data.message || 'Failed to delete API key.', 'error');
      });
    }).catch(function(e) {
      console.error('Delete API key failed:', e);
      showToast('Network error — try again.', 'error');
    });
  };
  if (window.modal && typeof window.modal.confirm === 'function') {
    window.modal.confirm({
      title: 'Delete API key',
      body: 'This will permanently revoke the key. Any integrations using it will stop working.',
      danger: true,
      confirmLabel: 'Yeah, delete it',
      onConfirm: doDelete
    });
    return;
  }
  showConfirmModal('Delete API key', 'This will permanently revoke the key. Any integrations using it will stop working.', doDelete);
}

(function staggerRows() {
  const rows = document.querySelectorAll('tbody tr');
  rows.forEach(function(row, i) {
    row.style.opacity = '0';
    row.style.transform = 'translateY(5px)';
    row.style.transition = 'none';
    setTimeout(function() {
      row.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
      row.style.opacity = '1';
      row.style.transform = 'translateY(0)';
      setTimeout(function() { row.style.transition = ''; row.style.opacity = ''; row.style.transform = ''; }, ROW_ANIMATION_DURATION_MS);
    }, i * STAGGER_DELAY_MS);
  });
})();

window.confirmDeleteApiKey = confirmDeleteApiKey;
})();
