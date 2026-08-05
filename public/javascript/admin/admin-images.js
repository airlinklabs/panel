const IMAGE_DELETE_RELOAD_DELAY_MS = 700;
const IMAGE_IMPORT_RELOAD_DELAY_MS = 800;

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
  if (res.ok) { showToast('Image deleted.', 'success'); setTimeout(() => location.reload(), IMAGE_DELETE_RELOAD_DELAY_MS); }
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

window.selectedImageFile = null;

function openUploadImageModal() {
  const modal = document.getElementById('uploadImageModal');
  if (!modal) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');
  Animate.openModal(modal, document.getElementById('uploadImageModalPanel'));
  removeSelectedImageFile();
  const fileInput = document.getElementById('imageFileInput');
  if (fileInput) fileInput.value = '';
}

function closeUploadImageModal() {
  const modal = document.getElementById('uploadImageModal');
  if (!modal) return;
  Animate.closeModal(modal, document.getElementById('uploadImageModalPanel'), function() {
    modal.classList.add('opacity-0', 'pointer-events-none');
  });
}

function removeSelectedImageFile() {
  window.selectedImageFile = null;
  const preview = document.getElementById('imageFilePreview');
  const dropZone = document.getElementById('imageDropZone');
  const btn = document.getElementById('imageUploadButton');
  if (preview) preview.classList.add('hidden');
  if (dropZone) dropZone.classList.remove('hidden');
  if (btn) btn.disabled = true;
}

function formatImageFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleImageFileSelection(file) {
  if (!file) return;
  window.selectedImageFile = file;
  document.getElementById('imageSelectedFileName').textContent = file.name;
  document.getElementById('imageSelectedFileSize').textContent = formatImageFileSize(file.size);
  document.getElementById('imageFilePreview').classList.remove('hidden');
  document.getElementById('imageDropZone').classList.add('hidden');
  document.getElementById('imageUploadButton').disabled = false;
}

function confirmImageUpload() {
  if (!window.selectedImageFile) { showToast('Select a JSON file to upload.', 'error'); return; }
  const file = window.selectedImageFile;
  closeUploadImageModal();
  const r = new FileReader();
  r.onload = function(e) {
    try { JSON.parse(e.target.result); } catch { showToast('Invalid JSON.', 'error'); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/admin/images/upload', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => xhr.status === 200 ? (showToast('Image uploaded.', 'success'), setTimeout(() => location.reload(), IMAGE_IMPORT_RELOAD_DELAY_MS)) : showToast('Upload failed.', 'error');
    xhr.onerror = () => showToast('Upload failed.', 'error');
    xhr.send(e.target.result);
  };
  r.readAsText(file);
}

document.getElementById('uploadBtn').addEventListener('click', openUploadImageModal);

document.addEventListener('DOMContentLoaded', function() {
  const dropZone = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('imageFileInput');
  const uploadButton = document.getElementById('imageUploadButton');
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.style.background = 'var(--theme-bg-hover)';
      dropZone.style.borderColor = 'var(--theme-accent)';
    });
    dropZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      dropZone.style.background = '';
      dropZone.style.borderColor = 'var(--theme-border)';
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.style.background = '';
      dropZone.style.borderColor = 'var(--theme-border)';
      if (e.dataTransfer.files.length > 0) handleImageFileSelection(e.dataTransfer.files[0]);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      if (e.target.files.length > 0) handleImageFileSelection(e.target.files[0]);
    });
  }
  if (uploadButton) {
    uploadButton.addEventListener('click', confirmImageUpload);
  }
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
        setTimeout(() => location.reload(), IMAGE_IMPORT_RELOAD_DELAY_MS);
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
