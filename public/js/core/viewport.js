(function () {
  var MOBILE_BREAKPOINT = 1024;
  var COOKIE_NAME = 'viewport_mode';
  var FORCE_COOKIE = 'force_desktop';
  var CHECK_DELAY = 300;
  var resizeTimer = null;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, maxAge) {
    document.cookie = name + '=' + value + '; path=/; SameSite=Strict; max-age=' + (maxAge || 31536000);
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; SameSite=Strict; max-age=0';
  }

  function isForceDesktop() {
    return getCookie(FORCE_COOKIE) === '1';
  }

  function getRequiredMode() {
    if (isForceDesktop()) return 'desktop';
    return window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
  }

  function checkAndSwitch() {
    // Never auto-switch away from desktop when force mode is on
    if (isForceDesktop()) return;
    var current = getCookie(COOKIE_NAME);
    var required = getRequiredMode();
    if (current !== required) {
      setCookie(COOKIE_NAME, required);
      window.location.reload();
    }
  }

  // Public API used by the account page toggle
  window.viewportMode = {
    enableForceDesktop: function () {
      setCookie(FORCE_COOKIE, '1');
      setCookie(COOKIE_NAME, 'desktop');
      window.location.reload();
    },
    disableForceDesktop: function () {
      deleteCookie(FORCE_COOKIE);
      setCookie(COOKIE_NAME, getRequiredMode());
      window.location.reload();
    },
    isForceDesktop: isForceDesktop,
  };

  if (!getCookie(COOKIE_NAME)) {
    setCookie(COOKIE_NAME, getRequiredMode());
  }

  // If force desktop is set but cookie says mobile, correct it immediately
  if (isForceDesktop() && getCookie(COOKIE_NAME) !== 'desktop') {
    setCookie(COOKIE_NAME, 'desktop');
    window.location.reload();
  }

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(checkAndSwitch, CHECK_DELAY);
  });
})();
