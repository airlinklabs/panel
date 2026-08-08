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

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function imageRowHtml(image) {
  return '<tr class="al-table-tr transition-colors cursor-pointer img-row" data-search="' + esc((image.name + ' ' + (image.author || '')).toLowerCase()) + '" onclick="handleRowClick(event, \'/admin/images/edit/' + image.id + '\')">' +
    '<td class="al-table-td whitespace-nowrap py-4 pl-6 pr-3 font-medium" style="color:var(--theme-text-strong)">' + esc(image.name) + '</td>' +
    '<td class="al-table-td whitespace-nowrap px-3 py-4 col-hide">' + esc(image.author || '—') + '</td>' +
    '<td class="al-table-td whitespace-nowrap px-3 py-4 col-hide">' + esc(new Date(image.createdAt).toLocaleDateString()) + '</td>' +
    '<td class="whitespace-nowrap px-3 py-4 text-sm"><div class="flex gap-2">' +
    '<a href="/admin/images/edit/' + image.id + '" onclick="event.stopPropagation()" class="al-btn-secondary px-3 py-2 text-sm font-medium shadow-lg transition inline-flex items-center gap-1.5">' + (window.alIcon ? alIcon('pencil', 'size-4') : '') + 'Edit</a>' +
    '<a href="/admin/images/export/' + image.id + '" onclick="event.stopPropagation()" class="al-btn-secondary px-3 py-2 text-sm font-medium shadow-lg transition inline-flex items-center gap-1.5">' + (window.alIcon ? alIcon('download', 'size-4') : '') + 'Export</a>' +
    '<button onclick="event.stopPropagation(); openDelete(\'' + image.id + '\', \'' + esc(image.name).replace(/'/g, "\\'") + '\')" type="button" class="al-btn-danger" aria-label="Delete image ' + esc(image.name) + '">' + (window.alIcon ? alIcon('trash-2', 'size-4') : '') + '</button>' +
    '</div></td></tr>';
}

async function renderImageTable() {
  const res = await fetch('/admin/images/list');
  const data = await res.json();
  const tbody = document.getElementById('tableBody');
  if (!tbody || !data.success) return;
  const searchInput = document.getElementById('imageFilterInput');
  const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
  tbody.innerHTML = data.images.map(imageRowHtml).join('');
  let n = 0;
  tbody.querySelectorAll('.img-row').forEach(function (r) {
    const match = !q || r.dataset.search.includes(q);
    r.style.display = match ? '' : 'none';
    if (match) n++;
  });
  const noResults = document.getElementById('noResults');
  if (noResults) noResults.classList.toggle('hidden', data.images.length === 0 || n > 0 || !q);
  const installedCountEl = document.getElementById('tabCountInstalled');
  if (installedCountEl) installedCountEl.textContent = data.images.length;
  const installedTextEl = document.getElementById('installedImagesCount');
  if (installedTextEl) installedTextEl.textContent = data.images.length;
  if (window.alTableScan) alTableScan(tbody);
}

async function deleteImage() {
  if (!_deleteId) return;
  const res = await fetch('/admin/images/delete/' + _deleteId, { method: 'DELETE' });
  if (res.ok) {
    showToast('Image deleted.', 'success');
    await renderImageTable();
  } else {
    showToast('Failed.', 'error');
  }
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
  setUploadMode('file');
  const modal = document.getElementById('uploadImageModal');
  if (!modal) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');
  Animate.openModal(modal, document.getElementById('uploadImageModalPanel'));
  removeSelectedImageFile();
  const fileInput = document.getElementById('imageFileInput');
  if (fileInput) fileInput.value = '';
}

function setUploadMode(mode) {
  const isUrl = mode === 'url';
  const fileBtn = document.getElementById('uploadModeFile');
  const urlBtn = document.getElementById('uploadModeUrl');
  const fileSection = document.getElementById('uploadFileSection');
  const urlSection = document.getElementById('importUrlSection');
  const uploadBtn = document.getElementById('imageUploadButton');
  const submitBtn = document.getElementById('importUrlSubmit');
  const active = 'color:var(--theme-text-strong); background:var(--theme-bg-card);';
  const idle = 'color:var(--theme-text-muted);';
  if (fileBtn) fileBtn.setAttribute('style', isUrl ? idle : active);
  if (urlBtn) urlBtn.setAttribute('style', isUrl ? active : idle);
  if (fileSection) fileSection.classList.toggle('hidden', isUrl);
  if (urlSection) urlSection.classList.toggle('hidden', !isUrl);
  if (uploadBtn) uploadBtn.classList.toggle('hidden', isUrl);
  if (submitBtn) submitBtn.classList.toggle('hidden', !isUrl);
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
    xhr.onload = () => {
      if (xhr.status === 200) {
        showToast('Image uploaded.', 'success');
        renderImageTable();
      } else {
        showToast('Upload failed.', 'error');
      }
    };
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

const importUrlSubmit = document.getElementById('importUrlSubmit');
if (importUrlSubmit) {
  importUrlSubmit.addEventListener('click', async () => {
    const url = document.getElementById('importUrlInput').value.trim();
    if (!url) { showToast('Enter a URL.', 'error'); return; }
    const btn = importUrlSubmit;
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
        renderImageTable();
        closeUploadImageModal();
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

document.getElementById('uploadModeFile').addEventListener('click', () => setUploadMode('file'));
document.getElementById('uploadModeUrl').addEventListener('click', () => {
  setUploadMode('url');
  document.getElementById('importUrlInput').focus();
});
