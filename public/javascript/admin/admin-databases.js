const DEFAULT_DB_PORT = 3306;

function showConfirmModal(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Delete', onConfirm });
}

function hostRowHtml(host) {
  const dbCount = (host._count && host._count.databases) || 0;
  const nodeName = host.node ? host.node.name : 'Any node';
  const playIcon = window.alIcon ? window.alIcon('play', 'size-3', { strokeWidth: 1.5 }) : '';
  const netIcon = window.alIcon ? window.alIcon('network', 'size-3 mr-1') : '';
  const trashIcon = window.alIcon ? window.alIcon('trash-2', 'size-4') : '';
  return '<tr class="al-table-tr" data-host-id="' + host.id + '">' +
    '<td class="al-table-td sm:pl-6"><div class="font-medium" style="color:var(--theme-text-strong);">' + window.escHtml(host.name) + '</div></td>' +
    '<td class="al-table-td">' +
    '<div class="flex items-center gap-2">' +
    '<span class="relative inline-flex rounded-full h-2.5 w-2.5" style="background:var(--theme-text-placeholder); border:2px solid var(--theme-bg-card);"></span>' +
    '<span>' + window.escHtml(host.host) + ':' + window.escHtml(host.port) + '</span>' +
    '</div>' +
    '<div class="mt-1 ml-2 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset text-neutral-600 dark:text-neutral-300 ring-neutral-600/20">' + window.escHtml(host.username) + '</div>' +
    '<div class="mt-1 ml-2 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset text-neutral-600 dark:text-neutral-300 ring-neutral-600/20">' + netIcon + window.escHtml(nodeName) + '</div>' +
    '</td>' +
    '<td class="al-table-td">' + dbCount + '</td>' +
    '<td class="al-table-td">' + new Date(host.createdAt).toLocaleDateString() + '</td>' +
    '<td class="al-table-td"><div class="flex gap-3 whitespace-nowrap">' +
    '<button onclick="testHost(\'' + host.id + '\')" type="button" class="al-btn-secondary text-xs">' + playIcon + 'Test</button>' +
    '<button onclick="deleteHost(\'' + host.id + '\')" type="button" class="al-btn-ghost" style="color:var(--theme-danger);" aria-label="Delete host">' + trashIcon + '</button>' +
    '</div></td></tr>';
}

function addHostRow(host) {
  if (document.querySelector('#hostTable [data-host-id="' + host.id + '"]')) return;
  let tbody = document.querySelector('#hostTable table tbody');
  if (tbody) {
    if (window.al) al.addRow(tbody, hostRowHtml(host));
    return;
  }
  const wrap = document.getElementById('hostTable');
  if (!wrap) return;
  const empty = wrap.querySelector('.py-20');
  if (empty) empty.remove();
  wrap.insertAdjacentHTML('beforeend',
    '<table class="al-table">' +
    '<colgroup><col style="min-width:160px"><col style="min-width:240px"><col style="min-width:90px"><col style="min-width:140px"><col style="min-width:160px"></colgroup>' +
    '<thead class="al-table-head"><tr>' +
    '<th scope="col" class="al-table-th sm:pl-6">Name</th>' +
    '<th scope="col" class="al-table-th sm:pl-6">Host</th>' +
    '<th scope="col" class="al-table-th sm:pl-6">Databases</th>' +
    '<th scope="col" class="al-table-th sm:pl-6">Created</th>' +
    '<th scope="col" class="al-table-th sm:pl-6">Actions</th>' +
    '</tr></thead><tbody></tbody></table>');
  tbody = wrap.querySelector('table tbody');
  if (tbody && window.al) al.addRow(tbody, hostRowHtml(host));
}

function showHostsEmpty() {
  const wrap = document.getElementById('hostTable');
  if (!wrap || wrap.querySelector('.py-20')) return;
  const table = wrap.querySelector('table');
  if (table) table.remove();
  const div = document.createElement('div');
  div.className = 'flex flex-col items-center justify-center py-20 text-center';
  div.innerHTML =
    '<div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style="background:var(--theme-bg-secondary); border:1px solid var(--theme-border);">' +
    (window.alIcon ? window.alIcon('database', 'w-6 h-6', { style: 'color:var(--theme-text-muted)' }) : '') +
    '</div>' +
    '<h3 class="text-sm font-medium" style="color:var(--theme-text-strong);">No database hosts yet</h3>' +
    '<p class="text-sm mt-1 max-w-xs" style="color:var(--theme-text-muted);">Add a MySQL host to start provisioning databases.</p>' +
    '<div class="mt-5"><button onclick="autoGenerateHost()" type="button" class="al-btn-primary">' + (window.alIcon ? window.alIcon('zap', 'size-4', { strokeWidth: 1.5 }) : '') + 'Auto-generate host</button></div>';
  wrap.appendChild(div);
}

async function autoGenerateHost() {
  const btn = document.getElementById('autoHostBtn');
  const label = btn ? btn.querySelector('span') : null;
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Working…';
  const result = await window.api('/admin/databases/auto-host', 'POST');
  if (result && result.success) {
    showToast(result.created ? 'Host generated and connection verified.' : 'Host already exists. Connection verified.', 'success');
    if (result.created && result.host) addHostRow(result.host);
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
      const row = document.querySelector('#hostTable [data-host-id="' + hostId + '"]');
      if (row && window.al) al.removeRow(row);
      const wrap = document.getElementById('hostTable');
      if (wrap && !wrap.querySelector('[data-host-id]')) showHostsEmpty();
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
