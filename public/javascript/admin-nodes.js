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
  }
}

function showPopup(command) {
  const overlay = createOverlay();
  const popup = createPopup(command);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    popup.classList.remove('scale-95', 'opacity-0');
  }, 10);

  const copyBtn = document.getElementById('copyBtn');
  copyBtn.addEventListener('click', () => copyCommand(copyBtn, command));
  document.getElementById('doneBtn').addEventListener('click', closePopup);
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center transition-opacity duration-300 opacity-0';
  overlay.id = 'modal-overlay';
  return overlay;
}

function createPopup(command) {
  const popup = document.createElement('div');
  popup.className = 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white border border-neutral-200 dark:border-white/5 rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4 transform transition-all duration-300 scale-95 opacity-0';
  popup.innerHTML = `
    <div class="flex justify-center items-center mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 48 48" class="text-emerald-500">
        <path fill="currentColor" d="M16.599,41.42L1.58,26.401c-0.774-0.774-0.774-2.028,0-2.802l4.019-4.019 c0.774-0.774,2.028-0.774,2.802,0L23.42,34.599c0.774,0.774,0.774,2.028,0,2.802l-4.019,4.019 C18.627,42.193,17.373,42.193,16.599,41.42z"/>
        <path fill="currentColor" d="M12.58,34.599L39.599,7.58c0.774-0.774,2.028-0.774,2.802,0l4.019,4.019 c0.774,0.774,0.774,2.028,0,2.802L19.401,41.42c-0.774,0.774-2.028,0.774-2.802,0l-4.019-4.019 C11.807,36.627,11.807,35.373,12.58,34.599z"/>
      </svg>
    </div>
    <h2 class="text-2xl font-bold mb-2 text-center">Token Created</h2>
    <p class="mb-4 text-neutral-600 dark:text-neutral-300 text-center">To auto-configure your node, run the following command:</p>
    <pre class="bg-neutral-100 dark:bg-neutral-900 p-3 rounded-xl mb-4 overflow-x-auto"><code id="commandCode" class="text-emerald-500">${command}</code></pre>
    <div class="flex justify-end">
      <button id="copyBtn" class="bg-emerald-600 text-white px-4 py-2 rounded-xl mr-2 hover:bg-emerald-700 transition-colors">Copy</button>
      <button id="doneBtn" class="bg-neutral-800 dark:bg-neutral-700 text-white px-4 py-2 rounded-xl hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors">Close</button>
    </div>
  `;
  return popup;
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
    .catch(error => console.error('Failed to copy:', error));
}

function closePopup() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('opacity-0');
  setTimeout(() => document.body.removeChild(overlay), 300);
}
