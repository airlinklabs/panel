function initImageEdit() {
  let imageData;
  try { imageData = JSON.parse(document.getElementById('page-data').dataset.image); } catch { imageData = {}; }
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

  const isMobile = !!document.querySelector('[data-mobile-tab]');

  function activateTab(name) {
    document.querySelectorAll(isMobile ? '[data-mobile-tab]' : '.tab-btn').forEach(btn => {
      const tabName = isMobile ? btn.dataset.mobileTab : btn.dataset.tab;
      const active = tabName === name;
      btn.classList.toggle('border-neutral-800', active);
      btn.classList.toggle('dark:border-white', active);
      btn.classList.toggle('text-neutral-800', active);
      btn.classList.toggle('dark:text-white', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-neutral-500', !active);
    });
    document.querySelectorAll(isMobile ? '[id^="mobileTab"]' : '.tab-form').forEach(form => {
      const formName = isMobile ? form.id.replace('mobileTab', '').toLowerCase() : form.dataset.tabForm;
      form.classList.toggle('hidden', formName !== name);
    });
    if (name === 'raw') renderRawEditor();
  }

  document.querySelectorAll(isMobile ? '[data-mobile-tab]' : '.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = isMobile ? btn.dataset.mobileTab : btn.dataset.tab;
      activateTab(tabName);
    });
  });
  activateTab('general');

  function el(id) { return document.getElementById(id); }

  const fieldName = el('field-name') || el('name');
  const fieldAuthor = el('field-author') || el('author');
  const fieldStartup = el('field-startup') || el('startup');
  const fieldStop = el('field-stop');
  const fieldStartupDone = el('field-startup-done');
  const fieldDescription = el('field-description') || el('description');

  if (fieldName) fieldName.value = state.name;
  if (fieldAuthor) fieldAuthor.value = state.author;
  if (fieldStartup) fieldStartup.value = state.startup;
  if (fieldStop) fieldStop.value = state.stop;
  if (fieldStartupDone) fieldStartupDone.value = state.startup_done;
  if (fieldDescription) fieldDescription.value = state.description;

  const saveGeneral = el('save-general');
  if (saveGeneral) {
    saveGeneral.addEventListener('click', async () => {
      state.name = (fieldName || el('name')).value.trim();
      state.description = (fieldDescription || el('description')).value;
      state.author = (fieldAuthor || el('author')).value.trim();
      state.startup = (fieldStartup || el('startup')).value.trim();
      if (fieldStop) state.stop = fieldStop.value.trim();
      if (fieldStartupDone) state.startup_done = fieldStartupDone.value.trim();
      await saveState();
    });
  }

  function renderDockerImages() {
    const list = el('docker-images-list') || el('docker-images-list-mobile');
    if (!list) return;
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

  const addDockerImage = el('add-docker-image') || el('add-docker-image-mobile');
  if (addDockerImage) {
    addDockerImage.addEventListener('click', () => {
      state.docker_images[''] = '';
      renderDockerImages();
    });
  }

  const saveDocker = el('save-docker') || el('save-docker-mobile');
  if (saveDocker) {
    saveDocker.addEventListener('click', async () => {
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
  }

  function renderVariables() {
    const list = el('variables-list') || el('variables-list-mobile');
    if (!list) return;
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
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Env Variable</label>' +
            '<input data-var-field="' + idx + '" data-field="env_variable" type="text" value="' + escHtml(v.env_variable || '') + '" placeholder="SERVER_JARFILE"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Default Value</label>' +
            '<input data-var-field="' + idx + '" data-field="default_value" type="text" value="' + escHtml(v.default_value || '') + '"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Field Type</label>' +
            '<select data-var-field="' + idx + '" data-field="field_type"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition">' +
              '<option value="text"' + ((v.field_type || 'text') === 'text' ? ' selected' : '') + '>text</option>' +
              '<option value="number"' + (v.field_type === 'number' ? ' selected' : '') + '>number</option>' +
            '</select></div>' +
          '<div class="col-span-2"><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>' +
            '<input data-var-field="' + idx + '" data-field="description" type="text" value="' + escHtml(v.description || '') + '"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
          '<div class="col-span-2"><label class="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Validation Rules</label>' +
            '<input data-var-field="' + idx + '" data-field="rules" type="text" value="' + escHtml(v.rules || '') + '" placeholder="required|string|between:3,15"' +
            ' class="w-full rounded-lg border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-700 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition"></div>' +
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

  const addVariable = el('add-variable') || el('add-variable-mobile');
  if (addVariable) {
    addVariable.addEventListener('click', () => {
      state.variables.push({ name: '', description: '', env_variable: '', default_value: '', user_viewable: true, user_editable: true, rules: '', field_type: 'text' });
      renderVariables();
    });
  }

  const saveVariables = el('save-variables') || el('save-variables-mobile');
  if (saveVariables) {
    saveVariables.addEventListener('click', async () => {
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
  }

  const installScript = state.scripts.installation || {};
  const installContainer = el('field-install-container') || el('field-install-container-mobile');
  const installEntrypoint = el('field-install-entrypoint') || el('field-install-entrypoint-mobile');
  const installScriptEl = el('field-install-script') || el('field-install-script-mobile');
  if (installContainer) installContainer.value = installScript.container || '';
  if (installEntrypoint) installEntrypoint.value = installScript.entrypoint || 'bash';
  if (installScriptEl) installScriptEl.value = installScript.script || '';

  const saveInstall = el('save-install') || el('save-install-mobile');
  if (saveInstall) {
    saveInstall.addEventListener('click', async () => {
      state.scripts.installation = {
        container: (installContainer || el('field-install-container')).value.trim(),
        entrypoint: (installEntrypoint || el('field-install-entrypoint')).value.trim() || 'bash',
        script: (installScriptEl || el('field-install-script')).value,
      };
      await saveState();
    });
  }

  function renderPortRequirements() {
    const list = el('port-requirements-list');
    if (!list) return;
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

  const addPortReq = el('add-port-requirement') || el('addPortRequirement');
  if (addPortReq) {
    addPortReq.addEventListener('click', () => {
      state.portRequirements.push({ name: 'Port ' + (state.portRequirements.length + 1), internalPort: 25565 });
      renderPortRequirements();
    });
  }

  const saveSettings = el('save-settings') || el('saveSettingsBtn');
  if (saveSettings) {
    saveSettings.addEventListener('click', async () => {
      document.querySelectorAll('[data-port-req]').forEach(input => {
        const idx = Number(input.dataset.portReq);
        const field = input.dataset.field;
        state.portRequirements[idx][field] = field === 'internalPort' ? Number(input.value) : input.value;
      });
      state.portRequirements = state.portRequirements.filter(port => port.name && port.internalPort);
      await saveState();
    });
  }

  let monacoEditor = null;

  function renderRawEditor() {
    if (monacoEditor) {
      monacoEditor.setValue(buildExportJson());
      return;
    }
    const editorEl = el('json-editor') || el('jsonEditor');
    if (!editorEl) return;
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoEditor = monaco.editor.create(editorEl, {
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

  const saveRaw = el('save-raw') || el('saveButton');
  if (saveRaw) {
    saveRaw.addEventListener('click', async () => {
      if (!monacoEditor) return;
      let parsed;
      try { parsed = JSON.parse(monacoEditor.getValue()); }
      catch (e) { showToast('Invalid JSON: ' + e.message, 'error'); return; }
      await savePayload(parsed);
    });
  }

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
}
document.addEventListener('DOMContentLoaded', initImageEdit);
document.addEventListener('turbo:load', initImageEdit);
