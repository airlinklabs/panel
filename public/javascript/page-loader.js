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
    } catch {}
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
    catch { return p; }
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
    try { sessionStorage.setItem(NAV_FLAG, '1'); } catch {}
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
      if (cls.indexOf('mobile-server-chrome') !== -1) return false;
      // Skip any element whose computed position is fixed
      var pos = window.getComputedStyle(child).position;
      if (pos === 'fixed') return false;
      return true;
    });
  }

  // ── Content animation ─────────────────────────────────────────────────────

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateOut(c) {
    if (!c) return;
    if (prefersReducedMotion()) return;
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
    if (prefersReducedMotion()) {
      document.documentElement.classList.remove('js-loading');
      c.style.opacity = '1';
      c.style.transform = '';
      Array.from(c.children).forEach(function (child) {
        child.style.opacity = '';
        child.style.transform = '';
        child.style.transition = '';
      });
      return;
    }

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
    var isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('active', 'font-medium');
      l.style.color = '';
    });
    if (!link) return;
    link.classList.add('active', 'font-medium');
    link.style.color = isDark ? '#ffffff' : '#0a0a0a';
  }

  function movePill(link, animate) {
    var bg = el('active-background');
    if (!bg || !link) return;
    var parent = bg.parentElement;
    var rect = link.getBoundingClientRect();
    var parentRect = parent.getBoundingClientRect();
    var top = rect.top - parentRect.top + parent.scrollTop;
    var left = rect.left - parentRect.left + parent.scrollLeft;
    bg.style.position = 'absolute';
    bg.style.left = left + 'px';
    bg.style.top = top + 'px';
    bg.style.width = rect.width + 'px';
    bg.style.height = rect.height + 'px';
    bg.style.transition = animate
      ? 'top 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), left 0.25s cubic-bezier(0.16,1,0.3,1), width 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease'
      : 'none';
    bg.style.opacity = '1';
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
    requestAnimationFrame(function () {
      if (el('active-background')) {
        el('active-background').style.transition =
          'top 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), left 0.25s cubic-bezier(0.16,1,0.3,1), width 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease';
      }
    });
  }

  // ── Mobile nav highlight ──────────────────────────────────────────────────

  function initMobileHighlight() {
    var path = normalizePath(window.location.pathname);
    document.querySelectorAll('.mobile-nav-link, .mobile-subnav-link').forEach(function (link) {
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
      link.setAttribute('data-active', active ? 'true' : 'false');
    });
  }

  // ── Initial overlay ───────────────────────────────────────────────────────

  var BAR_MS = 340;
  var FADE_MS = 240;
  var barEl = null;
  var hiding = false;

  function startProgress() {
    barEl = el('pl-bar');
    if (barEl) {
      barEl.style.transition = 'width ' + BAR_MS + 'ms cubic-bezier(0.16,1,0.3,1)';
      barEl.style.width = '82%';
    }
  }

  function imagesReady() {
    var imgs = Array.from(document.images || []);
    return imgs.every(function (img) {
      if (img.closest && img.closest('#pl-overlay')) return true;
      return img.complete && img.naturalWidth > 0;
    });
  }

  function pageNeedsReadyEvent() {
    if (window.__pageReady === true) return false;
    return !!document.getElementById('loading-state') || !!document.body.getAttribute('data-await-page-ready');
  }

  function waitForCriticals(done) {
    var timeout = setTimeout(done, 8000);
    var readySeen = false;

    function finish() {
      if (readySeen) return;
      readySeen = true;
      clearTimeout(timeout);
      done();
    }

    function check() {
      if (document.readyState !== 'complete') return;
      if (!imagesReady()) return;
      if (pageNeedsReadyEvent()) return;
      finish();
    }

    window.addEventListener('load', check, { once: true });
    document.addEventListener('readystatechange', check);
    window.addEventListener('custom:page-ready', function () {
      window.__pageReady = true;
      finish();
    }, { once: true });
    window.addEventListener('page-ready', function () {
      window.__pageReady = true;
      finish();
    }, { once: true });

    if (document.readyState === 'complete') {
      rafTick(check);
    }
  }

  function rafTick(fn) {
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  function hideOverlay() {
    var ov = el('pl-overlay');
    if (!ov || hiding) return;
    hiding = true;
    if (!barEl) barEl = el('pl-bar');
    if (barEl) {
      barEl.style.width = '100%';
    }
    ov.style.transition = 'opacity ' + FADE_MS + 'ms ease';
    ov.style.opacity = '0';
    var inner = el('pl-inner');
    if (inner) {
      inner.style.transition = 'opacity ' + (FADE_MS - 40) + 'ms ease';
      inner.style.opacity = '0';
    }
    window.setTimeout(function () {
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      barEl = null;
      hiding = false;
    }, FADE_MS);
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

  function tryHideOverlay() {
    if (_fromNav) return;
    var ov = el('pl-overlay');
    if (!ov) return;
    waitForCriticals(function () {
      hideOverlay();
      fadeContentIn();
    });
  }

  window.addEventListener('load', tryHideOverlay);

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      initDesktopHighlight(false);
      initMobileHighlight();
      fadeContentIn();
    }
  });

  document.addEventListener('al:navigated', function () {
    initDesktopHighlight(true);
    initMobileHighlight();
    fadeContentIn();
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
    if (a.classList.contains('mobile-nav-link') || a.classList.contains('mobile-subnav-link')) {
      document.querySelectorAll('.mobile-nav-link, .mobile-subnav-link').forEach(function (l) {
        l.classList.remove('text-neutral-900', 'dark:text-white', 'active-mobile');
        l.classList.add('text-neutral-500', 'dark:text-neutral-400');
        if (l.classList.contains('mobile-subnav-link')) l.setAttribute('data-active', 'false');
      });
      a.classList.remove('text-neutral-500', 'dark:text-neutral-400');
      a.classList.add('text-neutral-900', 'dark:text-white', 'active-mobile');
      if (a.classList.contains('mobile-subnav-link')) a.setAttribute('data-active', 'true');
    }
    markNavigation();
    fadeContentOut();
  }, true);

  document.addEventListener('submit', function () {
    markNavigation();
    fadeContentOut();
  }, true);

})();
