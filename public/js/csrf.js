/**
 * CSRF protection utilities for AJAX requests
 */
(function() {
  // Get the CSRF token from the meta tag
  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  }

  // Add CSRF token to fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    // Only add CSRF token to same-origin POST, PUT, DELETE, PATCH requests
    if (
      !url.startsWith('http') || 
      url.startsWith(window.location.origin)
    ) {
      options = options || {};
      options.headers = options.headers || {};
      
      // Add CSRF token for non-GET methods
      const method = options.method?.toUpperCase() || 'GET';
      if (method !== 'GET') {
        const token = getCsrfToken();
        if (token) {
          options.headers['CSRF-Token'] = token;
        }
      }
    }
    
    return originalFetch.call(this, url, options);
  };

  // Add CSRF token to XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    const token = getCsrfToken();
    const originalSend = this.send;
    
    this.send = function(data) {
      if (
        token && 
        method.toUpperCase() !== 'GET' && 
        (!url.startsWith('http') || url.startsWith(window.location.origin))
      ) {
        this.setRequestHeader('CSRF-Token', token);
      }
      return originalSend.apply(this, arguments);
    };
    
    return originalXhrOpen.apply(this, arguments);
  };
})();
