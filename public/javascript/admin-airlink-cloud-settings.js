(function() {
  const csrfToken = document.getElementById('page-data').dataset.csrfToken;

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('airlinkCloudApiKey').value;
    const backupEnabled = document.getElementById('airlinkCloudBackupEnabled').checked;

    try {
      const res = await fetch('/admin/airlink-cloud', {
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
      } else {
        showToast(data.error || 'Failed to save settings.', 'error');
      }
    } catch (err) {
      showToast('An error occurred while saving settings.', 'error');
    }
  });
})();
