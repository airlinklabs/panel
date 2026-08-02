(function() {
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
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';
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
        el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        setTimeout(function() { el.style.transition = ''; }, 200);
      });
    });
  }

  function animatePortOut(el, cb) {
    el.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(cb, 160);
  }

  function addPort(input) {
    if (input.includes('-')) {
      const [start, end] = input.split('-').map(p => parseInt(p.trim()));
      if (isNaN(start) || isNaN(end) || start >= end || start < 1024 || end > 65535) {
        showToast('Invalid port range. Format should be start-end (e.g., 25565-25570) with ports between 1024 and 65535.', 'error');
        return;
      }
      for (let port = start; port <= end; port++) {
        if (!allocatedPorts.includes(port)) allocatedPorts.push(port);
      }
    } else {
      const port = parseInt(input.trim());
      if (isNaN(port) || port < 1024 || port > 65535) {
        showToast('Invalid port. Port must be between 1024 and 65535.', 'error');
        return;
      }
      if (!allocatedPorts.includes(port)) allocatedPorts.push(port);
    }

    allocatedPorts.sort((a, b) => a - b);
    renderAllocatedPorts();

    const tags = document.querySelectorAll('#allocatedPortsList > div[data-port]');
    tags.forEach((tag, i) => setTimeout(() => animatePortIn(tag), i * 30));
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
    if (!hidden) return '';
    const v = parseFloat(hidden.value);
    return isFinite(v) ? String(Math.round(v / 1024 * 100) / 100) : '';
  }

  document.getElementById('createNodeBtn').addEventListener('click', async () => {
    const ramAll = document.getElementById('nodeRamAll').checked;
    const diskAll = document.getElementById('nodeDiskAll').checked;
    const cpuAll = document.getElementById('nodeProcessorAll').checked;

    const nodeData = {
      name: document.getElementById('nodeName').value,
      ram: ramAll ? 'all' : gbValue('nodeRamValue'),
      cpu: cpuAll ? 'all' : document.getElementById('nodeProcessor').value,
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
          showToast('Node\'s up and running.', 'success');
          setTimeout(() => {
            window.location.href = '/admin/nodes?err=none';
          }, 1000);
        }, 500);
      } else {
        loader.close();
        const data = await response.json().catch(() => ({}));
        showToast(data.error || 'Failed to create node.', 'error');
      }
    } catch (error) {
      loader.close();
      console.error('Error creating node:', error);
      showToast('Error creating node. Try again.', 'error');
    }
  });

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
})();