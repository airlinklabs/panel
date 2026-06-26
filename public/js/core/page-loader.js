(function () {
  'use strict';

  // ── Configure Turbo ───────────────────────────────────────────────────────
  if (window.Turbo) {
    Turbo.setProgressBarDelay(0);
    Turbo.session.drive = true;
    // Only swap page-content, never touch persistent layout elements
    Turbo.session.elementAttribute = 'data-turbo-permanent';
  }

  function normalizePath(p) {
    try { return new URL(p, window.location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch { return p; }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function resetTopbarMotion() {
    document.querySelectorAll('.al-topbar').forEach(function (bar) {
      bar.classList.add('al-topbar-ready');
    });
  }

  function moveDesktopIndicator(link) {
    var bg = document.getElementById('active-background');
    if (!bg || !link) return;

    var ul = link.closest('ul');
    if (!ul) return;

    var linkRect = link.getBoundingClientRect();
    var ulRect = ul.getBoundingClientRect();
    var targetY = linkRect.top - ulRect.top + ul.scrollTop;

    bg.style.height = linkRect.height + 'px';
    bg.style.transform = 'translate3d(0, ' + targetY + 'px, 0)';
    bg.style.opacity = '1';

    if (!bg.dataset.ready || prefersReducedMotion()) {
      bg.dataset.ready = 'true';
      bg.classList.add('is-ready');
      return;
    }

    bg.classList.remove('is-travelling');
    void bg.offsetWidth;
    bg.classList.add('is-travelling');
  }

  function setSearchStateBindings() {
    var shell = document.getElementById('desktop-search-shell');
    if (shell && !shell.dataset.bound) {
      shell.dataset.bound = 'true';
      shell.addEventListener('focusin', function () { shell.classList.add('is-active'); });
      shell.addEventListener('focusout', function () { shell.classList.remove('is-active'); });
    }
  }

  // ── Nav highlight ─────────────────────────────────────────────────────────
  function initHighlight() {
    var path = normalizePath(window.location.pathname);
    var best = null, bestLen = 0;
    document.querySelectorAll('.nav-link').forEach(function (link) {
      var href = normalizePath(link.getAttribute('href') || '');
      var prefix = link.getAttribute('data-match-prefix');
      if (!href) return;
      // Check prefix match first (highest priority for dynamic routes)
      if (prefix && path.startsWith(prefix) && prefix.length > bestLen) {
        best = link;
        bestLen = prefix.length;
        return;
      }
      // Exact match is highest priority
      if (path === href) {
        best = link;
        bestLen = 9999;
        return;
      }
      // Root path match
      if (href === '/' && path === '/' && 1 > bestLen) {
        best = link;
        bestLen = 1;
        return;
      }
      // Prefix match for non-root hrefs
      if (href !== '/' && path.startsWith(href) && href.length > bestLen) {
        best = link;
        bestLen = href.length;
      }
    });
    var isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('active', 'font-medium');
      l.style.color = '';
    });
    if (best) {
      best.classList.add('active', 'font-medium');
      best.style.color = isDark ? '#ffffff' : '#0a0a0a';
      moveDesktopIndicator(best);
    }
    var activeMobileLink = null;
    document.querySelectorAll('.mobile-nav-link').forEach(function (link) {
      var href = normalizePath(link.getAttribute('href') || '');
      var prefix = link.getAttribute('data-match-prefix');
      var exact = link.getAttribute('data-match-exact') === 'true';
      var active = prefix ? path.startsWith(prefix) : exact ? path === href : (path === href || (href !== '/' && path.startsWith(href)));
      var mAlso = link.getAttribute('data-match-prefix-also');
      if (!active && mAlso && path.startsWith(mAlso)) active = true;
      link.classList.toggle('text-neutral-900', active);
      link.classList.toggle('dark:text-white', active);
      link.classList.toggle('active-mobile', active);
      link.classList.toggle('text-neutral-500', !active);
      link.classList.toggle('dark:text-neutral-400', !active);
      if (active && !activeMobileLink) activeMobileLink = link;
    });
  }

  // ── Sidebar special links highlight ───────────────────────────────────────
  function markSpecialLinks(path) {
    var account = document.getElementById('sidebar-account-link');
    var logout  = document.getElementById('sidebar-logout-link');
    var isDark  = document.documentElement.classList.contains('dark');
    if (account) {
      var onAccount = path === '/account' || path.startsWith('/account/');
      account.style.background = onAccount
        ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
        : '';
    }
    if (logout) logout.style.background = '';
  }

  // ── Theme re-init ─────────────────────────────────────────────────────────
  function reinitTheme() {
    if (typeof updateToggleDot === 'function') updateToggleDot();
    if (typeof initializeTheme === 'function') initializeTheme();
  }

  // ── Run on every navigation ───────────────────────────────────────────────
  function onPageLoad() {
    resetTopbarMotion();
    setSearchStateBindings();
    initHighlight();
    markSpecialLinks(window.location.pathname);
    reinitTheme();
    document.dispatchEvent(new CustomEvent('al:chrome-ready', { bubbles: true, detail: { url: window.location.href, pathname: window.location.pathname } }));
  }

  document.addEventListener('DOMContentLoaded', onPageLoad);
  document.addEventListener('turbo:load', onPageLoad);
  document.addEventListener('al:navigated', function () {
    resetTopbarMotion();
    setSearchStateBindings();
    initHighlight();
    markSpecialLinks(window.location.pathname);
    reinitTheme();
  });
  window.addEventListener('resize', function () {
    initHighlight();
  }, { passive: true });

})();
