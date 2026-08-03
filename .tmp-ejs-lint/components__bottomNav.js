/* inline script 1 */

(function () {
  var btn = document.getElementById('mobile-more-btn');
  var sheet = document.getElementById('mobile-more-sheet');
  var close = document.getElementById('mobile-more-close');
  var backdrop = document.getElementById('mobile-more-backdrop');
  var themeToggle = document.getElementById('mobile-theme-toggle');
  var lastFocus = null;

  function openSheet() {
    sheet.classList.remove('translate-y-full');
    sheet.classList.remove('closing');
    backdrop.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    sheet.removeAttribute('inert');
    lastFocus = document.activeElement;
    if (close) close.focus();
  }

  function closeSheet() {
    sheet.classList.add('closing');
    sheet.classList.add('translate-y-full');
    backdrop.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    sheet.setAttribute('inert', '');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  if (sheet) {
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      var focusables = sheet.querySelectorAll('a[href], button:not([disabled])');
      if (focusables.length === 0) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }

  if (btn) btn.addEventListener('click', openSheet);
  if (close) close.addEventListener('click', closeSheet);
  if (backdrop) backdrop.addEventListener('click', closeSheet);

  // Theme toggle for mobile
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      if (typeof toggleTheme === 'function') {
        toggleTheme();
      } else {
        var isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        window.dispatchEvent(new CustomEvent('al:themechange'));
      }
    });
  }

  // Close sheet on any navigation link click
  document.querySelectorAll('.mobile-more-link').forEach(function(link) {
    link.addEventListener('click', closeSheet);
  });

  // Highlight active mobile nav link
  function markActiveMobile(path) {
    var links = document.querySelectorAll('.mobile-nav-link[data-match-prefix]');
    links.forEach(function(link) {
      var prefix = link.getAttribute('data-match-prefix');
      if (prefix && path.startsWith(prefix)) {
        link.classList.add('active-mobile');
        link.style.color = 'var(--theme-nav-text-active)';
      } else {
        link.classList.remove('active-mobile');
        link.style.color = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    markActiveMobile(window.location.pathname);
  });
  document.addEventListener('al:navigated', function () {
    markActiveMobile(window.location.pathname);
  });
})();
