/* inline script 1 */

(function () {
  var SERVER_ID = 'null';
  var sftpPlainPassword = null;
  var lastFocusedElement = null;

  function trapFocus(modal, e) {
    if (e.key !== 'Tab') return;
    var focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  window.openSftpModal = function () {
    var modal = document.getElementById('sftpModal');
    var panel = modal.querySelector('.al-sftp-panel');
    lastFocusedElement = document.activeElement;
    if (window.Animate) Animate.openModal(modal, panel);
    else { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    loadSftpCredentials();
    // Focus first focusable element
    setTimeout(function() {
      var closeBtn = modal.querySelector('button[aria-label="Close SFTP modal"]');
      if (closeBtn) closeBtn.focus();
    }, 0);
    // Add keyboard handlers
    modal._keydownHandler = function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSftpModal();
        return;
      }
      trapFocus(modal, e);
    };
    document.addEventListener('keydown', modal._keydownHandler);
  };

  window.closeSftpModal = function () {
    var modal = document.getElementById('sftpModal');
    var panel = modal.querySelector('.al-sftp-panel');
    // Remove keyboard handler
    if (modal._keydownHandler) {
      document.removeEventListener('keydown', modal._keydownHandler);
      modal._keydownHandler = null;
    }
    var done = function () {
      modal.classList.add('hidden'); modal.classList.remove('flex');
      restoreFocus();
    };
    if (window.Animate && panel) Animate.closeModal(modal, panel, done);
    else done();
  };

  function restoreFocus() {
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  function showSftpState(state) {
    document.getElementById('sftpLoading').classList.toggle('hidden', state !== 'loading');
    document.getElementById('sftpError').classList.toggle('hidden', state !== 'error');
    document.getElementById('sftpCredentials').classList.toggle('hidden', state !== 'credentials');
  }

  function fillCredentials(data) {
    if (data.password) {
      sftpPlainPassword = data.password;
    }

    document.getElementById('sftpValHost').textContent = data.host;
    document.getElementById('sftpValPort').textContent = data.port;
    document.getElementById('sftpValUser').textContent = data.username;
    document.getElementById('sftpValPass').textContent = data.password || sftpPlainPassword || 'Regenerate to view';
    showSftpState('credentials');
  }

  function loadSftpCredentials() {
    showSftpState('loading');
    fetch('/server/' + SERVER_ID + '/sftp/credentials')
      .then(function (resp) {
        if (resp.status === 404) {
          return generateSftpCredentials();
        }
        if (!resp.ok) {
          return resp.json().catch(function () { return {}; }).then(function (d) {
            throw new Error(d.error || 'Request failed (' + resp.status + ')');
          });
        }
        return resp.json().then(fillCredentials);
      })
      .catch(function (err) {
        document.getElementById('sftpErrorMsg').textContent = err.message || 'Unknown error.';
        showSftpState('error');
      });
  }

  window.generateSftpCredentials = function () {
    var btn = document.getElementById('sftpRegenBtn');
    if (btn) btn.disabled = true;
    showSftpState('loading');

    return fetch('/server/' + SERVER_ID + '/sftp/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.json().catch(function () { return {}; }).then(function (d) {
            throw new Error(d.error || 'Request failed (' + resp.status + ')');
          });
        }
        return resp.json();
      })
      .then(function (data) {
        if (btn) btn.disabled = false;
        fillCredentials(data);
        showToast('Fresh credentials ready.', 'success');
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        document.getElementById('sftpErrorMsg').textContent = err.message || 'Unknown error.';
        showSftpState('error');
      });
  };

  window.revokeSftpCredentials = function () {
    fetch('/server/' + SERVER_ID + '/sftp/credentials', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function () {
        closeSftpModal();
        showToast('SFTP access revoked.', 'success');
      })
      .catch(function (err) {
        console.error('Failed to revoke SFTP credentials:', err);
        showToast('Failed to revoke credentials. Try again.', 'error');
      });
  };

  window.sftpCopy = function (elementId) {
    var el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent || '').then(function () {
      showToast('Copied!', 'success');
    }).catch(function () {
      showToast('Copy failed — try selecting and copying manually.', 'error');
    });
  };

  // Touch device support: tap to toggle password reveal
  document.querySelectorAll('.sftp-password').forEach(function(el) {
    el.addEventListener('click', function() {
      this.classList.toggle('blur-sm');
      this.classList.toggle('blur-none');
    });
  });
})();
