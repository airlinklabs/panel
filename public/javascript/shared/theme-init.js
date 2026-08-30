/**
 * Theme initialization — simplified for admin-controlled theme.
 *
 * The admin selects a single theme for all users. The dark class is
 * set server-side in the inline script in header.ejs. This module
 * just exposes applyThemeSheets for live preview in the admin settings.
 */
(function () {
  if (window.__themeInit) return;
  window.__themeInit = true;

  function applyThemeSheets() {
    var isDark = document.documentElement.classList.contains("dark");
    var themeSheet = document.getElementById("theme-css");
    // Single theme sheet is always enabled — the dark class is set server-side
    if (themeSheet) themeSheet.disabled = false;
  }

  // Expose for use by other scripts
  window.applyThemeSheets = applyThemeSheets;

  // Run immediately
  applyThemeSheets();
})();
