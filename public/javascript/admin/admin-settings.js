(function () {
  const tabBtns   = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const tabList = document.querySelector('[role="tablist"]');

  function activate(id) {
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === id;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.setAttribute('tabindex', on ? '0' : '-1');
    });
    tabPanels.forEach(p => p.classList.toggle('hidden', p.dataset.tabPanel !== id));
    try { localStorage.setItem('settings_tab', id); } catch {}
  }

  // Arrow key navigation for tabs
  if (tabList) {
    tabList.addEventListener('keydown', function(e) {
      const tabs = Array.from(tabBtns);
      const currentIndex = tabs.findIndex(t => t === document.activeElement);
      if (currentIndex === -1) return;
      
      let newIndex = currentIndex;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIndex = tabs.length - 1;
      }
      
      if (newIndex !== currentIndex) {
        tabs[newIndex].focus();
        activate(tabs[newIndex].dataset.tab);
      }
    });
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.tab)));
  let saved = null;
  try { saved = localStorage.getItem('settings_tab'); } catch {}
  activate(saved || 'appearance');

  function post(url, body, btn) {
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    return fetch(url, {
      method:  'POST',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body:    body instanceof FormData ? body : JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Failed');
        showToast('Settings saved. Looking good.', 'success');
      })
      .catch(err => showToast(err.message || 'Failed', 'error'))
      .finally(() => { if (btn) { btn.disabled = false; btn.textContent = orig; } });
  }

  document.getElementById('form-appearance').addEventListener('submit', function (e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    const fd  = new FormData(this);
    const allowReg = this.querySelector('[name="allowRegistration"]');
    if (allowReg && !allowReg.checked) fd.set('allowRegistration', 'false');
    post('/admin/settings', fd, btn).then(() => setTimeout(() => location.reload(), 1200));
  });

  document.getElementById('saveServerPolicy').addEventListener('click', function () {
    post('/admin/settings/server-policy', {
      allowUserCreateServer: document.getElementById('allowUserCreateServer').checked,
      allowUserDeleteServer: document.getElementById('allowUserDeleteServer').checked,
      defaultServerLimit:    parseInt(document.getElementById('defaultServerLimit').value, 10),
      defaultMaxMemory:      parseInt(document.getElementById('defaultMaxMemory').value,   10),
      defaultMaxCpu:         parseInt(document.getElementById('defaultMaxCpu').value,      10),
      defaultMaxStorage:     parseInt(document.getElementById('defaultMaxStorage').value,  10),
      uploadLimit:           parseInt(document.getElementById('uploadLimitInput').value,   10) || 100,
    }, this);
  });

  document.getElementById('saveVtKey').addEventListener('click', function () {
    post('/admin/settings/security', {
      rateLimitEnabled:    document.getElementById('rateLimitEnabled').checked,
      rateLimitRpm:        parseInt(document.getElementById('rateLimitRpm').value, 10),
      loginMaxAttempts:    parseInt(document.getElementById('loginMaxAttempts').value, 10),
      loginLockoutMinutes: parseInt(document.getElementById('loginLockoutMinutes').value, 10),
      enforceDaemonHttps:  document.getElementById('enforceDaemonHttps').checked,
      behindReverseProxy:  document.getElementById('behindReverseProxy').checked,
      hashApiKeys:         document.getElementById('hashApiKeys').checked,
      virusTotalApiKey:    document.getElementById('vtKeyInput').value.trim() || null,
    }, this);
  });

  document.getElementById('saveRateLimit').addEventListener('click', function () {
    post('/admin/settings/security', {
      rateLimitEnabled:    document.getElementById('rateLimitEnabled').checked,
      rateLimitRpm:        parseInt(document.getElementById('rateLimitRpm').value, 10),
      loginMaxAttempts:    parseInt(document.getElementById('loginMaxAttempts').value, 10),
      loginLockoutMinutes: parseInt(document.getElementById('loginLockoutMinutes').value, 10),
      enforceDaemonHttps:  document.getElementById('enforceDaemonHttps').checked,
      behindReverseProxy:  document.getElementById('behindReverseProxy').checked,
      hashApiKeys:         document.getElementById('hashApiKeys').checked,
      virusTotalApiKey:    document.getElementById('vtKeyInput').value.trim() || null,
    }, this);
  });

  document.getElementById('banIpBtn').addEventListener('click', function () {
    const ip = document.getElementById('banIpInput').value.trim();
    if (!ip) return showToast('Enter an IP address', 'error');
    fetch('/admin/settings/ban-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Failed');
        document.getElementById('banIpInput').value = '';
        showToast('IP banned. Bye bye.', 'success');
        setTimeout(() => location.reload(), 800);
      })
      .catch(err => showToast(err.message || 'Failed', 'error'));
  });

  document.getElementById('bannedIpList').addEventListener('click', function (e) {
    const btn = e.target.closest('.unban-btn');
    if (!btn) return;
    fetch('/admin/settings/unban-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: btn.dataset.ip }) })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Failed');
        showToast('IP unbanned. Welcome back.', 'success');
        setTimeout(() => location.reload(), 800);
      })
      .catch(err => showToast(err.message || 'Failed', 'error'));
  });

  document.getElementById('resetButton').addEventListener('click', function () {
    window.modal.confirm({
      title: 'Reset settings',
      body:  'Reset all appearance settings to their defaults?',
      danger: true,
      confirmLabel: 'Reset',
      onConfirm: () => {
        fetch('/admin/settings/reset', { method: 'POST' })
          .then(r => r.json())
          .then(d => {
            if (d.success) { showToast('Settings reset to defaults.', 'success'); setTimeout(() => location.reload(), 1200); }
            else showToast(d.error || 'Failed', 'error');
          })
           .catch(() => showToast('Something went wrong.', 'error'));
      },
    });
  });

  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', function () {
      const group = document.querySelectorAll(`input[name="${this.name}"]`);
      group.forEach(r => {
        const label = r.closest('label');
        if (!label) return;
        const ring = label.querySelector('.rounded-full.border-2');
        const dot  = ring?.querySelector('.al-radio-dot-active');
        if (r.checked) {
          label.classList.add('al-radio-active');
          label.classList.remove('border-neutral-200', 'dark:border-neutral-600/30');
          if (ring) { ring.classList.add('al-radio-ring-active'); ring.classList.remove('border-neutral-300', 'dark:border-neutral-600'); }
          if (!dot && ring) { const d = document.createElement('span'); d.className = 'w-2.5 h-2.5 rounded-full al-radio-dot-active'; ring.appendChild(d); }
        } else {
          label.classList.remove('al-radio-active');
          label.classList.add('border-neutral-200', 'dark:border-neutral-600/30');
          if (ring) { ring.classList.remove('al-radio-ring-active'); ring.classList.add('border-neutral-300', 'dark:border-neutral-600'); }
          dot?.remove();
        }
      });
    });
  });
})();
