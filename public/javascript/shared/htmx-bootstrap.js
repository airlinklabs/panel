/**
 * HTMX bootstrap module — CSP-compatible, nonce-safe.
 *
 * Responsibilities:
 * 1. Add CSRF token to same-origin unsafe HTMX requests.
 * 2. Handle 401 responses consistently with existing session-expiry behaviour.
 * 3. Dispatch toast events from HX-Trigger headers.
 *
 * Does NOT:
 * - Monkey-patch fetch
 * - Replace HTML globally
 * - Auto-run arbitrary scripts from responses
 */
(function () {
  if (window.__htmxBootstrap) return;
  window.__htmxBootstrap = true;

  // ── CSRF token injection ─────────────────────────────────────────────
  document.body.addEventListener('htmx:configRequest', function (event) {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (!meta) return;
    var token = meta.getAttribute('content');
    if (!token) return;

    var method = (event.detail.verb || 'get').toUpperCase();
    if (method === 'GET') return;

    // Ensure headers object exists and set the CSRF token directly
    if (!event.detail.headers) event.detail.headers = {};
    event.detail.headers['CSRF-Token'] = token;
  });

  // ── Session expiry handling ──────────────────────────────────────────
  document.body.addEventListener('htmx:beforeSend', function (event) {
    var xhr = event.detail.xhr;
    if (!xhr) return;

    var originalOnReadyStateChange = xhr.onreadystatechange;
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 401) {
        var url = event.detail.requestConfig?.path || event.detail.requestConfig?.url || '';
        // Skip API routes (bad API key is a real auth error, not expired session)
        if (url.startsWith('/api/')) return;
        // Skip if this is the current page (avoid redirect loop)
        if (url === window.location.pathname) return;

        if (window.showToast) {
          showToast(
            window.__sessionExpiredMsg || 'Your session expired. Please sign in again.',
            'error'
          );
        }
        if (!window.__sessionExpiryRedirecting) {
          window.__sessionExpiryRedirecting = true;
          setTimeout(function () {
            window.location.href = '/login';
          }, 1500);
        }
      }
      if (originalOnReadyStateChange) {
        originalOnReadyStateChange.apply(this, arguments);
      }
    };
  });

  // ── HX-Trigger event → toast wiring ──────────────────────────────────
  document.body.addEventListener('htmx:beforeSwap', function (event) {
    var xhr = event.detail.xhr;
    if (!xhr) return;

    var triggerHeader = xhr.getResponseHeader('HX-Trigger');
    if (!triggerHeader) return;

    try {
      var triggers = JSON.parse(triggerHeader);
      // Support both flat { al: { toast: {...} } } and direct { "al:toast": {...} }
      var toastData = null;

      if (triggers.al && triggers.al.toast) {
        toastData = triggers.al.toast;
      } else if (triggers['al:toast']) {
        toastData = triggers['al:toast'];
      }

      if (toastData && window.showToast) {
        showToast(
          toastData.message || '',
          toastData.type || 'info'
        );
      }

      // Dispatch custom events from HX-Trigger (e.g. closeMountModal)
      if (triggers.al) {
        for (var key in triggers.al) {
          if (key === 'toast') continue;
          if (triggers.al[key]) {
            document.dispatchEvent(new CustomEvent('al:' + key, { detail: triggers.al[key] }));
          }
        }
      }
    } catch (e) {
      // Malformed HX-Trigger header — ignore silently
    }
  });

  // ── HTMX swap lifecycle — destroy/initialize islands ──────────────────
  document.body.addEventListener('htmx:beforeSwap', function (event) {
    if (event.detail.target && window.Islands && typeof Islands.destroyWithin === 'function') {
      Islands.destroyWithin(event.detail.target);
    }
  });

  document.body.addEventListener('htmx:afterSettle', function (event) {
    var target = event.detail.target;
    if (!target) return;

    // Mount component systems and specialist islands within the swapped target
    if (window.Islands && typeof Islands.mountWithin === 'function') {
      Islands.mountWithin(target);
    }

    // Focus management after swaps
    // If the target has an aria-invalid field, focus it (validation failure)
    var invalidField = target.querySelector('[aria-invalid="true"]');
    if (invalidField) {
      invalidField.focus();
      return;
    }

    // If the target is a form with an error summary, focus the first error
    var errorSummary = target.querySelector('[role="alert"]');
    if (errorSummary) {
      errorSummary.focus();
      return;
    }

    // If the target has role="alert", focus it (error/success message)
    if (target.getAttribute && target.getAttribute('role') === 'alert') {
      target.focus();
      return;
    }
  });
})();
