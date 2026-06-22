(function() {
  const imageData = JSON.parse(document.getElementById('page-data').dataset.image);
  const imageId = imageData.id;

  let state = {
    name: imageData.name,
    description: imageData.description,
    author: imageData.author,
    startup: imageData.startup,
    stop: imageData.stop,
    startup_done: imageData.startup_done,
    docker_images: imageData.docker_images,
    variables: imageData.variables,
    scripts: imageData.scripts,
    info: imageData.info,
    meta: imageData.meta,
    portRequirements: imageData.portRequirements,
  };

  function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('border-neutral-800', active);
      btn.classList.toggle('dark:border-white', active);
      btn.classList.toggle('text-neutral-800', active);
      btn.classList.toggle('dark:text-white', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-neutral-500', !active);
    });
    document.querySelectorAll('.tab-form').forEach(form => {
      form.classList.toggle('hidden', form.dataset.tabForm !== name);
    });
    if (name === 'raw') renderRawEditor();
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
  activateTab('general');

  document.getElementById('field-name').value = state.name;
  document.getElementById('field-description').value = state.description;
  document.getElementById('field-author').value = state.author;
  document.getElementById('field-startup').value = state.startup;
  document.getElementById('field-stop').value = state.stop;
  document.getElementById('field-startup-done').value = state.startup_done;

  document.getElementById('save-general').addEventListener('click', async () => {
    state.name = document.getElementById('field-name').value.trim();
    state.description = document.getElementById('field-description').value;
    state.author = document.getElementById('field-author').value.trim();
    state.startup = document.getElementById('field-startup').value.trim();
    state.stop = document.getElementById('field-stop').value.trim();
    state.startup_done = document.getElementById('field-startup-done').value.trim();
    await saveState();
  });

  function renderDockerImages() {
    const list = document.getElementById('docker-images-list');
    list.innerHTML = '';
    const entries = Object.entries(state.docker_images);
    if (entries.length === 0) {
      list.innerHTML = '<p class="text-xs text-neutral-400">No Docker images configured. Click Add Image to add one.</p>';
      return;
    }
    entries.forEach(([label, image], idx) => {
      const row = document.createElement('div');
      row.className = 'flex gap-2 items-center';
      row.innerHTML =
        '<input data-docker-label="' + idx + '" type="text" value="' + escHtml(label) + '" placeholder="Label (e.g. java 21)"' +
        ' aria-label="Docker image label"' +
        ' class="w-40 shrink-0 rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition">' +
        '<input data-docker-image="' + idx + '" type="text" value="' + escHtml(image) + '" placeholder="Image ref (e.g. ghcr.io/ptero-eggs/yolks:java_21)"' +
        ' aria-label="Docker image reference"' +
        ' class="flex-1 rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition">' +
        '<button data-docker-remove="' + idx + '" type="button"' +
        ' aria-label="Remove Docker image entry"' +
        ' class="px-3 py-2 text-xs rounded-xl border border-red-200 dark:border-red-900/30 bg-white dark:bg-neutral-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0">' +
        'Remove</button>';
      list.appendChild(row);
    });

    list.querySelectorAll('[data-docker-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.dockerRemove);
        const keys = Object.keys(state.docker_images);
        delete state.docker_images[keys[idx]];
        renderDockerImages();
      });
    });
  }
  renderDockerImages();

  document.getElementById('add-docker-image').addEventListener('click', () => {
    state.docker_images[''] = '';
    renderDockerImages();
  });

  document.getElementById('save-docker').addEventListener('click', async () => {
    const newImages = {};
    document.querySelectorAll('[data-docker-label]').forEach((labelInput, idx) => {
      const imageInput = document.querySelector('[data-docker-image="' + idx + '"]');
      const label = labelInput.value.trim();
      const img = imageInput.value.trim();
      if (label && img) newImages[label] = img;
    });
    state.docker_images = newImages;
    await saveState();
  });

  function renderVariables() {
    const list = document.getElementById('variables-list');
    list.innerHTML = '';
    if (!state.variables.length) {
      list.innerHTML = '<p class="text-xs text-neutral-400">No variables defined. Click Add Variable to add one.</p>';
      return;
    }
    state.variables.forEach((v, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-white dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-white/5 p-4';
      card.innerHTML =
        '<div class="flex items-center justify-between mb-3">' +
          '<span class="text-xs font-medium text-neutral-500">#' + (idx + 1) + '</span>' +
          '<button data-var-remove="' + idx + '" type="button" class="text-xs text-red-500 hover:text-red-400 transition">Remove</button>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Name</label>' +
            '<input data-var-field="' + idx + '" data-field="name" type="text" value="' + escHtml(v.name || '') + '"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Env Variable</label>' +
            '<input data-var-field="' + idx + '" data-field="env_variable" type="text" value="' + escHtml(v.env_variable || '') + '" placeholder="SERVER_JARFILE"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Default Value</label>' +
            '<input data-var-field="' + idx + '" data-field="default_value" type="text" value="' + escHtml(v.default_value || '') + '"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Field Type</label>' +
            '<select data-var-field="' + idx + '" data-field="field_type"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition">' +
              '<option value="text"' + ((v.field_type || 'text') === 'text' ? ' selected' : '') + '>text</option>' +
              '<option value="number"' + (v.field_type === 'number' ? ' selected' : '') + '>number</option>' +
            '</select></div>' +
          '<div class="col-span-2"><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>' +
            '<input data-var-field="' + idx + '" data-field="description" type="text" value="' + escHtml(v.description || '') + '"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div class="col-span-2"><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Validation Rules</label>' +
            '<input data-var-field="' + idx + '" data-field="rules" type="text" value="' + escHtml(v.rules || '') + '" placeholder="required|string|between:3,15"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700/40 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div class="flex items-center gap-4">' +
            '<label class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">' +
              '<input data-var-field="' + idx + '" data-field="user_viewable" type="checkbox"' + (v.user_viewable !== false ? ' checked' : '') +
              ' class="rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white focus:ring-0"> User viewable</label>' +
            '<label class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">' +
              '<input data-var-field="' + idx + '" data-field="user_editable" type="checkbox"' + (v.user_editable !== false ? ' checked' : '') +
              ' class="rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white focus:ring-0"> User editable</label>' +
          '</div>' +
        '</div>';
      list.appendChild(card);
    });

    list.querySelectorAll('[data-var-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.variables.splice(parseInt(btn.dataset.varRemove), 1);
        renderVariables();
      });
    });
  }
  renderVariables();

  document.getElementById('add-variable').addEventListener('click', () => {
    state.variables.push({ name: '', description: '', env_variable: '', default_value: '', user_viewable: true, user_editable: true, rules: '', field_type: 'text' });
    renderVariables();
  });

  document.getElementById('save-variables').addEventListener('click', async () => {
    document.querySelectorAll('[data-var-field]').forEach(input => {
      const idx = parseInt(input.dataset.varField);
      const field = input.dataset.field;
      if (!state.variables[idx]) return;
      if (input.type === 'checkbox') {
        state.variables[idx][field] = input.checked;
      } else {
        state.variables[idx][field] = input.value;
      }
    });
    await saveState();
  });

  const installScript = state.scripts.installation || {};
  document.getElementById('field-install-container').value = installScript.container || '';
  document.getElementById('field-install-entrypoint').value = installScript.entrypoint || 'bash';
  document.getElementById('field-install-script').value = installScript.script || '';

  document.getElementById('save-install').addEventListener('click', async () => {
    state.scripts.installation = {
      container: document.getElementById('field-install-container').value.trim(),
      entrypoint: document.getElementById('field-install-entrypoint').value.trim() || 'bash',
      script: document.getElementById('field-install-script').value,
    };
    await saveState();
  });

  function renderPortRequirements() {
    const list = document.getElementById('port-requirements-list');
    list.innerHTML = '';
    if (!state.portRequirements.length) {
      list.innerHTML = '<p class="text-xs text-neutral-400">No required ports. Servers can be created without port bindings unless an admin adds ports.</p>';
      return;
    }
    state.portRequirements.forEach((port, idx) => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end';
      row.innerHTML =
        '<label class="text-xs text-neutral-500">Port name<input data-port-req="' + idx + '" data-field="name" value="' + escHtml(port.name || '') + '"' +
        ' class="mt-1 w-full rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-800 dark:text-white"></label>' +
        '<label class="text-xs text-neutral-500">Internal port<input data-port-req="' + idx + '" data-field="internalPort" type="number" min="1" max="65535" value="' + escHtml(port.internalPort || '') + '"' +
        ' class="mt-1 w-full rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-800 dark:text-white"></label>' +
        '<button type="button" data-port-req-remove="' + idx + '" class="rounded-xl border border-red-200 dark:border-red-900/30 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition">Remove</button>';
      list.appendChild(row);
    });
    list.querySelectorAll('[data-port-req-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.portRequirements.splice(Number(btn.dataset.portReqRemove), 1);
        renderPortRequirements();
      });
    });
  }
  renderPortRequirements();

  document.getElementById('add-port-requirement').addEventListener('click', () => {
    state.portRequirements.push({ name: 'Port ' + (state.portRequirements.length + 1), internalPort: 25565 });
    renderPortRequirements();
  });

  document.getElementById('save-settings').addEventListener('click', async () => {
    document.querySelectorAll('[data-port-req]').forEach(input => {
      const idx = Number(input.dataset.portReq);
      const field = input.dataset.field;
      state.portRequirements[idx][field] = field === 'internalPort' ? Number(input.value) : input.value;
    });
    state.portRequirements = state.portRequirements.filter(port => port.name && port.internalPort);
    await saveState();
  });

  let monacoEditor = null;

  function renderRawEditor() {
    if (monacoEditor) {
      monacoEditor.setValue(buildExportJson());
      return;
    }
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoEditor = monaco.editor.create(document.getElementById('json-editor'), {
        value: buildExportJson(),
        language: 'json',
        theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        tabSize: 2,
      });
    });
  }

  document.getElementById('save-raw').addEventListener('click', async () => {
    if (!monacoEditor) return;
    let parsed;
    try { parsed = JSON.parse(monacoEditor.getValue()); }
    catch (e) { showToast('Invalid JSON: ' + e.message, 'error'); return; }
    await savePayload(parsed);
  });

  function buildExportJson() {
    return JSON.stringify({
      meta: { version: 'PTDL_v2', ...state.meta },
      name: state.name, description: state.description, author: state.author, startup: state.startup,
      config: { stop: state.stop, startup: { done: state.startup_done }, files: {}, logs: {} },
      docker_images: state.docker_images, variables: state.variables,
      scripts: { installation: state.scripts.installation || null }, portRequirements: state.portRequirements,
    }, null, 2);
  }

  async function saveState() {
    const payload = {
      meta: { version: 'PTDL_v2', ...state.meta },
      name: state.name, description: state.description, author: state.author, startup: state.startup,
      config: { stop: state.stop, startup: { done: state.startup_done }, files: {}, logs: {} },
      docker_images: state.docker_images, variables: state.variables,
      scripts: { installation: state.scripts.installation || null }, info: state.info, portRequirements: state.portRequirements,
    };
    await savePayload(payload);
  }

  async function savePayload(payload) {
    try {
      const r = await fetch('/admin/images/edit/' + imageId, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (data.success) showToast('Saved.', 'success');
      else showToast(data.error || 'Failed to save.', 'error');
    } catch {
      showToast('Network error.', 'error');
    }
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
