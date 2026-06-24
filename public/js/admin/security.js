document.getElementById('form-rate-limit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const enabled = document.getElementById('rateLimitEnabled').checked;
  const rpm = document.getElementById('rateLimitRpm').value;
  try {
    const r = await fetch('/admin/security/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rateLimitEnabled: enabled, rateLimitRpm: rpm }),
    });
    const data = await r.json();
    if (data.success) showToast('Rate limit settings saved. Breathe easy.', 'success');
    else showToast(data.error || 'Failed to save.', 'error');
  } catch {
    showToast('An error occurred.', 'error');
  }
});

document.getElementById('ban-ip-btn').addEventListener('click', async () => {
  const ip = document.getElementById('ban-ip-input').value.trim();
  if (!ip) return;
  try {
    const r = await fetch('/admin/security/ban-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
    });
    const data = await r.json();
    if (data.success) {
      document.getElementById('ban-ip-input').value = '';
      showToast(`${ip} has been banned.`, 'success');
      setTimeout(() => location.reload(), 800);
    } else {
      showToast(data.error || 'Failed to ban IP.', 'error');
    }
  } catch {
    showToast('An error occurred.', 'error');
  }
});

document.getElementById('ban-ip-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('ban-ip-btn').click();
});

document.querySelectorAll('.unban-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const li = btn.closest('li');
    const ip = li.dataset.ip;
    try {
      const r = await fetch('/admin/security/unban-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const data = await r.json();
      if (data.success) {
        li.remove();
        showToast(`${ip} has been unbanned.`, 'success');
        if (document.querySelectorAll('#banned-list li').length === 0) {
          const list = document.getElementById('banned-list');
          if (list) {
            list.insertAdjacentHTML('afterend', '<p id="no-bans-msg" class="text-xs text-neutral-400">No IPs are currently banned.</p>');
            list.remove();
          }
        }
      } else {
        showToast(data.error || 'Failed to unban IP.', 'error');
      }
    } catch {
      showToast('An error occurred.', 'error');
    }
  });
});
