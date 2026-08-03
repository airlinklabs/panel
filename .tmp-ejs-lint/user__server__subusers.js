/* inline script 1 */

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
const serverId = 'null';
let editingSubUserId = null;

const { showToast } = typeof createToastSystem === 'function' ? createToastSystem() : { showToast: (m) => console.warn('[subusers]', m) };

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  Animate.openModal(el, el.querySelector('.al-sheet-panel'));
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  Animate.closeModal(el, el.querySelector('.al-sheet-panel'));
}
window.closeModal = closeModal;

document.querySelectorAll('.perm-select-all, .perm-select-none').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = document.getElementById(btn.dataset.modal);
    if (!modal) return;
    const selectAll = btn.classList.contains('perm-select-all');
    modal.querySelectorAll('.add-perm, .edit-perm').forEach(cb => cb.checked = selectAll);
  });
});

window.openAddSubUserModal = () => {
  document.getElementById('addSubUserEmail').value = '';
  document.querySelectorAll('.add-perm').forEach(cb => cb.checked = true);
  openModal('addSubUserModal');
};

window.openEditSubUserModal = (id, name, permissions) => {
  editingSubUserId = id;
  document.getElementById('editSubUserName').textContent = name;
  document.querySelectorAll('.edit-perm').forEach(cb => cb.checked = permissions.includes(cb.value));
  openModal('editSubUserModal');
};

async function api(url, method, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    showToast(err.message || 'Something went wrong.', 'error');
    return null;
  }
}

document.getElementById('confirmAddSubUser')?.addEventListener('click', async () => {
  const email = document.getElementById('addSubUserEmail').value.trim();
  if (!email) { showToast('Enter the user email.', 'error'); return; }
  const permissions = [...document.querySelectorAll('.add-perm:checked')].map(cb => cb.value);
  const result = await api('/server/' + serverId + '/subusers', 'POST', { email, permissions });
  if (result) {
    showToast('Subuser added.', 'success');
    setTimeout(() => location.reload(), 900);
  }
});

document.getElementById('confirmEditSubUser')?.addEventListener('click', async () => {
  if (!editingSubUserId) return;
  const permissions = [...document.querySelectorAll('.edit-perm:checked')].map(cb => cb.value);
  const result = await api('/server/' + serverId + '/subusers/' + editingSubUserId, 'PUT', { permissions });
  if (result) {
    showToast('Permissions updated.', 'success');
    setTimeout(() => location.reload(), 900);
  }
});

window.removeSubUser = async (id, name) => {
  const t = req.translations;
  await new Promise(resolve => {
    window.modal.confirm({
      title: t.removeSubuserTitle || 'Remove subuser',
      body: (t.removeSubuserBodyBefore || 'Remove ') + name + (t.removeSubuserBodyAfter || ' from this server? They will lose access immediately.'),
      danger: true,
      confirmLabel: t.removeLabel || 'Remove',
      onConfirm: resolve,
    });
  });
  const result = await api('/server/' + serverId + '/subusers/' + id, 'DELETE');
  if (result) {
    showToast('Subuser removed.', 'success');
    setTimeout(() => location.reload(), 900);
  }
};
