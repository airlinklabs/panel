/**
 * Theme initialization — prevent flash-of-wrong-theme.
 *
 * Reads the dark-mode class from <html> (set server-side) and
 * ensures the theme stylesheet is enabled. Runs synchronously
 * before first paint when loaded as a blocking script.
 */
(function () {
  if (window.__themeInit) {return;}
  window.__themeInit = true;

  function applyThemeSheets() {
    const themeSheet = document.getElementById('theme-css');
    if (themeSheet) {themeSheet.disabled = false;}
  }

  window.applyThemeSheets = applyThemeSheets;
  applyThemeSheets();
})();
