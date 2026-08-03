/* inline script 1 */

  let activeModalId = null;
  let modalReturnFocus = null;

  function getFocusableElements(root) {
    return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('API key copied to clipboard', 'success');
    }).catch(err => {
      console.error('Could not copy text: ', err);
      showToast('Failed to copy to clipboard', 'error');
    });
  }


  const createApiKeyBtn = document.getElementById('createApiKeyBtn');
  const createApiKeyModal = document.getElementById('createApiKeyModal');
  const createApiKeyPanel = document.getElementById('createApiKeyPanel');

  createApiKeyBtn.addEventListener('click', () => {
    modalReturnFocus = document.activeElement;
    activeModalId = 'createApiKeyModal';
    createApiKeyModal.setAttribute('aria-hidden', 'false');
    createApiKeyModal.classList.remove('hidden');
    createApiKeyModal.classList.add('flex');
    Animate.openModal(createApiKeyModal, createApiKeyPanel);
    const focusable = getFocusableElements(createApiKeyPanel || createApiKeyModal);
    (focusable[0] || createApiKeyPanel || createApiKeyModal).focus();
  });

  function hideCreateModal() {
    createApiKeyModal.setAttribute('aria-hidden', 'true');
    const done = function () {
      createApiKeyModal.classList.add('hidden');
      createApiKeyModal.classList.remove('flex');
      if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
      modalReturnFocus = null;
      activeModalId = null;
    };
    Animate.closeModal(createApiKeyModal, createApiKeyPanel, done);
  }

  function toggleCategory(btn) {
    const panel = btn.nextElementSibling;
    const chevron = btn.querySelector('.category-chevron');
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      panel.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      chevron.classList.remove('rotate-180');
      setTimeout(() => {
        if (!panel.classList.contains('open')) panel.classList.add('hidden');
      }, 200);
    } else {
      panel.classList.remove('hidden');
      panel.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      chevron.classList.add('rotate-180');
    }
  }

  function updateCategoryCount(category) {
    const total = document.querySelectorAll(`#createApiKeyModal .permission-checkbox[data-category="${category}"]`).length;
    const checked = document.querySelectorAll(`#createApiKeyModal .permission-checkbox[data-category="${category}"]:checked`).length;
    const countEl = document.querySelector(`#createApiKeyModal .category-count[data-category="${category}"]`);
    if (countEl) countEl.textContent = checked === 0 ? '' : `${checked}/${total}`;

    document.querySelectorAll(`#createApiKeyModal .permission-checkbox[data-category="${category}"]`).forEach(cb => {
      const label = cb.closest('.permission-label');
      const text = label.querySelector('.permission-label-text');
      if (cb.checked) {
        label.classList.add('border-neutral-900', 'dark:border-white/30', 'bg-neutral-900', 'dark:bg-white/10');
        label.classList.remove('border-neutral-100', 'dark:border-neutral-700/40', 'bg-neutral-50', 'dark:bg-neutral-800/50');
        text.classList.add('text-white', 'dark:text-white');
        text.classList.remove('text-neutral-600', 'dark:text-neutral-300');
      } else {
        label.classList.remove('border-neutral-900', 'dark:border-white/30', 'bg-neutral-900', 'dark:bg-white/10');
        label.classList.add('border-neutral-100', 'dark:border-neutral-700/40', 'bg-neutral-50', 'dark:bg-neutral-800/50');
        text.classList.remove('text-white', 'dark:text-white');
        text.classList.add('text-neutral-600', 'dark:text-neutral-300');
      }
    });
  }

  const presetPermissions = {
    'full-admin': [
      'airlink.api.servers.read', 'airlink.api.servers.create', 'airlink.api.servers.update', 'airlink.api.servers.delete',
      'airlink.api.users.read', 'airlink.api.users.create', 'airlink.api.users.update', 'airlink.api.users.delete',
      'airlink.api.nodes.read', 'airlink.api.nodes.create', 'airlink.api.nodes.update', 'airlink.api.nodes.delete',
      'airlink.api.settings.read', 'airlink.api.settings.update'
    ],
    'read-only': [
      'airlink.api.servers.read', 'airlink.api.users.read', 'airlink.api.nodes.read', 'airlink.api.settings.read'
    ],
    'server-manager': [
      'airlink.api.servers.read', 'airlink.api.servers.create', 'airlink.api.servers.update', 'airlink.api.servers.delete',
      'airlink.api.nodes.read'
    ],
    'user-manager': [
      'airlink.api.users.read', 'airlink.api.users.create', 'airlink.api.users.update', 'airlink.api.users.delete',
      'airlink.api.servers.read'
    ],
    'node-monitor': [
      'airlink.api.nodes.read', 'airlink.api.servers.read'
    ],
    'none': []
  };

  document.querySelectorAll('#createApiKeyModal .preset-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const preset = this.dataset.preset;
      const allowed = presetPermissions[preset] || [];

      document.querySelectorAll('#createApiKeyModal .permission-checkbox').forEach(cb => {
        cb.checked = allowed.includes(cb.value);
      });

      ['servers', 'users', 'nodes', 'settings'].forEach(cat => updateCategoryCount(cat));

      document.querySelectorAll('#createApiKeyModal .preset-btn').forEach(b => {
        b.classList.remove('bg-neutral-900', 'dark:bg-white', 'text-white', 'dark:text-neutral-900', 'border-neutral-900', 'dark:border-white');
        b.classList.add('bg-white', 'dark:bg-neutral-800', 'text-neutral-700', 'dark:text-neutral-300', 'border-neutral-200', 'dark:border-neutral-700');
      });
      this.classList.remove('bg-white', 'dark:bg-neutral-800', 'text-neutral-700', 'dark:text-neutral-300', 'border-neutral-200', 'dark:border-neutral-700');
      this.classList.add('bg-neutral-900', 'dark:bg-white', 'text-white', 'dark:text-neutral-900', 'border-neutral-900', 'dark:border-white');
    });
  });


  const editApiKeyModal = document.getElementById('editApiKeyModal');
  const editApiKeyModalPanel = document.getElementById('editApiKeyModalPanel');
  const editApiKeyModalBackdrop = document.getElementById('editApiKeyModalBackdrop');
  const editApiKeyForm = document.getElementById('editApiKeyForm');
  const editNameInput = document.getElementById('edit-name');
  const editDescriptionInput = document.getElementById('edit-description');

  function showEditModal(id, name, description, permissions) {
    modalReturnFocus = document.activeElement;
    activeModalId = 'editApiKeyModal';
    editApiKeyForm.action = `/admin/apikeys/edit/${id}`;
    editNameInput.value = name;
    editDescriptionInput.value = description || '';

    document.querySelectorAll('[id^="edit-permission-"]').forEach(cb => cb.checked = false);

    try {
      const perms = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
      perms.forEach(p => {
        const cb = document.getElementById(`edit-permission-${p}`);
        if (cb) cb.checked = true;
      });
    } catch (e) {
      console.error('Error parsing permissions:', e);
      showToast('Could not load permissions for this API key.', 'error');
    }

    editApiKeyModal.setAttribute('aria-hidden', 'false');
    editApiKeyModal.classList.remove('hidden');
    editApiKeyModal.classList.add('flex');
    Animate.openModal(editApiKeyModal, editApiKeyModalPanel);
    editNameInput.focus();
  }

  function hideEditModal() {
    editApiKeyModal.setAttribute('aria-hidden', 'true');
    const done = function () {
      editApiKeyModal.classList.add('hidden');
      editApiKeyModal.classList.remove('flex');
      if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
      modalReturnFocus = null;
      activeModalId = null;
    };
    Animate.closeModal(editApiKeyModal, editApiKeyModalPanel, done);
  }

  editApiKeyModalBackdrop.addEventListener('click', hideEditModal);

  document.addEventListener('keydown', function(e) {
    if (!activeModalId) return;
    const modal = document.getElementById(activeModalId);
    const panel = modal.querySelector('[role="dialog"]');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (activeModalId === 'createApiKeyModal') hideCreateModal();
      else hideEditModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(panel);
    if (!focusable.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });


  document.querySelectorAll('.select-category').forEach(button => {
    button.addEventListener('click', function() {
      const category = this.getAttribute('data-category');
      const checkboxes = document.querySelectorAll(`.permission-checkbox[data-category="${category}"]`);


      const allSelected = Array.from(checkboxes).every(cb => cb.checked);


      checkboxes.forEach(checkbox => {
        checkbox.checked = !allSelected;
      });


      this.textContent = allSelected ? 'Select All' : 'Deselect All';
    });
  });

  document.querySelectorAll('.edit-select-category').forEach(button => {
    button.addEventListener('click', function() {
      const category = this.getAttribute('data-category');
      const checkboxes = document.querySelectorAll(`.edit-permission-checkbox[data-category="${category}"]`);


      const allSelected = Array.from(checkboxes).every(cb => cb.checked);


      checkboxes.forEach(checkbox => {
        checkbox.checked = !allSelected;
      });


      this.textContent = allSelected ? 'Select All' : 'Deselect All';
    });
  });


  document.getElementById('editSelectAllBtn').addEventListener('click', function() {
    document.querySelectorAll('.edit-permission-checkbox').forEach(checkbox => {
      checkbox.checked = true;
    });
    showToast('All permissions selected', 'success');
  });

  document.getElementById('editSelectNoneBtn').addEventListener('click', function() {
    document.querySelectorAll('.edit-permission-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    showToast('All permissions cleared', 'success');
  });

  document.getElementById('editSelectReadOnlyBtn').addEventListener('click', function() {

    document.querySelectorAll('.edit-permission-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });


    document.querySelectorAll('.edit-permission-checkbox').forEach(checkbox => {
      if (checkbox.value.includes('.read')) {
        checkbox.checked = true;
      }
    });

    showToast('Read-only permissions selected', 'success');
  });

  async function postForm(form, successMessage) {
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      });
      if (res.ok) {
        showToast(successMessage, 'success');
        setTimeout(function() { location.reload(); }, 700);
        return true;
      }
      let msg = 'Something went wrong. Try again.';
      try { const data = await res.json(); msg = data.error || data.message || msg; } catch (e) {}
      showToast(msg, 'error');
      return false;
    } catch (e) {
      console.error('Request failed:', e);
      showToast('Network error — try again.', 'error');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  const createApiKeyForm = document.getElementById('createApiKeyForm');
  if (createApiKeyForm) {
    createApiKeyForm.addEventListener('submit', function(e) {
      e.preventDefault();
      postForm(createApiKeyForm, 'API key created').then(function(ok) {
        if (ok) hideCreateModal();
      });
    });
  }

  document.querySelectorAll('form[id^="toggleKeyForm_"]').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const enabling = form.querySelector('button[type="submit"]').getAttribute('aria-label')?.includes('Enable');
      postForm(form, enabling ? 'API key enabled' : 'API key disabled');
    });
  });

  editApiKeyForm.addEventListener('submit', function(e) {
    e.preventDefault();
    postForm(editApiKeyForm, 'API key updated').then(function(ok) {
      if (ok) hideEditModal();
    });
  });

  const createdKeyModal = document.getElementById('createdKeyModal');
  if (createdKeyModal) {
    const createdKeyPanel = document.getElementById('createdKeyPanel');
    createdKeyModal.classList.remove('hidden');
    createdKeyModal.classList.add('flex');
    createdKeyModal.setAttribute('aria-hidden', 'false');
    Animate.openModal(createdKeyModal, createdKeyPanel);
    if (createdKeyPanel) createdKeyPanel.focus();
    window.hideCreatedKeyModal = function() {
      const done = function () {
        createdKeyModal.classList.add('hidden');
        createdKeyModal.classList.remove('flex');
        createdKeyModal.setAttribute('aria-hidden', 'true');
        history.replaceState({}, '', '/admin/apikeys');
      };
      Animate.closeModal(createdKeyModal, createdKeyPanel, done);
    };
    window.copyCreatedKey = function() {
      copyToClipboard('null');
    };
  }

/* inline script 2 */
