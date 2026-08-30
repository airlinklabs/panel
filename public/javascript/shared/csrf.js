/**
 * CSRF protection utilities for AJAX requests
 */
(function () {
  // Get the CSRF token from the meta tag
  function getCsrfToken() {
    return document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");
  }

  // Add CSRF token to fetch requests
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    // Only add CSRF token to same-origin POST, PUT, DELETE, PATCH requests
    if (!url.startsWith("http") || url.startsWith(window.location.origin)) {
      options = options || {};
      options.headers = options.headers || {};

      // Add CSRF token for non-GET methods, but never duplicate a header
      // the page already set — Express joins duplicate headers with ", "
      // and the joined value would fail token validation.
      const method = options.method?.toUpperCase() || "GET";
      if (method !== "GET") {
        const token = getCsrfToken();
        const hasToken = Object.keys(options.headers).some(
          (h) => h.toLowerCase() === "csrf-token",
        );
        if (token && !hasToken) {
          options.headers["CSRF-Token"] = token;
        }
      }
    }

    const promise = originalFetch.call(this, url, options);

    // Session-expiry surfacing — a 401 on a page request means the session
    // died mid-work. Tell the user instead of failing silently. API routes
    // are exempt (a bad API key is a real auth error, not an expired session).
    promise
      .then((res) => {
        if (res.status === 401 && !String(url).startsWith("/api/")) {
          const cleanUrl =
            typeof url === "string" ? url : url && url.href ? url.href : "";
          if (cleanUrl === window.location.pathname) return;
          if (window.showToast) {
            showToast(
              window.__sessionExpiredMsg ||
                "Your session expired. Please sign in again.",
              "error",
            );
          }
          if (!window.__sessionExpiryRedirecting) {
            window.__sessionExpiryRedirecting = true;
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
          }
        }
      })
      .catch(() => {});

    return promise;
  };

  // Add CSRF token to XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const token = getCsrfToken();
    const originalSend = this.send;

    this.send = function (_data) {
      if (
        token &&
        method.toUpperCase() !== "GET" &&
        (!url.startsWith("http") || url.startsWith(window.location.origin))
      ) {
        this.setRequestHeader("CSRF-Token", token);
      }
      return originalSend.apply(this, arguments);
    };

    return originalXhrOpen.apply(this, arguments);
  };
})();
