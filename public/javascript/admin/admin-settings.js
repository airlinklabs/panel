(function () {
  function post(url, body, btn) {
    var orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
    return fetch(url, {
      method:  'POST',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body:    body instanceof FormData ? body : JSON.stringify(body),
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.success) throw new Error(d.error || 'Failed');
        showToast('Settings saved. Looking good.', 'success');
      })
      .catch(function(err) { showToast(err.message || 'Failed', 'error'); })
      .finally(function() { if (btn) { btn.disabled = false; btn.textContent = orig; } });
  }

  var formAppearance = document.getElementById('form-appearance');

  window.tabHandlers = window.tabHandlers || {};
  window.tabLabels = window.tabLabels || {};
  window.tabResetHandlers = window.tabResetHandlers || {};

  /* ── Appearance ──────────────────────────── */
  window.tabHandlers['appearance'] = function() {
    if (!formAppearance) return;
    var btn = document.getElementById('tab-save-btn');
    var fd = new FormData(formAppearance);
    post('/admin/settings', fd, btn).then(function() { setTimeout(function() { location.reload(); }, 1200); });
  };
  window.tabLabels['appearance'] = 'Save';
  window.tabResetHandlers['appearance'] = function() {
    window.modal.confirm({
      title: 'Reset settings',
      body:  'Reset all appearance settings to their defaults?',
      danger: true,
      confirmLabel: 'Reset',
      onConfirm: function() {
        fetch('/admin/settings/reset', { method: 'POST' })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.success) { showToast('Settings reset to defaults.', 'success'); setTimeout(function() { location.reload(); }, 1200); }
            else showToast(d.error || 'Failed', 'error');
          })
          .catch(function() { showToast('Something went wrong.', 'error'); });
      },
    });
  };

  /* ── Servers ─────────────────────────────── */
  window.tabHandlers['servers'] = function() {
    var btn = document.getElementById('tab-save-btn');
    post('/admin/settings/server-policy', {
      allowUserCreateServer: document.getElementById('allowUserCreateServer').checked,
      allowUserDeleteServer: document.getElementById('allowUserDeleteServer').checked,
      defaultServerLimit:    parseInt(document.getElementById('defaultServerLimit').value, 10),
      defaultMaxMemory:      parseInt(document.getElementById('defaultMaxMemory').value,   10),
      defaultMaxCpu:         parseInt(document.getElementById('defaultMaxCpu').value,      10),
      defaultMaxStorage:     parseInt(document.getElementById('defaultMaxStorage').value,  10),
      uploadLimit:           parseInt(document.getElementById('uploadLimitInput').value,   10) || 100,
    }, btn);
  };
  window.tabLabels['servers'] = 'Save';
  window.tabResetHandlers['servers'] = function() { location.reload(); };

  /* ── Security ────────────────────────────── */
  window.tabHandlers['security'] = function() {
    var btn = document.getElementById('tab-save-btn');
    btn.disabled = true; btn.textContent = 'Saving\u2026';

    Promise.all([
      post('/admin/settings/security', {
        rateLimitEnabled:    document.getElementById('rateLimitEnabled').checked,
        rateLimitRpm:        parseInt(document.getElementById('rateLimitRpm').value, 10),
        loginMaxAttempts:    parseInt(document.getElementById('loginMaxAttempts').value, 10),
        loginLockoutMinutes: parseInt(document.getElementById('loginLockoutMinutes').value, 10),
        enforceDaemonHttps:  document.getElementById('enforceDaemonHttps').checked,
        behindReverseProxy:  document.getElementById('behindReverseProxy').checked,
        hashApiKeys:         document.getElementById('hashApiKeys').checked,
        virusTotalApiKey:    document.getElementById('vtKeyInput').value.trim() || null,
      }),
      post('/admin/settings', (function() {
        var fd = new FormData();
        var reg = document.getElementById('allowRegistration');
        fd.set('allowRegistration', reg && reg.checked ? 'true' : 'false');
        return fd;
      })()),
    ]).then(function() {
      btn.disabled = false; btn.textContent = 'Save';
    }).catch(function() {
      btn.disabled = false; btn.textContent = 'Save';
    });
  };
  window.tabLabels['security'] = 'Save';
  window.tabResetHandlers['security'] = function() { location.reload(); };

  /* ── IP banning (not tab-specific) ───────── */
  document.getElementById('banIpBtn').addEventListener('click', function () {
    var ip = document.getElementById('banIpInput').value.trim();
    if (!ip) return showToast('Enter an IP address', 'error');
    fetch('/admin/settings/ban-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.success) throw new Error(d.error || 'Failed');
        document.getElementById('banIpInput').value = '';
        showToast('IP banned. Bye bye.', 'success');
        setTimeout(function() { location.reload(); }, 800);
      })
      .catch(function(err) { showToast(err.message || 'Failed', 'error'); });
  });

  document.getElementById('bannedIpList').addEventListener('click', function (e) {
    var btn = e.target.closest('.unban-btn');
    if (!btn) return;
    fetch('/admin/settings/unban-ip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: btn.dataset.ip }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.success) throw new Error(d.error || 'Failed');
        showToast('IP unbanned. Welcome back.', 'success');
        setTimeout(function() { location.reload(); }, 800);
      })
      .catch(function(err) { showToast(err.message || 'Failed', 'error'); });
  });

  /* ── Radio button style toggle ──────────── */
  if (window._rebindTabHandlers) window._rebindTabHandlers();

  document.querySelectorAll('input[type="radio"]').forEach(function(radio) {
    radio.addEventListener('change', function () {
      var group = document.querySelectorAll('input[name="' + this.name + '"]');
      group.forEach(function(r) {
        var label = r.closest('label');
        if (!label) return;
        var ring = label.querySelector('.rounded-full.border-2');
        var dot  = ring && ring.querySelector('.al-radio-dot-active');
        if (r.checked) {
          label.classList.add('al-radio-active');
          label.classList.remove('border-neutral-200', 'dark:border-neutral-600/30');
          if (ring) { ring.classList.add('al-radio-ring-active'); ring.classList.remove('border-neutral-300', 'dark:border-neutral-600'); }
          if (!dot && ring) { var d = document.createElement('span'); d.className = 'w-2.5 h-2.5 rounded-full al-radio-dot-active'; ring.appendChild(d); }
        } else {
          label.classList.remove('al-radio-active');
          label.classList.add('border-neutral-200', 'dark:border-neutral-600/30');
          if (ring) { ring.classList.remove('al-radio-ring-active'); ring.classList.add('border-neutral-300', 'dark:border-neutral-600'); }
          if (dot) dot.remove();
        }
      });
    });
  });
})();
