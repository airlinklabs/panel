/* inline script 1 */

function initializeTheme() {
    const userPreference = localStorage.getItem('theme');
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (userPreference === 'dark' || (!userPreference && systemPreference)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    applyThemeSheets();
  }

  function applyThemeSheets() {
    const isDark = document.documentElement.classList.contains('dark');
    const lightSheet = document.getElementById('light-theme-css');
    const darkSheet = document.getElementById('dark-theme-css');
    if (lightSheet) lightSheet.disabled = isDark;
    if (darkSheet) darkSheet.disabled = !isDark;
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyThemeSheets();
    window.dispatchEvent(new CustomEvent('al:themechange'));
  }

  initializeTheme();
