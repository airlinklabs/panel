(function () {

  const HARD_NAV = [
    /^\/server\/[^/]+$/,  // console: xterm + live WebSocket
    /^\/auth\//,
    /^\/logout/,
    /^\/install/,
  ];

  const SLOW_MS = 150;
  const BAR_MAX_PERCENT = 72;
  const BAR_DECAY_RATE = 500;
  const BAR_THRESHOLD = 71;
  const BAR_TRANSITION_MS = 300;
  const BAR_FADE_DELAY_MS = 150;
  const BAR_FADE_MS = 220;
  const EXACT_MATCH_SCORE = 9999;
  const CONTENT_FADE_OUT_MS = 100;
  const CONTENT_FADE_IN_MS = 155;
  const CONTENT_SETTLE_MS = 105;
  const PILL_TRANSITION = 'transform 0.38s cubic-bezier(0.16,1,0.3,1), height 0.2s ease, opacity 0.15s ease';
  const ACTIVE_BORDER_RADIUS = '0.75rem';
  const COLOR_DARK_TEXT  = '#171717';
  const COLOR_LIGHT_TEXT = '#f0f0f0';
  const COLOR_DARK_BG    = '#f0f0f0';
  const COLOR_LIGHT_BG   = '#171717';

  let navigating = false;

  function isHardNav(pathname) {
    for (let i = 0; i < HARD_NAV.length; i++) {
      if (HARD_NAV[i].test(pathname)) return true;
    }
    return false;
  }

  function skipLink(a, e) {
    if (!a) return true;
    const h = a.getAttribute('href');
    if (!h || h === '#' || h.charAt(0) === '#') return true;
    if (h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) return true;
    if (a.hasAttribute('download') || a.target === '_blank') return true;
    if (a.hasAttribute('data-no-transition')) return true;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return true;
    return false;
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  let bar = null, barTimer = null, barRaf = null;

  function barStart() {
    if (bar) return;
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:2px;z-index:99999;'
      + 'pointer-events:none;background:'
      + (document.documentElement.classList.contains('dark') ? '#fff' : '#171717')
      + ';width:0%;';
    document.body.appendChild(bar);
    const t0 = Date.now();
    (function tick() {
      if (!bar) return;
      const p = BAR_MAX_PERCENT * (1 - Math.exp(-(Date.now() - t0) / BAR_DECAY_RATE));
      bar.style.transition = 'width ' + BAR_TRANSITION_MS + 'ms ease';
      bar.style.width = p + '%';
      if (p < BAR_THRESHOLD) barRaf = requestAnimationFrame(tick);
    })();
  }

  function barDone() {
    clearTimeout(barTimer); barTimer = null;
    if (!bar) return;
    if (barRaf) { cancelAnimationFrame(barRaf); barRaf = null; }
    bar.style.transition = 'width 0.15s ease';
    bar.style.width = '100%';
    const b = bar; bar = null;
    setTimeout(function () {
      b.style.transition = 'opacity 0.2s ease';
      b.style.opacity = '0';
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, BAR_FADE_MS);
    }, BAR_FADE_DELAY_MS);
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

  const seenSrc = new Set();

  function trackExisting() {
    document.querySelectorAll('script[src]').forEach(function (s) {
      if (s.src) seenSrc.add(s.src);
    });
  }

  function runScripts(scriptEls) {
    if (!scriptEls || !scriptEls.length) return Promise.resolve();

    const ext = scriptEls.filter(function (s) { return !!(s.getAttribute('src')); });
    const inl = scriptEls.filter(function (s) { return !(s.getAttribute('src')); });

    const chain = ext.reduce(function (p, old) {
      return p.then(function () {
        return new Promise(function (resolve) {
          const rawSrc = old.getAttribute('src') || '';
          let abs;
          try { abs = new URL(rawSrc, window.location.origin).href; }
          catch { abs = rawSrc; }
          if (seenSrc.has(abs)) { resolve(); return; }
          seenSrc.add(abs);
          const s = document.createElement('script');
          Array.from(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
          s.onload = resolve;
          s.onerror = function () { console.warn('[nav] failed to load', abs); resolve(); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());

    return chain.then(function () {
      inl.forEach(function (old) {
        const code = old.textContent || '';
        if (!code.trim()) return;
        try {
          const s = document.createElement('script');
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

  function collectScripts(newDoc) {
    const scripts = [];
    const seen = new WeakSet();

    function add(el) {
      if (!seen.has(el)) { seen.add(el); scripts.push(el); }
    }

    const pc = newDoc.getElementById('page-content');
    if (pc) pc.querySelectorAll('script').forEach(add);

    const body = newDoc.body;
    if (body) {
      let afterMain = false;
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
    const bg = document.getElementById('active-background');
    let best = null, bestLen = 0;
    const isDark = document.documentElement.classList.contains('dark');

    function norm(p) {
      try { return new URL(p, window.location.origin).pathname.replace(/\/+$/, '') || '/'; }
      catch { return p; }
    }
    newPath = norm(newPath);

    document.querySelectorAll('.nav-link').forEach(function (link) {
      link.classList.remove('active', 'font-medium');
      link.style.color = '';
      link.style.background = '';
      const href = norm(link.getAttribute('href') || '');
      const prefix = link.getAttribute('data-match-prefix');
      if (!href) return;
      if (newPath === href) { best = link; bestLen = EXACT_MATCH_SCORE; }
      else if (prefix && newPath.startsWith(prefix) && prefix.length > bestLen) {
        best = link; bestLen = prefix.length;
      }
      else if (href !== '/' && newPath.startsWith(href) && href.length > bestLen) {
        best = link; bestLen = href.length;
      }
    });

    const accountLink = document.querySelector('a[href="/account"]');
    const logoutLink  = document.querySelector('a[href="/logout"]');

    [accountLink, logoutLink].forEach(function (link) {
      if (!link) return;
      link.classList.remove('nav-extra-active');
      link.style.background = '';
      link.style.color = '';
      link.style.fontWeight = '';
      const userText = link.querySelector('#sidebar-username');
      if (userText) userText.parentElement.style.color = '';
    });

    if (best) {
      best.classList.add('active', 'font-medium');
      best.style.color = isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT;
      best.style.background = isDark ? COLOR_DARK_BG : COLOR_LIGHT_BG;
      best.style.borderRadius = ACTIVE_BORDER_RADIUS;
      if (bg) {
        const r   = best.getBoundingClientRect();
        const ul  = best.closest('ul');
        if (ul) {
          const top = r.top - ul.getBoundingClientRect().top + ul.scrollTop;
          bg.style.transition = PILL_TRANSITION;
          bg.style.height     = r.height + 'px';
          bg.style.transform  = 'translateY(' + top + 'px)';
          bg.style.opacity    = '1';
        }
      }
    } else {
      let specialMatch = null;
      if (accountLink && (newPath === '/account' || newPath.startsWith('/account'))) specialMatch = accountLink;
      else if (logoutLink && newPath.startsWith('/logout')) specialMatch = logoutLink;

      if (specialMatch && bg) {
        const r2 = specialMatch.getBoundingClientRect();
        const sidebar = document.getElementById('pc-sidebar2');
        if (sidebar) {
          const sTop = r2.top - sidebar.getBoundingClientRect().top + sidebar.scrollTop;
          bg.style.transition = PILL_TRANSITION;
          bg.style.height     = r2.height + 'px';
          bg.style.transform  = 'translateY(' + sTop + 'px)';
          bg.style.opacity    = '1';
          bg.style.left   = '0';
          bg.style.width  = '100%';
          bg.style.borderRadius = '0';
        }
        specialMatch.style.color = isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT;
        specialMatch.style.background = isDark ? COLOR_DARK_BG : COLOR_LIGHT_BG;
        specialMatch.style.fontWeight = '700';
        const userText = specialMatch.querySelector('#sidebar-username');
        if (userText) userText.parentElement.style.color = isDark ? COLOR_DARK_TEXT : COLOR_LIGHT_TEXT;
      } else if (bg) {
        bg.style.left         = '';
        bg.style.width        = '';
        bg.style.borderRadius = '';
        bg.style.transition = 'opacity 0.15s ease';
        bg.style.opacity    = '0';
      }
    }

    if (best && bg) {
      bg.style.left         = '';
      bg.style.width        = '';
      bg.style.borderRadius = '';
    }

    document.querySelectorAll('.nav-link2').forEach(function (link) {
      const href = link.getAttribute('href') || '';
      link.setAttribute('data-active', newPath.startsWith(href) ? 'true' : 'false');
    });
  }

  // ── CSS sync ──────────────────────────────────────────────────────────────

  function syncStyles(newDoc) {
    const have = new Set();
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) { have.add(l.href); });
    newDoc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      if (!have.has(l.href)) document.head.appendChild(document.importNode(l, true));
    });
  }

  // ── DOM swap ──────────────────────────────────────────────────────────────

  function doSwap(newDoc, url) {
    const newPath = new URL(url, window.location.origin).pathname;
    document.title = newDoc.title || document.title;
    syncStyles(newDoc);

    const scripts = collectScripts(newDoc);

    const newContent = newDoc.getElementById('page-content');
    const oldContent = document.getElementById('page-content');

    let target, newEl;

    if (oldContent && newContent) {
      const imp = document.importNode(newContent, true);
      imp.querySelectorAll('script').forEach(function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      target = oldContent;
      newEl  = imp;
    } else {
      const oldMain = document.querySelector('main');
      const newMain = newDoc.querySelector('main');
      if (!oldMain || !newMain) { window.location.href = url; return Promise.resolve(); }
      const impMain = document.importNode(newMain, true);
      impMain.querySelectorAll('script').forEach(function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      target = oldMain;
      newEl  = impMain;
    }

    target.style.transition = 'opacity ' + CONTENT_FADE_OUT_MS + 'ms ease';
    target.style.opacity = '0';

    return new Promise(function (resolve) {
      setTimeout(function () {
        target.parentNode.replaceChild(newEl, target);
        updateNav(newPath);

        newEl.style.opacity = '0';
        newEl.style.transition = 'opacity 0.15s ease';

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            newEl.style.opacity = '1';
            setTimeout(function () {
              newEl.style.transition = '';
              newEl.style.opacity = '';
              try { newEl.scrollTop = 0; } catch { /* noop */ }

              runScripts(scripts).then(resolve).catch(function (e) {
                console.warn('[nav] runScripts error', e);
                resolve();
              });
            }, CONTENT_FADE_IN_MS);
          });
        });
      }, CONTENT_SETTLE_MS);
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
        const newDoc = new DOMParser().parseFromString(html, 'text/html');
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
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (skipLink(a, e)) return;

    const href = a.getAttribute('href');
    let parsed;
    try { parsed = new URL(href, window.location.origin); } catch { return; }
    if (parsed.origin !== window.location.origin) return;

    const path = parsed.pathname + parsed.search + parsed.hash;
    if (isHardNav(parsed.pathname)) return;

    e.preventDefault();
    e.stopPropagation();

    if (parsed.pathname === window.location.pathname && !parsed.search) return;

    navigate(path, true);
  }, true);

  // ── Back / forward ────────────────────────────────────────────────────────

  window.addEventListener('popstate', function (e) {
    const url = (e.state && e.state.url) || window.location.pathname;
    let parsed;
    try { parsed = new URL(url, window.location.origin); } catch { window.location.href = url; return; }
    if (isHardNav(parsed.pathname)) { window.location.href = url; return; }
    navigate(url, false);
  });

  // ── Theme toggle ───────────────────────────────────────────────────────────

  window.addEventListener('al:themechange', function () {
    updateNav(window.location.pathname);
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  history.replaceState(
    { url: window.location.pathname + window.location.search },
    '',
    window.location.href
  );

  trackExisting();

})();
