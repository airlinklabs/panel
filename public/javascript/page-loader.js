(function () {

  var NAV_FLAG    = 'al_nav';
  var FADE_OUT_MS = 160;
  var STAGGER_MS  = 65;
  var CHILD_DUR   = 480;
  var EASE_OUT    = 'cubic-bezier(0.4,0,1,1)';
  var EASE_IN     = 'cubic-bezier(0.16,1,0.3,1)';

  // ── Read nav flag before any paint ───────────────────────────────────────
  var _fromNav = (function () {
    try {
      var v = sessionStorage.getItem(NAV_FLAG);
      if (v) { sessionStorage.removeItem(NAV_FLAG); return true; }
    } catch (_) {}
    return false;
  })();

  if (_fromNav) {
    document.documentElement.style.opacity = '0';
    document.documentElement.style.pointerEvents = 'none';
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function normalizePath(p) {
    try { return new URL(p, window.location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch (_) { return p; }
  }

  function isNavLink(a) {
    var href = a && a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return false;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    if (a.hasAttribute('download') || a.target === '_blank') return false;
    if (href.startsWith('http') && !href.startsWith(window.location.origin)) return false;
    return true;
  }

  function markNavigation() {
    try { sessionStorage.setItem(NAV_FLAG, '1'); } catch (_) {}
  }

  // ── Animated element ──────────────────────────────────────────────────────

  function getAnimEl() {
    return el('server-page-body') || el('page-content') || null;
  }

  // Returns the children of the container that should animate.
  // Skips fixed-positioned chrome elements (mobile topbar, bottom nav, sheets).
  function getAnimatableChildren(container) {
    return Array.from(container.children).filter(function (child) {
      var cls = child.className || '';
      if (cls.indexOf('mobile-top-bar') !== -1) return false;
      if (cls.indexOf('mobile-bottom-nav') !== -1) return false;
      if (cls.indexOf('mobile-more-sheet') !== -1) return false;
      // Skip any element whose computed position is fixed
      var pos = window.getComputedStyle(child).position;
      if (pos === 'fixed') return false;
      return true;
    });
  }

  // ── Content animation ─────────────────────────────────────────────────────

  function animateOut(c) {
    if (!c) return;
    var children = getAnimatableChildren(c);
    var targets  = children.length ? children : [c];
    targets.forEach(function (t) {
      t.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ' + EASE_OUT + ', transform ' + FADE_OUT_MS + 'ms ' + EASE_OUT;
      t.style.opacity    = '0';
      t.style.transform  = 'translateY(6px)';
    });
  }

  function animateIn(c) {
    if (!c) return;

    var children = getAnimatableChildren(c);

    // Pin every child to its hidden start state with inline styles FIRST.
    // This must happen before we remove js-loading, so the moment the CSS
    // rule stops applying the inline style already holds the same value —
    // no flash, no jitter.
    children.forEach(function (child) {
      child.style.transition = 'none';
      child.style.opacity    = '0';
      child.style.transform  = 'translateY(14px)';
    });

    // Now safe to drop the CSS pre-hide class — inline styles are holding.
    document.documentElement.classList.remove('js-loading');

    // Make sure the wrapper itself is fully visible.
    c.style.transition = 'none';
    c.style.opacity    = '1';
    c.style.transform  = '';

    if (!children.length) return;

    // One reflow so the browser registers the pinned start state.
    void c.offsetHeight;

    children.forEach(function (child, i) {
      var delay = i * STAGGER_MS;
      child.style.transition =
        'opacity ' + CHILD_DUR + 'ms ' + EASE_IN + ' ' + delay + 'ms, ' +
        'transform ' + CHILD_DUR + 'ms ' + EASE_IN + ' ' + delay + 'ms';
      child.style.opacity   = '1';
      child.style.transform = 'translateY(0)';
    });

    var totalDur = (children.length - 1) * STAGGER_MS + CHILD_DUR + 40;
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

  function revealAfterNav() {
    document.documentElement.style.opacity      = '';
    document.documentElement.style.pointerEvents = '';
    var ov = el('pl-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    barEl = null; hiding = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        animateIn(getAnimEl());
      });
    });
  }

  // ── Desktop sidebar highlight ─────────────────────────────────────────────

  function findDesktopActiveLink(path) {
    var best = null, bestLen = 0;
    document.querySelectorAll('.nav-link').forEach(function (link) {
      var href        = normalizePath(link.getAttribute('href') || '');
      var matchPrefix = link.getAttribute('data-match-prefix');
      if (!href) return;
      if (matchPrefix) {
        if (path.startsWith(matchPrefix) && matchPrefix.length > bestLen) {
          best = link; bestLen = matchPrefix.length;
        }
        return;
      }
      if (path === href) { best = link; bestLen = 9999; return; }
      if (href === '/') {
        if (path === '/' && 1 > bestLen) { best = link; bestLen = 1; }
        return;
      }
      if (path.startsWith(href) && href.length > bestLen) { best = link; bestLen = href.length; }
    });
    return best;
  }

  function getPillTop(link) {
    var ul = link.closest('ul');
    if (!ul) return 0;
    return link.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop;
  }

  function setDesktopActiveLink(link) {
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('active', 'text-neutral-950', 'font-[405]', 'dark:text-white');
    });
    if (link) link.classList.add('active', 'text-neutral-950', 'font-[405]', 'dark:text-white');
  }

  function movePill(link, animate) {
    var bg = el('active-background');
    if (!bg || !link) return;
    var top = getPillTop(link);
    var h   = link.getBoundingClientRect().height;
    bg.style.transition = animate
      ? 'transform 0.22s cubic-bezier(0.4,0,0.2,1), height 0.18s ease, opacity 0.15s ease'
      : 'none';
    bg.style.height    = h + 'px';
    bg.style.transform = 'translateY(' + top + 'px)';
    bg.style.opacity   = '1';
  }

  function initDesktopHighlight(fromNav) {
    var bg = el('active-background');
    if (!bg) return;
    var path   = normalizePath(window.location.pathname);
    var active = findDesktopActiveLink(path);
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
      if (el('active-background')) {
        el('active-background').style.transition =
          'transform 0.22s cubic-bezier(0.4,0,0.2,1), height 0.18s ease, opacity 0.15s ease';
      }
    }, fromNav ? 0 : 200);
  }

  // ── Mobile nav highlight ──────────────────────────────────────────────────

  function initMobileHighlight() {
    var path = normalizePath(window.location.pathname);
    document.querySelectorAll('.mobile-nav-link').forEach(function (link) {
      var href     = normalizePath(link.getAttribute('href') || '');
      var mPrefix  = link.getAttribute('data-match-prefix');
      var mAlso    = link.getAttribute('data-match-prefix-also');
      var mExact   = link.getAttribute('data-match-exact') === 'true';
      var active   = false;
      if (mPrefix)     active = path.startsWith(mPrefix);
      else if (mExact) active = path === href;
      else             active = path === href || (href !== '/' && path.startsWith(href));
      if (!active && mAlso && path.startsWith(mAlso)) active = true;
      link.classList.remove('text-neutral-500', 'dark:text-neutral-400', 'text-neutral-900', 'dark:text-white', 'active-mobile');
      link.classList.add(active ? 'text-neutral-900' : 'text-neutral-500');
      link.classList.add(active ? 'dark:text-white'  : 'dark:text-neutral-400');
      if (active) link.classList.add('active-mobile');
    });
  }

  // ── Initial overlay ───────────────────────────────────────────────────────

  var SPRINT_MS = 340, HOLD_MS = 160, OV_FADE_MS = 240;
  var barEl = null, hiding = false;

  function startProgress() {
    barEl = el('pl-bar');
    var pct = 0;
    var iv = setInterval(function () {
      if (hiding) { clearInterval(iv); return; }
      pct = Math.min(pct + (82 - pct) * 0.065 + 1.2, 82);
      if (barEl) barEl.style.width = pct + '%';
    }, 90);
  }

  function hideOverlaySlow() {
    var ov = el('pl-overlay');
    if (!ov || hiding) return;
    hiding = true;
    if (!barEl) barEl = el('pl-bar');
    if (barEl) {
      barEl.style.transition = 'width ' + SPRINT_MS + 'ms cubic-bezier(0.16,1,0.3,1)';
      barEl.style.width = '100%';
    }
    setTimeout(function () {
      var ov2 = el('pl-overlay');
      if (!ov2) return;
      ov2.style.transition = 'opacity ' + OV_FADE_MS + 'ms ease';
      ov2.style.opacity = '0';
      var inner = el('pl-inner');
      if (inner) {
        inner.style.transition = 'opacity ' + (OV_FADE_MS - 40) + 'ms ease';
        inner.style.opacity = '0';
      }
      setTimeout(function () {
        var ov3 = el('pl-overlay');
        if (ov3 && ov3.parentNode) ov3.parentNode.removeChild(ov3);
        barEl = null; hiding = false;
      }, OV_FADE_MS);
    }, SPRINT_MS + HOLD_MS);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    initDesktopHighlight(_fromNav);
    initMobileHighlight();
    if (_fromNav) {
      revealAfterNav();
    } else {
      if (el('pl-overlay')) startProgress();
    }
  });

  window.addEventListener('load', function () {
    if (!_fromNav) {
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
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!isNavLink(a)) return;
    if (a.classList.contains('nav-link')) {
      setDesktopActiveLink(a);
      movePill(a, true);
    }
    if (a.classList.contains('mobile-nav-link')) {
      document.querySelectorAll('.mobile-nav-link').forEach(function (l) {
        l.classList.remove('text-neutral-900', 'dark:text-white', 'active-mobile');
        l.classList.add('text-neutral-500', 'dark:text-neutral-400');
      });
      a.classList.remove('text-neutral-500', 'dark:text-neutral-400');
      a.classList.add('text-neutral-900', 'dark:text-white', 'active-mobile');
    }
    markNavigation();
    fadeContentOut();
  }, true);

  document.addEventListener('submit', function () {
    markNavigation();
    fadeContentOut();
  }, true);

})();
