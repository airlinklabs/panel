(function () {

  const NAV_FLAG    = 'al_nav';
  const FADE_OUT_MS = 160;
  const STAGGER_MS  = 65;
  const CHILD_DUR   = 480;
  var _rootStyle = getComputedStyle(document.documentElement);
  var EASE_OUT    = _rootStyle.getPropertyValue('--ease-in').trim() || 'cubic-bezier(0.4,0,1,1)';
  var EASE_IN     = _rootStyle.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16,1,0.3,1)';
  const SPRINT_MS   = 340;
  const HOLD_MS     = 160;
  const OV_FADE_MS  = 240;
  const LOAD_GUARD_MS = 2000;
  const EXACT_MATCH_SCORE = 9999;

  var _isDark = document.documentElement.classList.contains('dark');
  var COLOR_DARK_BG    = _rootStyle.getPropertyValue('--theme-bg').trim() || '#161616';
  var COLOR_LIGHT_BG   = _rootStyle.getPropertyValue('--theme-bg').trim() || '#f5f5f5';
  var COLOR_DARK_TEXT  = _rootStyle.getPropertyValue('--theme-text').trim() || '#e0e0e0';
  var COLOR_LIGHT_TEXT = _rootStyle.getPropertyValue('--theme-text').trim() || '#404040';
  var COLOR_DARK_LOGO_BG  = _rootStyle.getPropertyValue('--theme-bg').trim() || '#f0f0f0';
  var COLOR_LIGHT_LOGO_BG = '#000000';

  const PROGRESS_CEILING  = 82;
  const PROGRESS_DECAY    = 0.065;
  const PROGRESS_INCREMENT = 1.2;
  const PROGRESS_INTERVAL_MS = 90;
  const CLEARANCE_OVERHEAD_MS = 40;

  const ACTIVE_BORDER_RADIUS = '0.75rem';
  var PILL_TRANSITION = 'none';

  const MOBILE_ACTIVE_CLASSES = ['text-neutral-900', 'dark:text-white', 'active-mobile'];
  const MOBILE_INACTIVE_CLASSES = ['text-neutral-500', 'dark:text-neutral-400'];

  // ── Read nav flag before any paint ───────────────────────────────────────
  const _fromNav = (function () {
    try {
      const v = sessionStorage.getItem(NAV_FLAG);
      if (v) { sessionStorage.removeItem(NAV_FLAG); return true; }
    } catch { /* sessionStorage unavailable */ }
    return false;
  })();

  if (_fromNav) {
    // Hide only the content column so the sidebar stays painted during the
    // swap — hiding <html> hides the sidebar too (it blinks out/in) and the
    // invisible page lets the browser's white canvas show through in dark
    // mode. The content wrapper is faded back in by revealAfterNav().
    const _pc = el('page-content') || el('server-page-body');
    if (_pc) _pc.style.opacity = '0';
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function normalizePath(p) {
    try { return new URL(p, window.location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch { return p; }
  }

  function isNavLink(a) {
    const href = a && a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return false;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    if (a.hasAttribute('download') || a.target === '_blank') return false;
    if (href.startsWith('http') && !href.startsWith(window.location.origin)) return false;
    return true;
  }

  function markNavigation() {
    try { sessionStorage.setItem(NAV_FLAG, '1'); } catch { /* sessionStorage unavailable */ }
  }

  // ── Turbo Drive interop ────────────────────────────────────────────────────
  // When Turbo is present it takes over same-origin link clicks and form
  // submits (swapping <body> via fetch), so the sessionStorage nav-flag + full
  // reload flow is only needed for links/forms Turbo deliberately skips.
  // Highlights and the reveal animation re-run after the swap on turbo:load.

  const USING_TURBO = !!(window.Turbo);

  function willTurboHandle(el) {
    if (!USING_TURBO) return false;
    const t = el.getAttribute && el.getAttribute('data-turbo');
    return t !== 'false';
  }

  // ── Animated element ──────────────────────────────────────────────────────

  function getAnimEl() {
    return el('server-page-body') || el('page-content') || null;
  }

  function hasClass(child, frag) {
    const list = child.classList;
    if (list && typeof list.contains === 'function') return list.contains(frag);
    const name = child.className;
    return typeof name === 'string' && name.indexOf(frag) !== -1;
  }

  function getAnimatableChildren(container) {
    return Array.from(container.children).filter(function (child) {
      if (hasClass(child, 'mobile-top-bar')) return false;
      if (hasClass(child, 'mobile-bottom-nav')) return false;
      if (hasClass(child, 'mobile-more-sheet')) return false;
      if (hasClass(child, 'mobile-server-chrome')) return false;
      const pos = window.getComputedStyle(child).position;
      if (pos === 'fixed') return false;
      return true;
    });
  }

  // ── Content animation ─────────────────────────────────────────────────────

  function animateOut(c) {
    if (!c) return;
    const children = getAnimatableChildren(c);
    const targets  = children.length ? children : [c];
    targets.forEach(function (t) {
      t.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ' + EASE_OUT + ', transform ' + FADE_OUT_MS + 'ms ' + EASE_OUT;
      t.style.opacity    = '0';
      t.style.transform  = 'translateY(6px)';
    });
  }

  function animateIn(c) {
    if (!c) return;

    const children = getAnimatableChildren(c);

    children.forEach(function (child) {
      child.style.transition = 'none';
      child.style.opacity    = '0';
      child.style.transform  = 'translateY(14px)';
    });

    document.documentElement.classList.remove('js-loading');

    c.style.transition = 'none';
    c.style.opacity    = '1';
    c.style.transform  = '';

    if (!children.length) return;

    void c.offsetHeight;

    children.forEach(function (child, i) {
      const delay = i * STAGGER_MS;
      child.style.transition =
        'opacity ' + CHILD_DUR + 'ms ' + EASE_IN + ' ' + delay + 'ms, ' +
        'transform ' + CHILD_DUR + 'ms ' + EASE_IN + ' ' + delay + 'ms';
      child.style.opacity   = '1';
      child.style.transform = 'translateY(0)';
    });

    const totalDur = (children.length - 1) * STAGGER_MS + CHILD_DUR + CLEARANCE_OVERHEAD_MS;
    setTimeout(function () {
      children.forEach(function (child) {
        child.style.transition = '';
        child.style.opacity    = '';
        child.style.transform  = '';
      });
    }, totalDur);
  }

  function fadeContentOut() {
    animateOut(getAnimEl());
  }

  function fadeContentIn() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        animateIn(getAnimEl());
      });
    });
  }

  // ── Reveal after navigation ───────────────────────────────────────────────

  let barEl = null;
  let hiding = false;

  function revealAfterNav() {
    const _pc = el('page-content') || el('server-page-body');
    if (_pc) _pc.style.opacity = '';
    const ov = el('pl-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    barEl = null;
    hiding = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        animateIn(getAnimEl());
      });
    });
  }

  // ── Desktop sidebar highlight ─────────────────────────────────────────────

  function findDesktopActiveLink(path) {
    let best = null;
    let bestLen = 0;
    document.querySelectorAll('.nav-link').forEach(function (link) {
      const href        = normalizePath(link.getAttribute('href') || '');
      const matchPrefix = link.getAttribute('data-match-prefix');
      if (!href) return;
      if (path === href) { best = link; bestLen = EXACT_MATCH_SCORE; return; }
      if (matchPrefix) {
        if (path.startsWith(matchPrefix) && matchPrefix.length > bestLen) {
          best = link;
          bestLen = matchPrefix.length;
        }
        return;
      }
      if (href === '/') return;
      if (path.startsWith(href) && href.length > bestLen) { best = link; bestLen = href.length; }
    });
    return best;
  }

  function getPillTop(link) {
    const ul = link.closest('ul');
    if (!ul) return 0;
    return link.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop;
  }

  function setDesktopActiveLink(link) {
    var rs = getComputedStyle(document.documentElement);
    var isDark = document.documentElement.classList.contains('dark');
    // Inverted pill — background is the theme's text color, foreground is the
    // theme's background color (same as the account link highlight).
    var pillBg = rs.getPropertyValue('--theme-text').trim() || (isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT);
    var pillFg = rs.getPropertyValue('--theme-bg').trim() || (isDark ? COLOR_LIGHT_BG : COLOR_DARK_BG);
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('active', 'font-medium');
      l.style.color = '';
      l.style.background = '';
    });
    if (!link) return;
    link.classList.add('active', 'font-medium');
    link.style.color = pillFg;
    link.style.background = pillBg;
    link.style.borderRadius = ACTIVE_BORDER_RADIUS;
  }

  function movePill(link, animate) {
    const bg = el('active-background');
    if (!bg || !link) return;
    const top = getPillTop(link);
    const h   = link.getBoundingClientRect().height;
    bg.style.transition = animate ? PILL_TRANSITION : 'none';
    bg.style.height    = h + 'px';
    bg.style.transform = 'translateY(' + top + 'px)';
    bg.style.opacity   = '1';
  }

  function initDesktopHighlight(fromNav) {
    const bg = el('active-background');
    if (!bg) return;
    const sb = el('pc-sidebar');
    if (sb && sb.style.display === 'none') {
      setTimeout(function () { initDesktopHighlight(fromNav); }, 0);
      return;
    }
    const path   = normalizePath(window.location.pathname);
    const active = findDesktopActiveLink(path);
    setDesktopActiveLink(active);
    if (!active) { bg.style.opacity = '0'; return; }
    bg.style.transition = 'none';
    movePill(active, false);
    void bg.offsetHeight;
    if (!fromNav) {
      bg.style.transition = 'opacity 0.18s ease';
      bg.style.opacity    = '1';
    }
    setTimeout(function () {
      const bgEl = el('active-background');
      if (bgEl) {
        bgEl.style.transition = PILL_TRANSITION;
      }
    }, fromNav ? 0 : 200);
  }

  // ── Mobile nav highlight ──────────────────────────────────────────────────

  function initMobileHighlight() {
    const path = normalizePath(window.location.pathname);
    document.querySelectorAll('.mobile-nav-link').forEach(function (link) {
      const href     = normalizePath(link.getAttribute('href') || '');
      const mPrefix  = link.getAttribute('data-match-prefix');
      const mAlso    = link.getAttribute('data-match-prefix-also');
      const mExact   = link.getAttribute('data-match-exact') === 'true';
      let active     = false;
      if (mPrefix)     active = path.startsWith(mPrefix);
      else if (mExact) active = path === href;
      else             active = path === href || (href !== '/' && path.startsWith(href));
      if (!active && mAlso && path.startsWith(mAlso)) active = true;
      link.classList.remove(...MOBILE_INACTIVE_CLASSES, ...MOBILE_ACTIVE_CLASSES);
      link.classList.add(active ? 'text-neutral-900' : 'text-neutral-500');
      link.classList.add(active ? 'dark:text-white'  : 'dark:text-neutral-400');
      if (active) link.classList.add('active-mobile');
    });
  }

  // ── Initial overlay ───────────────────────────────────────────────────────

  function startProgress() {
    barEl = el('pl-bar');
    let pct = 0;
    const iv = setInterval(function () {
      if (hiding) { clearInterval(iv); return; }
      pct = Math.min(pct + (PROGRESS_CEILING - pct) * PROGRESS_DECAY + PROGRESS_INCREMENT, PROGRESS_CEILING);
      if (barEl) barEl.style.transform = 'scaleX(' + (pct / 100) + ')';
    }, PROGRESS_INTERVAL_MS);
  }

  function hideOverlaySlow() {
    const ov = el('pl-overlay');
    if (!ov || hiding) return;
    hiding = true;
    if (!barEl) barEl = el('pl-bar');
    if (barEl) {
      barEl.style.transition = 'transform ' + SPRINT_MS + 'ms ' + _rootStyle.getPropertyValue('--ease-out').trim();
      barEl.style.transform = 'scaleX(1)';
    }
    setTimeout(function () {
      const ov2 = el('pl-overlay');
      if (!ov2) return;
      ov2.style.transition = 'opacity ' + OV_FADE_MS + 'ms ease';
      ov2.style.opacity = '0';
      const inner = el('pl-inner');
      if (inner) {
        inner.style.transition = 'opacity ' + (OV_FADE_MS - 40) + 'ms ease';
        inner.style.opacity = '0';
      }
      setTimeout(function () {
        const ov3 = el('pl-overlay');
        if (ov3 && ov3.parentNode) ov3.parentNode.removeChild(ov3);
        barEl = null;
        hiding = false;
      }, OV_FADE_MS);
    }, SPRINT_MS + HOLD_MS);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function revealAfterStuckLoad() {
    if (document.documentElement.classList.contains('js-loading')) {
      hideOverlaySlow();
      fadeContentIn();
    }
  }

  // turbo:load also fires for the initial page (Turbo boots it), so only treat
  // subsequent fires as boundary-after-navigation. pageRenderer's body swap
  // leaves `<html class="js-loading">` behind, so the new content is hidden by
  // CSS until revealAfterNav animates it in — no flash between swap and reveal.

  var _turboVisits = 0;
  document.addEventListener('turbo:load', function () {
    initDesktopHighlight(_turboVisits > 0);
    initMobileHighlight();
    if (_turboVisits > 0) {
      revealAfterNav();
      _turboVisits = 0;
    }
  });
  document.addEventListener('turbo:before-visit', function () {
    _turboVisits++;
  });

  document.addEventListener('DOMContentLoaded', function () {
    initDesktopHighlight(_fromNav);
    initMobileHighlight();
    if (_fromNav) {
      revealAfterNav();
    } else {
      if (el('pl-overlay')) startProgress();
      window.__alLoadGuard = setTimeout(revealAfterStuckLoad, LOAD_GUARD_MS);
    }
  });

  window.addEventListener('load', function () {
    if (!_fromNav) {
      if (window.__alLoadGuard) {
        clearTimeout(window.__alLoadGuard);
        window.__alLoadGuard = null;
      }
      hideOverlaySlow();
      fadeContentIn();
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      initDesktopHighlight(false);
      initMobileHighlight();
      fadeContentIn();
    }
  });

  // ── Click interception ────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!isNavLink(a)) return;
    if (a.classList.contains('nav-link')) {
      setDesktopActiveLink(a);
      movePill(a, true);
    }
    if (a.classList.contains('mobile-nav-link')) {
      document.querySelectorAll('.mobile-nav-link').forEach(function (l) {
        l.classList.remove(...MOBILE_ACTIVE_CLASSES);
        l.classList.add(...MOBILE_INACTIVE_CLASSES);
      });
      a.classList.remove(...MOBILE_INACTIVE_CLASSES);
      a.classList.add(...MOBILE_ACTIVE_CLASSES);
    }
    if (!willTurboHandle(a)) markNavigation();
    fadeContentOut();
  }, true);

  window.addEventListener('al:themechange', function () {
    const path = normalizePath(window.location.pathname);
    const isDark = document.documentElement.classList.contains('dark');
    const active = findDesktopActiveLink(path);
    setDesktopActiveLink(active);
    if (active) movePill(active, false);
    initMobileHighlight();
    const accountLink = document.getElementById('sidebar-account-link');
    if (accountLink) {
      const onAccount = path === '/account' || path.startsWith('/account/');
      const userText = accountLink.querySelector('#sidebar-username');
      var pillRs = getComputedStyle(document.documentElement);
      var pillBg = pillRs.getPropertyValue('--theme-text').trim() || (isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT);
      var pillFg = pillRs.getPropertyValue('--theme-bg').trim() || (isDark ? COLOR_LIGHT_BG : COLOR_DARK_BG);
      if (onAccount) {
        accountLink.style.background = pillBg;
        accountLink.style.color = pillFg;
        accountLink.style.fontWeight = '700';
        if (userText) userText.parentElement.style.color = pillFg;
      } else {
        accountLink.style.background = '';
        accountLink.style.color = '';
        accountLink.style.fontWeight = '';
        if (userText) userText.parentElement.style.color = '';
      }
    }
    const logo = document.getElementById('sidebar-logo-link');
    if (logo) {
      const onCredits = path === '/credits' || path.startsWith('/credits/');
      const logoBlock = document.getElementById('sidebar-logo-block');
      const logoTitle = logo.querySelector('h1');
      const logoImg = logo.querySelector('img');
      if (onCredits) {
        if (logoBlock) {
          logoBlock.style.background = isDark ? COLOR_DARK_LOGO_BG : COLOR_LIGHT_LOGO_BG;
          logoBlock.style.borderRadius = ACTIVE_BORDER_RADIUS;
        }
        logo.style.color = isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT;
        if (logoImg) logoImg.style.background = COLOR_LIGHT_LOGO_BG;
        if (logoTitle) {
          logoTitle.style.color = isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT;
          logoTitle.style.fontWeight = '700';
        }
      } else {
        if (logoBlock) {
          logoBlock.style.background = '';
          logoBlock.style.borderRadius = '';
        }
        logo.style.color = '';
        if (logoImg) logoImg.style.background = '';
        if (logoTitle) {
          logoTitle.style.color = '';
          logoTitle.style.fontWeight = '';
        }
      }
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target && e.target.closest && e.target.closest('form');
    if (form && !willTurboHandle(form)) markNavigation();
    fadeContentOut();
  }, true);

})();
