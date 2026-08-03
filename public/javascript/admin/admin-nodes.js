function handleRowClick(event, url) {
  if (!event.target.closest('button, a')) {
    window.location = url;
  }
}

function showConfirmModal(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Yeah, delete it', onConfirm });
}

async function deleteNode(nodeId) {
  showConfirmModal('Delete node', 'This will permanently remove the node. This cannot be undone.', async () => {
    try {
      const response = await fetch(`/admin/node/${nodeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (response.ok) {
        showToast('Node deleted.', 'success');
        window.location.reload();
      } else if (result.error === 'There are instances on the node') {
        showConfirmModal('Node has servers', 'There are servers on this node. Delete all servers and remove the node?', async () => {
          const r2 = await fetch(`/admin/node/${nodeId}?deleteInstance=true`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          if (r2.ok) {
            showToast('Node and servers deleted.', 'success');
            window.location.reload();
          } else {
            showToast('Failed to delete node', 'error');
          }
        });
      } else {
        showToast(result.message || 'Failed to delete node', 'error');
      }
    } catch {
      showToast('Request failed. Try again?', 'error');
    }
  });
}

document.getElementById('createButton').addEventListener('click', () => {
  location.href = '/admin/nodes/create';
});

async function configure(nodeId) {
  try {
    const response = await fetch(`/admin/node/${nodeId}/configure`);
    if (!response.ok) throw new Error('Failed to fetch configure command');
    const data = await response.json();
    showPopup(data);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to fetch configure command.', 'error');
  }
}

function showPopup(command) {
  const popup = document.createElement('div');
  popup.style.display = 'none';
  popup.innerHTML = `
    <div class="flex justify-center items-center mb-6">
      ${alIcon('badge-check', 'text-emerald-500', { width: 64, height: 64 })}
    </div>
    <p class="mb-4 text-neutral-600 dark:text-neutral-300 text-center">To auto-configure your node, run the following command:</p>
    <pre class="bg-neutral-100 dark:bg-neutral-900 p-3 rounded-xl mb-4 overflow-x-auto"><code id="commandCode" class="text-emerald-500">${command}</code></pre>
    <div class="flex justify-end">
      <button id="copyBtn" class="bg-emerald-600 text-white px-4 py-2 rounded-xl mr-2 hover:bg-emerald-700 transition-colors">Copy</button>
      <button id="doneBtn" class="bg-neutral-800 dark:bg-neutral-700 text-white px-4 py-2 rounded-xl hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors">Close</button>
    </div>
  `;

  window.modal.show({
    title: 'Token Created',
    bodyNode: popup,
    panelClass: 'max-w-xl',
  });

  const copyBtn = document.getElementById('copyBtn');
  copyBtn.addEventListener('click', () => copyCommand(copyBtn, command));
  document.getElementById('doneBtn').addEventListener('click', closePopup);
}

function closePopup() {
  window.modal.close();
}

function copyCommand(copyBtn, command) {
  navigator.clipboard.writeText(command)
    .then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.replace('bg-emerald-600', 'bg-neutral-600');
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.replace('bg-neutral-600', 'bg-emerald-600');
      }, 2000);
    })
    .catch(error => { console.error('Failed to copy:', error); showToast('Couldn\'t copy the command. Try again.', 'error'); });
}

// ── Live node status polling ──────────────────────────────────
(function() {
  var pageData = document.getElementById('page-data');
  if (!pageData) return;
  var rawNodes = pageData.dataset.nodes;
  if (!rawNodes) return;

  var nodeList;
  try { nodeList = JSON.parse(rawNodes); } catch { return; }
  if (!nodeList || !nodeList.length) return;

  function getStatusClass(status) {
    if (status === 'Online') return 'al-dot-online';
    if (status === 'Offline') return 'al-dot-offline';
    return 'al-dot-warning';
  }

  function updateNodeStatus(nodeId, status) {
    var cell = document.querySelector('#nodeTable [data-node-id="' + nodeId + '"]');
    if (!cell) return;
    var dot = cell.querySelector('.al-dot-online, .al-dot-offline, .al-dot-warning');
    if (!dot) return;
    var newClass = getStatusClass(status);
    if (dot.className !== newClass) {
      dot.className = newClass;
    }
  }

  function pollNodeStatus() {
    fetch('/admin/nodes/list')
      .then(function(r) { return r.json(); })
      .then(function(nodes) {
        if (!nodes || !nodes.length) return;
        nodes.forEach(function(n) {
          updateNodeStatus(n.id, n.status);
        });
        var anyOffline = nodes.some(function(n) { return n.status === 'Offline'; });
        var alertEl = document.querySelector('.al-alert-danger');
        if (anyOffline) {
          if (!alertEl) window.location.reload();
        } else {
          if (alertEl) alertEl.remove();
        }
      })
      .catch(function() {});
  }

  setInterval(pollNodeStatus, 15000);
})();
