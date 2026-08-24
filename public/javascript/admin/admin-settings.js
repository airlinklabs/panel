(function () {
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_UPLOAD_LIMIT = 100;

var formAppearance = document.getElementById('form-appearance');

/* ── Auto-save indicator ─────────────────── */
function showSaved() {
  var el = document.getElementById('autosave-indicator');
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function() { el.style.opacity = '0'; }, 2000);
}

/* ── POST helper ─────────────────────────── */
function post(url, body) {
  return fetch(url, {
    method:  'POST',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body:    body instanceof FormData ? body : JSON.stringify(body),
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.success) throw new Error(d.error || 'Failed');
      showSaved();
      return d;
    })
    .catch(function(err) { showToast(err.message || 'Failed', 'error'); return false; });
}

/* ── In-place DOM helpers ─────────────────── */

function applyThemeCss(value) {
  var link = document.getElementById('theme-css');
  if (value && value !== 'default' && value !== 'light' && value !== 'dark') {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'theme-css';
      document.head.appendChild(link);
    }
    link.href = value;
  } else if (link) {
    link.parentNode.removeChild(link);
  }
}

function applyThemeFromForm() {
  if (!formAppearance) return;
  var checked = formAppearance.querySelector('input[name="theme"]:checked');
  var value = checked ? checked.value : 'dark';
  applyThemeCss(value);
  // Toggle dark class: add for dark/custom themes, remove for light
  var isLightTheme = value === 'light' || (value && value.indexOf('light') !== -1);
  if (isLightTheme) {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
  if (window.applyThemeSheets) window.applyThemeSheets();
}

/* ── Panel wallpaper live preview ────────────── */
function applyWallpaperFromResponse(url) {
  var layer = document.getElementById('al-wallpaper-layer');
  var body = document.body;
  if (url) {
    body.classList.add('al-wallpaper');
    body.style.setProperty('--al-wallpaper-image', "url('" + url + "')");
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'al-wallpaper-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(layer, document.body.firstChild);
    }
  } else {
    body.classList.remove('al-wallpaper');
    body.style.removeProperty('--al-wallpaper-image');
    if (layer) layer.parentNode.removeChild(layer);
  }
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

/* ── Auto-save: appearance ──────────────────── */
function saveAppearance() {
  if (!formAppearance) return;
  var fd = new FormData();
  // Title
  var titleInput = formAppearance.querySelector('input[name="title"]');
  if (titleInput) fd.set('title', titleInput.value);
  // Theme radio
  var themeRadio = formAppearance.querySelector('input[name="theme"]:checked');
  if (themeRadio) fd.set('theme', themeRadio.value);
  // File uploads (only if user selected a file)
  ['logo-input', 'favicon-input', 'theme-file-input', 'login-wallpaper-file', 'register-wallpaper-file', 'panel-wallpaper-file'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el._selectedFile) {
      fd.set(el.name, el._selectedFile);
    }
  });
  // Wallpaper URLs
  ['login-wallpaper-url', 'register-wallpaper-url', 'panel-wallpaper-url'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) fd.set(el.name, el.value);
  });
  post('/admin/settings', fd).then(function(ok) {
    if (ok) {
      applyThemeFromForm();
      applyWallpaperFromResponse(ok.panelWallpaper);
    }
  });
}

/* ── Auto-save: servers tab ─────────────────── */
function saveServers() {
  post('/admin/settings/server-policy', {
    allowUserCreateServer: document.getElementById('allowUserCreateServer').checked,
    allowUserDeleteServer: document.getElementById('allowUserDeleteServer').checked,
    allowUserCreateImages: document.getElementById('allowUserCreateImages').checked,
    onboardingEnabled: document.getElementById('onboardingEnabled').checked,
    defaultServerLimit:    parseInt(document.getElementById('defaultServerLimit').value, 10) || 0,
    defaultMaxMemory:      parseInt(document.getElementById('defaultMaxMemory').value,   10) || 0,
    defaultMaxCpu:         parseInt(document.getElementById('defaultMaxCpu').value,      10) || 0,
    defaultMaxStorage:     parseInt(document.getElementById('defaultMaxStorage').value,  10) || 0,
    defaultMaxDatabases:   parseInt(document.getElementById('defaultMaxDatabases').value, 10) || 0,
    defaultOverallocateMemory: parseInt(document.getElementById('defaultOverallocateMemory').value, 10) || 0,
    defaultOverallocateDisk:   parseInt(document.getElementById('defaultOverallocateDisk').value, 10) || 0,
    defaultOverallocateCpu:    parseInt(document.getElementById('defaultOverallocateCpu').value, 10) || 0,
    uploadLimit:           parseInt(document.getElementById('uploadLimitInput').value,   10) || DEFAULT_UPLOAD_LIMIT,
  });
}

/* ── Auto-save: security tab ────────────────── */
function saveSecurity() {
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
  ]);
}

/* ── Auto-save listeners ──────────────────── */

// Appearance: text inputs save on blur
if (formAppearance) {
  formAppearance.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(input) {
    input.addEventListener('change', function() { saveAppearance(); });
  });
  // Theme radio buttons
  formAppearance.querySelectorAll('input[name="theme"]').forEach(function(radio) {
    radio.addEventListener('change', function() { saveAppearance(); });
  });
}

// Servers tab: save on any input change
var serversPanel = document.getElementById('panel-servers');
if (serversPanel) {
  serversPanel.querySelectorAll('input').forEach(function(input) {
    input.addEventListener('change', function() { saveServers(); });
  });
}

// Security tab: save on any input change
var securityPanel = document.getElementById('panel-security');
if (securityPanel) {
  securityPanel.querySelectorAll('input').forEach(function(input) {
    input.addEventListener('change', function() { saveSecurity(); });
  });
}

/* ── IP banning ──────────────────────────── */
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

function banRowHtml(ip) {
  return '<div class="flex items-center justify-between rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 px-4 py-2.5">' +
    '<span class="text-sm font-mono text-neutral-700 dark:text-neutral-300">' + window.escHtml(ip) + '</span>' +
    '<button type="button" class="unban-btn text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition inline-flex items-center gap-1.5" data-ip="' + window.escAttr(ip) + '">' +
    (window.alIcon ? window.alIcon('shield-check', 'size-3', { strokeWidth: 1.5 }) : '') + 'Unban</button></div>';
}

function addBanRow(ip) {
  var list = document.getElementById('bannedIpList');
  if (!list) return;
  var hasEmpty = Array.prototype.some.call(list.children, function(child) { return child.tagName === 'P'; });
  if (hasEmpty) {
    Array.prototype.forEach.call(list.children, function(child) {
      if (child.tagName === 'P') child.parentNode.removeChild(child);
    });
  }
  al.addRow(list, banRowHtml(ip));
}

function removeBanRow(btn) {
  var row = btn.closest('.flex.items-center.justify-between');
  if (!row) return;
  var list = document.getElementById('bannedIpList');
  al.removeRow(row).then(function() {
    if (list && !list.querySelector('.unban-btn')) {
      var p = document.createElement('p');
      p.className = 'text-sm text-neutral-400';
      p.textContent = 'No banned IPs.';
      list.appendChild(p);
    }
  });
}

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

/* ── Radio button style toggle ──────────── */
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
