/* inline script 1 */

const listA = [
    "Charged", "Fiery", "Mystical", "Dark", "Angry", "Enchanted",
    "Blazing", "Cursed", "Frozen", "Swift", "Ancient", "Wicked",
    "Luminous", "Vengeful", "Radiant", "Thunderous", "Shadow",
    "Frost", "Vibrant", "Spectral", "Nether", "Ender", "Caving",
    "Toxic", "Haunted", "Radiant", "Ghostly"
];
const listB = [
    "Creeper", "Dragon", "Zombie", "Ghoul", "Enderman", "Skeleton",
    "Wither", "Magma Cube", "Blaze", "Witch", "Slime", "Spider",
    "Phantom", "Villager", "Pillager", "Vindicator", "Drowned",
    "Illager", "Ender Dragon", "Husk", "Stray", "Ravager", "Piglin",
    "Hoglin", "Shulker", "Warden"
];
function generateRandomName() {
    let randomA, randomB;
    do { randomA = listA[Math.floor(Math.random() * listA.length)]; randomB = listB[Math.floor(Math.random() * listB.length)]; } while (randomA === randomB);
    document.getElementById("serverName").value = randomA + " " + randomB;
}

/* inline script 2 */

  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('editServerForm');
    const allowStartupEditToggle = document.getElementById('allowStartupEdit');
    const allowStartupEditLabel  = document.getElementById('allowStartupEditLabel');
    const suspendServerToggle    = document.getElementById('suspendServer');
    const suspendServerLabel     = document.getElementById('suspendServerLabel');
    const serverNodeSelect = document.getElementById('serverNode');
    const serverImageSelect = document.getElementById('serverImage');
    const serverPortsInput = document.getElementById('serverPorts');
    let nodesData = {};
    let availablePorts = [];
    let assignedPorts = null.map((port, index) => {
      const parts = String(port.Port || '').split(':');
      return {
        name: port.name || `Port ${index + 1}`,
        internalPort: Number(port.internalPort || parts[1] || parts[0]),
        externalPort: Number(port.externalPort || parts[0]),
        primary: Boolean(port.primary || index === 0),
      };
    });

    async function fetchNodesData() {
      const response = await fetch('/admin/nodes/list');
      const nodes = await response.json();
      nodes.forEach(node => {
        let ports = [];
        try { ports = JSON.parse(node.allocatedPorts || '[]'); } catch {}
        nodesData[node.id] = { ...node, parsedPorts: ports };
      });
      updatePortsForSelectedNode();
    }

    function updatePortsForSelectedNode() {
      const node = nodesData[serverNodeSelect.value];
      if (!node) return;
      const usedPorts = new Set();
      (node.servers || []).forEach(server => {
        if (server.id === null) return;
        try {
          JSON.parse(server.Ports || '[]').forEach(portInfo => {
            const external = Number(portInfo.externalPort || String(portInfo.Port || '').split(':')[0]);
            if (!isNaN(external)) usedPorts.add(external);
          });
        } catch {}
      });
      availablePorts = (node.parsedPorts || [])
        .filter(port => !usedPorts.has(port) || assignedPorts.some(item => Number(item.externalPort) === port))
        .map(port => ({ port, label: `${node.address}:${port}` }));
      ensureMinimumPortRows();
      syncPortsButton();
    }

    function getPortRequirements() {
      const selectedOption = serverImageSelect.options[serverImageSelect.selectedIndex];
      try { return JSON.parse(selectedOption.getAttribute('data-port-requirements') || '[]'); } catch { return []; }
    }

    function ensureMinimumPortRows() {
      const requirements = getPortRequirements();
      while (assignedPorts.length < requirements.length) {
        const req = requirements[assignedPorts.length] || {};
        assignedPorts.push({
          name: req.name || `Port ${assignedPorts.length + 1}`,
          internalPort: Number(req.internalPort || 25565),
          externalPort: availablePorts.find(item => !assignedPorts.some(port => Number(port.externalPort) === item.port))?.port || '',
          primary: assignedPorts.length === 0
        });
      }
      serverPortsInput.value = JSON.stringify(assignedPorts);
    }

    function syncPortsButton() {
      serverPortsInput.value = JSON.stringify(assignedPorts);
      document.getElementById('assignPortsBtn').textContent = assignedPorts.length ? `Assign ports (${assignedPorts.length})` : 'Assign ports';
    }

    function renderPortRows() {
      if (!window.PortsAllocator) return;
      PortsAllocator.open({
        requirements: getPortRequirements(),
        assignedPorts: assignedPorts,
        availablePorts: availablePorts,
        onSave: function (rows) {
          assignedPorts = rows;
          syncPortsButton();
        }
      });
    }
    document.getElementById('assignPortsBtn').addEventListener('click', renderPortRows);
    serverNodeSelect.addEventListener('change', updatePortsForSelectedNode);
    serverImageSelect.addEventListener('change', () => { ensureMinimumPortRows(); syncPortsButton(); });
    fetchNodesData();

    allowStartupEditToggle.addEventListener('change', function() {
      allowStartupEditLabel.textContent = this.checked ? 'Enabled' : 'Disabled';
    });

    suspendServerToggle.addEventListener('change', async function() {
      const checked = this.checked;
      const action = checked ? 'suspend' : 'unsuspend';

      try {
        const response = await fetch('/admin/servers/null/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error((await response.json()).error || 'Request failed');
        }

        suspendServerLabel.textContent = checked ? 'Suspended' : 'Active';
        window.location.reload();
      } catch (err) {
        this.checked = !checked;
        suspendServerLabel.textContent = checked ? 'Active' : 'Suspended';
        showToast('Failed to ' + action + ' server: ' + (err.message || 'unknown error'), 'error');
      }
    });

    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      data.ports = assignedPorts;
      data.mountIds = formData.getAll('mountIds').map(v => Number(v.valueOf()));

      // Handle checkbox values
      if (!formData.has('allowStartupEdit')) {
        data.allowStartupEdit = 'false';
      }

      if (!formData.has('Suspended')) {
        data.Suspended = 'false';
      }

      const loader = showLoadingPopup('Updating Server', 'Processing server update...');
      loader.updateProgress(20, 'Sending server configuration...');

      try {
        const response = await fetch('/admin/servers/edit/null', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
          loader.updateProgress(100, 'Server updated successfully!');
          setTimeout(() => {
            loader.close();
            showToast('Server updated successfully!', 'success');
            setTimeout(() => {
              window.location.href = '/admin/servers';
            }, 1000);
          }, 500);
        } else {
          loader.close();
          showToast('Failed to update server: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        loader.close();
        showToast('Failed to update server: ' + error.message, 'error');
      }
    });
  });

