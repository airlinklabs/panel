/* inline script 1 */

(function () {
  // Fill the -_- background
  // Fill -_- background — generate once, set once, CSS handles the animation
  (function () {
// ── -_- infinite canvas scroller ─────────────────────────────────────
    (function () {
      var canvas  = document.getElementById('credits-canvas');
      if (!canvas) return;
      var ctx     = canvas.getContext('2d');
      var TILE    = '-_-  ';
      var ANGLE   = -12 * Math.PI / 180;
      var SPEED   = 28;          // px/s along the slant axis
      var FONT_SZ = 17;
      var LINE_H  = Math.round(FONT_SZ * 2.6);
      var offset  = 0;           // current scroll offset in px (grows forever, mod LINE_H)
      var last    = null;
      var raf     = null;
      var running = false;

      function isDark() {
        return document.documentElement.classList.contains('dark');
      }

      function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      function draw(ts) {
        if (!running) return;
        raf = requestAnimationFrame(draw);

        // Advance offset
        if (last !== null) offset += SPEED * (ts - last) / 1000;
        last = ts;
        // Wrap offset to LINE_H so it never grows unbounded
        var wrapped = offset % LINE_H;

        var W = canvas.width;
        var H = canvas.height;

        ctx.clearRect(0, 0, W, H);
        ctx.save();

        // Move origin to centre, rotate, then shift so the pattern tiles
        ctx.translate(W / 2, H / 2);
        ctx.rotate(ANGLE);

        // How wide/tall the rotated slab needs to be to cover every corner
        var D = Math.ceil(Math.sqrt(W * W + H * H));

        ctx.font = 'bold ' + FONT_SZ + 'px monospace';
        ctx.letterSpacing = '0.16em';
        ctx.fillStyle = isDark()
          ? 'rgba(255,255,255,0.15)'
          : 'rgba(0,0,0,0.18)';

        // How many tiles fill one row at this diagonal width
        var tileW   = ctx.measureText(TILE).width;
        var tilesPR = Math.ceil((D * 2) / tileW) + 2;
        var row     = TILE.repeat(tilesPR);

        // Draw rows from top of slab to bottom, shifted by scroll offset
        var startY = -D - LINE_H + wrapped;
        for (var y = startY; y < D + LINE_H; y += LINE_H) {
          ctx.fillText(row, -D, y);
        }

        ctx.restore();
      }

      function start() {
        if (running) return;
        running = true;
        last    = null;
        canvas.style.opacity = '1';
        raf = requestAnimationFrame(draw);
      }

      function stop() {
        running = false;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      }

      resize();
      window.addEventListener('resize', resize);

      // Start only after the page overlay is gone
      var plOverlay = document.getElementById('pl-overlay');
      if (!plOverlay) {
        start();
      } else {
        var obs = new MutationObserver(function (mutations) {
          mutations.forEach(function (m) {
            m.removedNodes.forEach(function (n) {
              if (n && n.id === 'pl-overlay') {
                obs.disconnect();
                setTimeout(start, 80);
              }
            });
          });
        });
        obs.observe(document.body, { childList: true });
        if (!document.getElementById('pl-overlay')) setTimeout(start, 80);
      }

      // Fade out and stop on navigation
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href === '#' || href.startsWith('#') || a.target === '_blank') return;
        var bg = document.querySelector('.credits-bg');
        if (bg) {
          bg.classList.add('fading-out');
          setTimeout(stop, 350);
        }
      }, true);
    })();
  })();

  // Contributors cache
  var CACHE_KEY    = 'airlink_contributors_v2';
  var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var LEADS        = ['bthavanish', 'privt00', 'achul123'];

  function showCacheLabel(ts) {
    var el = document.getElementById('contrib-cache-label');
    if (!el) return;
    var mins = Math.round((Date.now() - ts) / 60000);
    el.textContent = mins < 2 ? 'Just updated' : 'Updated ' + mins + 'm ago';
  }

  function renderContributors(list) {
    var grid = document.getElementById('contributors-grid');
    if (!grid) return;
    var others = list.filter(function (c) {
      return !LEADS.includes(c.login) && c.type !== 'Bot';
    });
    if (!others.length) {
      grid.innerHTML = '<p class="col-span-full text-sm" style="color:var(--theme-text-muted);">No other contributors found.</p>';
      return;
    }
    grid.innerHTML = others.map(function (c) {
      return '<a href="' + c.html_url + '" target="_blank" rel="noopener"' +
        ' class="al-card flex items-center gap-3 px-3 py-3 hover:border-[var(--theme-border-accent)] transition-colors min-w-0">' +
        '<img loading="lazy" src="' + c.avatar_url + '&s=48" alt="' + c.login + '" class="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/10 object-cover shrink-0" onerror="this.src=\'https://github.com/ghost.png\'">' +
        '<div class="min-w-0 flex-1"><p class="text-xs font-medium truncate" style="color:var(--theme-text-strong);">' + c.login + '</p>' +
        '<p class="text-[10px]" style="color:var(--theme-text-muted);">' + c.contributions + ' commit' + (c.contributions !== 1 ? 's' : '') + '</p></div></a>';
    }).join('');
  }

  // Try cache first, then fetch
  var cached = null;
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < CACHE_TTL_MS) {
        cached = parsed;
      }
    }
  } catch (_) {}

  if (cached) {
    showCacheLabel(cached.ts);
    renderContributors(cached.data);
  } else {
    fetch('https://api.github.com/repos/airlinklabs/panel/contributors?per_page=100')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (_) {}
        showCacheLabel(Date.now());
        renderContributors(data);
      })
      .catch(function () {
        var grid = document.getElementById('contributors-grid');
        if (grid) grid.innerHTML = '<p class="col-span-full text-sm" style="color:var(--theme-text-muted);">Could not load contributors. GitHub may be rate limiting — try again later.</p>';
      });
  }
})();
