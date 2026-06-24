(function() {
  let currentConfig = {};
  let blockedList = [];

  async function loadConfig() {
    try {
      const res = await fetch('/modrinth/api/config', { credentials: 'include' });
      const data = await res.json();
      if (!data.success || !data.data) { showToast('Failed to load', 'error'); return; }
      currentConfig = data.data;
      document.getElementById('configEditor').value = JSON.stringify(data.data, null, 2);
      populateFields(data.data);
      loadFileStatus();
      loadStatistics();
    } catch { showToast('Failed to load', 'error'); }
  }

  function populateFields(cfg) {
    document.getElementById('warningEnabled').checked = !!cfg.modrinthInstallationWarning;
    document.getElementById('warningTitle').value = cfg.warningTitle || '';
    document.getElementById('warningMessage').value = cfg.warningMessage || '';
    document.querySelectorAll('.type-cb').forEach(cb => { cb.checked = (cfg.disabledProjectTypes || []).includes(cb.value); });
    blockedList = Array.isArray(cfg.blockedProjects) ? [...cfg.blockedProjects] : [];
    renderBlocked();
    document.getElementById('jsonEditor').value = JSON.stringify(cfg, null, 2);
    validateJson();
  }

  function collectConfig() {
    return {
      modrinthInstallationWarning: document.getElementById('warningEnabled').checked,
      warningTitle: document.getElementById('warningTitle').value,
      warningMessage: document.getElementById('warningMessage').value,
      disabledProjectTypes: Array.from(document.querySelectorAll('.type-cb:checked')).map(cb => cb.value),
      blockedProjects: blockedList,
    };
  }

  function renderBlocked() {
    const el = document.getElementById('blocked-list');
    if (!blockedList.length) { el.innerHTML = '<p class="text-[10px] text-neutral-400">None</p>'; return; }
    el.innerHTML = blockedList.map(id =>
      '<div class="blocked-chip">' +
      '<code>' + esc(id) + '</code>' +
      '<button onclick="removeBlocked(\'' + esc(id) + '\')" class="text-neutral-400 hover:text-red-500 text-xs">x</button></div>'
    ).join('');
  }

  window.addBlocked = function() {
    const inp = document.getElementById('blockedInput');
    const v = inp.value.trim();
    if (!v || blockedList.includes(v)) return;
    blockedList.push(v); renderBlocked(); inp.value = '';
  };
  window.removeBlocked = function(id) { blockedList = blockedList.filter(x => x !== id); renderBlocked(); };

  async function saveConfig() {
    const cfg = collectConfig();
    const btn = document.getElementById('saveBtn');
    const status = document.getElementById('save-status');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/modrinth/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (data.success) {
        status.className = 'mb-3 p-3 rounded-lg text-xs bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20';
        status.textContent = 'Saved'; status.classList.remove('hidden');
        showToast('Saved', 'success');
        currentConfig = cfg;
        document.getElementById('configEditor').value = JSON.stringify(cfg, null, 2);
        loadFileStatus();
        setTimeout(() => status.classList.add('hidden'), 4000);
      } else {
        status.className = 'mb-3 p-3 rounded-lg text-xs bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20';
        status.textContent = data.error || 'Failed'; status.classList.remove('hidden');
      }
    } catch { showToast('Failed', 'error'); }
    finally { btn.textContent = 'Save'; btn.disabled = false; }
  }

  async function loadFileStatus() {
    try {
      const res = await fetch('/modrinth/api/file-status');
      const data = await res.json();
      const el = document.getElementById('fileStatus');
      if (data.success && data.data.exists) {
        el.innerHTML = '<div class="file-status-dot ok"></div><span class="text-green-600 dark:text-green-400">Exists</span> &middot; ' + data.data.size + ' bytes &middot; ' + new Date(data.data.lastModified).toLocaleString();
      } else {
        el.innerHTML = '<div class="file-status-dot warn"></div><span class="text-amber-500">Not created</span> — will be created on first save';
      }
    } catch {
      document.getElementById('fileStatus').innerHTML = '<div class="file-status-dot error"></div><span class="text-neutral-500">Could not load</span>';
    }
  }

  async function loadStatistics() {
    try {
      const res = await fetch('/modrinth/api/statistics');
      const data = await res.json();
      if (data.success) {
        document.getElementById('statInstalls').textContent = data.data.totalInstallations;
        document.getElementById('statProjects').textContent = data.data.activeProjects;
        document.getElementById('statBlocked').textContent = data.data.blockedInstallations;
      }
    } catch {}
  }

  async function clearCache() {
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/modrinth/api/cache/clear', { method: 'POST', headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
      const data = await res.json();
      showToast(data.success ? 'Cache cleared' : (data.error || 'Failed'), data.success ? 'success' : 'error');
    } catch { showToast('Failed', 'error'); }
  }

  window.applyTemplate = function(name) {
    const templates = {
      minimal: { modrinthInstallationWarning: false, warningTitle: '', warningMessage: '', disabledProjectTypes: [], blockedProjects: [] },
      permissive: { modrinthInstallationWarning: true, warningTitle: 'Notice', warningMessage: 'Modrinth access is monitored.', disabledProjectTypes: [], blockedProjects: [] },
      strict: { modrinthInstallationWarning: true, warningTitle: 'Warning', warningMessage: 'Only approved content allowed.', disabledProjectTypes: ['modpack', 'shader'], blockedProjects: [] },
    };
    const t = templates[name]; if (!t) return;
    populateFields(t);
    document.getElementById('configEditor').value = JSON.stringify(t, null, 2);
    showToast('Template applied', 'info');
  };

  function validateJson() {
    const el = document.getElementById('jsonEditor');
    const status = document.getElementById('jsonStatus');
    try { JSON.parse(el.value); status.textContent = 'Valid JSON'; status.className = 'text-[10px] text-green-600 dark:text-green-400'; }
    catch { status.textContent = 'Invalid JSON'; status.className = 'text-[10px] text-red-500'; }
  }

  window.applyJson = function() {
    const el = document.getElementById('jsonEditor');
    try {
      const cfg = JSON.parse(el.value);
      currentConfig = cfg;
      populateFields(cfg);
      document.getElementById('configEditor').value = JSON.stringify(cfg, null, 2);
      showToast('Applied', 'success');
    } catch { showToast('Invalid JSON', 'error'); }
  };

  function esc(t) { if (typeof t !== 'string') return String(t || ''); var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  document.getElementById('jsonEditor').addEventListener('input', validateJson);

  document.getElementById('configEditor').addEventListener('input', function() {
    try {
      const cfg = JSON.parse(this.value);
      currentConfig = cfg;
      populateFields(cfg);
      document.getElementById('jsonEditor').value = JSON.stringify(cfg, null, 2);
      validateJson();
    } catch {}
  });

  loadConfig();
})();
