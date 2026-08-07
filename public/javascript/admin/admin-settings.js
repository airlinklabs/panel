const DEFAULT_SMTP_PORT = 587;
const DEFAULT_UPLOAD_LIMIT = 100;

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
        return true;
      })
      .catch(function(err) { showToast(err.message || 'Failed', 'error'); return false; })
      .finally(function() { if (btn) { btn.disabled = false; btn.textContent = orig; } });
  }

  var formAppearance = document.getElementById('form-appearance');

  window.tabHandlers = window.tabHandlers || {};
  window.tabLabels = window.tabLabels || {};
  window.tabResetHandlers = window.tabResetHandlers || {};

  /* ── In-place DOM helpers ─────────────────── */

  function applyThemeCss(mode, value) {
    var link = document.getElementById(mode + '-theme-css');
    if (value && value !== 'default') {
      if (!link) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.id = mode + '-theme-css';
        link.setAttribute('data-theme-mode', mode);
        document.head.appendChild(link);
      }
      link.href = value;
    } else if (link) {
      link.parentNode.removeChild(link);
    }
  }

  function applyThemeFromForm() {
    if (!formAppearance) return;
    var light = formAppearance.querySelector('input[name="lightTheme"]:checked');
    var dark  = formAppearance.querySelector('input[name="darkTheme"]:checked');
    applyThemeCss('light', light ? light.value : 'default');
    applyThemeCss('dark',  dark  ? dark.value  : 'default');
    if (window.applyThemeSheets) window.applyThemeSheets();
  }

  function selectThemeRadio(name, value) {
    if (!formAppearance) return;
    var changed = false;
    formAppearance.querySelectorAll('input[name="' + name + '"]').forEach(function(radio) {
      var on = radio.value === value;
      if (radio.checked !== on) { radio.checked = on; changed = true; }
    });
    if (changed) {
      var checked = formAppearance.querySelector('input[name="' + name + '"]:checked');
      if (checked) checked.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function resetAppearanceForm() {
    if (!formAppearance) return;
    var title = formAppearance.querySelector('input[name="title"]');
    if (title) title.value = 'Airlink';
    selectThemeRadio('lightTheme', 'default');
    selectThemeRadio('darkTheme', 'default');
    var loginUrl = document.getElementById('login-wallpaper-url');
    var registerUrl = document.getElementById('register-wallpaper-url');
    if (loginUrl) loginUrl.value = '';
    if (registerUrl) registerUrl.value = '';
    document.querySelectorAll('#panel-appearance img').forEach(function(img) { img.remove(); });
    applyThemeCss('light', 'default');
    applyThemeCss('dark', 'default');
  }

  var formSnapshot = [];
  function snapshotForms() {
    formSnapshot = [];
    document.querySelectorAll('#panel-servers input, #panel-security input, #panel-security select, #panel-security textarea').forEach(function(el) {
      formSnapshot.push({ el: el, value: el.value, checked: el.checked, text: null });
    });
    document.querySelectorAll('#panel-servers [data-format-switcher], #panel-security [data-format-switcher]').forEach(function(btn) {
      formSnapshot.push({ el: btn, value: btn.textContent, checked: null, text: true });
    });
  }
  function syncFormatSwitchers() {
    document.querySelectorAll('#panel-servers [data-format-switcher], #panel-security [data-format-switcher]').forEach(function(btn) {
      var display = document.getElementById(btn.dataset.display);
      var hidden  = document.getElementById(btn.dataset.hidden);
      if (!display || !hidden) return;
      var v = parseInt(hidden.value, 10);
      if (isNaN(v) || v <= 0) return;
      if (v >= 1024) {
        display.value = Math.round(v / 1024);
        btn.textContent = 'GB';
      } else {
        display.value = v;
        btn.textContent = 'MB';
      }
    });
  }
  function restoreForm() {
    formSnapshot.forEach(function(s) {
      if (s.text) { s.el.textContent = s.value; return; }
      s.el.value = s.value;
      s.el.checked = s.checked;
    });
    syncFormatSwitchers();
  }

  function banRowHtml(ip) {
    return '<div class="flex items-center justify-between rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 px-4 py-2.5">' +
      '<span class="text-sm font-mono text-neutral-700 dark:text-neutral-300">' + window.escHtml(ip) + '</span>' +
      '<button type="button" class="unban-btn text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition inline-flex items-center gap-1.5" data-ip="' + window.escAttr(ip) + '">' +
      (window.alIcon ? window.alIcon('shield-check', 'size-3', { strokeWidth: 1.5 }) : '') + 'Unban</button></div>';
  }

  function showEmptyBanList(list) {
    if (!list) return;
    var hasEmpty = Array.prototype.some.call(list.children, function(child) { return child.tagName === 'P'; });
    if (hasEmpty) return;
    var p = document.createElement('p');
    p.className = 'text-sm text-neutral-400';
    p.textContent = 'No banned IPs.';
    list.appendChild(p);
  }

  function hideEmptyBanList(list) {
    if (!list) return;
    Array.prototype.forEach.call(list.children, function(child) {
      if (child.tagName === 'P') child.parentNode.removeChild(child);
    });
  }

  function addBanRow(ip) {
    var list = document.getElementById('bannedIpList');
    if (!list) return;
    hideEmptyBanList(list);
    al.addRow(list, banRowHtml(ip));
  }

  function removeBanRow(btn) {
    var row = btn.closest('.flex.items-center.justify-between');
    if (!row) return;
    var list = document.getElementById('bannedIpList');
    al.removeRow(row).then(function() {
      if (list && !list.querySelector('.unban-btn')) showEmptyBanList(list);
    });
  }

  snapshotForms();

  /* ── Appearance ──────────────────────────── */
  window.tabHandlers['appearance'] = function() {
    if (!formAppearance) return;
    const btn = document.getElementById('tab-save-btn');
    const fd = new FormData(formAppearance);
    post('/admin/settings', fd, btn).then(function(ok) { if (ok) applyThemeFromForm(); });
  };
  window.tabLabels['appearance'] = 'Save';
  window.tabResetHandlers['appearance'] = function() {
    window.modal.confirm({
      title: 'Reset settings',
      body:  'Reset all appearance settings to their defaults?',
      danger: true,
      confirmLabel: 'Reset',
      onConfirm: async function() {
        const d = await window.api('/admin/settings/reset', 'POST');
        if (d && d.success) {
          showToast('Settings reset to defaults.', 'success');
          resetAppearanceForm();
        } else if (d) {
          showToast(d.error || 'Failed', 'error');
        }
      },
    });
  };

  /* ── Servers ─────────────────────────────── */
  window.tabHandlers['servers'] = function() {
    const btn = document.getElementById('tab-save-btn');
    post('/admin/settings/server-policy', {
      allowUserCreateServer: document.getElementById('allowUserCreateServer').checked,
      allowUserDeleteServer: document.getElementById('allowUserDeleteServer').checked,
      defaultServerLimit:    parseInt(document.getElementById('defaultServerLimit').value, 10) || 0,
      defaultMaxMemory:      parseInt(document.getElementById('defaultMaxMemory').value,   10) || 0,
      defaultMaxCpu:         parseInt(document.getElementById('defaultMaxCpu').value,      10) || 0,
      defaultMaxStorage:     parseInt(document.getElementById('defaultMaxStorage').value,  10) || 0,
      defaultMaxDatabases:   parseInt(document.getElementById('defaultMaxDatabases').value, 10) || 0,
      defaultOverallocateMemory: parseInt(document.getElementById('defaultOverallocateMemory').value, 10) || 0,
      defaultOverallocateDisk:   parseInt(document.getElementById('defaultOverallocateDisk').value, 10) || 0,
      defaultOverallocateCpu:    parseInt(document.getElementById('defaultOverallocateCpu').value, 10) || 0,
      uploadLimit:           parseInt(document.getElementById('uploadLimitInput').value,   10) || DEFAULT_UPLOAD_LIMIT,
    }, btn);
  };
  window.tabLabels['servers'] = 'Save';
  window.tabResetHandlers['servers'] = function() {
    restoreForm();
    showToast('Changes discarded.', 'success');
  };

  /* ── Security ────────────────────────────── */
  window.tabHandlers['security'] = function() {
    const btn = document.getElementById('tab-save-btn');
    btn.disabled = true; btn.textContent = 'Saving\u2026';

    Promise.all([
      post('/admin/settings/security', {
        rateLimitEnabled:    document.getElementById('rateLimitEnabled').checked,
        rateLimitRpm:        parseInt(document.getElementById('rateLimitRpm').value, 10) || 0,
        loginMaxAttempts:    parseInt(document.getElementById('loginMaxAttempts').value, 10) || 0,
        loginLockoutMinutes: parseInt(document.getElementById('loginLockoutMinutes').value, 10) || 0,
        enforceDaemonHttps:  document.getElementById('enforceDaemonHttps').checked,
        require2faForAdmins: document.getElementById('require2faForAdmins').checked,
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
      post('/admin/settings/smtp', {
        smtpHost:     document.getElementById('smtpHost').value.trim() || null,
        smtpPort:     parseInt(document.getElementById('smtpPort').value, 10) || DEFAULT_SMTP_PORT,
        smtpUser:     document.getElementById('smtpUser').value.trim() || null,
        smtpPassword: document.getElementById('smtpPassword').value || null,
        smtpFrom:     document.getElementById('smtpFrom').value.trim() || null,
        smtpSecure:   document.getElementById('smtpSecure').checked,
      }),
      post('/admin/settings/s3', {
        s3Enabled:    document.getElementById('s3Enabled').checked,
        s3Endpoint:   document.getElementById('s3Endpoint').value.trim() || null,
        s3Region:     document.getElementById('s3Region').value.trim() || null,
        s3Bucket:     document.getElementById('s3Bucket').value.trim() || null,
        s3AccessKey:  document.getElementById('s3AccessKey').value.trim() || null,
        s3SecretKey:  document.getElementById('s3SecretKey').value || null,
        s3PathStyle:  document.getElementById('s3PathStyle').checked,
      }),
    ]).then(function() {
      btn.disabled = false; btn.textContent = 'Save';
    }).catch(function(err) {
      console.error('Security settings save error:', err);
      btn.disabled = false; btn.textContent = 'Save';
    });
  };
  window.tabLabels['security'] = 'Save';
  window.tabResetHandlers['security'] = function() {
    restoreForm();
    showToast('Changes discarded.', 'success');
  };

  /* ── SMTP test ──────────────────────────── */
  document.getElementById('smtpTestBtn').addEventListener('click', function () {
    const btn = this;
    const result = document.getElementById('smtpTestResult');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Testing\u2026';
    result.classList.add('hidden');
    fetch('/admin/settings/smtp/test', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        result.classList.remove('hidden');
        result.textContent = d.success ? 'Connection OK.' : d.error || 'Connection failed.';
        result.className = 'px-5 pb-5 text-xs ' + (d.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');
      })
      .catch(function() {
        result.classList.remove('hidden');
        result.textContent = 'Connection failed.';
        result.className = 'px-5 pb-5 text-xs text-red-600 dark:text-red-400';
      })
      .finally(function() { btn.disabled = false; btn.innerHTML = orig; });
  });

  /* ── S3 test ──────────────────────────── */
  document.getElementById('s3TestBtn').addEventListener('click', function () {
    const btn = this;
    const result = document.getElementById('s3TestResult');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Testing\u2026';
    result.classList.add('hidden');
    fetch('/admin/settings/s3/test', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        result.classList.remove('hidden');
        result.textContent = d.success ? d.message || 'Connection OK.' : d.error || 'Connection failed.';
        result.className = 'px-5 pb-5 text-xs ' + (d.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');
      })
      .catch(function() {
        result.classList.remove('hidden');
        result.textContent = 'Connection failed.';
        result.className = 'px-5 pb-5 text-xs text-red-600 dark:text-red-400';
      })
      .finally(function() { btn.disabled = false; btn.innerHTML = orig; });
  });

  /* ── IP banning (not tab-specific) ───────── */
  document.getElementById('banIpBtn').addEventListener('click', async function () {
    const ip = document.getElementById('banIpInput').value.trim();
    if (!ip) return showToast('Enter an IP address', 'error');
    const d = await window.api('/admin/settings/ban-ip', 'POST', { ip });
    if (d && d.success) {
      document.getElementById('banIpInput').value = '';
      showToast('IP banned. Bye bye.', 'success');
      addBanRow(ip);
    } else if (d) {
      showToast(d.error || 'Failed', 'error');
    }
  });

  document.getElementById('bannedIpList').addEventListener('click', async function (e) {
    var btn = e.target.closest('.unban-btn');
    if (!btn) return;
    const d = await window.api('/admin/settings/unban-ip', 'POST', { ip: btn.dataset.ip });
    if (d && d.success) {
      showToast('IP unbanned. Welcome back.', 'success');
      removeBanRow(btn);
    } else if (d) {
      showToast(d.error || 'Failed', 'error');
    }
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
