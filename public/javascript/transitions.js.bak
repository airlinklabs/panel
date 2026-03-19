(function () {

  // Pages that need a full hard navigation — can't survive a DOM swap.
  var HARD_NAV = [
    /^\/server\/[^\/]+$/,  // console: xterm + live WebSocket
    /^\/auth\//,
    /^\/logout/,
    /^\/install/,
  ];

  var SLOW_MS = 150;
  var navigating = false;

  function isHardNav(pathname) {
    for (var i = 0; i < HARD_NAV.length; i++) {
      if (HARD_NAV[i].test(pathname)) return true;
    }
    return false;
  }

  function skipLink(a, e) {
    if (!a) return true;
    var h = a.getAttribute('href');
    if (!h || h === '#' || h.charAt(0) === '#') return true;
    if (h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) return true;
    if (a.hasAttribute('download') || a.target === '_blank') return true;
    if (a.hasAttribute('data-no-transition')) return true;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return true;
    return false;
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  var bar = null, barTimer = null, barRaf = null;

  function barStart() {
    if (bar) return;
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:2px;z-index:99999;'
      + 'pointer-events:none;background:'
      + (document.documentElement.classList.contains('dark') ? '#fff' : '#171717')
      + ';width:0%;';
    document.body.appendChild(bar);
    var t0 = Date.now();
    (function tick() {
      if (!bar) return;
      var p = 72 * (1 - Math.exp(-(Date.now() - t0) / 500));
      bar.style.transition = 'width 0.3s ease';
      bar.style.width = p + '%';
      if (p < 71) barRaf = requestAnimationFrame(tick);
    })();
  }

  function barDone() {
    clearTimeout(barTimer); barTimer = null;
    if (!bar) return;
    if (barRaf) { cancelAnimationFrame(barRaf); barRaf = null; }
    bar.style.transition = 'width 0.15s ease';
    bar.style.width = '100%';
    var b = bar; bar = null;
    setTimeout(function () {
      b.style.transition = 'opacity 0.2s ease';
      b.style.opacity = '0';
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 220);
    }, 150);
  }

  function barCancel() {
    clearTimeout(barTimer); barTimer = null;
    if (barRaf) { cancelAnimationFrame(barRaf); barRaf = null; }
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function barSchedule() {
    clearTimeout(barTimer);
    barTimer = setTimeout(barStart, SLOW_MS);
  }

  // ── Script execution ──────────────────────────────────────────────────────
  // All page scripts have been converted from DOMContentLoaded wrappers to
  // IIFEs, so they run immediately when injected.
  //
  // External scripts (CDN libs like Chart.js) load sequentially so that
  // inline scripts depending on them run only after those libs are ready.

  var seenSrc = new Set();

  function trackExisting() {
    document.querySelectorAll('script[src]').forEach(function (s) {
      if (s.src) seenSrc.add(s.src);
    });
  }

  function runScripts(scriptEls) {
    if (!scriptEls || !scriptEls.length) return Promise.resolve();

    var ext = scriptEls.filter(function (s) { return !!(s.getAttribute('src')); });
    var inl = scriptEls.filter(function (s) { return !(s.getAttribute('src')); });

    // Load external scripts in order first
    var chain = ext.reduce(function (p, old) {
      return p.then(function () {
        return new Promise(function (resolve) {
          var rawSrc = old.getAttribute('src') || '';
          var abs;
          try { abs = new URL(rawSrc, window.location.origin).href; }
          catch (_) { abs = rawSrc; }
          if (seenSrc.has(abs)) { resolve(); return; }
          seenSrc.add(abs);
          var s = document.createElement('script');
          Array.from(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
          s.onload = resolve;
          s.onerror = function () { console.warn('[nav] failed to load', abs); resolve(); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());

    // Then execute inline scripts — they are now IIFEs so run immediately on inject
    return chain.then(function () {
      inl.forEach(function (old) {
        var code = old.textContent || '';
        if (!code.trim()) return;
        try {
          var s = document.createElement('script');
          s.textContent = code;
          document.head.appendChild(s);
          if (s.parentNode) s.parentNode.removeChild(s);
        } catch (e) {
          console.warn('[nav] script error', e);
        }
      });
    });
  }

  // ── Script collection ─────────────────────────────────────────────────────
  // Collect scripts from:
  // 1. Inside #page-content in the parsed doc (stagger animations etc.)
  // 2. Body children after </main> (the main page script block + toast include)

  function collectScripts(newDoc) {
    var scripts = [];
    var seen = new WeakSet();

    function add(el) {
      if (!seen.has(el)) { seen.add(el); scripts.push(el); }
    }

    var pc = newDoc.getElementById('page-content');
    if (pc) pc.querySelectorAll('script').forEach(add);

    var body = newDoc.body;
    if (body) {
      var afterMain = false;
      body.childNodes.forEach(function (node) {
        if (node.nodeName === 'MAIN') { afterMain = true; return; }
        if (!afterMain) return;
        if (node.nodeName === 'SCRIPT') add(node);
        if (node.querySelectorAll) node.querySelectorAll('script').forEach(add);
      });
    }

    return scripts;
  }

  // ── Sidebar active indicator ──────────────────────────────────────────────

  function updateNav(newPath) {
    var bg = document.getElementById('active-background');
    var best = null, bestLen = 0;
    var isDark = document.documentElement.classList.contains('dark');

    document.querySelectorAll('.nav-link').forEach(function (link) {
      link.classList.remove('active', 'font-medium');
      link.style.color = '';
      var href = (link.getAttribute('href') || '').replace(/\/$/, '');
      if (!href) return;
      if (newPath === href) { best = link; bestLen = 9999; }
      else if (href !== '/' && newPath.startsWith(href) && href.length > bestLen) {
        best = link; bestLen = href.length;
      }
    });

    if (best) {
      best.classList.add('active', 'font-medium');
      best.style.color = isDark ? '#ffffff' : '#0a0a0a';
      if (bg) {
        var r = best.getBoundingClientRect();
        var ul = best.closest('ul');
        if (ul) {
          var top = r.top - ul.getBoundingClientRect().top + ul.scrollTop;
          bg.style.transition = 'transform 0.2s cubic-bezier(0.4,0,0.2,1), height 0.15s ease, opacity 0.12s ease';
          bg.style.height    = r.height + 'px';
          bg.style.transform = 'translateY(' + top + 'px)';
          bg.style.opacity   = '1';
        }
      }
    } else if (bg) {
      bg.style.transition = 'opacity 0.12s ease';
      bg.style.opacity = '0';
    }

    document.querySelectorAll('.nav-link2').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      link.setAttribute('data-active', newPath.startsWith(href) ? 'true' : 'false');
    });
  }

  // ── CSS sync ──────────────────────────────────────────────────────────────

  function syncStyles(newDoc) {
    var have = new Set();
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) { have.add(l.href); });
    newDoc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      if (!have.has(l.href)) document.head.appendChild(document.importNode(l, true));
    });
  }

  // ── DOM swap ──────────────────────────────────────────────────────────────

  function doSwap(newDoc, url) {
    var newPath = new URL(url, window.location.origin).pathname;
    document.title = newDoc.title || document.title;
    syncStyles(newDoc);

    var scripts = collectScripts(newDoc);

    var newContent = newDoc.getElementById('page-content');
    var oldContent = document.getElementById('page-content');

    var target, newEl;

    if (oldContent && newContent) {
      // Desktop: only swap #page-content — sidebar and topbar are untouched
      var imp = document.importNode(newContent, true);
      imp.querySelectorAll('script').forEach(function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      target = oldContent;
      newEl  = imp;
    } else {
      // Mobile / no page-content id: swap whole <main>
      var oldMain = document.querySelector('main');
      var newMain = newDoc.querySelector('main');
      if (!oldMain || !newMain) { window.location.href = url; return Promise.resolve(); }
      var impMain = document.importNode(newMain, true);
      impMain.querySelectorAll('script').forEach(function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      target = oldMain;
      newEl  = impMain;
    }

    // Fade out old content
    target.style.transition = 'opacity 0.1s ease';
    target.style.opacity = '0';

    return new Promise(function (resolve) {
      setTimeout(function () {
        // Swap element in DOM
        target.parentNode.replaceChild(newEl, target);
        updateNav(newPath);

        // Fade in
        newEl.style.opacity = '0';
        newEl.style.transition = 'opacity 0.15s ease';

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            newEl.style.opacity = '1';
            setTimeout(function () {
              newEl.style.transition = '';
              newEl.style.opacity = '';
              try { newEl.scrollTop = 0; } catch (_) {}

              // Run scripts after DOM is visible and settled
              runScripts(scripts).then(resolve).catch(function (e) {
                console.warn('[nav] runScripts error', e);
                resolve();
              });
            }, 155);
          });
        });
      }, 105);
    });
  }

  // ── Navigate ──────────────────────────────────────────────────────────────

  function navigate(url, push) {
    if (navigating) return;
    navigating = true;
    barSchedule();

    fetch(url, { credentials: 'same-origin' })
      .then(function (res) {
        if (res.redirected) {
          barCancel(); navigating = false;
          window.location.href = res.url;
          return null;
        }
        if (!res.ok) {
          barCancel(); navigating = false;
          window.location.href = url;
          return null;
        }
        return res.text();
      })
      .then(function (html) {
        if (html === null) return;
        var newDoc = new DOMParser().parseFromString(html, 'text/html');
        if (push !== false) history.pushState({ url: url }, '', url);
        return doSwap(newDoc, url);
      })
      .then(function () { barDone(); navigating = false; document.dispatchEvent(new Event('al:navigated')); })
      .catch(function (err) {
        console.warn('[nav] error', err);
        barCancel(); navigating = false;
        window.location.href = url;
      });
  }

  // ── Click interception ────────────────────────────────────────────────────

  window.__transitionsActive = true;

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (skipLink(a, e)) return;

    var href = a.getAttribute('href');
    var parsed;
    try { parsed = new URL(href, window.location.origin); } catch (_) { return; }
    if (parsed.origin !== window.location.origin) return;

    var path = parsed.pathname + parsed.search + parsed.hash;
    if (isHardNav(parsed.pathname)) return;

    e.preventDefault();
    e.stopPropagation();

    if (parsed.pathname === window.location.pathname && !parsed.search) return;

    navigate(path, true);
  }, true);

  // ── Back / forward ────────────────────────────────────────────────────────

  window.addEventListener('popstate', function (e) {
    var url = (e.state && e.state.url) || window.location.pathname;
    var parsed;
    try { parsed = new URL(url, window.location.origin); } catch (_) { window.location.href = url; return; }
    if (isHardNav(parsed.pathname)) { window.location.href = url; return; }
    navigate(url, false);
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  history.replaceState(
    { url: window.location.pathname + window.location.search },
    '',
    window.location.href
  );

  trackExisting();

})();
