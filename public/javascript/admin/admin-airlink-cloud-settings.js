(function() {
  var csrfToken = document.getElementById('page-data').dataset.csrfToken;

  document.getElementById('saveBtn').addEventListener('click', async function() {
    var apiKey = document.getElementById('airlinkCloudApiKey').value;
    var backupEnabled = document.getElementById('airlinkCloudBackupEnabled').checked;

    try {
      var res = await fetch('/admin/airlink-cloud', {
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

      var data = await res.json();
      if (data.success) {
        showToast('Settings saved. Looking good.', 'success');
      } else {
        showToast(data.error || 'Failed to save settings.', 'error');
      }
    } catch (err) {
      showToast('An error occurred while saving settings.', 'error');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', function() {
    location.reload();
  });
})();
