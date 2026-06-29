function initServerCreate() {
  const serverImageSelect = document.getElementById('serverImage');
  const dockerImageSelect = document.getElementById('dockerImage');
  const serverNodeSelect = document.getElementById('serverNode');
  const serverPortsInput = document.getElementById('serverPorts');
  const variablesContainer = document.getElementById('variablesContainer');
  const form = document.getElementById('createServerForm');

  let nodesData = {};
  let availablePorts = [];
  let assignedPorts = [];

  async function fetchNodesData() {
    try {
      const response = await fetch('/admin/nodes/list');
      const nodes = await response.json();
      nodes.forEach(node => {
        let ports = [];
        try {
          if (node.allocatedPorts) ports = JSON.parse(node.allocatedPorts);
        } catch (e) { console.error('Error parsing allocated ports:', e); }
        nodesData[node.id] = { ...node, parsedPorts: ports };
      });
      updatePortsForSelectedNode();
    } catch (error) { console.error('Error fetching nodes:', error); }
  }

  function updatePortsForSelectedNode() {
    const selectedNodeId = serverNodeSelect.value;
    availablePorts = [];
    if (!selectedNodeId || !nodesData[selectedNodeId]) { syncPortsButton(); return; }
    const node = nodesData[selectedNodeId];
    const nodeAddress = node.address;
    if (!node.parsedPorts || node.parsedPorts.length === 0) { syncPortsButton(); return; }
    const usedPorts = new Set();
    if (node.servers && node.servers.length > 0) {
      node.servers.forEach(server => {
        try {
          if (server.Ports) {
            const ports = JSON.parse(server.Ports);
            ports.forEach(portInfo => {
              const port = parseInt(portInfo.Port.split(':')[0]);
              if (!isNaN(port)) usedPorts.add(port);
            });
          }
        } catch (e) { console.error('Error parsing server ports:', e); }
      });
    }
    availablePorts = node.parsedPorts.filter(port => !usedPorts.has(port)).map(port => ({ port, label: `${nodeAddress}:${port}` }));
    assignedPorts = assignedPorts.filter(port => availablePorts.some(item => item.port === Number(port.externalPort)));
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

  const isMobile = () => window.innerWidth < 640;

  function buildExternalPortSelect(port, index) {
    const select = document.createElement('select');
    select.setAttribute('data-port-field', index);
    select.setAttribute('data-field', 'externalPort');
    select.className = 'w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white';
    if (availablePorts.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No ports available';
      opt.disabled = true;
      opt.selected = true;
      select.appendChild(opt);
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select port';
      select.appendChild(placeholder);
      availablePorts.forEach(item => {
        const option = document.createElement('option');
        option.value = item.port;
        option.textContent = item.label;
        option.selected = Number(port.externalPort) === item.port;
        select.appendChild(option);
      });
    }
    return select;
  }

  function renderPortRows() {
    ensureMinimumPortRows();
    const container = document.getElementById('portsRows');
    container.innerHTML = '';
    const min = getPortRequirements().length;
    const mobile = isMobile();

    if (!mobile) {
      const table = document.createElement('div');
      table.className = 'hidden sm:block';
      const header = document.createElement('div');
      header.className = 'grid grid-cols-[1fr_100px_180px_40px] gap-3 px-3 pb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400';
      header.innerHTML = '<span>Port name</span><span>Internal port</span><span>External port</span><span></span>';
      table.appendChild(header);
      assignedPorts.forEach((port, index) => {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-[1fr_100px_180px_40px] gap-3 items-center rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800/40 p-3 animate-[fadeSlideIn_0.2s_ease-out]';
        const nameInput = document.createElement('input');
        nameInput.setAttribute('data-port-field', index);
        nameInput.setAttribute('data-field', 'name');
        nameInput.value = port.name || '';
        nameInput.className = 'w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white';
        const internalInput = document.createElement('input');
        internalInput.setAttribute('data-port-field', index);
        internalInput.setAttribute('data-field', 'internalPort');
        internalInput.type = 'number';
        internalInput.min = '1';
        internalInput.max = '65535';
        internalInput.value = port.internalPort || '';
        internalInput.className = 'w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('data-remove-port', index);
        deleteBtn.className = `p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition ${index < min ? 'opacity-40 pointer-events-none' : ''}`;
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
        row.appendChild(nameInput);
        row.appendChild(internalInput);
        row.appendChild(buildExternalPortSelect(port, index));
        row.appendChild(deleteBtn);
        table.appendChild(row);
      });
      container.appendChild(table);
    }

    if (mobile) {
      const cardList = document.createElement('div');
      cardList.className = 'sm:hidden space-y-3';
      assignedPorts.forEach((port, index) => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800/40 p-3 space-y-2 animate-[fadeSlideIn_0.2s_ease-out]';
        const nameInput = document.createElement('input');
        nameInput.setAttribute('data-port-field', index);
        nameInput.setAttribute('data-field', 'name');
        nameInput.value = port.name || '';
        nameInput.placeholder = 'Port name';
        nameInput.className = 'w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white';
        const internalInput = document.createElement('input');
        internalInput.setAttribute('data-port-field', index);
        internalInput.setAttribute('data-field', 'internalPort');
        internalInput.type = 'number';
        internalInput.min = '1';
        internalInput.max = '65535';
        internalInput.value = port.internalPort || '';
        internalInput.placeholder = 'Internal port';
        internalInput.className = 'w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-white';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('data-remove-port', index);
        deleteBtn.className = `w-full rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 transition ${index < min ? 'opacity-40 pointer-events-none' : ''}`;
        deleteBtn.textContent = 'Remove';
        card.appendChild(nameInput);
        card.appendChild(internalInput);
        card.appendChild(buildExternalPortSelect(port, index));
        card.appendChild(deleteBtn);
        cardList.appendChild(card);
      });
      container.appendChild(cardList);
    }
  }

  function openPortsModal() {
    renderPortRows();
    const modal = document.getElementById('portsModal');
    const panel = document.getElementById('portsModalPanel');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
      panel.classList.remove('translate-y-full', 'sm:scale-95', 'opacity-0');
      panel.classList.add('translate-y-0', 'sm:scale-100', 'opacity-100');
    });
  }

  function closePortsModal() {
    const modal = document.getElementById('portsModal');
    const panel = document.getElementById('portsModalPanel');
    panel.classList.add('translate-y-full', 'sm:scale-95', 'opacity-0');
    panel.classList.remove('translate-y-0', 'sm:scale-100', 'opacity-100');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
  }

  document.getElementById('assignPortsBtn').addEventListener('click', openPortsModal);
  document.getElementById('closePortsModal').addEventListener('click', closePortsModal);
  document.getElementById('portsModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePortsModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('portsModal').classList.contains('hidden')) closePortsModal(); });
  document.getElementById('addPortRow').addEventListener('click', () => {
    assignedPorts.push({ name: `Port ${assignedPorts.length + 1}`, internalPort: 25565, externalPort: '', primary: assignedPorts.length === 0 });
    renderPortRows();
  });
  document.getElementById('portsRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-port]');
    if (!button) return;
    assignedPorts.splice(Number(button.dataset.removePort), 1);
    renderPortRows();
  });
  document.getElementById('savePortsModal').addEventListener('click', () => {
    document.querySelectorAll('[data-port-field]').forEach(input => {
      const index = Number(input.dataset.portField);
      assignedPorts[index][input.dataset.field] = input.dataset.field.includes('Port') ? Number(input.value) : input.value;
    });
    assignedPorts = assignedPorts.filter(port => port.name && port.internalPort && port.externalPort);
    assignedPorts.forEach((port, index) => { port.primary = index === 0; });
    syncPortsButton();
    closePortsModal();
  });

  function updateDockerImages() {
    const selectedOption = serverImageSelect.options[serverImageSelect.selectedIndex];
    const dockerImagesData = selectedOption.getAttribute('data-docker-images');
    dockerImageSelect.innerHTML = '<option value="" disabled selected>Select a Docker image</option>';
    if (dockerImagesData) {
      const dockerImages = JSON.parse(dockerImagesData);
      dockerImages.forEach(imageObj => {
        Object.entries(imageObj).forEach(([key, value]) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = key;
          dockerImageSelect.appendChild(option);
        });
      });
    }
  }

  function updateVariables() {
    const selectedOption = serverImageSelect.options[serverImageSelect.selectedIndex];
    const variables = JSON.parse(selectedOption.getAttribute('data-variables')) || [];
    variablesContainer.innerHTML = '';
    if (variables.length === 0) { document.getElementById('variablesSectionRow').classList.remove('open'); return; }
    document.getElementById('variablesSectionRow').classList.add('open');
    variables.forEach(variable => {
      const envKey = variable.env_variable || variable.env || '';
      const fieldType = variable.field_type || variable.type || 'text';
      const defaultVal = variable.default_value ?? variable.value ?? '';
      const isRequired = variable.rules ? variable.rules.includes('required') : !!variable.required;
      const wrapper = document.createElement('div');
      wrapper.classList.add('mb-2', 'flex', 'flex-col', 'gap-1.5');
      const label = document.createElement('label');
      label.setAttribute('for', envKey);
      label.classList.add('text-neutral-700', 'dark:text-neutral-400', 'text-sm', 'font-medium', 'tracking-tight');
      label.textContent = variable.name + (isRequired ? ' *' : '');
      wrapper.appendChild(label);
      if (variable.description) {
        const desc = document.createElement('p');
        desc.classList.add('text-xs', 'text-neutral-500');
        desc.textContent = variable.description;
        wrapper.appendChild(desc);
      }
      const input = document.createElement('input');
      input.type = fieldType === 'number' ? 'number' : 'text';
      input.placeholder = defaultVal || `Enter ${variable.name}`;
      input.classList.add('rounded-xl', 'focus:ring', 'focus:ring-neutral-800/10', 'focus:border-neutral-800/20', 'text-neutral-800', 'dark:text-white', 'text-sm', 'w-full', 'hover:bg-white/5', 'px-4', 'py-2', 'bg-neutral-400/10', 'dark:bg-neutral-600/20', 'border', 'border-neutral-800/10', 'dark:border-white/5');
      input.id = envKey;
      input.name = envKey;
      input.value = defaultVal;
      if (isRequired) input.required = true;
      wrapper.appendChild(input);
      variablesContainer.appendChild(wrapper);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const variablesArray = [];
    const selectedOption = serverImageSelect.options[serverImageSelect.selectedIndex];
    const variables = JSON.parse(selectedOption.getAttribute('data-variables')) || [];
    variables.forEach(variable => {
      const envKey = variable.env_variable || variable.env || '';
      const fieldType = variable.field_type || variable.type || 'text';
      let value = formData.get(envKey);
      if (fieldType === 'number') value = parseInt(value);
      if (value !== null) {
        variablesArray.push({ env_variable: envKey, env: envKey, name: variable.name, value: value, field_type: fieldType });
      }
    });
    const data = Object.fromEntries(formData);
    data.variables = variablesArray;
    data.ports = assignedPorts;
    const loader = showLoadingPopup('Creating Server', 'Initializing server creation...');
    loader.updateProgress(20, 'Sending server configuration...');
    fetch('/admin/servers/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(response => { if (!response.ok) throw new Error('Server creation failed'); return response; })
      .then(data => {
        loader.updateProgress(100, 'Server created successfully!');
        setTimeout(() => { loader.close(); showToast('Server created successfully!', 'success'); setTimeout(() => { window.location.href = '/admin/servers?err=none'; }, 1000); }, 500);
      })
      .catch(error => { loader.close(); console.error('Error:', error); showToast('Failed to create server: ' + error.message, 'error'); });
  });

  fetchNodesData();
  updateDockerImages();
  updateVariables();

  const allowStartupEditToggle = document.getElementById('allowStartupEdit');
  const allowStartupEditLabel = document.getElementById('allowStartupEditLabel');
  if (allowStartupEditToggle && allowStartupEditLabel) {
    allowStartupEditToggle.addEventListener('change', function() { allowStartupEditLabel.textContent = this.checked ? 'Enabled' : 'Disabled'; });
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderPortRows, 150); });

  serverImageSelect.addEventListener('change', () => { updateDockerImages(); updateVariables(); ensureMinimumPortRows(); syncPortsButton(); });
  serverNodeSelect.addEventListener('change', () => { updatePortsForSelectedNode(); });

  function syncUnit(displayId, unitId, hiddenId) {
    const display = document.getElementById(displayId);
    const unit    = document.getElementById(unitId);
    const hidden  = document.getElementById(hiddenId);
    if (!display || !unit || !hidden) return;
    function update() { hidden.value = Math.round(parseFloat(display.value || 0) * parseInt(unit.value)); }
    display.addEventListener('input', update);
    unit.addEventListener('change', function() {
      const prevMult = this.value === '1024' ? 1 : 1024;
      const newMult  = parseInt(this.value);
      if (prevMult !== newMult) display.value = Math.round(parseFloat(display.value || 0) * prevMult / newMult) || 1;
      update();
    });
    update();
  }
  syncUnit('serverMemoryDisplay',  'serverMemoryUnit',  'serverMemory');
  syncUnit('serverStorageDisplay', 'serverStorageUnit', 'serverStorage');
}

