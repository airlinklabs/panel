(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  var scrollPositions = {};
  var pageCleanupFns  = [];
  var navigating      = false;

  // ── Public API ──────────────────────────────────────────────────────────
  window.registerPageCleanup = function (fn) { pageCleanupFns.push(fn); };

  window.navigateTo = function (url, opts) {
    return doNavigate(url, opts || {});
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getSwapTarget() {
    return document.getElementById('page-content') || document.querySelector('main');
  }

  function isHardNav(url) {
    var hardPrefixes = ['/auth/', '/logout', '/install', '/server/'];
    var pathname = new URL(url, window.location.origin).pathname;
    return hardPrefixes.some(function (p) { return pathname.startsWith(p); });
  }

  function notChrome(el) {
    var cls = (el.className || '').toString();
    return (
      cls.indexOf('mobile-top-bar')    === -1 &&
      cls.indexOf('mobile-bottom-nav') === -1 &&
      cls.indexOf('mobile-more-sheet') === -1 &&
      el.id !== 'toast-container' &&
      window.getComputedStyle(el).position !== 'fixed'
    );
  }

  function animate(el, from, to, opts) {
    if (reducedMotion()) return Promise.resolve();
    return el.animate([from, to], {
      duration: opts.duration || 250,
      delay:    opts.delay    || 0,
      easing:   opts.easing   || 'cubic-bezier(0.16,1,0.3,1)',
      fill:     opts.fill     || 'forwards',
    }).finished;
  }

  function staggerOut(target) {
    if (reducedMotion()) return Promise.resolve();
    var children = Array.from(target.children).filter(notChrome);
    var promises = children.map(function (el, i) {
      return animate(el,
        { opacity: 1, transform: 'translateY(0px)' },
        { opacity: 0, transform: 'translateY(-6px)' },
        { duration: 110, delay: i * 16, easing: 'cubic-bezier(0.4,0,1,1)' }
      );
    });
    return Promise.all(promises);
  }

  function staggerIn(target) {
    if (reducedMotion()) return;
    var children = Array.from(target.children).filter(notChrome);
    children.forEach(function (el, i) {
      animate(el,
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0px)' },
        { duration: 280, delay: 30 + i * 38, fill: 'backwards' }
      );
    });
  }

  function showSkeleton(target) {
    if (!target) return;
    var html = '<div class="p-4 lg:p-8 space-y-4 al-skeleton" aria-hidden="true">';
    for (var i = 0; i < 4; i++) {
      html += '<div class="h-16 rounded-xl bg-neutral-100 dark:bg-white/[0.04] animate-pulse"></div>';
    }
    html += '</div>';
    target.innerHTML = html;
  }

  // Sync any new <style> or <link> tags from fetched doc
  function syncStyles(newDoc) {
    var existing = Array.from(document.querySelectorAll('link[rel=stylesheet], style'))
      .map(function (el) { return el.href || el.textContent; });
    newDoc.querySelectorAll('link[rel=stylesheet], style').forEach(function (el) {
      var key = el.href || el.textContent;
      if (!existing.includes(key)) document.head.appendChild(document.importNode(el, true));
    });
  }

  // Collect and re-run scripts from new page content
  function collectScripts(container) {
    var scripts = [];
    container.querySelectorAll('script').forEach(function (s) {
      scripts.push({ src: s.src, text: s.textContent, nonce: s.nonce });
      s.parentNode && s.parentNode.removeChild(s);
    });
    return scripts;
  }

  function runScripts(scripts) {
    return scripts.reduce(function (chain, s) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          if (s.src) {
            var el = document.createElement('script');
            el.src = s.src;
            if (s.nonce) el.nonce = s.nonce;
            el.onload = resolve;
            el.onerror = resolve;
            document.body.appendChild(el);
          } else if (s.text) {
            try { Function(s.text)(); } catch (e) { console.warn('[nav] script error', e); }
            resolve();
          } else {
            resolve();
          }
        });
      });
    }, Promise.resolve());
  }

  function updateActiveNav(pathname) {
    document.querySelectorAll('.nav-link[data-href]').forEach(function (link) {
      var href = link.dataset.href || link.getAttribute('href');
      var exact = link.dataset.exact === 'true';
      var active = exact ? pathname === href : pathname.startsWith(href);
      link.dataset.active = active ? 'true' : 'false';
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });
    // Slide active background indicator
    var activeLink = document.querySelector('.nav-link[data-active="true"]');
    var bg         = document.getElementById('active-background');
    if (activeLink && bg) {
      var nav  = activeLink.closest('nav');
      if (nav) {
        var linkRect = activeLink.getBoundingClientRect();
        var navRect  = nav.getBoundingClientRect();
        bg.style.transform = 'translateY(' + (linkRect.top - navRect.top) + 'px)';
        bg.style.opacity   = '1';
      }
    } else if (bg) {
      bg.style.opacity = '0';
    }
  }

  // ── Progress bar ────────────────────────────────────────────────────────
  var progressBar = (function () {
    var bar = null;
    function getBar() {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'al-progress';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:2px;z-index:99999;background:rgb(99 102 241);transform:scaleX(0);transform-origin:left;transition:transform 200ms ease,opacity 200ms ease;pointer-events:none;';
        document.body.appendChild(bar);
      }
      return bar;
    }
    return {
      start: function () { var b = getBar(); b.style.transition = 'transform 2s cubic-bezier(0.1,0.5,0.5,1),opacity 200ms ease'; b.style.transform = 'scaleX(0.7)'; b.style.opacity = '1'; },
      done:  function () { var b = getBar(); b.style.transition = 'transform 150ms ease,opacity 250ms ease 150ms'; b.style.transform = 'scaleX(1)'; setTimeout(function () { b.style.opacity = '0'; setTimeout(function () { b.style.transform = 'scaleX(0)'; }, 300); }, 150); },
      fail:  function () { var b = getBar(); b.style.background = 'rgb(239 68 68)'; b.style.transform = 'scaleX(1)'; setTimeout(function () { b.style.opacity = '0'; }, 300); },
    };
  })();

  // ── Core navigation ─────────────────────────────────────────────────────
  function doNavigate(url, opts) {
    var fullUrl = new URL(url, window.location.origin).href;
    var pathname = new URL(url, window.location.origin).pathname;

    if (isHardNav(url)) { window.location.href = url; return Promise.resolve(); }
    if (navigating && !opts.force) return Promise.resolve();
    if (pathname === window.location.pathname && !opts.force) return Promise.resolve();

    navigating = true;
    progressBar.start();

    var target = getSwapTarget();

    // Save scroll before swap
    if (target) scrollPositions[window.location.pathname] = target.scrollTop;

    // Run cleanup fns from outgoing page
    pageCleanupFns.forEach(function (fn) { try { fn(); } catch (e) {} });
    pageCleanupFns = [];

    // Stagger out, show skeleton, fetch in parallel
    var staggerPromise = target ? staggerOut(target) : Promise.resolve();
    var fetchPromise   = fetch(url, { headers: { 'X-SPA-Request': '1' }, credentials: 'same-origin' });

    // Show skeleton after stagger-out starts
    if (target) {
      setTimeout(function () {
        if (navigating) showSkeleton(target);
      }, reducedMotion() ? 0 : 140);
    }

    return Promise.all([staggerPromise, fetchPromise])
      .then(function (results) {
        var response = results[1];
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (html) {
        var parser  = new DOMParser();
        var newDoc  = parser.parseFromString(html, 'text/html');
        var newBody = newDoc.body;

        document.title = newDoc.title || document.title;
        syncStyles(newDoc);

        // Detach toast container so it survives the swap
        var toastEl = document.getElementById('toast-container');
        if (toastEl) document.body.appendChild(toastEl);

        // Find new content element
        var newContent = newBody.querySelector('#page-content') || newBody.querySelector('main');
        if (!newContent) { window.location.href = url; return; }

        var scripts = collectScripts(newContent);
        var imp     = document.importNode(newContent, true);

        if (target) {
          target.parentNode.replaceChild(imp, target);
        } else {
          document.body.innerHTML = newBody.innerHTML;
        }

        window.history.pushState({ url: url }, '', url);
        updateActiveNav(pathname);

        // Restore scroll
        var restoredTarget = getSwapTarget();
        if (restoredTarget) {
          var savedScroll = scrollPositions[pathname] || 0;
          restoredTarget.scrollTop = savedScroll;
        }

        progressBar.done();
        navigating = false;

        // Stagger in
        if (restoredTarget) staggerIn(restoredTarget);

        // Re-run page scripts
        return runScripts(scripts).then(function () {
          document.dispatchEvent(new CustomEvent('al:navigated', { detail: { url: url, pathname: pathname } }));
        });
      })
      .catch(function (err) {
        console.error('[nav]', err);
        progressBar.fail();
        navigating = false;
        window.location.href = url;
      });
  }

  // ── Link interception ────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a[href]');
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || el.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    doNavigate(href, {});
  });

  // ── Back/Forward ─────────────────────────────────────────────────────────
  window.addEventListener('popstate', function (e) {
    var url = (e.state && e.state.url) || window.location.href;
    doNavigate(url, { force: true });
  });

  // ── Initial state ────────────────────────────────────────────────────────
  window.history.replaceState({ url: window.location.href }, '', window.location.href);
  updateActiveNav(window.location.pathname);

  document.addEventListener('al:navigated', function (e) {
    updateActiveNav(e.detail.pathname);
  });

})();
