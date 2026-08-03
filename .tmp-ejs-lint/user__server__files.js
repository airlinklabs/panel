/* inline script 1 */

  function handleFileNameKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        confirmCreateFile();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.showImageViewer !== 'function' && typeof window.imageViewerSystem === 'function') {
      const { showImageViewer, closeImageViewer, downloadViewedImage } = window.imageViewerSystem();
      window.showImageViewer = showImageViewer;
      window.closeImageViewer = closeImageViewer;
      window.downloadViewedImage = downloadViewedImage;
    }


  });

  function deletefile(fileName, filePath) {
    window.modal.confirm({
      title: 'Delete File',
      body: `Are you sure you want to delete "${fileName}"? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: () => {
      const loader = showLoadingPopup('Deleting File', 'Removing file from server...');
      fetch('/server/null/files/rm/' + encodeURIComponent(filePath), { method: 'DELETE' })
      .then(response => {
        loader.close();
        if (response.ok) {
           showToast(`File ${fileName} deleted.`, 'success');
          setTimeout(() => location.reload(), 1000);
        } else {
          showToast('Failed to delete file', 'error');
        }
      })
      .catch(error => {
        loader.close();
        console.error('Error:', error);
        showToast('Something went wrong.', 'error');
      });
      }
    });
  }

  function downloadfile(fileName, filePath) {
    fetch('/server/null/files/download/' + encodeURIComponent(filePath), { method: 'GET' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error downloading file: ${response.statusText}`);
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Download failed:', error);
            showToast('Failed to download file', 'error');
        });
}

 // File Select thingy

  const selectAllCheckbox = document.getElementById('selectAll');
  const fileCheckboxes = document.querySelectorAll('.file-checkbox:not(#selectAll)');
  const floatingActionBar = document.getElementById('floatingActionBar');
  const selectedFilesCount = document.getElementById('selectedFilesCount');
  const massDeleteBtn = document.getElementById('massDeleteBtn');
  const massDeleteModal = document.getElementById('massDeleteModal');
  const massDeleteMessage = document.getElementById('massDeleteMessage');
  const confirmMassDeleteBtn = document.getElementById('confirmMassDelete');

  let selectedFiles = [];

  function updateSelectedFiles() {
    const selectedCount = selectedFiles.length;
    if (selectedFiles.length > 0) {
    floatingActionBar.classList.remove('translate-y-full');
  } else {
    floatingActionBar.classList.add('translate-y-full');
  }
    document.querySelectorAll('.file-checkbox[data-filename]').forEach(checkbox => {
      const row = checkbox.closest('tr');
      if (row) row.classList.toggle('is-selected', checkbox.checked);
    });
    document.getElementById('selectedFilesCount').innerText = `${selectedCount} file${selectedCount !== 1 ? 's' : ''} selected`;

    document.getElementById('massDeleteBtn').disabled = selectedCount === 0;
    document.getElementById('massArchiveBtn').disabled = selectedCount === 0;
}

document.getElementById('massArchiveBtn').addEventListener('click', () => {
    if (selectedFiles.length > 0) {
        window.modal.confirm({
          title: 'Confirm Archive',
          body: `Archive ${selectedFiles.length} selected file${selectedFiles.length !== 1 ? 's' : ''}?`,
          danger: false,
          confirmLabel: 'Archive',
          onConfirm: () => archiveFiles(selectedFiles)
        });
    }
});

function initializeSelectedFiles() {
  const storedSelectedFiles = JSON.parse(sessionStorage.getItem('selectedFiles') || '[]');
  fileCheckboxes.forEach(checkbox => {
    checkbox.checked = storedSelectedFiles.includes(checkbox.dataset.filename);
  });
  updateSelectedFiles();
}

