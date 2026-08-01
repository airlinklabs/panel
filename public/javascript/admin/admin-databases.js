function showConfirmModal(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Delete', onConfirm });
}

async function testHost(hostId) {
  try {
    const response = await fetch(`/admin/databases/${hostId}/test`, { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      showToast(`Connection successful (${result.latency}ms)`, 'success');
    } else {
      showToast(result.error || 'Connection failed', 'error');
    }
  } catch {
    showToast('Request failed. Try again?', 'error');
  }
}

async function deleteHost(hostId) {
  showConfirmModal('Delete host', 'This will permanently remove the database host. This cannot be undone.', async () => {
    try {
      const response = await fetch(`/admin/databases/${hostId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (response.ok) {
        showToast('Host deleted.', 'success');
        window.location.reload();
      } else {
        showToast(result.error || 'Failed to delete host', 'error');
      }
    } catch {
      showToast('Request failed. Try again?', 'error');
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
      port: document.getElementById('hostPort').value || 3306,
      username: document.getElementById('hostUser').value.trim(),
      password: document.getElementById('hostPassword').value,
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
