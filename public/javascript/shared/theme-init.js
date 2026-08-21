/**
 * Theme initialization — extracted from header.ejs and auth-header.ejs.
 *
 * Handles:
 * - Reading user preference from localStorage
 * - Falling back to system preference
 * - Toggling light/dark theme stylesheets
 * - Terminal theme notification
 * - Dispatching al:themechange event
 *
 * Called immediately on page load to prevent flash.
 * Must carry a CSP nonce when inline; this external file does not need one.
 */
(function () {
  if (window.__themeInit) return;
  window.__themeInit = true;

  function initializeTheme() {
    var userPreference = localStorage.getItem('theme');
    var systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (userPreference === 'dark' || (!userPreference && systemPreference)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    applyThemeSheets();
  }

  function applyThemeSheets() {
    var isDark = document.documentElement.classList.contains('dark');
    var lightSheet = document.getElementById('light-theme-css');
    var darkSheet = document.getElementById('dark-theme-css');
    if (lightSheet) lightSheet.disabled = isDark;
    if (darkSheet) darkSheet.disabled = !isDark;
  }

  function toggleTheme() {
    var isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyThemeSheets();
    if (typeof window.setTerminalTheme === 'function') {
      window.setTerminalTheme();
    }
    window.dispatchEvent(new CustomEvent('al:themechange'));
  }

  // Expose for use by other scripts
  window.initializeTheme = initializeTheme;
  window.toggleTheme = toggleTheme;
  window.applyThemeSheets = applyThemeSheets;

  // Run immediately
  initializeTheme();
})();
