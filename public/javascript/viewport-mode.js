(function () {
  var MOBILE_BREAKPOINT = 1024;
  var COOKIE_NAME = 'viewport_mode';
  var CHECK_DELAY = 300;
  var resizeTimer = null;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + value + '; path=/; SameSite=Strict; max-age=31536000';
  }

  function getRequiredMode() {
    return window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
  }

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
