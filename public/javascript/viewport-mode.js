(function () {
  var MOBILE_BREAKPOINT = 1024;
  var COOKIE_NAME = 'viewport_mode';
  var CHECK_DELAY = 300;
  var resizeTimer = null;

  /**
   * Retrieve the value of a cookie by name.
   * @param {string} name - Name of the cookie to read.
   * @returns {string|null} The cookie value if found, or `null` if not present.
   */
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  /**
   * Set a cookie with the given name and value using path=/, SameSite=Strict, and a max-age of 1 year.
   * @param {string} name - Cookie name; an existing cookie with the same name will be overwritten.
   * @param {string} value - Cookie value.
   */
  function setCookie(name, value) {
    document.cookie = name + '=' + value + '; path=/; SameSite=Strict; max-age=31536000';
  }

  /**
   * Determine which viewport mode should be active based on the current window width.
   * @returns {'mobile'|'desktop'} `'mobile'` if window.innerWidth is less than MOBILE_BREAKPOINT, `'desktop'` otherwise.
   */
  function getRequiredMode() {
    return window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
  }

  /**
   * Ensure the stored viewport mode matches the current window width and reload the page if it changed.
   *
   * Reads the `viewport_mode` cookie, determines the required mode for the current window width, and if they differ
   * updates the cookie to the required mode and triggers a page reload.
   */
  function checkAndSwitch() {
    var current = getCookie(COOKIE_NAME);
    var required = getRequiredMode();
    if (current !== required) {
      setCookie(COOKIE_NAME, required);
      window.location.reload();
    }
  }

  // Set cookie immediately on first load if not set
  if (!getCookie(COOKIE_NAME)) {
    setCookie(COOKIE_NAME, getRequiredMode());
  }

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(checkAndSwitch, CHECK_DELAY);
  });
})();