// Select All functionality
selectAllCheckbox.addEventListener('change', event => {
    if (window.animateCheckbox) window.animateCheckbox(selectAllCheckbox);
    const isChecked = event.target.checked;

    // Get all file checkboxes (excluding the select all checkbox itself)
    const fileCheckboxes = document.querySelectorAll('.file-checkbox:not(#selectAll)');

    fileCheckboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        if (window.animateCheckbox) window.animateCheckbox(checkbox);
        const fileName = checkbox.dataset.filename;

        if (isChecked) {
            if (!selectedFiles.includes(fileName)) {
                selectedFiles.push(fileName);
            }
        } else {
            selectedFiles = selectedFiles.filter(name => name !== fileName);
        }
    });

    updateSelectedFiles();
});

document.querySelectorAll('.file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', event => {
        if (window.animateCheckbox) window.animateCheckbox(checkbox);
        const fileName = event.target.dataset.filename;

        if (event.target.checked) {
            if (!selectedFiles.includes(fileName)) selectedFiles.push(fileName);
        } else {
            selectedFiles = selectedFiles.filter(name => name !== fileName);
        }

        // Update select all checkbox state
        const fileCheckboxes = document.querySelectorAll('.file-checkbox:not(#selectAll)');
        const checkedCount = document.querySelectorAll('.file-checkbox:not(#selectAll):checked').length;
        selectAllCheckbox.checked = checkedCount === fileCheckboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < fileCheckboxes.length;

        updateSelectedFiles();
    });
});

function archiveFiles(files) {
    const loader = showLoadingPopup('Creating Archive', 'Preparing files for archiving...');
    loader.updateProgress(20, 'Compressing files...');

    fetch('/server/null/zip', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          relativePath: files,
          zipname: 'archive'
         })
    })
    .then(response => response.json())
    .then(data => {
        loader.updateProgress(100, 'Archive created!');
        setTimeout(() => {
            loader.close();
            if (data.success) {
                showToast('Files archived.', 'success');
                selectedFiles = [];
                updateSelectedFiles();
                setTimeout(() => location.reload(), 1000);
            } else {
                showToast('Failed to archive files', 'error');
            }
        }, 500);
    })
    .catch(error => {
        loader.close();
        console.error('Error:', error);
        showToast('Something went wrong.', 'error');
    });
}

massDeleteBtn.addEventListener('click', function() {
  massDeleteMessage.textContent = `Are you sure you want to delete ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}? This is a permanent action and cannot be reversed.`;
  const panel = document.getElementById('massDeleteModalPanel');
  massDeleteModal.classList.remove('opacity-0', 'pointer-events-none');
  Animate.openModal(massDeleteModal, panel);
});

function closeMassDeleteModal() {
  const panel = document.getElementById('massDeleteModalPanel');
  const done = function () {
    massDeleteModal.classList.add('opacity-0', 'pointer-events-none');
  };
  Animate.closeModal(massDeleteModal, panel, done);
}

confirmMassDeleteBtn.addEventListener('click', async function() {
  closeMassDeleteModal();

  const loader = showLoadingPopup('Deleting Files', `Removing ${selectedFiles.length} files...`);
  loader.updateProgress(10, 'Processing deletion requests...');

  const deletePromises = selectedFiles.map(fileName =>
    fetch('/server/null/files/rm/' + encodeURIComponent(fileName), { method: 'DELETE' })
  );

  try {
    await Promise.all(deletePromises);
    loader.updateProgress(100, 'Files deleted.');
    setTimeout(() => {
      loader.close();
      showToast(`${selectedFiles.length} files deleted.`, 'success');
      setTimeout(() => window.location.reload(), 1000);
    }, 500);
  } catch (error) {
    loader.close();
    console.error('Error deleting files:', error);
    showToast('Failed to delete files', 'error');
  }
});

document.addEventListener('DOMContentLoaded', initializeSelectedFiles);

window.addEventListener('beforeunload', () => {
  sessionStorage.removeItem('selectedFiles');
});

updateSelectedFiles();

