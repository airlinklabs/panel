(function () {
  'use strict';

  // ── Configure Turbo ───────────────────────────────────────────────────────
  if (window.Turbo) {
    Turbo.setProgressBarDelay(0);
    Turbo.session.drive = true;
  }

  function normalizePath(p) {
    try { return new URL(p, window.location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch { return p; }
  }

  // ── Nav highlight ─────────────────────────────────────────────────────────
  function initHighlight() {
    var path = normalizePath(window.location.pathname);
    var best = null, bestLen = 0;
    document.querySelectorAll('.nav-link').forEach(function (link) {
      var href = normalizePath(link.getAttribute('href') || '');
      var prefix = link.getAttribute('data-match-prefix');
      if (!href) return;
      if (prefix) { if (path.startsWith(prefix) && prefix.length > bestLen) { best = link; bestLen = prefix.length; } return; }
      if (path === href) { best = link; bestLen = 9999; return; }
      if (href === '/') { if (path === '/' && 1 > bestLen) { best = link; bestLen = 1; } return; }
      if (path.startsWith(href) && href.length > bestLen) { best = link; bestLen = href.length; }
    });
    var isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('active', 'font-medium');
      l.style.color = '';
    });
    if (best) {
      best.classList.add('active', 'font-medium');
      best.style.color = isDark ? '#ffffff' : '#0a0a0a';
      var bg = document.getElementById('active-background');
      if (bg) {
        var ul = best.closest('ul');
        if (ul) {
          void document.body.offsetHeight;
          bg.style.transition = 'none';
          bg.style.height = best.getBoundingClientRect().height + 'px';
          bg.style.transform = 'translateY(' + (best.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop) + 'px)';
          bg.style.opacity = '1';
        }
      }
    }
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
    initHighlight();
    markSpecialLinks(window.location.pathname);
    reinitTheme();
    // Dispatch al:navigated for backward compatibility with other scripts
    document.dispatchEvent(new CustomEvent('al:navigated', { bubbles: true, detail: { url: window.location.href, pathname: window.location.pathname } }));
  }

  document.addEventListener('DOMContentLoaded', onPageLoad);
  document.addEventListener('turbo:load', onPageLoad);
  document.addEventListener('al:navigated', onPageLoad);

})();
