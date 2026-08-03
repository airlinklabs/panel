/* inline script 1 */

const t = null;
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
const serverId = 'null';

const { showToast } = typeof createToastSystem === 'function' ? createToastSystem() : { showToast: (m) => console.warn('[databases]', m) };

function getFocusableElements(panel) {
  return Array.from((panel || document).querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && el.offsetParent !== null);
}

let lastAddModalFocus = null;

window.openAddDatabaseModal = () => {
  lastAddModalFocus = document.activeElement;
  document.getElementById('dbHostSelect').value = document.querySelector('#dbHostSelect option')?.value || '';
  Animate.openModal(document.getElementById('addDatabaseModal'), document.getElementById('addDatabasePanel'));
  const focusable = getFocusableElements(document.getElementById('addDatabasePanel'));
  (focusable[0] || document.getElementById('addDatabasePanel')).focus();
};

window.closeAddDatabaseModal = () => {
  Animate.closeModal(document.getElementById('addDatabaseModal'), document.getElementById('addDatabasePanel'));
  if (lastAddModalFocus) lastAddModalFocus.focus();
};

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('addDatabaseModal');
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    e.preventDefault();
    closeAddDatabaseModal();
    return;
  }
  if (e.key === 'Tab' && !modal.classList.contains('hidden')) {
    const focusable = getFocusableElements(document.getElementById('addDatabasePanel'));
    if (focusable.length === 0) return;
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
});

document.getElementById('confirmAddDatabase')?.addEventListener('click', async () => {
  const hostId = document.getElementById('dbHostSelect').value;
  if (!hostId) {
    showToast(t.selectDbHost || 'Select a database host.', 'error');
    return;
  }
  const btn = document.getElementById('confirmAddDatabase');
  btn.disabled = true;
  try {
    const response = await fetch('/server/' + serverId + '/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'csrf-token': csrfToken },
      body: JSON.stringify({ hostId }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      showToast(t.databaseCreated || 'Database created.', 'success');
      closeAddDatabaseModal();
      window.location.reload();
    } else {
      showToast(result.error || t.failedCreateDatabase || 'Failed to create database.', 'error');
    }
  } catch {
    showToast(t.requestFailed || 'Request failed. Try again?', 'error');
  } finally {
    btn.disabled = false;
  }
});

window.copyText = (text) => {
  navigator.clipboard.writeText(text).then(
    () => showToast(t.copiedToClipboard || 'Copied to clipboard.', 'success'),
    () => showToast(t.couldNotCopy || 'Could not copy.', 'error'),
  );
};

window.togglePassword = (id) => {
  const pass = document.getElementById('db-pass-' + id);
  const mask = document.getElementById('db-pass-mask-' + id);
  const hidden = pass.style.display === 'none';
  pass.style.display = hidden ? 'flex' : 'none';
  mask.style.display = hidden ? 'none' : 'flex';
};

window.rotatePassword = async (id) => {
  window.modal.confirm({
    title: t.rotatePasswordTitle || 'Rotate password',
    body: t.rotatePasswordConfirm || 'Generate a new password for this database user? Existing connections will be dropped.',
    confirmLabel: t.rotate || 'Rotate',
    onConfirm: async () => {
      try {
        const response = await fetch(`/server/${serverId}/databases/${id}/rotate-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'csrf-token': csrfToken },
        });
        const result = await response.json();
        if (response.ok && result.success) {
          const passEl = document.getElementById('db-pass-' + id);
          passEl.textContent = result.password;
          const dsnEl = document.getElementById('db-dsn-' + id);
          dsnEl.textContent = dsnEl.textContent.replace(/:[^@]+@/, ':' + result.password + '@');
          showToast(t.passwordRotated || 'Password rotated.', 'success');
        } else {
          showToast(result.error || t.failedRotatePassword || 'Failed to rotate password.', 'error');
        }
      } catch {
        showToast(t.requestFailed || 'Request failed. Try again?', 'error');
      }
    },
  });
};

window.deleteDatabase = async (id) => {
  window.modal.confirm({
    title: t.deleteDatabaseTitle || 'Delete database',
    body: t.deleteDatabaseConfirm || 'This will permanently delete the database and its user from the host. This cannot be undone.',
    danger: true,
    confirmLabel: t.delete || 'Delete',
    onConfirm: async () => {
      try {
        const response = await fetch(`/server/${serverId}/databases/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'csrf-token': csrfToken },
        });
        const result = await response.json();
        if (response.ok && result.success) {
          showToast(t.databaseDeleted || 'Database deleted.', 'success');
          window.location.reload();
        } else {
          showToast(result.error || t.failedDeleteDatabase || 'Failed to delete database.', 'error');
        }
      } catch {
        showToast(t.requestFailed || 'Request failed. Try again?', 'error');
      }
    },
  });
};
