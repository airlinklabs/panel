(function() {
  const pd = document.getElementById('page-data').dataset;
  let allocatedPorts = JSON.parse(pd.allocatedPorts || '[]');
  const usedPortsSet = new Set(JSON.parse(pd.usedPorts || '[]'));

  function getUsedPorts() { return usedPortsSet; }

  function renderAllocatedPorts() {
    const portsList = document.getElementById('allocatedPortsList');
    portsList.innerHTML = '';
    if (allocatedPorts.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'col-span-4 text-sm text-neutral-500 italic';
      emptyMessage.textContent = 'No ports allocated yet. Add ports that will be available for servers.';
      portsList.appendChild(emptyMessage);
      return;
    }
    const usedPorts = getUsedPorts();
    allocatedPorts.forEach(port => {
      portsList.appendChild(buildPortTag(port, usedPorts));
    });
  }

  function buildPortTag(port, usedPorts) {
    const isUsed = usedPorts.has(port);
    const portTag = document.createElement('div');
    portTag.dataset.port = port;
    portTag.className = 'flex items-center justify-between rounded-lg ' + (isUsed ? 'bg-amber-600/10 dark:bg-amber-700/20' : 'bg-neutral-800/10 dark:bg-neutral-700/20') + ' px-3 py-1.5 text-sm';
    portTag.style.opacity = '0';
    portTag.style.transform = 'translateY(4px)';

    const portText = document.createElement('span');
    portText.className = isUsed ? 'text-amber-600 dark:text-amber-400 flex items-center' : 'text-neutral-800 dark:text-neutral-300';
    if (isUsed) {
      portText.innerHTML = port + ' <span class="ml-2 text-xs bg-amber-600/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">In use</span>';
    } else {
      portText.textContent = port;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ml-2 text-neutral-500 hover:text-red-500 transition-colors';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';

    if (isUsed) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Cannot remove port that is in use by a server';
      deleteBtn.className += ' opacity-50 cursor-not-allowed';
    } else {
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        animatePortOut(portTag, () => removePort(port));
      };
    }

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
    const usedPorts = getUsedPorts();
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

    const portsList = document.getElementById('allocatedPortsList');
    portsList.innerHTML = '';
    allocatedPorts.forEach((port, i) => {
      const tag = buildPortTag(port, usedPorts);
      portsList.appendChild(tag);
      setTimeout(() => animatePortIn(tag), i * 30);
    });
  }

  function removePort(port) {
    const usedPorts = getUsedPorts();
    if (usedPorts.has(port)) {
      showToast('Cannot remove port that is in use by a server', 'error');
      return;
    }

    allocatedPorts = allocatedPorts.filter(p => p !== port);
    const portsList = document.getElementById('allocatedPortsList');
    portsList.innerHTML = '';
    if (allocatedPorts.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'col-span-4 text-sm text-neutral-500 italic';
      emptyMessage.textContent = 'No ports allocated yet. Add ports that will be available for servers.';
      portsList.appendChild(emptyMessage);
      return;
    }
    const used = getUsedPorts();
    allocatedPorts.forEach((p) => {
      const tag = buildPortTag(p, used);
      portsList.appendChild(tag);
      tag.style.opacity = '1';
      tag.style.transform = '';
    });
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

  document.getElementById('updateNodeBtn').addEventListener('click', async () => {
    const nodeData = {
      name: document.getElementById('nodeName').value,
      ram: document.getElementById('nodeRam').value,
      cpu: document.getElementById('nodeProcessor').value,
      disk: document.getElementById('nodeDisk').value,
      address: document.getElementById('nodeAddress').value,
      port: document.getElementById('nodePort').value,
      allocatedPorts: JSON.stringify(allocatedPorts)
    };

    try {
      const response = await fetch('/admin/node/' + pd.nodeId + '/edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodeData)
      });

      if (response.ok) {
        console.log('Node updated:', await response.json());
        showToast('Node updated. Looking good.', 'success');
        setTimeout(() => {
          window.location.href = '/admin/nodes?err=none';
        }, 1000);
      } else {
        throw new Error('Failed to update node');
      }
    } catch (error) {
      showToast('Error updating node: ' + error, 'error');
    }
  });

  (function() {
    const portsList = document.getElementById('allocatedPortsList');
    portsList.innerHTML = '';
    if (allocatedPorts.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'col-span-4 text-sm text-neutral-500 italic';
      emptyMessage.textContent = 'No ports allocated yet. Add ports that will be available for servers.';
      portsList.appendChild(emptyMessage);
      return;
    }
    const usedPorts = getUsedPorts();
    allocatedPorts.forEach((port, i) => {
      const tag = buildPortTag(port, usedPorts);
      portsList.appendChild(tag);
      setTimeout(() => animatePortIn(tag), i * 25);
    });
  })();
})();
