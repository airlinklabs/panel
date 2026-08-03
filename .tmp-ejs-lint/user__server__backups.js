/* inline script 1 */

const serverUUID = 'null';

function showLoading(title, message) {
  showLoadingPopup(title, message);
}
function hideLoading() {
  hideLoadingPopup();
}
function showConfirmation(title, message, onConfirm) {
  window.modal.confirm({ title, body: message, danger: true, confirmLabel: 'Confirm', onConfirm });
}
document.getElementById('confirmation-cancel') && document.getElementById('confirmation-cancel').addEventListener && null;

// Modal functions
function openCreateBackupModal() {
  const modal = document.getElementById('createBackupModal');
  const input = document.getElementById('backupName');
  const panel = document.getElementById('createBackupModalPanel');

  modal.classList.remove('opacity-0', 'pointer-events-none');
  Animate.openModal(modal, panel);

  input.focus();
}

function closeCreateBackupModal() {
  const modal = document.getElementById('createBackupModal');
  const panel = document.getElementById('createBackupModalPanel');
  const done = function () {
    modal.classList.add('opacity-0', 'pointer-events-none');
    // Clear input
    document.getElementById('backupName').value = '';
  };
  Animate.closeModal(modal, panel, done);
}

function handleBackupNameKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmCreateBackup();
  }
}

// Create backup
async function confirmCreateBackup() {
  const name = document.getElementById('backupName').value.trim();

  if (!name) {
     showToast('Enter a backup name.', 'error');
    return;
  }

  closeCreateBackupModal();
// Show loading toast with progress
const loading = showLoadingToast('Creating backup...');
let progress = 0;

// Simulate progress until request finishes
const progressInterval = setInterval(() => {
  progress += 10;
  loading.updateProgress(progress);
  if (progress >= 90) clearInterval(progressInterval); // cap at 90% until response
});

try {
  const response = await fetch(`/server/${serverUUID}/backups/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  const data = await response.json();

  if (data.success) {
    // Complete the progress bar
    loading.updateProgress(100);
     showToast('Backup created.', 'success');

    // Reload page to show new backup
    addBackupRow(data.backup);
  } else {
    loading.close();
    showToast(data.error || 'Failed to create backup', 'error');
  }
} catch (error) {
  loading.close();
  console.error('Failed to create backup:', error);
  showToast('Failed to create backup. Try again.', 'error');
}
}

// Download backup
function downloadBackup(backupId) {
  window.location.href = `/server/${serverUUID}/backups/${backupId}/download`;
}

// Restore backup
function restoreBackup(backupId, backupName) {
  showConfirmation(
    'Restore Backup',
    `Are you sure you want to restore the backup "${backupName}"? This will replace all current server files and cannot be undone.`,
    async () => {
      showLoading('Restoring backup...', 'Restoring backup. This may take a few minutes.');

      try {
        const response = await fetch(`/server/${serverUUID}/backups/${backupId}/restore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (data.success) {
           showToast('Backup restored.', 'success');
        } else {
          showToast(data.error || 'Failed to restore backup. Give it another try, or check that the node is online.', 'error');
        }
      } catch (error) {
        console.error('Failed to restore backup:', error);
        showToast('Failed to restore backup. Give it another try, or check that the node is online.', 'error');
      } finally {
        hideLoading();
      }
    }
  );
}

function addBackupRow(backup) {
  const tbody = document.getElementById('backups-table-body');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'al-table-tr transition-colors';
  tr.dataset.backupId = backup.UUID;

  const nameTd = document.createElement('td');
  nameTd.className = 'px-6 py-4 whitespace-nowrap';
  const nameDiv = document.createElement('div');
  nameDiv.className = 'text-sm font-medium';
  nameDiv.style.color = 'var(--theme-text-strong)';
  nameDiv.textContent = backup.name;
  nameTd.appendChild(nameDiv);
  tr.appendChild(nameTd);

  const sizeTd = document.createElement('td');
  sizeTd.className = 'px-6 py-4 whitespace-nowrap';
  const sizeText = backup.size ? (Number(backup.size) / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown';
  sizeTd.innerHTML = `<div class="text-sm" style="color:var(--theme-text-muted)">${sizeText}</div>`;
  tr.appendChild(sizeTd);

  const createdTd = document.createElement('td');
  createdTd.className = 'px-6 py-4 whitespace-nowrap';
  createdTd.innerHTML = `<div class="text-sm" style="color:var(--theme-text-muted)">Now</div>`;
  tr.appendChild(createdTd);

  const actionsTd = document.createElement('td');
  actionsTd.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'flex justify-end space-x-2';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  downloadBtn.style.cssText = 'color:var(--theme-accent);background:var(--theme-accent-subtle)';
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', () => downloadBackup(backup.UUID));

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  restoreBtn.style.cssText = 'color:var(--theme-success);background:var(--theme-success-bg)';
  restoreBtn.textContent = 'Restore';
  restoreBtn.addEventListener('click', () => restoreBackup(backup.UUID, backup.name));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  deleteBtn.style.cssText = 'color:var(--theme-danger);background:var(--theme-danger-bg)';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteBackup(backup.UUID, backup.name));

  actionsDiv.appendChild(downloadBtn);
  actionsDiv.appendChild(restoreBtn);
  actionsDiv.appendChild(deleteBtn);
  actionsTd.appendChild(actionsDiv);
  tr.appendChild(actionsTd);

  tbody.prepend(tr);
}

// Toggle backup lock
async function toggleBackupLock(backupId, backupName, currentlyLocked) {
  try {
    const response = await fetch(`/server/${serverUUID}/backups/${backupId}/lock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locked: !currentlyLocked }),
    });

    const data = await response.json();

    if (data.success) {
      showToast(currentlyLocked ? 'Backup unlocked.' : 'Backup locked.', 'success');
      setTimeout(() => window.location.reload(), 600);
    } else {
      showToast(data.error || 'Failed to update backup lock', 'error');
    }
  } catch (error) {
    console.error('Failed to toggle backup lock:', error);
    showToast('Failed to update backup lock. Try again.', 'error');
  }
}

// Delete backup
function deleteBackup(backupId, backupName) {  showConfirmation(
    'Delete Backup',
    `Are you sure you want to delete the backup "${backupName}"? This action cannot be undone.`,
    async () => {
      try {
        const response = await fetch(`/server/${serverUUID}/backups/${backupId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (data.success) {
           showToast('Backup deleted.', 'success');
          // Remove the row from the table
          const row = document.querySelector(`tr[data-backup-id="${backupId}"]`);
          if (row) {
            row.remove();
          }

          // Check if table is now empty
          const tbody = document.getElementById('backups-table-body');
          if (tbody && tbody.children.length === 0) {
            // Reload to show empty state
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        } else {
          showToast(data.error || 'Failed to delete backup', 'error');
        }
      } catch (error) {
        console.error('Failed to delete backup:', error);
        showToast('Failed to delete backup. Try again.', 'error');
      }
    }
  );
}
