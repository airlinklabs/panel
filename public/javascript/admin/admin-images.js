function handleRowClick(e, url) { if (!e.target.closest('button,a')) window.location = url; }

let modalReturnFocus = null;

function getFocusableElements(root) {
  return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function trapModalFocus(e, overlay) {
  const panel = overlay.querySelector('[role="dialog"]');
  if (!panel) return;
  if (e.key === 'Tab') {
    const focusable = getFocusableElements(panel);
    if (!focusable.length) { e.preventDefault(); panel.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function openCreate() {
  modalReturnFocus = document.activeElement;
  const overlay = document.getElementById('createOverlay');
  overlay.classList.add('open');
  Animate.openModal(overlay, overlay.querySelector('.modal-box'));
  overlay.querySelector('[role="dialog"]').focus();
}
function closeCreate() {
  const overlay = document.getElementById('createOverlay');
  overlay.classList.add('closing');
  const done = function () { overlay.classList.remove('open'); overlay.classList.remove('closing'); };
  Animate.closeModal(overlay, overlay.querySelector('.modal-box'), done);
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}
document.getElementById('createOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeCreate(); });

let _deleteId = null;
function openDelete(id, name) {
  modalReturnFocus = document.activeElement;
  _deleteId = id;
  document.getElementById('deleteMsg').textContent = '"' + name + '" will be permanently removed.';
  const overlay = document.getElementById('deleteOverlay');
  overlay.classList.add('open');
  Animate.openModal(overlay, overlay.querySelector('.modal-box'));
  overlay.querySelector('[role="dialog"]').focus();
}
function closeDelete() {
  const overlay = document.getElementById('deleteOverlay');
  overlay.classList.add('closing');
  const done = function () { overlay.classList.remove('open'); overlay.classList.remove('closing'); };
  Animate.closeModal(overlay, overlay.querySelector('.modal-box'), done);
  _deleteId = null;
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}
document.getElementById('deleteOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDelete(); });
document.addEventListener('keydown', function(e) {
  const openOverlay = document.querySelector('.modal-overlay.open');
  if (!openOverlay) return;
  if (e.key === 'Escape') { e.preventDefault(); openOverlay === document.getElementById('createOverlay') ? closeCreate() : closeDelete(); return; }
  trapModalFocus(e, openOverlay);
});
document.getElementById('deleteConfirm').addEventListener('click', async function() {
  if (!_deleteId) return;
  this.textContent = 'Deleting…'; this.disabled = true;
  const res = await fetch('/admin/images/delete/' + _deleteId, { method: 'DELETE' });
  if (res.ok) { showToast('Image deleted.', 'success'); setTimeout(() => location.reload(), 700); }
  else { showToast('Failed.', 'error'); this.textContent = 'Delete'; this.disabled = false; closeDelete(); }
});

document.getElementById('imageFilterInput')?.addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  let n = 0;
  document.querySelectorAll('.img-row').forEach(r => {
    const match = !q || r.dataset.search.includes(q);
    r.style.display = match ? '' : 'none';
    if (match) n++;
  });
  const el = document.getElementById('noResults');
  if (el) el.classList.toggle('hidden', n > 0 || !q);
});

document.getElementById('uploadBtn').addEventListener('click', function() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.click();
  inp.onchange = function() {
    const f = this.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = function(e) {
      try { JSON.parse(e.target.result); } catch { showToast('Invalid JSON.', 'error'); return; }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/admin/images/upload', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = () => xhr.status === 200 ? (showToast('Image uploaded.', 'success'), setTimeout(() => location.reload(), 800)) : showToast('Upload failed.', 'error');
      xhr.onerror = () => showToast('Upload failed.', 'error');
      xhr.send(e.target.result);
    };
    r.readAsText(f);
  };
});
