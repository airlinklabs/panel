(function() {
  var pageData = document.getElementById('page-data');
  var currentSettings = {};
  try { currentSettings = JSON.parse(pageData.dataset.modrinthSettings || '{}'); } catch (e) {}
  var PROJECT_TYPES = ['mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin'];

  document.addEventListener('DOMContentLoaded', function() {
    setupTabs();
    loadCurrentSettings();
    refreshFileStatus();
    setupProjectTypeButtons();
    setupJsonEditor();
    document.getElementById('newProjectId').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') addBlockedProject();
    });
  });

  /* ── Tabs ─────────────────────────────────────────────────────── */
  function setupTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.getAttribute('data-tab');
        btns.forEach(function(b) {
          b.classList.remove('text-neutral-800', 'dark:text-white', 'border-neutral-800', 'dark:border-white');
          b.classList.add('text-neutral-400', 'border-transparent');
        });
        btn.classList.add('text-neutral-800', 'dark:text-white', 'border-neutral-800', 'dark:border-white');
        btn.classList.remove('text-neutral-400', 'border-transparent');
        panels.forEach(function(p) { p.classList.add('hidden'); });
        var active = document.querySelector('[data-tab-panel="' + target + '"]');
        if (active) active.classList.remove('hidden');
      });
    });
    // Activate first tab
    if (btns.length) btns[0].click();
  }

  /* ── Project type pills ───────────────────────────────────────── */
  function setupProjectTypeButtons() {
    var container = document.getElementById('projectTypeButtons');
    if (!container) return;
    container.innerHTML = '';
    PROJECT_TYPES.forEach(function(type) {
      var btn = document.createElement('button');
      btn.setAttribute('data-type', type);
      btn.type = 'button';
      btn.className = 'px-3 py-1.5 text-xs border rounded-xl font-medium transition-colors border-neutral-200 dark:border-neutral-600/30 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-500 bg-neutral-100 dark:bg-neutral-700/20';
      btn.textContent = type;
      btn.addEventListener('click', function() { toggleProjectType(type); });
      container.appendChild(btn);
    });
  }

  function updateProjectTypeButtons() {
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      var disabled = settings.disabledProjectTypes || [];
      document.querySelectorAll('[data-type]').forEach(function(btn) {
        var type = btn.getAttribute('data-type');
        if (disabled.includes(type)) {
          btn.className = 'px-3 py-1.5 text-xs border rounded-xl font-medium transition-colors bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400';
        } else {
          btn.className = 'px-3 py-1.5 text-xs border rounded-xl font-medium transition-colors border-neutral-200 dark:border-neutral-600/30 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-500 bg-neutral-100 dark:bg-neutral-700/20';
        }
      });
    } catch (e) {}
  }

  function toggleProjectType(type) {
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      if (!Array.isArray(settings.disabledProjectTypes)) settings.disabledProjectTypes = [];
      var idx = settings.disabledProjectTypes.indexOf(type);
      if (idx > -1) settings.disabledProjectTypes.splice(idx, 1); else settings.disabledProjectTypes.push(type);
      updateJsonEditor(settings);
      updateProjectTypeButtons();
    } catch (e) { showToast('Could not parse JSON', 'error'); }
  }

  /* ── Blocked projects ─────────────────────────────────────────── */
  function addBlockedProject() {
    var input = document.getElementById('newProjectId');
    var id = input.value.trim();
    if (!id) { showToast('Enter a project ID', 'error'); return; }
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      if (!Array.isArray(settings.blockedProjects)) settings.blockedProjects = [];
      if (settings.blockedProjects.includes(id)) { showToast('Already blocked', 'warning'); return; }
      settings.blockedProjects.push(id);
      updateJsonEditor(settings);
      updateBlockedProjectsList();
      input.value = '';
      showToast('"' + id + '" added to blocked list', 'success');
    } catch (e) { showToast('Could not parse JSON', 'error'); }
  }

  function removeBlockedProject(id) {
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      if (!Array.isArray(settings.blockedProjects)) return;
      var idx = settings.blockedProjects.indexOf(id);
      if (idx > -1) { settings.blockedProjects.splice(idx, 1); updateJsonEditor(settings); updateBlockedProjectsList(); }
    } catch (e) { showToast('Could not update', 'error'); }
  }
  window.removeBlockedProject = removeBlockedProject;

  function updateBlockedProjectsList() {
    var container = document.getElementById('blockedProjectsList');
    if (!container) return;
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      var list = settings.blockedProjects || [];
      if (!list.length) { container.innerHTML = '<p class="text-sm text-neutral-400">No blocked projects.</p>'; return; }
      container.innerHTML = list.map(function(id) {
        return '<div class="flex items-center justify-between rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 px-4 py-2.5">' +
          '<span class="text-sm font-mono text-neutral-700 dark:text-neutral-300">' + escapeHtml(id) + '</span>' +
          '<button onclick="removeBlockedProject(\'' + escapeHtml(id) + '\')" type="button" class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition">Remove</button>' +
          '</div>';
      }).join('');
    } catch (e) {}
  }

  /* ── Easy settings sync ───────────────────────────────────────── */
  function applyEasySettings() {
    try {
      var settings = JSON.parse(document.getElementById('jsonEditor').value);
      settings.modrinthInstallationWarning = document.getElementById('enableWarning').checked;
      settings.warningTitle = document.getElementById('warningTitle').value.trim() || 'Installation Temporarily Disabled';
      settings.warningMessage = document.getElementById('warningMessage').value.trim() || '';
      updateJsonEditor(settings);
      showToast('Settings applied to JSON', 'success');
    } catch (e) { showToast('Could not parse JSON', 'error'); }
  }

  /* ── Load / save ──────────────────────────────────────────────── */
  function loadCurrentSettings() {
    fetch('/modrinth/api/config', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data) {
          currentSettings = data.data;
          updateJsonEditor(currentSettings);
          updateEasyUI(currentSettings);
          updateProjectTypeButtons();
          updateBlockedProjectsList();
        }
      })
      .catch(function() {
        updateJsonEditor(currentSettings);
        updateEasyUI(currentSettings);
        updateProjectTypeButtons();
        updateBlockedProjectsList();
      });
  }

  function updateEasyUI(s) {
    var ew = document.getElementById('enableWarning');
    var wt = document.getElementById('warningTitle');
    var wm = document.getElementById('warningMessage');
    if (ew) ew.checked = !!s.modrinthInstallationWarning;
    if (wt) wt.value = s.warningTitle || '';
    if (wm) wm.value = s.warningMessage || '';
  }

  function saveSettings() {
    var parsed;
    try { parsed = JSON.parse(document.getElementById('jsonEditor').value); } catch (e) { showToast('Invalid JSON', 'error'); return; }
    fetch('/modrinth/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(parsed) })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.success) showToast('Configuration saved', 'success'); else throw new Error(d.error || 'Save failed'); })
      .catch(function(e) { showToast(e.message, 'error'); });
  }

  /* ── JSON editor ──────────────────────────────────────────────── */
  function updateJsonEditor(s) {
    document.getElementById('jsonEditor').value = JSON.stringify(s, null, 2);
    updateCharacterCount();
  }

  function setupJsonEditor() {
    var editor = document.getElementById('jsonEditor');
    editor.addEventListener('input', updateCharacterCount);
    editor.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveSettings(); }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); formatJson(); }
    });
  }

  function updateCharacterCount() {
    document.getElementById('characterCount').textContent = document.getElementById('jsonEditor').value.length + ' characters';
    document.getElementById('jsonValid').classList.add('hidden');
    document.getElementById('jsonInvalid').classList.add('hidden');
  }

  function formatJson() {
    try {
      document.getElementById('jsonEditor').value = JSON.stringify(JSON.parse(document.getElementById('jsonEditor').value), null, 2);
      updateCharacterCount();
      showToast('JSON formatted', 'success');
    } catch (e) { showToast('Invalid JSON', 'error'); }
  }

  function validateJson() {
    try {
      JSON.parse(document.getElementById('jsonEditor').value);
      document.getElementById('jsonValid').classList.remove('hidden');
      document.getElementById('jsonInvalid').classList.add('hidden');
      showToast('JSON is valid', 'success');
    } catch (e) {
      document.getElementById('jsonValid').classList.add('hidden');
      document.getElementById('jsonInvalid').classList.remove('hidden');
      showToast(e.message, 'error');
    }
  }

  function resetToDefaults() {
    var d = { modrinthInstallationWarning: false, warningTitle: 'Installation Temporarily Disabled', warningMessage: 'Installations are temporarily disabled.', disabledProjectTypes: [], blockedProjects: [] };
    updateJsonEditor(d); updateEasyUI(d); updateProjectTypeButtons(); updateBlockedProjectsList();
    showToast('Defaults loaded', 'info');
  }

  function loadTemplate(type) {
    var t = {
      restrictive: { modrinthInstallationWarning: true, warningTitle: 'Installation Disabled', warningMessage: 'Mod installation is currently restricted.', disabledProjectTypes: ['shader', 'resourcepack'], blockedProjects: [] },
      permissive: { modrinthInstallationWarning: false, warningTitle: '', warningMessage: '', disabledProjectTypes: [], blockedProjects: [] }
    }[type];
    if (!t) return;
    updateJsonEditor(t); updateEasyUI(t); updateProjectTypeButtons(); updateBlockedProjectsList();
    showToast(type + ' template loaded', 'success');
  }

  /* ── File status ──────────────────────────────────────────────── */
  function refreshFileStatus() {
    fetch('/modrinth/api/file-status', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var el = document.getElementById('fileStatus');
        if (data.success && data.data) {
          var f = data.data;
          el.innerHTML = '<div class="w-2 h-2 bg-emerald-500 rounded-full"></div>' +
            '<span class="text-sm text-neutral-700 dark:text-neutral-300">File found</span>' +
            (f.size ? '<span class="text-xs text-neutral-400 dark:text-neutral-600 ml-4">' + f.size + ' bytes</span>' : '') +
            (f.lastModified ? '<span class="text-xs text-neutral-400 dark:text-neutral-600 ml-2">Modified ' + new Date(f.lastModified).toLocaleString() + '</span>' : '');
        } else {
          el.innerHTML = '<div class="w-2 h-2 bg-amber-500 rounded-full"></div>' +
            '<span class="text-sm text-neutral-500 dark:text-neutral-400">File not found — will be created on save</span>';
        }
      })
      .catch(function() {
        document.getElementById('fileStatus').innerHTML = '<div class="w-2 h-2 bg-red-500 rounded-full"></div>' +
          '<span class="text-sm text-neutral-500">Could not check file status</span>';
      });
  }

  function escapeHtml(t) { if (typeof t !== 'string') return String(t || ''); var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
})();
