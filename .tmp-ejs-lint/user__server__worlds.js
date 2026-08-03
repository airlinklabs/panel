/* inline script 1 */

  document.addEventListener('DOMContentLoaded', function() {
    // Hide loading indicator when worlds are loaded
    const loadingIndicator = document.getElementById('loadingIndicator');
    const noWorldsMessage = document.getElementById('noWorldsMessage');
    const serverTable = document.getElementById('serverTable');

    // Hide loading indicator after a short delay to prevent flickering
    setTimeout(() => {
      document.getElementById('loadingIndicatorRow') && document.getElementById('loadingIndicatorRow').classList.remove('open');

      // Show appropriate content based on worlds availability
      if (null > 0) {
        document.getElementById('serverTableRow') && document.getElementById('serverTableRow').classList.add('open');
        document.getElementById('noWorldsMessageRow') && document.getElementById('noWorldsMessageRow').classList.remove('open');
      } else {
        document.getElementById('serverTableRow') && document.getElementById('serverTableRow').classList.remove('open');
        document.getElementById('noWorldsMessageRow') && document.getElementById('noWorldsMessageRow').classList.add('open');
      }
    }, 500);

    // WebSocket for server status
    const wsCheck = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/server/null/status`);

    wsCheck.onopen = function() {
      // Connection established
    };

    wsCheck.onmessage = function(event) {
      // No need to show daemon down message as it's been removed
      console.log('WebSocket message received:', JSON.parse(event.data));
    };

    wsCheck.onerror = function() {
      // No need to show daemon down message as it's been removed
      console.error('WebSocket connection error');
    };

    // Close WebSocket when page is unloaded
    window.addEventListener('beforeunload', function() {
      if (wsCheck && wsCheck.readyState === WebSocket.OPEN) {
        wsCheck.close();
      }
    });
  });

  function confirmDeleteWorld(worldName) {
    const t = null;
    window.modal.confirm({
      title: t.deleteWorld || 'Delete World',
      body: (t.deleteWorldConfirmBody || 'Delete "{world}"? All world data will be permanently lost and cannot be recovered.').replace('{world}', worldName),
      danger: true,
      confirmLabel: t.deleteWorld || 'Delete World',
      onConfirm: () => deleteWorld(worldName, () => {})
    });
  }

  function deleteWorld(worldName, callback) {
    const t = null;
    showToast((t.deletingWorld || 'Deleting world {world}...').replace('{world}', worldName), 'info');

    fetch('/server/null/files/rm/' + encodeURIComponent(worldName), {
      method: 'DELETE'
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || t.failedToDeleteWorld || 'Failed to delete world');
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        showToast((t.worldDeleted || 'World {world} deleted.').replace('{world}', worldName), 'success');

        // Fade out the deleted row
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          if (row.textContent.includes(worldName)) {
            row.style.transition = 'opacity 0.5s';
            row.style.opacity = '0';
            break;
          }
        }

        // Reload after animation
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(data.error || t.failedToDeleteWorld || 'Failed to delete world', 'error');
        if (callback) callback();
      }
    })
    .catch(error => {
      console.error('Error deleting world:', error);
      showToast(error.message || t.failedToDeleteWorld || 'Failed to delete world', 'error');
      if (callback) callback();
    });
  }
