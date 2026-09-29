/**
 * CSRF protection — reads token from <meta> and attaches to same-origin
 * non-GET fetch/XHR requests. Also surfaces 401 session expiry.
 */
(function () {
  'use strict';

  function getCsrfToken() {
    return document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute('content');
  }

  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    if (!url.startsWith('http') || url.startsWith(window.location.origin)) {
      options = options || {};
      options.headers = options.headers || {};

      const method = options.method?.toUpperCase() || 'GET';
      if (method !== 'GET') {
        const token = getCsrfToken();
        const hasToken = Object.keys(options.headers).some(
          (h) => h.toLowerCase() === 'csrf-token',
        );
        if (token && !hasToken) {
          options.headers['CSRF-Token'] = token;
        }
      }
    }

    const promise = originalFetch.call(this, url, options);

    promise
      .then((res) => {
        if (res.status === 401 && !String(url).startsWith('/api/')) {
          const cleanUrl =
            typeof url === 'string' ? url : url && url.href ? url.href : '';
          if (cleanUrl === window.location.pathname) {return;}
          if (window.showToast) {
            showToast(
              window.__sessionExpiredMsg ||
                'Your session expired. Please sign in again.',
              'error',
            );
          }
          if (!window.__sessionExpiryRedirecting) {
            window.__sessionExpiryRedirecting = true;
            setTimeout(() => {
              window.location.href = '/login';
            }, 1500);
          }
        }
      })
      .catch(() => {});

    return promise;
  };
})();
