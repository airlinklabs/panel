(function () {
  'use strict';

  const MIN_MEMORY = 128;
  const MIN_STORAGE = 128;
  const MIN_CPU = 50;
  const TOAST_SHOW_DELAY = 10;
  const TOAST_HIDE_DELAY = 3000;
  const TOAST_REMOVE_DELAY = 300;
  const REDIRECT_DELAY = 1000;
  const FOCUS_DELAY = 80;

  const STEPPER_DEFAULTS = { step: 1, min: 0, max: 999999 };
  const STORAGE_UNITS = { gb: 1024, overflowPct: 100 };

  const REQUIRED_PORT_LISTeners = ['MemoryDisplay', 'Cpu', 'SwapDisplay', 'StorageDisplay'];

  const imageSelect = document.getElementById('imageId');
  const dockerSelect = document.getElementById('dockerImage');
  const assignPortsLabel = document.getElementById('assignPortsLabel');
  const assignPortsBtn = document.getElementById('assignPortsBtn');
  const requiredPortsList = document.getElementById('requiredPortsList');
  const portsOkBtn = document.getElementById('portsOk');
  const nodeHeadroom = document.getElementById('nodeHeadroom');
  const nodeHeadroomRows = document.getElementById('nodeHeadroomRows');
  const headroomHint = document.getElementById('headroomHint');
  const nodeIdSelect = document.getElementById('nodeId');
  const createBtn = document.getElementById('createBtn');
  const errorMsg = document.getElementById('errorMsg');
  const errorText = document.getElementById('errorText');
  const serverNameInput = document.getElementById('serverName');
  const memoryInput = document.getElementById('Memory');
  const cpuInput = document.getElementById('Cpu');
  const storageInput = document.getElementById('Storage');
  const swapInput = document.getElementById('Swap');
  const toastContainer = document.getElementById('toast-container');

  function getRequiredPorts() {
    const opt = imageSelect.options[imageSelect.selectedIndex];
    try {
      return JSON.parse(opt?.dataset.portRequirements || '[]');
    } catch (err) {
      console.warn('Failed to parse port requirements:', err);
      return [];
    }
  }

  // port state for the "assign ports" flow. Each entry is { name, internalPort }.
  // External ports are auto-assigned by the server; users can only pick the
  // internal container port and a friendly name.
  let portsState = [];

  function seedPortsFromImage() {
    portsState = getRequiredPorts()
      .filter(function (p) { return p && p.internalPort; })
      .map(function (p) {
        return { name: String(p.name || ''), internalPort: Number(p.internalPort) };
      });
    updateRequiredPorts();
  }

  function updateRequiredPorts() {
    assignPortsLabel.textContent = portsState.length ? 'Ports (' + portsState.length + ')' : 'Assign ports';
  }

  function renderPortRows() {
    requiredPortsList.innerHTML = '';
    if (!portsState.length) {
      requiredPortsList.innerHTML = '<p class="text-xs text-neutral-500 dark:text-neutral-400">No ports yet. Add one below, or leave empty for a single auto-assigned port.</p>';
      return;
    }
    portsState.forEach(function (port, index) {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-[1fr_auto_auto] gap-2 items-center';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Name';
      nameInput.maxLength = 32;
      nameInput.value = port.name || '';
      nameInput.className = 'al-input';
      nameInput.addEventListener('input', function () {
        portsState[index].name = nameInput.value.trim();
      });

      const internalInput = document.createElement('input');
      internalInput.type = 'number';
      internalInput.min = '1';
      internalInput.max = '65535';
      internalInput.value = port.internalPort;
      internalInput.className = 'al-input font-mono';
      internalInput.title = 'Internal (container) port';
      internalInput.addEventListener('input', function () {
        portsState[index].internalPort = parseInt(internalInput.value, 10);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'px-2 py-2 rounded-lg text-neutral-500 hover:text-red-500 hover:bg-red-500/10 transition';
      removeBtn.title = 'Remove port';
      removeBtn.setAttribute('aria-label', 'Remove port');
      removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 4.5v9A6 6 0 0 1 6 21a6 6 0 0 1-3-5.2V6.5A6 6 0 0 0 12 3"/></svg>'.replace(/<svg/g, '<svg ');
      removeBtn.addEventListener('click', function () {
        portsState.splice(index, 1);
        renderPortRows();
      });

      row.appendChild(nameInput);
      row.appendChild(internalInput);
      row.appendChild(removeBtn);
      requiredPortsList.appendChild(row);
    });
  }

  const addPortBtn = document.getElementById('addPortBtn');
  addPortBtn.addEventListener('click', function () {
    portsState.push({ name: 'Port ' + (portsState.length + 1), internalPort: 25565 });
    renderPortRows();
  });

  imageSelect.addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    const raw = opt.dataset.docker;
    dockerSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select variant';
    ph.disabled = true;
    ph.selected = true;
    dockerSelect.appendChild(ph);
    if (raw) {
      try {
        JSON.parse(raw).forEach(function (obj) {
          Object.keys(obj).forEach(function (key) {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = key;
            dockerSelect.appendChild(o);
          });
        });
      } catch (err) {
        console.warn('Failed to parse docker variants:', err);
      }
    }
    dockerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    seedPortsFromImage();
  });

  assignPortsBtn.addEventListener('click', function () {
    renderPortRows();
    window.modal.show({
      title: 'Assign ports',
      bodyNode: document.getElementById('portsContent'),
      panelClass: 'max-w-lg',
    });
  });

  portsOkBtn.addEventListener('click', function () {
    window.modal.close();
  });

  document.querySelectorAll('.stepper-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.dataset.target);
      var step = parseInt(btn.dataset.step) || STEPPER_DEFAULTS.step;
      var min = parseInt(btn.dataset.min) || parseInt(input.min) || STEPPER_DEFAULTS.min;
      var max = parseInt(btn.dataset.max) || parseInt(input.max) || STEPPER_DEFAULTS.max;
      var val = parseInt(input.value) || 0;
      val = btn.dataset.action === 'inc' ? Math.min(max, val + step) : Math.max(min, val - step);
      input.value = val;
      input.dispatchEvent(new Event('input'));
    });
  });

  serverNameInput.addEventListener('input', function () {
    this.classList.remove('invalid');
  });

  function fmtMb(mb) {
    if (!isFinite(mb)) return '';
    return mb >= STORAGE_UNITS.gb
      ? String(Math.round((mb / STORAGE_UNITS.gb) * 10) / 10) + ' GB'
      : Math.round(mb) + ' MB';
  }

  function headroomRow(label, used, current, cap, unit, fmt) {
    var total = used + current;
    var pct = cap > 0 ? (total / cap) * 100 : 0;
    var over = total > cap;
    var row = document.createElement('div');
    var color = over ? 'var(--theme-danger)' : pct >= 80 ? 'var(--theme-warning, #d97706)' : 'var(--theme-accent)';
    row.className = 'space-y-1';
    row.innerHTML =
      '<div class="flex items-center justify-between text-[11px]">' +
        '<span class="text-neutral-500 dark:text-neutral-400 font-medium">' + label + '</span>' +
        '<span class="font-mono ' + (over ? 'text-red-500 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400') + '">' +
          fmt(used) + ' in use' + (current > 0 ? ' + ' + fmt(current) + ' here' : '') + ' / ' + fmt(cap) + '</span>' +
      '</div>' +
      '<div class="h-1.5 rounded-full overflow-hidden" style="background:var(--theme-border-subtle, rgba(128,128,128,0.25))">' +
        '<div class="h-full rounded-full transition-all duration-200" style="width:' + Math.min(100, pct) + '%;background:' + color + '"></div>' +
      '</div>';
    return row;
  }

  function fmtPercent(v) {
    return Math.round(v) + '%';
  }

  function refreshHeadroom() {
    var data = (window.__nodeHeadroom || {})[nodeIdSelect.value];
    if (!data) {
      nodeHeadroom.classList.add('hidden');
      return;
    }

    var mem = parseInt(memoryInput.value) || 0;
    var cpu = parseInt(cpuInput.value) || 0;
    var st = parseInt(storageInput.value) || 0;

    var rows = [];
    if (data.ram > 0) rows.push(headroomRow('RAM', data.usedMemory, mem, data.ram * STORAGE_UNITS.gb * (1 + data.overMemory / STORAGE_UNITS.overflowPct), 'MB', fmtMb));
    if (data.cpu > 0) rows.push(headroomRow('CPU', data.usedCpu, cpu, data.cpu * (1 + data.overCpu / STORAGE_UNITS.overflowPct), '%', fmtPercent));
    if (data.disk > 0) rows.push(headroomRow('Disk', data.usedStorage, st, data.disk * STORAGE_UNITS.gb * (1 + data.overDisk / STORAGE_UNITS.overflowPct), 'MB', fmtMb));

    if (!rows.length) {
      nodeHeadroom.classList.add('hidden');
      return;
    }
    nodeHeadroomRows.innerHTML = '';
    rows.forEach(function (r) { nodeHeadroomRows.appendChild(r); });
    var over = data.overMemory > 0 || data.overCpu > 0 || data.overDisk > 0;
    headroomHint.textContent = over ? 'Node capacity includes overallocation.' : '';
    nodeHeadroom.classList.remove('hidden');
  }

  nodeIdSelect.addEventListener('change', refreshHeadroom);
  REQUIRED_PORT_LISTeners.forEach(function (id) {
    document.getElementById(id).addEventListener('input', refreshHeadroom);
  });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.al-format-switcher')) refreshHeadroom();
  });
  seedPortsFromImage();
  refreshHeadroom();

  function showConfirm(title, body) {
    return new Promise(function (resolve) {
      window.modal.confirm({
        title: title,
        body: body,
        confirmLabel: 'Create',
        onConfirm: resolve,
      });
    });
  }

  createBtn.addEventListener('click', async function () {
    var btn = this;
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creating...';

    var name = serverNameInput.value.trim();
    var description = document.getElementById('serverDescription').value.trim();
    var nodeId = nodeIdSelect.value;
    var imageId = imageSelect.value;
    var dockerImage = dockerSelect.value;
    var mem = parseInt(memoryInput.value);
    var cpu = parseInt(cpuInput.value);
    var storage = parseInt(storageInput.value);
    var swap = parseInt(swapInput.value);

    document.querySelectorAll('.form-input').forEach(function (el) { el.classList.remove('invalid'); });

    var validationErrors = [];

    if (!name) {
      validationErrors.push('Server name is required.');
      serverNameInput.classList.add('invalid');
    } else if (name.length < 3) {
      validationErrors.push('Server name must be at least 3 characters.');
      serverNameInput.classList.add('invalid');
    }

    if (!nodeId) validationErrors.push('Select a node.');
    if (!imageId) validationErrors.push('Select an image.');
    if (!dockerImage) validationErrors.push('Select a docker variant.');
    if (mem < MIN_MEMORY) validationErrors.push('Memory must be at least ' + MIN_MEMORY + ' MB.');
    if (storage < MIN_STORAGE) validationErrors.push('Storage must be at least ' + MIN_STORAGE + ' MB.');
    if (cpu < MIN_CPU) validationErrors.push('CPU must be at least ' + MIN_CPU + '%.');

    if (portsState.some(function (entry) {
      return !entry.name || !Number.isInteger(entry.internalPort) || entry.internalPort < 1 || entry.internalPort > 65535;
    })) {
      validationErrors.push('Every port needs a name and a valid internal port (1-65535).');
    }

    if (validationErrors.length > 0) {
      btn.disabled = false;
      btn.textContent = origText;
      errorText.textContent = validationErrors.join('\n');
      errorMsg.classList.remove('hidden');
      return;
    }

    var ok = await showConfirm(
      'Create server?',
      '"' + name + '" will be created and queued for installation. This may take a moment.'
    );
    if (!ok) {
      btn.disabled = false;
      btn.textContent = origText;
      return;
    }

    try {
      var r = await fetch('/create-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, description: description, nodeId: nodeId, imageId: imageId, dockerImage: dockerImage, Memory: mem, Cpu: cpu, Storage: storage, Swap: swap, ports: portsState }),
      });
      var d = await r.json();
      if (d.success) {
        if (toastContainer) {
          var toast = document.createElement('div');
          toast.className = 'al-toast al-toast-success';
          toast.innerHTML = '<span class="al-toast-icon">' + alIcon('circle-check', 'w-4 h-4', { strokeWidth: 2 }) + '</span><span class="al-toast-text">Server created successfully!</span>';
          toastContainer.appendChild(toast);
          setTimeout(function () { toast.classList.add('show'); }, TOAST_SHOW_DELAY);
          setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, TOAST_REMOVE_DELAY);
          }, TOAST_HIDE_DELAY);
        }
        setTimeout(function () {
          window.location.href = '/server/' + d.serverUUID;
        }, REDIRECT_DELAY);
      } else {
        btn.disabled = false;
        btn.textContent = origText;
        errorText.textContent = d.error || 'Something went wrong.';
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Failed to create server:', err);
      btn.disabled = false;
      btn.textContent = origText;
      errorText.textContent = 'Network error. Try again.';
      errorMsg.classList.remove('hidden');
    }
  });

})();
