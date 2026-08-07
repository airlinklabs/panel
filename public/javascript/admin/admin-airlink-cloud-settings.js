(function() {
  const csrfToken = document.getElementById('page-data').dataset.csrfToken;
  const apiKeyInput = document.getElementById('airlinkCloudApiKey');
  const backupToggle = document.getElementById('airlinkCloudBackupEnabled');

  let savedKey = apiKeyInput.value;
  let savedEnabled = backupToggle.checked;

  document.getElementById('saveBtn').addEventListener('click', async function() {
    const apiKey = apiKeyInput.value;
    const backupEnabled = backupToggle.checked;

    try {
      const res = await fetch('/airlink-cloud/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          airlinkCloudApiKey: apiKey,
          airlinkCloudBackupEnabled: backupEnabled
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Settings saved. Looking good.', 'success');
        savedKey = apiKeyInput.value;
        savedEnabled = backupToggle.checked;
      } else {
        showToast(data.error || 'Failed to save settings.', 'error');
      }
    } catch (err) {
      showToast('An error occurred while saving settings.', 'error');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', function() {
    apiKeyInput.value = savedKey;
    backupToggle.checked = savedEnabled;
    showToast('Changes discarded.', 'info');
  });
})();
