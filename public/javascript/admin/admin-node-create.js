(function() {
  var _rootStyle = getComputedStyle(document.documentElement);
  var _portEase = _rootStyle.getPropertyValue('--ease-standard').trim() || 'ease';
  const PORT_MIN = 1024;
  const PORT_MAX = 65535;
  const ANIMATION_DURATION_MS = 200;
  const PORT_STAGGER_MS = 30;
  const PORT_OUT_DURATION_MS = 160;
  const COPY_RESET_DELAY_MS = 1500;
  const VERIFY_DELAY_MS = 1800;

  let allocatedPorts = [];

  function renderAllocatedPorts() {
    const portsList = document.getElementById('allocatedPortsList');
    portsList.innerHTML = '';
    if (allocatedPorts.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'col-span-4 text-sm italic';
      emptyMessage.style.color = 'var(--theme-text-muted)';
      emptyMessage.textContent = 'No ports allocated yet. Add ports that will be available for servers.';
      portsList.appendChild(emptyMessage);
      return;
    }
    allocatedPorts.forEach(port => {
      portsList.appendChild(buildPortTag(port));
    });
  }

  function buildPortTag(port) {
    const portTag = document.createElement('div');
    portTag.dataset.port = port;
    portTag.className = 'flex items-center justify-between rounded-lg bg-neutral-800/10 dark:bg-neutral-700/20 px-3 py-1.5 text-sm';
    portTag.style.opacity = '0';
    portTag.style.transform = 'translateY(4px)';

    const portText = document.createElement('span');
    portText.className = 'text-neutral-800 dark:text-neutral-300';
    portText.textContent = port;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ml-2 text-neutral-500 hover:text-red-500 transition-colors';
    deleteBtn.innerHTML = alIcon('x', 'w-4 h-4', { strokeWidth: 1.5 });
    deleteBtn.onclick = (e) => {
      e.preventDefault();
      animatePortOut(portTag, () => removePort(port));
    };

    portTag.appendChild(portText);
    portTag.appendChild(deleteBtn);
    return portTag;
  }

  function animatePortIn(el) {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = 'opacity 0.18s ' + _portEase + ', transform 0.18s ' + _portEase;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        setTimeout(function() { el.style.transition = ''; }, ANIMATION_DURATION_MS);
      });
    });
  }

  function animatePortOut(el, cb) {
    el.style.transition = 'opacity 0.15s ' + _portEase + ', transform 0.15s ' + _portEase;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(cb, PORT_OUT_DURATION_MS);
  }

  function addPort(input) {
    if (input.includes('-')) {
      const [start, end] = input.split('-').map(p => parseInt(p.trim()));
      if (isNaN(start) || isNaN(end) || start >= end || start < PORT_MIN || end > PORT_MAX) {
        showToast('Invalid port range. Format should be start-end (e.g., 25565-25570) with ports between ' + PORT_MIN + ' and ' + PORT_MAX + '.', 'error');
        return;
      }
      for (let port = start; port <= end; port++) {
        if (!allocatedPorts.includes(port)) allocatedPorts.push(port);
      }
    } else {
      const port = parseInt(input.trim());
      if (isNaN(port) || port < PORT_MIN || port > PORT_MAX) {
        showToast('Invalid port. Port must be between ' + PORT_MIN + ' and ' + PORT_MAX + '.', 'error');
        return;
      }
      if (!allocatedPorts.includes(port)) allocatedPorts.push(port);
    }

    allocatedPorts.sort((a, b) => a - b);
    renderAllocatedPorts();

    const tags = document.querySelectorAll('#allocatedPortsList > div[data-port]');
    tags.forEach((tag, i) => setTimeout(() => animatePortIn(tag), i * PORT_STAGGER_MS));
  }

  function removePort(port) {
    allocatedPorts = allocatedPorts.filter(p => p !== port);
    renderAllocatedPorts();
    document.querySelectorAll('#allocatedPortsList > div[data-port]').forEach(tag => { tag.style.opacity = '1'; tag.style.transform = ''; });
  }

  document.getElementById('addPortBtn').addEventListener('click', () => {
    const input = document.getElementById('newPortInput').value.trim();
    if (input) {
      addPort(input);
      document.getElementById('newPortInput').value = '';
    }
  });

  document.getElementById('newPortInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target.value.trim();
      if (input) {
        addPort(input);
        e.target.value = '';
      }
    }
  });

  function gbValue(hiddenId) {
    const hidden = document.getElementById(hiddenId);
    if (hidden) {
      const v = parseFloat(hidden.value);
      if (!hidden.value || isNaN(v)) return '';
      return isFinite(v) ? String(Math.round(v / 1024 * 100) / 100) : '';
    }
    return '';
  }

  document.getElementById('createNodeBtn').addEventListener('click', async () => {
    const ramAll = document.getElementById('nodeRamAll').checked;
    const diskAll = document.getElementById('nodeDiskAll').checked;
    const cpuAll = document.getElementById('nodeProcessorAll').checked;

    const nodeData = {
      name: document.getElementById('nodeName').value,
      ram: ramAll ? 'all' : gbValue('nodeRamValue'),
      cpu: cpuAll ? 'all' : document.getElementById('nodeCpuValue').value,
      disk: diskAll ? 'all' : gbValue('nodeDiskValue'),
      address: document.getElementById('nodeAddress').value,
      port: document.getElementById('nodePort').value,
      key: document.getElementById('daemonKey').value.trim(),
      allocatedPorts: JSON.stringify(allocatedPorts),
      overallocateMemory: document.getElementById('nodeOverallocateMemory').value,
      overallocateDisk: document.getElementById('nodeOverallocateDisk').value,
      overallocateCpu: document.getElementById('nodeOverallocateCpu').value,
      locationId: document.getElementById('nodeLocation').value
    };

    if (!nodeData.name || !nodeData.address || !nodeData.port) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    if (!ramAll && !nodeData.ram) { showToast('RAM is required when not unlimited.', 'error'); return; }
    if (!diskAll && !nodeData.disk) { showToast('Disk is required when not unlimited.', 'error'); return; }
    if (!cpuAll && !nodeData.cpu) { showToast('CPU is required when not unlimited.', 'error'); return; }

    const loader = showLoadingPopup('Creating Node', 'Initializing node creation...');
    loader.updateProgress(20, 'Sending node configuration...');

    try {
      const response = await fetch('/admin/nodes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodeData)
      });

      if (response.ok) {
        const data = await response.json();
        loader.updateProgress(100, 'Node created!');
        setTimeout(() => {
          loader.close();
          sessionStorage.setItem('airlink:newNode', JSON.stringify(data.node));
          window.location.hash = '#created';
        }, 500);
      } else {
        loader.close();
        const data = await response.json().catch(() => ({}));
        showToast(data.error || data.message || 'Failed to create node.', 'error');
      }
    } catch (error) {
      loader.close();
      console.error('Error creating node:', error);
      showToast('Error creating node. Try again.', 'error');
    }
  });

  function showSetupPanel(node) {
    const form = document.getElementById('nodeForm');
    const panel = document.getElementById('nodeSetupPanel');
    form.classList.add('hidden');
    panel.classList.remove('hidden');

    const panelUrl = window.location.origin;
    const cli = 'configure --panel "' + panelUrl + '" --key "' + node.key + '"';
    document.getElementById('daemonCliCommand').textContent = cli;

    const copyCli = document.getElementById('copyDaemonCli');
    const copyHint = document.getElementById('copyDaemonCliHint');
    copyHint.textContent = 'Paste into a terminal on the machine where the daemon runs.';

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return Promise.resolve();
    }

    document.getElementById('copyDaemonCli').addEventListener('click', async () => {
      const label = copyCli.innerHTML;
      try {
        await copyText(cli);
        copyCli.innerHTML = '<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        copyHint.textContent = 'Copied!';
      } catch {
        copyHint.textContent = 'Could not copy. Select the command above and copy it manually.';
      }
      setTimeout(() => { copyCli.innerHTML = label; copyHint.textContent = 'Paste into a terminal on the machine where the daemon runs.'; }, COPY_RESET_DELAY_MS);
    });

    document.getElementById('verifyDaemonBtn').addEventListener('click', async () => {
      const btn = document.getElementById('verifyDaemonBtn');
      const result = document.getElementById('daemonVerifyResult');
      btn.disabled = true;
      btn.textContent = 'Checking...';
      result.classList.add('hidden');

      try {
        const res = await fetch('/admin/node/' + node.id + '/verify', { method: 'POST' });
        const d = await res.json().catch(() => ({}));
        result.classList.remove('hidden');
        if (d.connected) {
          result.style.color = 'var(--theme-success)';
          result.textContent = 'Daemon is live' + (d.version ? ' (' + d.version + ')' : '') + '. Key checks out — servers can now run on this node.';
          showToast('Daemon verified!', 'success');
          setTimeout(() => { window.location.href = '/admin/nodes?verified=' + node.id; }, VERIFY_DELAY_MS);
        } else {
          result.style.color = 'var(--theme-danger)';
          result.textContent = d.error || 'Could not reach the daemon. Check the address, port, and key.';
        }
      } catch {
        result.classList.remove('hidden');
        result.style.color = 'var(--theme-danger)';
        result.textContent = 'Verification failed. Check the address, port, and key, then try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'I\'ve done this — verify connection';
      }
    });
  }

  ['nodeRam', 'nodeDisk', 'nodeProcessor'].forEach(function(id) {
    const checkbox = document.getElementById(id + 'All');
    const input = document.getElementById(id);
    if (checkbox && input) {
      checkbox.addEventListener('change', function() {
        input.disabled = this.checked;
        if (this.checked) {
          input.value = '';
          input.dispatchEvent(new Event('input'));
        }
      });
    }
  });

  renderAllocatedPorts();

  // Hash route: #created — show the setup panel for the newly created node
  if (window.location.hash === '#created') {
    const stored = sessionStorage.getItem('airlink:newNode');
    if (stored) {
      sessionStorage.removeItem('airlink:newNode');
      try {
        showSetupPanel(JSON.parse(stored));
      } catch {}
    }
  }
})();