/* inline script 3 */

  // ── Transfer Logic ─────────────────────────────────────────────────────
  (function() {
    const transferBtn = document.getElementById('transferServerBtn');
    const transferModal = document.getElementById('transferModal');
    const transferModalBackdrop = document.getElementById('transferModalBackdrop');
    const transferModalPanel = document.getElementById('transferModalPanel');
    const transferTargetNode = document.getElementById('transferTargetNode');
    const transferPortsContainer = document.getElementById('transferPortsContainer');
    const addTransferPortBtn = document.getElementById('addTransferPortBtn');
    const confirmTransferBtn = document.getElementById('confirmTransferBtn');
    const transferStatusDiv = document.getElementById('transferStatus');
    const transferStatusText = document.getElementById('transferStatusText');
    const transferProgressBar = document.getElementById('transferProgressBar');
    const transferStatusDetail = document.getElementById('transferStatusDetail');

    let transferPorts = [];
    let nodesData = {};
    let pollInterval = null;

    const statusSteps = {
      'pending': { pct: 5, text: 'Queued...' },
      'stopping': { pct: 15, text: 'Stopping server on source node...' },
      'archiving': { pct: 30, text: 'Archiving server files...' },
      'transferring': { pct: 50, text: 'Streaming data to destination...' },
      'restoring': { pct: 70, text: 'Restoring files on destination...' },
      'installing': { pct: 85, text: 'Installing server on destination...' },
      'updating-db': { pct: 92, text: 'Updating database records...' },
      'starting': { pct: 97, text: 'Starting server on destination...' },
      'completed': { pct: 100, text: 'Transfer complete!' },
      'failed': { pct: 0, text: 'Transfer failed' },
    };

    async function fetchNodesData() {
      try {
        const response = await fetch('/admin/nodes/list');
        const nodes = await response.json();
        nodes.forEach(node => {
          let ports = [];
          try { ports = JSON.parse(node.allocatedPorts || '[]'); } catch {}
          // Also include ports from allocation table
          if (node.allocations && Array.isArray(node.allocations)) {
            node.allocations.forEach(a => {
              if (!ports.includes(a.port)) ports.push(a.port);
            });
          }
          nodesData[node.id] = { ...node, parsedPorts: ports.sort((a,b) => a-b) };
        });
      } catch (err) {
        console.error('Failed to fetch nodes:', err);
      }
    }

    function getUsedPortsForNode(nodeId) {
      const node = nodesData[nodeId];
      if (!node) return new Set();
      const used = new Set();
      (node.servers || []).forEach(server => {
        // Skip the current server being transferred
        if (server.id === null) return;
        try {
          JSON.parse(server.Ports || '[]').forEach(portInfo => {
            const external = Number(portInfo.externalPort || String(portInfo.Port || '').split(':')[0]);
            if (!isNaN(external)) used.add(external);
          });
        } catch {}
      });
      return used;
    }

    function renderTransferPorts() {
      const nodeId = transferTargetNode.value;
      if (!nodeId) return;
      const node = nodesData[nodeId];
      if (!node) return;

      const usedPorts = getUsedPortsForNode(parseInt(nodeId));
      const availablePorts = (node.parsedPorts || [])
        .filter(port => !usedPorts.has(port) || transferPorts.some(p => p.externalPort === port));

      if (transferPorts.length === 0) {
        // Initialize with current server ports
        try {
          transferPorts = JSON.parse('null').map((p, i) => ({
            name: p.name || 'Port ' + (i + 1),
            internalPort: Number(p.internalPort || String(p.Port || '').split(':')[1] || String(p.Port || '').split(':')[0]),
            externalPort: Number(p.externalPort || String(p.Port || '').split(':')[0]),
            primary: Boolean(p.primary || i === 0),
          }));
        } catch {
          transferPorts = [{ name: 'Port 1', internalPort: 25565, externalPort: 25565, primary: true }];
        }
      }

      let html = '';
      transferPorts.forEach((port, idx) => {
        const portOptions = availablePorts.map(p =>
          `<option value="${p}" ${p === port.externalPort ? 'selected' : ''}>${node.address}:${p}</option>`
        ).join('');

        html += `
          <div class="flex items-center gap-2 transfer-port-row" data-idx="${idx}">
            <select class="al-input flex-1 transfer-port-select" data-idx="${idx}">
              ${portOptions}
            </select>
            <input type="number" class="al-input w-20 transfer-port-internal" data-idx="${idx}" value="${port.internalPort}" placeholder="Internal">
            <label class="flex items-center gap-1 text-xs shrink-0">
              <input type="checkbox" class="transfer-port-primary" data-idx="${idx}" ${port.primary ? 'checked' : ''}> Primary
            </label>
            <button type="button" onclick="removeTransferPort(${idx})" class="al-btn-ghost p-1 shrink-0" style="color:var(--theme-danger);" aria-label="Remove port">
              null
            </button>
          </div>
        `;
      });

      transferPortsContainer.innerHTML = html || '<p class="text-xs text-neutral-500">No ports configured.</p>';
      addTransferPortBtn.classList.toggle('hidden', transferPorts.length === 0);
      updateConfirmButton();
    }

    window.removeTransferPort = function(idx) {
      transferPorts.splice(idx, 1);
      renderTransferPorts();
    };

    function collectPortsFromUI() {
      const selects = document.querySelectorAll('.transfer-port-select');
      const internals = document.querySelectorAll('.transfer-port-internal');
      const primaries = document.querySelectorAll('.transfer-port-primary');
      transferPorts = [];
      selects.forEach((sel, i) => {
        transferPorts.push({
          name: 'Port ' + (i + 1),
          externalPort: parseInt(sel.value) || 0,
          internalPort: parseInt(internals[i]?.value) || parseInt(sel.value) || 25565,
          primary: primaries[i]?.checked || false,
        });
      });
    }

    function updateConfirmButton() {
      const nodeId = transferTargetNode.value;
      const hasPorts = transferPorts.length > 0 && transferPorts.every(p => p.externalPort > 0);
      confirmTransferBtn.disabled = !nodeId || !hasPorts;
    }

    // Event listeners
    transferBtn.addEventListener('click', function() {
      transferModal.classList.remove('hidden');
      transferModal.classList.add('flex');
      if (typeof Animate !== 'undefined') Animate.openModal(transferModal, transferModalPanel);
    });

    window.closeTransferModal = function() {
      if (typeof Animate !== 'undefined') {
        Animate.closeModal(transferModal, transferModalPanel, () => {
          transferModal.classList.add('hidden');
          transferModal.classList.remove('flex');
        });
      } else {
        transferModal.classList.add('hidden');
        transferModal.classList.remove('flex');
      }
    };

    transferTargetNode.addEventListener('change', function() {
      transferPorts = []; // Reset ports when node changes
      renderTransferPorts();
      updateConfirmButton();
    });

    addTransferPortBtn.addEventListener('click', function() {
      collectPortsFromUI();
      const nodeId = transferTargetNode.value;
      const node = nodesData[nodeId];
      if (!node) return;
      const usedPorts = getUsedPortsForNode(parseInt(nodeId));
      const usedByTransfer = new Set(transferPorts.map(p => p.externalPort));
      const nextPort = (node.parsedPorts || []).find(p => !usedPorts.has(p) && !usedByTransfer.has(p));
      transferPorts.push({
        name: 'Port ' + (transferPorts.length + 1),
        externalPort: nextPort || 25565,
        internalPort: nextPort || 25565,
        primary: false,
      });
      renderTransferPorts();
    });

    confirmTransferBtn.addEventListener('click', async function() {
      collectPortsFromUI();
      const nodeId = transferTargetNode.value;
      if (!nodeId || transferPorts.length === 0) return;

      confirmTransferBtn.disabled = true;
      confirmTransferBtn.textContent = 'Starting transfer...';

      try {
        const response = await fetch('/admin/servers/null/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetNodeId: parseInt(nodeId), ports: transferPorts }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to start transfer');
        }

        closeTransferModal();
        startTransferPolling();
        showToast('Transfer started!', 'success');
      } catch (err) {
        showToast('Failed to start transfer: ' + (err.message || 'unknown error'), 'error');
        confirmTransferBtn.disabled = false;
        confirmTransferBtn.innerHTML = 'nullTransfer Server';
      }
    });

    function startTransferPolling() {
      transferStatusDiv.classList.remove('hidden');
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(pollTransferStatus, 3000);
      pollTransferStatus();
    }

    async function pollTransferStatus() {
      try {
        const response = await fetch('/admin/servers/null/transfer/status');
        const state = await response.json();

        if (state.status === 'idle') {
          transferStatusDiv.classList.add('hidden');
          clearInterval(pollInterval);
          return;
        }

        const step = statusSteps[state.status] || { pct: 0, text: state.status };
        transferProgressBar.style.width = step.pct + '%';
        transferStatusText.textContent = step.text;
        transferStatusDetail.textContent = state.error || '';

        if (state.status === 'completed') {
          transferProgressBar.classList.remove('bg-purple-500');
          transferProgressBar.classList.add('bg-green-500');
          clearInterval(pollInterval);
          setTimeout(() => { window.location.reload(); }, 2000);
        } else if (state.status === 'failed') {
          transferProgressBar.classList.remove('bg-purple-500');
          transferProgressBar.classList.add('bg-red-500');
          clearInterval(pollInterval);
        }
      } catch {
        // Ignore poll errors
      }
    }

    // Check on page load if a transfer is in progress
    fetch('/admin/servers/null/transfer/status')
      .then(r => r.json())
      .then(state => {
        if (state.status && state.status !== 'idle' && state.status !== 'completed' && state.status !== 'failed') {
          startTransferPolling();
        }
      })
      .catch(() => {});

    fetchNodesData();
  })();
