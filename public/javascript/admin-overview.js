(function() {
  const pageData = document.getElementById('page-data').dataset;
  const currentVersion = pageData.airlinkVersion;
  const runningLatestVersion = pageData.runningLatestVersion;

  document.querySelectorAll('.current-version').forEach(el => el.textContent = currentVersion);
  const versionInline = document.getElementById('current-version-inline');
  if (versionInline) versionInline.textContent = currentVersion;
  const versionById = document.getElementById('current-version');
  if (versionById) versionById.textContent = currentVersion;

  document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('updateStatus');
    statusDiv.innerHTML = '<span class="text-neutral-500">Checking...</span>';
    statusDiv.classList.remove('hidden');

    try {
      const response = await fetch('/admin/check-update');
      const data = await response.json();
      const updateBtn = document.getElementById('performUpdateBtn');
      const updateInfo = document.getElementById('updateInfo');

      if (data.hasUpdate) {
        statusDiv.innerHTML = '<span class="text-amber-600 dark:text-amber-400">Update available — v' + data.latestVersion + '</span>';
        fadeIn(statusDiv);
        updateBtn.classList.remove('hidden');
        updateBtn.classList.add('inline-flex');
        fadeIn(updateBtn);
        if (data.updateInfo) {
          updateInfo.innerHTML = '<p class="text-xs text-neutral-500">' + data.updateInfo + '</p>';
          updateInfo.classList.remove('hidden');
          fadeIn(updateInfo);
        }
      } else {
        statusDiv.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400">' + (runningLatestVersion || 'Running latest version') + '</span>';
        fadeIn(statusDiv);
        updateBtn.classList.add('hidden');
        updateInfo.classList.add('hidden');
      }
    } catch (error) {
      statusDiv.innerHTML = '<span class="text-red-500">Failed to check for updates.</span>';
      fadeIn(statusDiv);
    }
  });

  document.getElementById('performUpdateBtn').addEventListener('click', async () => {
    window.modal.confirm({
      title: 'Install Update',
      body: 'The panel will perform the update and restart the server.',
      confirmLabel: 'Install',
      danger: false,
      onConfirm: async () => {
        const statusDiv = document.getElementById('updateStatus');
        statusDiv.innerHTML = '<span class="text-neutral-500">Installing...</span>';
        fadeIn(statusDiv);
        try {
          const response = await fetch('/admin/perform-update', { method: 'POST' });
          const data = await response.json();
          showToast(data.message || 'Update complete. Restarting.', 'success');
          statusDiv.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400">Update successful. Restarting...</span>';
          fadeIn(statusDiv);
          setTimeout(() => window.location.reload(), 5000);
        } catch (error) {
          statusDiv.innerHTML = '<span class="text-red-500">Update failed.</span>';
          fadeIn(statusDiv);
          showToast('Update failed. Check the logs.', 'error');
        }
      }
    });
  });

  function fadeIn(el) {
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        setTimeout(function() {
          el.style.transition = '';
          el.style.opacity = '';
          el.style.transform = '';
        }, 220);
      });
    });
  }

  async function measureApiLatency() {
    try {
      const start = performance.now();
      const response = await fetch('/api/v1/ping');
      const latency = Math.round(performance.now() - start);
      if (response.ok) {
        document.getElementById('apiLatency').textContent = latency + ' ms';
        const bar = document.getElementById('latencyBar');
        bar.style.width = Math.min((latency / 500) * 100, 100) + '%';
        bar.classList.remove('bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-neutral-400', 'dark:bg-neutral-500');
        if (latency < 100) bar.classList.add('bg-emerald-500');
        else if (latency < 300) bar.classList.add('bg-amber-500');
        else bar.classList.add('bg-red-500');
      }
    } catch (error) {
      document.getElementById('apiLatency').textContent = 'Error';
    }
  }

  measureApiLatency();
  setInterval(measureApiLatency, 30000);
})();
