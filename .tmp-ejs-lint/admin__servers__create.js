/* inline script 1 */

  document.addEventListener('DOMContentLoaded', () => {
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
          try { if (node.allocatedPorts) ports = JSON.parse(node.allocatedPorts); } catch (e) {}
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
          } catch (e) {}
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
      const min = requirements.length;
      while (assignedPorts.length < min) {
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
        title: 'Assign ports',
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
      if (variables.length === 0) {
        document.getElementById('variablesSectionRow').classList.remove('open');
        return;
      }
      document.getElementById('variablesSectionRow').classList.add('open');
      variables.forEach(variable => {
        const envKey = variable.env_variable || variable.env || '';
        const fieldType = variable.field_type || variable.type || 'text';
        const defaultVal = variable.default_value ?? variable.value ?? '';
        const isRequired = variable.rules ? variable.rules.includes('required') : !!variable.required;
        const wrapper = document.createElement('div');
        wrapper.classList.add('flex', 'flex-col', 'gap-1.5');
        const label = document.createElement('label');
        label.setAttribute('for', envKey);
        label.classList.add('text-neutral-700', 'dark:text-neutral-400', 'text-sm', 'tracking-tight');
        label.textContent = variable.name + (isRequired ? ' *' : '');
        if (variable.description) {
          const desc = document.createElement('p');
          desc.classList.add('text-xs', 'text-neutral-500');
          desc.textContent = variable.description;
          wrapper.appendChild(label);
          wrapper.appendChild(desc);
        } else { wrapper.appendChild(label); }
        let input;
        if (fieldType === 'number') {
          input = document.createElement('input');
          input.type = 'number';
          input.placeholder = defaultVal || `Enter ${variable.name}`;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.placeholder = defaultVal || `Enter ${variable.name}`;
        }
        input.classList.add('rounded-xl', 'focus:ring', 'focus:ring-neutral-800/10', 'focus:border-neutral-800/20', 'text-neutral-800', 'dark:text-white', 'text-sm', 'w-full', 'hover:bg-neutral-200', 'dark:hover:bg-white/5', 'px-4', 'py-2', 'bg-neutral-100', 'dark:bg-neutral-600/20', 'border', 'border-neutral-800/10', 'dark:border-white/5');
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
          variablesArray.push({
            env_variable: envKey, env: envKey, name: variable.name, value: value, field_type: fieldType,
          });
        }
      });
      const data = Object.fromEntries(formData);
      data.variables = variablesArray;
      data.ports = assignedPorts;
      const loader = showLoadingPopup('Creating Server', 'Initializing server creation...');
      loader.updateProgress(20, 'Sending server configuration...');
      fetch('/admin/servers/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
        .then(response => {
          if (!response.ok) throw new Error('Server creation failed');
          return response;
        })
        .then(data => {
          loader.updateProgress(100, 'Server created successfully!');
          setTimeout(() => { loader.close(); showToast('Server deployed. Go make something cool.', 'success'); setTimeout(() => { window.location.href = '/admin/servers'; }, 1000); }, 500);
        })
        .catch(error => { loader.close(); console.error('Error:', error); showToast('Failed to create server: ' + error.message, 'error'); });
    });

    fetchNodesData();
    updateDockerImages();
    updateVariables();

    const allowStartupEditToggle = document.getElementById('allowStartupEdit');
    const allowStartupEditLabel  = document.getElementById('allowStartupEditLabel');
    allowStartupEditToggle.addEventListener('change', function() { allowStartupEditLabel.textContent = this.checked ? 'Enabled' : 'Disabled'; });

    serverImageSelect.addEventListener('change', () => { updateDockerImages(); updateVariables(); ensureMinimumPortRows(); syncPortsButton(); });
    serverNodeSelect.addEventListener('change', () => { updatePortsForSelectedNode(); });
  });

/* inline script 2 */

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
