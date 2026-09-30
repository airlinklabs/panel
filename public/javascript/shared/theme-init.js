/**
 * Theme initialization — prevent flash-of-wrong-theme, and bind every
 * light/dark switch in the shell ([data-theme-toggle], rendered by
 * partials/topbar.ejs on desktop and partials/bottom-nav.ejs on phones).
 *
 * The server renders the class on <html> from panel settings; a per-browser
 * override in localStorage wins when present so the switch survives reloads.
 * Runs synchronously before first paint when loaded as a blocking script;
 * the switch binding waits for DOM ready because the two bars are parsed at
 * different points in the document.
 */
(function () {
  if (window.__themeInit) {return;}
  window.__themeInit = true;

  var STORAGE_KEY = 'al-theme';

  function readPreference() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (err) {
      return null;
    }
  }

  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function apply(dark, persist) {
    document.documentElement.classList.toggle('dark', dark);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      } catch (err) {
        /* private mode — the choice simply does not persist */
      }
    }
    applyThemeSheets();
    document.dispatchEvent(new CustomEvent('al:theme-change', { detail: { dark: dark } }));
  }

  function applyThemeSheets() {
    var themeSheet = document.getElementById('theme-css');
    if (themeSheet) {themeSheet.disabled = false;}
  }

  var stored = readPreference();
  if (stored) {apply(stored === 'dark', false);}

  window.applyThemeSheets = applyThemeSheets;
  window.alTheme = {
    isDark: isDark,
    set: function (dark) {apply(!!dark, true);},
    toggle: function () {apply(!isDark(), true);},
  };

  applyThemeSheets();

  /* ── Switch binding ───────────────────────────────────────────────
     Every switch in the shell carries [data-theme-toggle] — the desktop
     topbar and the phone top bar each render one. They are parsed at
     different points, so bind once the document is complete and keep
     aria-checked / aria-label in sync across all of them (the same
     contract search.js uses for [data-search-trigger]). */
  var switches = [];

  function t_(key, fallback) {
    var dict = window.__i18n || {};
    return dict[key] || fallback;
  }

  function syncSwitches() {
    var dark = isDark();
    for (var i = 0; i < switches.length; i++) {
      switches[i].setAttribute('aria-checked', dark ? 'true' : 'false');
      switches[i].setAttribute(
        'aria-label',
        dark ? t_('lightMode', 'Light Mode') : t_('darkMode', 'Dark Mode'),
      );
    }
  }

  function bindSwitches() {
    switches = Array.prototype.slice.call(
      document.querySelectorAll('[data-theme-toggle]'),
    );
    for (var i = 0; i < switches.length; i++) {
      if (switches[i].getAttribute('data-theme-bound')) {continue;}
      switches[i].setAttribute('data-theme-bound', '1');
      switches[i].addEventListener('click', function () {
        window.alTheme.toggle();
      });
    }
    syncSwitches();
  }

  document.addEventListener('al:theme-change', syncSwitches);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSwitches);
  } else {
    bindSwitches();
  }
})();
