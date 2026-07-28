(function () {
  function buildCustomSelect(container) {
    const select = document.getElementById(container.dataset.for);
    if (!select) return;

    const trigger  = document.createElement('div');
    trigger.className = 'cs-trigger';
    const label = document.createElement('span');
    label.className = 'cs-label';
    trigger.appendChild(label);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor'); arrow.setAttribute('stroke-width', '2');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('d', 'M19 9l-7 7-7-7');
    arrow.appendChild(p); trigger.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.style.display = 'none';

    container.appendChild(trigger);
    container.appendChild(dropdown);

    function syncLabel() {
      const sel = select.options[select.selectedIndex];
      if (sel && !sel.disabled && sel.value) {
        label.textContent = sel.text;
        label.classList.remove('cs-placeholder');
      } else {
        const ph = Array.from(select.options).find(o => o.disabled && o.selected);
        label.textContent = ph ? ph.text : 'Select…';
        label.classList.add('cs-placeholder');
      }
      Array.from(dropdown.children).forEach(item => {
        item.classList.toggle('selected', item.dataset.value === select.value);
      });
    }

    function syncFromSelect() {
      dropdown.innerHTML = '';
      Array.from(select.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'cs-option' + (opt.disabled ? ' disabled' : '');
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        if (!opt.disabled) {
          item.addEventListener('click', e => {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncLabel();
            close();
          });
        }
        dropdown.appendChild(item);
      });
      syncLabel();
    }

    function open() {
      document.querySelectorAll('.cs-dropdown').forEach(d => {
        if (d !== dropdown) { d.style.display = 'none'; d.parentElement.querySelector('.cs-trigger')?.classList.remove('open'); }
      });
      dropdown.style.display = 'block';
      trigger.classList.add('open');
      syncFromSelect();
    }

    function close() {
      dropdown.style.display = 'none';
      trigger.classList.remove('open');
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.style.display === 'none' ? open() : close();
    });

    document.addEventListener('click', close);

    const obs = new MutationObserver(syncFromSelect);
    obs.observe(select, { childList: true, subtree: true, attributes: true });
    select.addEventListener('change', syncLabel);
    syncFromSelect();
  }

  document.querySelectorAll('.custom-select').forEach(buildCustomSelect);

  document.getElementById('imageId').addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    const raw = opt.dataset.docker;
    const docker = document.getElementById('dockerImage');
    docker.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Select variant'; ph.disabled = true; ph.selected = true;
    docker.appendChild(ph);
    if (raw) {
      try {
        JSON.parse(raw).forEach(obj => {
          Object.keys(obj).forEach(key => {
            const o = document.createElement('option');
            o.value = key; o.textContent = key;
            docker.appendChild(o);
          });
        });
      } catch {}
    }
    docker.dispatchEvent(new Event('change', { bubbles: true }));
    updateRequiredPorts();
  });

  function getRequiredPorts() {
    const image = document.getElementById('imageId');
    const opt = image.options[image.selectedIndex];
    try { return JSON.parse(opt?.dataset.portRequirements || '[]'); } catch { return []; }
  }

  function updateRequiredPorts() {
    const ports = getRequiredPorts();
    document.getElementById('assignPortsLabel').textContent = ports.length ? `Assign ports (${ports.length})` : 'Assign ports';
  }

  document.getElementById('assignPortsBtn').addEventListener('click', () => {
    const ports = getRequiredPorts();
    const list = document.getElementById('requiredPortsList');
    list.innerHTML = '';
    if (!ports.length) {
      list.innerHTML = '<p class="text-xs text-neutral-500">This image does not require ports.</p>';
    } else {
      ports.forEach((port, index) => {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 dark:border-white/10 p-3 text-xs text-neutral-600 dark:text-neutral-300';
        row.innerHTML = `<span>${port.name || `Port ${index + 1}`}</span><span class="font-mono text-right">internal ${port.internalPort || ''}</span>`;
        list.appendChild(row);
      });
    }
    document.getElementById('portsOverlay').classList.add('open');
  });
  document.getElementById('portsOk').addEventListener('click', () => document.getElementById('portsOverlay').classList.remove('open'));

  document.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const step  = parseInt(btn.dataset.step || '1');
      const min   = parseInt(btn.dataset.min  || input.min  || '0');
      const max   = parseInt(btn.dataset.max  || input.max  || '999999');
      let val = parseInt(input.value) || 0;
      val = btn.dataset.action === 'inc' ? Math.min(max, val + step) : Math.max(min, val - step);
      input.value = val;
      input.dispatchEvent(new Event('input'));
    });
  });

  function syncUnit(displayId, unitId, hiddenId) {
    const display = document.getElementById(displayId);
    const unit    = document.getElementById(unitId);
    const hidden  = document.getElementById(hiddenId);
    function update() {
      hidden.value = Math.round(parseFloat(display.value || 0) * parseInt(unit.value));
    }
    display.addEventListener('input', update);
    unit.addEventListener('change', function() {
      const prevMult = this.value === '1024' ? 1 : 1024;
      const newMult  = parseInt(this.value);
      if (prevMult !== newMult) display.value = Math.round(parseFloat(display.value || 0) * prevMult / newMult) || 1;
      update();
    });
    update();
  }
  syncUnit('MemoryDisplay',  'MemoryUnit',  'Memory');
  syncUnit('StorageDisplay', 'StorageUnit', 'Storage');

  // Real-time validation: remove invalid state when user types
  document.getElementById('serverName').addEventListener('input', function() {
    this.classList.remove('invalid');
  });

  const overlay      = document.getElementById('confirmOverlay');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmBody  = document.getElementById('confirmBody');
  const confirmOk    = document.getElementById('confirmOk');
  const confirmCancel = document.getElementById('confirmCancel');
  let confirmResolve = null;
  let lastFocusedBeforeConfirm = null;

  function trapConfirmFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function showConfirm(title, body) {
    return new Promise(resolve => {
      lastFocusedBeforeConfirm = document.activeElement;
      confirmTitle.textContent = title;
      confirmBody.textContent  = body;
      overlay.classList.add('open');
      confirmResolve = resolve;
      // Focus the cancel button (safe default)
      setTimeout(function() { confirmCancel.focus(); }, 0);
      // Add keyboard handlers
      overlay._keydownHandler = function(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          overlay.classList.remove('open');
          if (confirmResolve) confirmResolve(false);
          return;
        }
        trapConfirmFocus(e);
      };
      document.addEventListener('keydown', overlay._keydownHandler);
    });
  }

  function closeConfirm(result) {
    overlay.classList.remove('open');
    if (overlay._keydownHandler) {
      document.removeEventListener('keydown', overlay._keydownHandler);
      overlay._keydownHandler = null;
    }
    if (confirmResolve) confirmResolve(result);
    confirmResolve = null;
    // Restore focus
    if (lastFocusedBeforeConfirm && typeof lastFocusedBeforeConfirm.focus === 'function') {
      lastFocusedBeforeConfirm.focus();
      lastFocusedBeforeConfirm = null;
    }
  }

  confirmOk.addEventListener('click', () => closeConfirm(true));
  confirmCancel.addEventListener('click', () => closeConfirm(false));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeConfirm(false); });

  document.getElementById('createBtn').addEventListener('click', async function () {
    const btn     = this;
    const errBox  = document.getElementById('errorMsg');
    const errText = document.getElementById('errorText');
    errBox.classList.add('hidden');

    const name        = document.getElementById('serverName').value.trim();
    const description = document.getElementById('serverDescription').value.trim();
    const nodeId      = document.getElementById('nodeId').value;
    const imageId     = document.getElementById('imageId').value;
    const dockerImage = document.getElementById('dockerImage').value;
    const Memory      = parseInt(document.getElementById('Memory').value);
    const Cpu         = parseInt(document.getElementById('Cpu').value);
    const Storage     = parseInt(document.getElementById('Storage').value);

    // Clear previous validation states
    document.querySelectorAll('.form-input').forEach(el => el.classList.remove('invalid'));

    let hasError = false;

    if (!name) {
      errText.textContent = 'Server name is required.';
      errBox.classList.remove('hidden');
      document.getElementById('serverName').classList.add('invalid');
      document.getElementById('serverName').focus();
      hasError = true;
    } else if (name.length < 3) {
      errText.textContent = 'Server name must be at least 3 characters.';
      errBox.classList.remove('hidden');
      document.getElementById('serverName').classList.add('invalid');
      document.getElementById('serverName').focus();
      hasError = true;
    }

    if (!nodeId) {
      errText.textContent = 'Select a node.';
      errBox.classList.remove('hidden');
      hasError = true;
    }

    if (!imageId) {
      errText.textContent = 'Select an image.';
      errBox.classList.remove('hidden');
      hasError = true;
    }

    if (!dockerImage) {
      errText.textContent = 'Select a docker variant.';
      errBox.classList.remove('hidden');
      hasError = true;
    }

    if (hasError) return;

    const ok = await showConfirm(
      'Create server?',
      `"${name}" will be created and queued for installation. This may take a moment.`
    );
    if (!ok) return;

    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const r = await fetch('/create-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, nodeId, imageId, dockerImage, Memory, Cpu, Storage }),
      });
      const d = await r.json();
      if (d.success) {
        // Show success toast before redirect
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
          const toast = document.createElement('div');
          toast.className = 'al-toast al-toast-success';
          toast.innerHTML = '<span class="al-toast-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></span><span class="al-toast-text">Server created successfully!</span>';
          toastContainer.appendChild(toast);
          setTimeout(() => toast.classList.add('show'), 10);
          setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
          }, 3000);
        }
        // Redirect after brief delay
        setTimeout(() => {
          window.location.href = '/server/' + d.serverUUID;
        }, 1000);
      } else {
        btn.disabled = false;
        btn.textContent = origText;
        errText.textContent = d.error || 'Something went wrong.';
        errBox.classList.remove('hidden');
      }
    } catch {
      btn.disabled = false;
      btn.textContent = origText;
      errText.textContent = 'Network error. Try again.';
      errBox.classList.remove('hidden');
    }
  });

})();