const listA = ["Charged","Fiery","Mystical","Dark","Angry","Enchanted","Blazing","Cursed","Frozen","Swift","Ancient","Wicked","Luminous","Vengeful","Radiant","Thunderous","Shadow","Frost","Vibrant","Spectral","Nether","Ender","Caving","Toxic","Haunted","Radiant","Ghostly"];
const listB = ["Creeper","Dragon","Zombie","Ghoul","Enderman","Skeleton","Wither","Magma Cube","Blaze","Witch","Slime","Spider","Phantom","Villager","Pillager","Vindicator","Drowned","Illager","Ender Dragon","Husk","Stray","Ravager","Piglin","Hoglin","Shulker","Warden"];
function generateRandomName() {
  let randomA, randomB;
  do { randomA = listA[Math.floor(Math.random() * listA.length)]; randomB = listB[Math.floor(Math.random() * listB.length)]; } while (randomA === randomB);
  document.getElementById("serverName").value = randomA + " " + randomB;
}

(function () {
  const display = document.getElementById('serverCPUDisplay');
  const hidden  = document.getElementById('serverCPU');
  const unit    = document.getElementById('serverCPUUnit');
  if (!display || !hidden || !unit) return;
  function syncHidden() {
    const val = parseFloat(display.value) || 0;
    hidden.value = unit.value === 'cores' ? String(Math.round(val * 100)) : String(Math.round(val));
  }
  unit.addEventListener('change', syncHidden);
  display.addEventListener('input', syncHidden);
  syncHidden();
})();

document.addEventListener('DOMContentLoaded', initServerCreate);
document.addEventListener('turbo:load', initServerCreate);