// New File
function openCreateFileModal() {
    const modal = document.getElementById('createFileModal');
    const input = document.getElementById('FileName');
    const panel = document.getElementById('createFileModalPanel');

    modal.classList.remove('opacity-0', 'pointer-events-none');
    Animate.openModal(modal, panel);

    input.focus();
  }

  function closeCreateFileModal() {
    const modal = document.getElementById('createFileModal');
    const panel = document.getElementById('createFileModalPanel');
    const done = function () {
      modal.classList.add('opacity-0', 'pointer-events-none');
    };
    Animate.closeModal(modal, panel, done);
  }


  function openRenameModal(fileName, filePath) {
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('newFileName');
    const panel = document.getElementById('renameModalPanel');
    document.getElementById('currentFileName').value = fileName;
    document.getElementById('currentFilePath').value = filePath;

    // Show the full path so the user can edit folder too
    input.value = filePath;

    modal.classList.remove('opacity-0', 'pointer-events-none');
    Animate.openModal(modal, panel);

    // Select only the filename part (after the last slash), excluding extension
    const slashIndex = filePath.lastIndexOf('/');
    const nameStart = slashIndex + 1;
    const lastDotIndex = filePath.lastIndexOf('.');
    const nameEnd = lastDotIndex > nameStart ? lastDotIndex : filePath.length;
    input.setSelectionRange(nameStart, nameEnd);
    input.focus();
  }

  function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    const panel = document.getElementById('renameModalPanel');
    const done = function () {
      modal.classList.add('opacity-0', 'pointer-events-none');
    };
    Animate.closeModal(modal, panel, done);
  }

  function confirmRename() { /* overridden below */ }

  // Add event listener for Enter key in rename modal
  document.getElementById('newFileName').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmRename();
    }
  });

  function rename(fileName, filePath) {
    openRenameModal(fileName, filePath);
  }

  async function extractZip(fileName, filePath) {
    try {
        const loader = showLoadingPopup('Extracting Archive', 'Preparing to extract files...');
        loader.updateProgress(20, 'Extracting files...');

        const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));

        const response = await fetch(`/server/null/unzip`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                relativePath: parentPath || '/',
                zipname: fileName
            })
        });

        if (response.ok) {
            loader.updateProgress(100, 'Files extracted successfully!');
            setTimeout(() => {
                loader.close();
                showToast('File extracted.', 'success');
                setTimeout(() => location.reload(), 1000);
            }, 500);
        } else {
            loader.close();
            const error = await response.json();
            showToast(error.error || 'Failed to extract file', 'error');
        }
    } catch (error) {
        console.error('Error extracting file:', error);
        showToast('Failed to extract file', 'error');
    }
  }

  // File Upload Functions
  // Use window object to ensure the variable is globally accessible
  window.selectedFile = null;

  function openUploadFileModal() {
    const modal = document.getElementById('uploadFileModal');
    if (!modal) {
      console.error('Upload modal not found');
      return;
    }

    modal.classList.remove('opacity-0', 'pointer-events-none');
    const panel = document.getElementById('uploadFileModalPanel');
    Animate.openModal(modal, panel);

    // Reset the file selection
    removeSelectedFile();

    // Reset the file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function closeUploadFileModal() {
    const modal = document.getElementById('uploadFileModal');
    if (!modal) {
      console.error('Upload modal not found');
      return;
    }

    const panel = document.getElementById('uploadFileModalPanel');
    const done = function () {
      modal.classList.add('opacity-0', 'pointer-events-none');
    };
    Animate.closeModal(modal, panel, done);
  }

  function removeSelectedFile() {
    window.selectedFile = null;

    const filePreview = document.getElementById('filePreview');
    const dropZone = document.getElementById('dropZone');
    const uploadButton = document.getElementById('uploadButton');

    if (filePreview) {
      filePreview.classList.add('hidden');
    }

    if (dropZone) {
      dropZone.classList.remove('hidden');
    }

    if (uploadButton) {
      uploadButton.disabled = true;
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function handleFileSelection(file) {
    if (!file) {
      console.error('No file provided to handleFileSelection');
      return;
    }

    // Make sure file is a valid File object
    if (!(file instanceof File)) {
      console.error('Invalid file object:', file);
      showToast('Invalid file selected', 'error');
      return;
    }

    window.selectedFile = file;

    const fileNameElement = document.getElementById('selectedFileName');
    const fileSizeElement = document.getElementById('selectedFileSize');
    const filePreviewElement = document.getElementById('filePreview');
    const dropZoneElement = document.getElementById('dropZone');
    const uploadButtonElement = document.getElementById('uploadButton');

    if (fileNameElement) {
      fileNameElement.textContent = file.name;
    }

    if (fileSizeElement) {
      fileSizeElement.textContent = formatFileSize(file.size);
    }

    if (filePreviewElement) {
      filePreviewElement.classList.remove('hidden');
    }

    if (dropZoneElement) {
      dropZoneElement.classList.add('hidden');
    }

    if (uploadButtonElement) {
      uploadButtonElement.disabled = false;
    }
  }

  async function confirmFileUpload() {

    if (!window.selectedFile) {
      showToast('Select a file to upload', 'error');
      return;
    }

    if (!(window.selectedFile instanceof File)) {
      console.error('Selected file is not a valid File object:', window.selectedFile);
      showToast('Invalid file selected', 'error');
      return;
    }

    // Store file info before closing modal
    const file = window.selectedFile;
    const fileName = file.name;
    const fileSize = file.size;

    closeUploadFileModal();
    const loader = showLoadingPopup('Uploading File', 'Preparing to upload...');

    try {
      // Check if file size is too large (limit to 100MB)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      if (fileSize > MAX_FILE_SIZE) {
        loader.close();
        showToast('File is too large. Maximum size is 100MB', 'error');
        return;
      }

      // Use FormData instead of JSON for more reliable file uploads
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', 'null');
      formData.append('fileName', fileName);

      loader.updateProgress(30, 'Uploading file...');

      try {
        // Use XMLHttpRequest for better progress tracking and reliability
        const xhr = new XMLHttpRequest();

        xhr.open('POST', `/server/null/upload`, true);

        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            loader.updateProgress(30 + (percentComplete * 0.6), `Uploading: ${percentComplete}%`);
          }
        };

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            loader.updateProgress(100, 'File uploaded successfully!');
            setTimeout(() => {
              loader.close();
               showToast(`File ${fileName} uploaded.`, 'success');
              setTimeout(() => location.reload(), 1000);
            }, 500);
          } else {
            loader.close();
            try {
              const errorData = JSON.parse(xhr.responseText);
              console.error('Upload error response:', errorData);

              let errorMessage = 'Failed to upload file';
              if (errorData.error) {
                errorMessage = errorData.error;
              } else if (errorData.details && errorData.details.error) {
                errorMessage = errorData.details.error;
              }

              showToast(errorMessage, 'error');
            } catch (e) {
              console.error('Error parsing error response:', e);
              showToast(`Failed to upload file: ${xhr.status} ${xhr.statusText}`, 'error');
            }
          }
        };

        xhr.onerror = function() {
          loader.close();
          console.error('XHR error during upload');
          showToast('Connection error during file upload', 'error');
        };

        xhr.ontimeout = function() {
          loader.close();
          console.error('XHR timeout during upload');
          showToast('Upload timed out. Try a smaller file.', 'error');
        };

        // Set a longer timeout for large files
        xhr.timeout = 300000; // 5 minutes

        xhr.send(formData);
      } catch (error) {
        loader.close();
        console.error('Error uploading file:', error);
         showToast('Something went wrong.', 'error');
      }
    } catch (error) {
      loader.close();
      console.error('Error uploading file:', error);
      showToast('An error occurred while uploading the file', 'error');
    }
  }

  // Global variable for selected file
  window.selectedFile = null;

  // Direct handler for file input change
  function handleFileInputChange(event) {
    if (event.target && event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      handleFileSelection(file);
    } else {
    }
  }

  // Initialize file upload functionality when the DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {

    // Get DOM elements
    const dropZone = document.getElementById('dropZone');
    const uploadButton = document.getElementById('uploadButton');

    if (!dropZone) {
      console.error('Drop zone element not found in the DOM');
      return;
    }

    dropZone.addEventListener('dragover', function(event) {
      event.preventDefault();
      dropZone.style.background = 'var(--theme-bg-hover)';
      dropZone.style.borderColor = 'var(--theme-accent)';
    });

    dropZone.addEventListener('dragleave', function(event) {
      event.preventDefault();
      dropZone.style.background = '';
      dropZone.style.borderColor = 'var(--theme-border)';
    });

    dropZone.addEventListener('drop', function(event) {
      event.preventDefault();
      dropZone.classList.remove('bg-neutral-50', 'border-neutral-400');

      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        handleFileSelection(file);
      } else {
      }
    });

    // Add direct click handler for upload button
    if (uploadButton) {
      uploadButton.addEventListener('click', function(event) {
        event.preventDefault();
        confirmFileUpload();
      });
    }

    // Initialize by clearing any previously selected file
    removeSelectedFile();
  });

  // ── New Folder ─────────────────────────────────────────────────────────────
  function openCreateFolderModal() {
    document.getElementById('FileName').value = '';
    document.getElementById('fileNamePreview').textContent = '';
    document.getElementById('fileNamePreview').classList.add('hidden');
    document.getElementById('createModalTitle').textContent = 'New Folder';
    document.getElementById('createModalHint').textContent = 'Folder name. Use / to create nested folders.';
    document.getElementById('FileName').setAttribute('data-mode', 'folder');
    openCreateFileModal();
  }

  // ── Path preview for create & rename ──────────────────────────────────────
  function updatePathPreview(inputEl, previewEl) {
    const val = inputEl.value;
    if (!val.includes('/')) {
      previewEl.classList.add('hidden');
      return;
    }
    const parts = val.split('/').filter(Boolean);
    if (parts.length < 2) { previewEl.classList.add('hidden'); return; }
    const folders = parts.slice(0, -1).join('/');
    const file = parts[parts.length - 1];
    previewEl.textContent = '';
    const span1 = document.createElement('span');
    span1.className = 'text-neutral-400';
    span1.textContent = 'Will create: ';
    const span2 = document.createElement('span');
    span2.className = 'text-blue-500 dark:text-blue-400';
    span2.textContent = folders + '/';
    const span3 = document.createElement('span');
    span3.className = 'text-neutral-700 dark:text-neutral-300';
    span3.textContent = file || '...';
    previewEl.appendChild(span1);
    previewEl.appendChild(span2);
    previewEl.appendChild(span3);
    previewEl.classList.remove('hidden');
  }

  document.getElementById('FileName').addEventListener('input', function() {
    updatePathPreview(this, document.getElementById('fileNamePreview'));
  });

  document.getElementById('newFileName').addEventListener('input', function() {
    updatePathPreview(this, document.getElementById('renamePreview'));
  });

  // ── confirmCreateFile: handle slash paths & folder mode ───────────────────
  async function confirmCreateFile() {
    const raw = document.getElementById('FileName').value.trim();
    const mode = document.getElementById('FileName').getAttribute('data-mode');
    if (!raw) { closeCreateFileModal(); return; }

    const base = 'null';
    let finalPath;

    if (raw.startsWith('/')) {
      finalPath = raw.replace(/^\/+/, '');
    } else {
      finalPath = base ? base + '/' + raw : raw;
    }

    if (mode === 'folder') {
      // Prefer the daemon mkdir endpoint (capability-detected via fallback):
      // on failure, fall back to the keep-file trick so old daemons keep working.
      closeCreateFileModal();
      const loader = showLoadingPopup('Creating', req.translations.creatingFolder || 'Creating folder...');
      try {
        const parts = finalPath.split('/');
        const name = parts.pop();
        const parent = parts.join('/');
        const res = await fetch('/server/null/files/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: parent || '/', name }),
        });
        loader.close();
        if (res.ok) {
          showToast(raw + (req.translations.createdSuffix || ' created'), 'success');
          setTimeout(() => location.reload(), 800);
        } else {
          showToast(req.translations.folderCreateFailedFallback || 'Failed to create folder, retrying with fallback', 'error');
          tryCreateFolderViaFile(finalPath, raw);
        }
      } catch {
        loader.close();
        tryCreateFolderViaFile(finalPath, raw);
      }
      return;
    }
    const label = mode === 'folder' ? (req.translations.creatingFolder || 'Creating folder...') : (req.translations.creatingFile || 'Creating file...');
    const loader = showLoadingPopup('Creating', label);

    const hasSlash = finalPath.includes('/');

    if (!hasSlash) {
      // Simple file in current dir — direct POST
      try {
        const encoded = encodeURIComponent(finalPath);
        const res = await fetch('/server/null/files/' + encoded, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '' }),
        });
        if (res.ok) {
          loader.updateProgress(100, 'Done!');
          setTimeout(() => { loader.close(); showToast(raw + (req.translations.createdSuffix || ' created'), 'success'); setTimeout(() => location.reload(), 800); }, 400);
        } else {
          loader.close(); showToast(req.translations.fileCreateFailed || 'Failed to create file', 'error');
        }
      } catch { loader.close(); showToast(req.translations.fileCreateError || 'Error creating file', 'error'); }
      return;
    }

    // Slash path — create a temp file first, then rename it to the target path
    // This lets the daemon handle directory creation via the rename/move endpoint
    const tempName = '__tmp_' + Date.now();
    const tempPath = base ? base + '/' + tempName : tempName;

    try {
      const res1 = await fetch('/server/null/files/' + encodeURIComponent(tempPath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });
      if (!res1.ok) { loader.close(); showToast(req.translations.fileCreateFailed || 'Failed to create file', 'error'); return; }

      loader.updateProgress(50, req.translations.movingToTarget || 'Moving to target path...');

      const res2 = await fetch('/server/null/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempPath, newName: finalPath }),
      });
      if (res2.ok) {
        loader.updateProgress(100, 'Done!');
        setTimeout(() => { loader.close(); showToast(raw + (req.translations.createdSuffix || ' created'), 'success'); setTimeout(() => location.reload(), 800); }, 400);
      } else {
        loader.close(); showToast(req.translations.moveToTargetFailed || 'Failed to move to target path', 'error');
      }
    } catch { loader.close(); showToast(req.translations.fileCreateError || 'Error creating file', 'error'); }
  }

  // Fallback for daemons without /fs/mkdir — create a .airlink_keep file inside.
  async function tryCreateFolderViaFile(finalPath, raw) {
    const keepPath = finalPath.replace(/\/*$/, '') + '/.airlink_keep';
    const encoded = encodeURIComponent(keepPath);
    try {
      const res = await fetch('/server/null/files/' + encoded, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });
      if (res.ok) {
        showToast(raw + (req.translations.createdSuffix || ' created'), 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast(req.translations.folderCreateFailed || 'Failed to create folder', 'error');
      }
    } catch {
      showToast(req.translations.folderCreateError || 'Error creating folder', 'error');
    }
  }

  // ── confirmRename: input is the full target path ──────────────────────────
  const _origConfirmRename = confirmRename;
  async function confirmRename() {
    const newPath = document.getElementById('newFileName').value.trim();
    const filePath = document.getElementById('currentFilePath').value;
    if (!newPath || newPath === filePath) { closeRenameModal(); return; }

    closeRenameModal();
    const loader = showLoadingPopup('Renaming', 'Processing...');

    try {
      const res = await fetch('/server/null/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, newName: newPath }),
      });
      loader.close();
      if (res.ok) {
        showToast('Renamed.', 'success');
        setTimeout(() => location.reload(), 800);
      } else {
        showToast('Failed to rename', 'error');
      }
    } catch { loader.close(); showToast('Failed to rename', 'error'); }
  }

  // ── Copy path ─────────────────────────────────────────────────────────────
  function copyFilePath(path) {
    navigator.clipboard.writeText(path).then(() => showToast('Copied!', 'success'));
  }

  // ── Dismiss selection ────────────────────────────────────────────────────
  document.getElementById('dismissSelectionBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.checked = false;
      const row = cb.closest('tr');
      if (row) row.classList.remove('is-selected');
    });
    selectedFiles = [];
    updateSelectedFiles();
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+A — select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.closest('input, textarea')) {
      e.preventDefault();
      document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = true;
        const row = cb.closest('tr');
        if (row) row.classList.add('is-selected');
        const name = cb.dataset.filename;
        if (name && !selectedFiles.includes(name)) selectedFiles.push(name);
      });
      updateSelectedFiles();
    }
    // Escape — deselect all
    if (e.key === 'Escape' && selectedFiles.length > 0) {
      document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('tr')?.classList.remove('is-selected');
      });
      selectedFiles = [];
      updateSelectedFiles();
    }
    // Delete — mass delete selected
    if (e.key === 'Delete' && selectedFiles.length > 0 && !e.target.closest('input, textarea')) {
      document.getElementById('massDeleteBtn')?.click();
    }
  });

  // ── File search/filter ───────────────────────────────────────────────────
  (function initFileSearch() {
    const input   = document.getElementById('fileSearchInput');
    const clearBtn = document.getElementById('clearFileSearch');
    if (!input) return;

    const applyFilter = (q) => {
      const rowMatches = (row) => {
        const name = row.querySelector('td:nth-child(2)')?.textContent?.toLowerCase() ?? '';
        return !q || name.includes(q);
      };
      if (window.__alPagination && typeof window.__alPagination.setFilter === 'function') {
        window.__alPagination.setFilter(rowMatches);
        return;
      }
      document.querySelectorAll('tbody tr.al-file-row').forEach(row => {
        row.style.display = rowMatches(row) ? '' : 'none';
      });
    };

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      clearBtn.classList.toggle('hidden', !q);
      applyFilter(q);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  })();

  // ── Move file modal ──────────────────────────────────────────────────────
  function openMoveModal(name, path) {
    document.getElementById('moveSourcePath').value = path;
    document.getElementById('moveDestPath').value   = '';
    const modal = document.getElementById('moveModal');
    const panel = document.getElementById('moveModalPanel');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    Animate.openModal(modal, panel);
    setTimeout(() => document.getElementById('moveDestPath').focus(), 80);
  }
  function closeMoveModal() {
    const modal = document.getElementById('moveModal');
    const panel = document.getElementById('moveModalPanel');
    const done = function () {
      modal.classList.add('opacity-0', 'pointer-events-none');
    };
    Animate.closeModal(modal, panel, done);
  }
  async function confirmMove() {
    const src  = document.getElementById('moveSourcePath').value;
    const dest = document.getElementById('moveDestPath').value.trim();
    if (!dest) { showToast('Enter a destination path.', 'error'); return; }
    try {
      const res = await fetch(`/server/null/files/rename`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'csrf-token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body:    JSON.stringify({ oldPath: src, newPath: dest }),
      });
      if (!res.ok) throw new Error('Move failed');
      closeMoveModal();
      showToast('File moved.', 'success');
      setTimeout(() => location.reload(), 700);
    } catch {
      showToast('Move failed — check the destination path.', 'error');
    }
  }

  // ── Duplicate file ───────────────────────────────────────────────────────
  async function duplicateFile(name, path) {
    const ext  = name.includes('.') ? '.' + name.split('.').pop() : '';
    const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
    const dir  = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const dest = `${dir}${base}_copy${ext}`;
    try {
      const res = await fetch(`/server/null/files/copy`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'csrf-token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body:    JSON.stringify({ location: path }),
      });
      if (!res.ok) throw new Error('Copy failed');
      showToast(`Duplicated as ${dest.split('/').pop()}.`, 'success');
      setTimeout(() => location.reload(), 700);
    } catch {
      showToast('Duplicate failed.', 'error');
    }
  }

  // ── toggleDropdown: position fixed dropdown at click coords ───────────────



  // Rename from action bar — only works when exactly 1 file selected
  document.getElementById('massRenameBtn').addEventListener('click', () => {
    if (selectedFiles.length !== 1) {
      showToast('Select exactly one file to rename', 'error');
      return;
    }
    const fullPath = selectedFiles[0];
    const name = fullPath.split('/').pop();
    openRenameModal(name, fullPath);
  });

  (function staggerFileRows() {
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(row, i) {
      row.style.opacity = '0';
      row.style.transform = 'translateY(5px)';
      row.style.transition = 'none';
      setTimeout(function() {
        row.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
        setTimeout(function() {
          row.style.transition = '';
          row.style.opacity = '';
          row.style.transform = '';
        }, 200);
      }, i * 25);
    });
  })();

  // ── Pull file from URL ──────────────────────────────────────────────────
  function openPullFileModal() {
    const modal = document.getElementById('pullFileModal');
    const input = document.getElementById('pullUrlInput');
    const preview = document.getElementById('pullUrlPreview');
    const button = document.getElementById('pullButton');
    if (!modal) return;
    input.value = '';
    preview.classList.add('hidden');
    button.disabled = false;
    button.classList.remove('opacity-60');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    Animate.openModal(modal, document.getElementById('pullFileModalPanel'));
    setTimeout(() => input.focus(), 80);
  }

  function closePullFileModal() {
    const modal = document.getElementById('pullFileModal');
    const panel = document.getElementById('pullFileModalPanel');
    const done = function () {
      modal.classList.add('opacity-0', 'pointer-events-none');
    };
    Animate.closeModal(modal, panel, done);
  }

  const pullUrlInput = document.getElementById('pullUrlInput');
  if (pullUrlInput) {
    pullUrlInput.addEventListener('input', () => {
      const preview = document.getElementById('pullUrlPreview');
      const url = pullUrlInput.value.trim();
      if (!url) { preview.classList.add('hidden'); return; }
      let name = '';
      try {
        const parsed = new URL(url);
        name = parsed.pathname.split('/').filter(Boolean).pop() || '';
      } catch {}
      if (!name) { preview.classList.add('hidden'); return; }
      const base = 'null';
      preview.textContent = 'Will save as: ' + (base ? base + '/' : '/') + name;
      preview.classList.remove('hidden');
    });
    pullUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pullButton').click(); }
    });
  }

  document.getElementById('pullButton')?.addEventListener('click', async () => {
    const url = document.getElementById('pullUrlInput').value.trim();
    if (!url) { showToast('Enter a file URL.', 'error'); return; }
    let parsed;
    try { parsed = new URL(url); } catch { showToast('Invalid URL.', 'error'); return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      showToast('Only http(s) URLs are allowed.', 'error');
      return;
    }

    closePullFileModal();
    const loader = showLoadingPopup('Pulling File', 'Downloading from URL...');
    try {
      const res = await fetch('/server/null/files/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'csrf-token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body: JSON.stringify({ url, path: 'null' }),
      });
      const data = await res.json();
      loader.close();
      if (res.ok && data.success) {
        showToast(data.message || 'File pulled.', 'success');
        setTimeout(() => location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to pull file.', 'error');
      }
    } catch {
      loader.close();
      showToast('Failed to pull file — check the URL and try again.', 'error');
    }
  });
