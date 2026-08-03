(function () {
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
    const portsOverlay = document.getElementById('portsOverlay');
    portsOverlay.classList.add('open');
    Animate.openModal(portsOverlay, portsOverlay.querySelector('.confirm-box'));
  });
  document.getElementById('portsOk').addEventListener('click', () => {
    const overlay = document.getElementById('portsOverlay');
    overlay.classList.add('closing');
    const done = function () { overlay.classList.remove('open'); overlay.classList.remove('closing'); };
    Animate.closeModal(overlay, overlay.querySelector('.confirm-box'), done);
  });

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

  // Real-time validation: remove invalid state when user types
  document.getElementById('serverName').addEventListener('input', function() {
    this.classList.remove('invalid');
  });

  function showConfirm(title, body) {
    return new Promise(resolve => {
      window.modal.confirm({
        title: title,
        body: body,
        confirmLabel: 'Create',
        onConfirm: resolve,
      });
    });
  }

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
    const Swap        = parseInt(document.getElementById('Swap').value);

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
        body: JSON.stringify({ name, description, nodeId, imageId, dockerImage, Memory, Cpu, Storage, Swap }),
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
