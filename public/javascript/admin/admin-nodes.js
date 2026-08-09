function handleRowClick(event, url) {
  if (!event.target.closest('button, a')) {
    window.location = url;
  }
}

function showConfirmModal(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Yeah, delete it', onConfirm });
}

function removeNodeRow(nodeId) {
  const row = document.querySelector('#nodeTable [data-node-id="' + nodeId + '"]');
  if (!row) return;
  al.removeRow(row).then(function () {
    const tbody = document.querySelector('#nodeTable tbody');
    if (tbody && !tbody.querySelector('[data-node-id]')) al.showEmpty(tbody, 'No nodes yet.', 4);
    syncNodeStats();
  });
}

function syncNodeStats() {
  const rows = Array.from(document.querySelectorAll('#nodeTable tbody tr[data-node-id]'));
  const total = rows.length;
  let instances = 0;
  let online = 0;
  let assigned = 0;
  rows.forEach(function (r) {
    instances += parseInt(r.getAttribute('data-instances') || '0', 10) || 0;
    if (r.getAttribute('data-online') === 'true') online++;
    if (r.getAttribute('data-location') === 'true') assigned++;
  });
  const setVal = function (id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setVal('totalNodesTotal', total);
  setVal('totalNodeInstancesTotal', instances);
  setVal('onlineNodesTotal', online);
  setVal('avgNodeInstancesTotal', total > 0 ? (instances / total).toFixed(2) : 0);
  setVal('nodesAssignedTotal', assigned);
  setVal('nodesUnassignedTotal', total - assigned);
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
        removeNodeRow(nodeId);
      } else if (result.error === 'There are instances on the node') {
        showConfirmModal('Node has servers', 'There are servers on this node. Delete all servers and remove the node?', async () => {
          const r2 = await fetch(`/admin/node/${nodeId}?deleteInstance=true`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          if (r2.ok) {
            showToast('Node and servers deleted.', 'success');
            removeNodeRow(nodeId);
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

  function offlineBannerHtml() {
    return alIcon('triangle-alert', 'w-4 h-4 shrink-0 mt-0.5') +
      '<div class="flex-1">' +
      '<p class="font-medium">Connection Error</p>' +
      '<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">One or more nodes are offline. Some information may be unavailable.</p>' +
      '</div>' +
      '<button type="button" onclick="refreshNodeStatuses()" class="shrink-0 px-3 py-1 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5" style="background:var(--theme-danger-bg); color:var(--theme-danger);">' +
      alIcon('refresh-cw', 'size-3', { strokeWidth: 1.5 }) + 'Retry Connection</button>';
  }

  function injectOfflineBanner() {
    if (document.querySelector('.al-alert-danger')) return;
    const banner = document.createElement('div');
    banner.className = 'al-alert-danger mb-5';
    banner.innerHTML = offlineBannerHtml();
    const table = document.getElementById('nodeTable');
    if (table && table.parentNode) table.parentNode.insertBefore(banner, table);
  }

  function applyNodeStatuses(nodes) {
    nodes.forEach(function (n) {
      updateNodeStatus(n.id, n.status);
    });
    const anyOffline = nodes.some(function (n) { return n.status === 'Offline'; });
    const alertEl = document.querySelector('.al-alert-danger');
    if (anyOffline) {
      if (!alertEl) injectOfflineBanner();
    } else if (alertEl) {
      alertEl.remove();
    }
  }

  // Nodes don't have their own daemon WS streams, but the shared realtime bus
  // fires `node.*` / `admin.servers.updated` events on any change. Re-fetch the
  // list only when the cache invalidates instead of polling every 15s.
  function pollNodeStatus() {
    fetch('/admin/nodes/list')
      .then(function(r) { return r.json(); })
      .then(function(nodes) {
        if (!nodes || !nodes.length) return;
        applyNodeStatuses(nodes);
      })
      .catch(function() {});
  }

  window.refreshNodeStatuses = function () {
    const banner = document.querySelector('.al-alert-danger');
    if (banner && window.al) al.patchEl(banner, '<div class="flex items-center gap-3">' + alIcon('loader-circle', 'w-4 h-4 animate-spin') + '<p class="font-medium">Reconnecting…</p></div>');
    fetch('/admin/nodes/list')
      .then(function(r) { return r.json(); })
      .then(function(nodes) {
        if (!nodes || !nodes.length) return;
        nodes.forEach(function (n) {
          updateNodeStatus(n.id, n.status);
        });
        const anyOffline = nodes.some(function (n) { return n.status === 'Offline'; });
        const alertEl = document.querySelector('.al-alert-danger');
        if (anyOffline) {
          if (alertEl && window.al) al.patchEl(alertEl, offlineBannerHtml());
          else if (!alertEl) injectOfflineBanner();
        } else if (alertEl) {
          alertEl.remove();
        }
      })
      .catch(function() {});
  };

  var stopNodeObservers = [];

  function wireNodeStatusRealtime() {
    var rt = window.alRealtime;
    var st = window.alState;
    if (!rt || !st) return;
    if (rt.watchAll) rt.watchAll();
    if (stopNodeObservers.length) return;
    stopNodeObservers.push(st.observe('admin:nodes', pollNodeStatus));
    stopNodeObservers.push(st.observe('node', pollNodeStatus));
  }

  if (window.alRealtime && window.alState) wireNodeStatusRealtime();
  else window.alListener(window, 'al:realtime-ready', 'admin-nodes-realtime-ready', wireNodeStatusRealtime);
  window.alListener(document, 'turbo:before-cache', 'admin-nodes-realtime-teardown', function () {
    stopNodeObservers.splice(0).forEach(function (stop) { stop(); });
  });
})();
