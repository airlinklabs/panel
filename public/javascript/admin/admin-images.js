function handleRowClick(e, url) { if (!e.target.closest('button,a')) window.location = url; }

function openCreate() {
  window.modal.show({
    title: 'New Image',
    bodyNode: document.getElementById('createContent'),
    panelClass: 'max-w-xl',
  });
}
function closeCreate() {
  window.modal.close();
}

let _deleteId = null;
function openDelete(id, name) {
  _deleteId = id;
  window.modal.confirm({
    title: 'Delete image?',
    body: '"' + name + '" will be permanently removed.',
    danger: true,
    confirmLabel: 'Delete',
    onConfirm: deleteImage,
  });
}
function closeDelete() {
  _deleteId = null;
  window.modal.close();
}
async function deleteImage() {
  if (!_deleteId) return;
  const res = await fetch('/admin/images/delete/' + _deleteId, { method: 'DELETE' });
  if (res.ok) { showToast('Image deleted.', 'success'); setTimeout(() => location.reload(), 700); }
  else { showToast('Failed.', 'error'); }
}

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

const importUrlBtn = document.getElementById('importUrlBtn');
if (importUrlBtn) {
  importUrlBtn.addEventListener('click', () => {
    const panel = document.getElementById('importUrlPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) document.getElementById('importUrlInput').focus();
  });
  document.getElementById('importUrlSubmit').addEventListener('click', async () => {
    const url = document.getElementById('importUrlInput').value.trim();
    if (!url) { showToast('Enter a URL.', 'error'); return; }
    const btn = document.getElementById('importUrlSubmit');
    btn.disabled = true; btn.classList.add('opacity-60');
    try {
      const r = await fetch('/admin/images/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast(d.message || 'Image imported.', 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(d.error || 'Import failed.', 'error');
      }
    } catch {
      showToast('Import failed.', 'error');
    } finally {
      btn.disabled = false; btn.classList.remove('opacity-60');
    }
  });
}
