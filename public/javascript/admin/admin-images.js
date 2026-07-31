function handleRowClick(e, url) { if (!e.target.closest('button,a')) window.location = url; }

function openCreate() {
  const overlay = document.getElementById('createOverlay');
  overlay.classList.add('open');
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.set(panel, { y: 16, scale: 0.95, opacity: 0 }); Phys.to(panel, { y: 0, scale: 1, opacity: 1 }, { stiffness: 320, damping: 21 }); }
}
function closeCreate() {
  const overlay = document.getElementById('createOverlay');
  const done = function () { overlay.classList.remove('open'); };
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.exit(overlay, { panel: panel, done: done }); } else done();
}
document.getElementById('createOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeCreate(); });

let _deleteId = null;
function openDelete(id, name) {
  _deleteId = id;
  document.getElementById('deleteMsg').textContent = '"' + name + '" will be permanently removed.';
  const overlay = document.getElementById('deleteOverlay');
  overlay.classList.add('open');
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.set(panel, { y: 16, scale: 0.95, opacity: 0 }); Phys.to(panel, { y: 0, scale: 1, opacity: 1 }, { stiffness: 320, damping: 21 }); }
}
function closeDelete() {
  const overlay = document.getElementById('deleteOverlay');
  const done = function () { overlay.classList.remove('open'); };
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.exit(overlay, { panel: panel, done: done }); } else done();
  _deleteId = null;
}
document.getElementById('deleteOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDelete(); });
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
