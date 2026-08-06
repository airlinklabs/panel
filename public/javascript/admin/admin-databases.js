const AUTO_HOST_RELOAD_DELAY_MS = 900;
const DEFAULT_DB_PORT = 3306;

function showConfirmModal(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Delete', onConfirm });
}

async function autoGenerateHost() {
  const btn = document.getElementById('autoHostBtn');
  const label = btn ? btn.querySelector('span') : null;
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Working…';
  const result = await window.api('/admin/databases/auto-host', 'POST');
  if (result && result.success) {
    showToast(result.created ? 'Host generated and connection verified.' : 'Host already exists. Connection verified.', 'success');
    setTimeout(() => window.location.reload(), AUTO_HOST_RELOAD_DELAY_MS);
  } else if (result) {
    showToast(result.error || 'Failed to auto-generate host', 'error');
  }
  if (btn) btn.disabled = false;
  if (label) label.textContent = 'Auto-generate';
}

async function autoGenerateBucket() {
  const btn = document.getElementById('autoBucketBtn');
  const label = btn ? btn.querySelector('span') : null;
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Working…';
  try {
    const result = await window.api('/admin/databases/auto-bucket', 'POST');
    if (result && result.success) {
      showToast(result.created ? 'Bucket created.' : 'Bucket already exists.', 'success');
    } else if (result) {
      showToast(result.error || 'Failed to auto-generate bucket', 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = 'Auto-generate';
  }
}

async function testHost(hostId) {
  const result = await window.api(`/admin/databases/${hostId}/test`, 'POST');
  if (result && result.success) {
    showToast(`Connection successful (${result.latency}ms)`, 'success');
  } else if (result) {
    showToast(result.error || 'Connection failed', 'error');
  }
}

async function deleteHost(hostId) {
  showConfirmModal('Delete host', 'This will permanently remove the database host. This cannot be undone.', async () => {
    const result = await window.api(`/admin/databases/${hostId}`, 'DELETE');
    if (result && result.success) {
      showToast('Host deleted.', 'success');
      window.location.reload();
    } else if (result) {
      showToast(result.error || 'Failed to delete host', 'error');
    }
  });
}

(function () {
  const saveBtn = document.getElementById('saveHostBtn');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', async () => {
    const data = {
      name: document.getElementById('hostName').value.trim(),
      host: document.getElementById('hostAddress').value.trim(),
      port: document.getElementById('hostPort').value || DEFAULT_DB_PORT,
      username: document.getElementById('hostUser').value.trim(),
      password: document.getElementById('hostPassword').value,
      nodeId: document.getElementById('hostNode')?.value || '',
    };

    if (!data.name || !data.host || !data.username || !data.password) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    try {
      const response = await fetch('/admin/databases/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.redirected) {
        window.location.href = response.url;
      } else {
        const result = await response.json();
        showToast(result.error || 'Failed to create host.', 'error');
      }
    } catch (error) {
      console.error('Error creating host:', error);
      showToast('Error creating host. Try again.', 'error');
    }
  });
})();
