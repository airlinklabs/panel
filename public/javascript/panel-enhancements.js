
(function () {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const spinnerSvg = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-dasharray="18 6" /></svg>';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function textAvatarDataUrl(name) {
    const seed = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Avatar fallback">
      <rect width="96" height="96" rx="24" fill="#e5e7eb"/>
      <text x="48" y="58" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="40" font-weight="700" fill="#525252">${seed}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function setupAvatarFallbacks() {
    document.querySelectorAll('img[alt*="avatar" i], img[data-avatar-fallback]').forEach((img) => {
      if (img.dataset.avatarFallbackBound) return;
      img.dataset.avatarFallbackBound = '1';
      img.addEventListener('error', () => {
        if (img.dataset.avatarFallbackApplied === '1') return;
        img.dataset.avatarFallbackApplied = '1';
        const name = img.getAttribute('alt')?.replace(/avatar/i, '').trim() || img.closest('[data-username]')?.getAttribute('data-username') || 'U';
        img.src = textAvatarDataUrl(name);
      });
    });
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const diff = date.getTime() - Date.now();
    const abs = Math.abs(diff);
    const units = [
      ['year', 365 * 24 * 3600 * 1000],
      ['month', 30 * 24 * 3600 * 1000],
      ['week', 7 * 24 * 3600 * 1000],
      ['day', 24 * 3600 * 1000],
      ['hour', 3600 * 1000],
      ['minute', 60 * 1000],
      ['second', 1000]
    ];
    let unit = 'second';
    let value = 0;
    for (const [u, ms] of units) {
      if (abs >= ms || u === 'second') {
        unit = u;
        value = Math.round(diff / ms);
        break;
      }
    }
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    return rtf.format(value, unit);
  }

  function setupTimestamps() {
    document.querySelectorAll('time[datetime], [data-timestamp]').forEach((el) => {
      const iso = el.getAttribute('datetime') || el.getAttribute('data-timestamp');
      if (!iso) return;
      const rel = relativeTime(iso);
      if (!rel) return;
      el.textContent = rel;
      el.setAttribute('title', iso);
    });
  }

  function setupFormLoading() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const submit = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!submit || submit.dataset.loadingBound === '1') return;
      submit.dataset.loadingBound = '1';
      const isButton = submit.tagName === 'BUTTON';
      if (isButton) {
        submit.dataset.originalHtml = submit.innerHTML;
        submit.disabled = true;
        submit.classList.add('opacity-80');
        submit.innerHTML = spinnerSvg + '<span>' + (submit.getAttribute('data-loading-label') || 'Saving…') + '</span>';
      } else {
        submit.dataset.originalValue = submit.value || '';
        submit.disabled = true;
        submit.value = submit.getAttribute('data-loading-label') || 'Saving…';
      }
    }, true);
  }

  function setSheetState(sheet, open) {
    if (!sheet) return;
    sheet.dataset.open = open ? 'true' : 'false';
    sheet.classList.toggle('translate-y-full', !open);
    sheet.classList.toggle('pointer-events-none', !open);
    sheet.classList.toggle('opacity-0', !open);
    sheet.style.filter = open ? 'blur(0)' : 'blur(4px)';
    sheet.classList.toggle('opacity-100', open);
  }

  function makeBackdrop(id) {
    let backdrop = document.getElementById(id + '-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = id + '-backdrop';
      backdrop.className = 'fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-200';
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  function openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    const backdrop = makeBackdrop(id);
    requestAnimationFrame(() => {
      backdrop.classList.remove('opacity-0', 'pointer-events-none');
      sheet.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
      sheet.style.filter = 'blur(0)';
      sheet.classList.add('opacity-100');
      sheet.dataset.open = 'true';
    });
    const focusable = sheet.querySelector('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeSheet(id) {
    const sheet = document.getElementById(id);
    const backdrop = document.getElementById(id + '-backdrop');
    if (!sheet || !backdrop) return;
    sheet.style.pointerEvents = 'none';
    sheet.dataset.open = 'false';
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    setSheetState(sheet, false);
    setTimeout(() => {
      if (!sheet.isConnected) return;
      sheet.style.pointerEvents = '';
    }, 320);
  }

  function setupSheets() {
    document.addEventListener('click', (event) => {
      const openMore = event.target.closest('#more-nav-btn');
      const openAdmin = event.target.closest('#admin-sheet-open');
      const closeMore = event.target.closest('#more-sheet-close');
      const closeAdmin = event.target.closest('#admin-sheet-close');
      const moreBackdrop = event.target.closest('#more-sheet-backdrop');
      const adminBackdrop = event.target.closest('#admin-sheet-backdrop');

      if (openMore) openSheet('more-sheet');
      if (openAdmin) openSheet('admin-sheet');
      if (closeMore || moreBackdrop) closeSheet('more-sheet');
      if (closeAdmin || adminBackdrop) closeSheet('admin-sheet');

      const sheet = event.target.closest('#more-sheet, #admin-sheet');
      if (sheet && event.target === sheet) {
        closeSheet(sheet.id);
      }
    }, true);
  }

  function ripple(el, event) {
    if (prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX || event.clientX || rect.left + rect.width / 2) - rect.left;
    const y = (event.touches?.[0]?.clientY || event.clientY || rect.top + rect.height / 2) - rect.top;
    const size = Math.max(rect.width, rect.height) * 1.8;
    const span = document.createElement('span');
    span.className = 'pointer-events-none absolute rounded-full bg-current/30 animate-none';
    span.style.left = `${x - size / 2}px`;
    span.style.top = `${y - size / 2}px`;
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.opacity = '0.3';
    span.style.transform = 'scale(0)';
    span.style.transition = 'transform 400ms cubic-bezier(0.16,1,0.3,1), opacity 400ms ease';
    el.style.position = el.style.position || 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(span);
    raf(() => {
      span.style.transform = 'scale(1)';
      span.style.opacity = '0';
    });
    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 420);
  }

  function setupMobileNav() {
    const links = Array.from(document.querySelectorAll('.mobile-nav-link'));
    let rafLock = 0;
    let activeTimer = 0;

    function setActive(link) {
      if (rafLock) return;
      rafLock = requestAnimationFrame(() => {
        rafLock = 0;
        links.forEach((el) => {
          const active = el === link;
          el.setAttribute('data-active', active ? 'true' : 'false');
          el.classList.toggle('text-neutral-900', active);
          el.classList.toggle('dark:text-white', active);
          el.classList.toggle('text-neutral-500', !active);
          el.classList.toggle('dark:text-neutral-400', !active);
        });
        if (link) {
          const icon = link.querySelector('svg, .nav-icon');
          if (icon) {
            icon.classList.remove('anim-bounce-up');
            void icon.offsetWidth;
            icon.classList.add('anim-bounce-up');
          }
        }
      });
    }

    links.forEach((link) => {
      link.addEventListener('pointerdown', (event) => ripple(link, event), { passive: true });
      link.addEventListener('touchstart', () => link.style.transform = 'scale(0.9)', { passive: true });
      link.addEventListener('mousedown', () => link.style.transform = 'scale(0.9)');
      const reset = () => {
        link.style.transition = 'transform 150ms ease';
        link.style.transform = 'scale(1)';
        clearTimeout(activeTimer);
        activeTimer = setTimeout(() => { link.style.transition = ''; }, 160);
      };
      link.addEventListener('touchend', reset, { passive: true });
      link.addEventListener('mouseup', reset);
      link.addEventListener('mouseleave', reset);
      link.addEventListener('click', () => setActive(link));
    });

    if (document.querySelector('[data-active="true"]')) {
      setActive(document.querySelector('[data-active="true"]'));
    }
  }

  function getSidebarActiveLink() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    let best = null;
    let bestLen = -1;
    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = (link.getAttribute('href') || '').replace(/\/+$/, '') || '/';
      const prefix = link.getAttribute('data-match-prefix');
      if (prefix && path.startsWith(prefix) && prefix.length > bestLen) {
        best = link; bestLen = prefix.length; return;
      }
      if (path === href && href.length > bestLen) {
        best = link; bestLen = href.length; return;
      }
      if (path.startsWith(href) && href.length > bestLen) {
        best = link; bestLen = href.length;
      }
    });
    return best;
  }

  function moveActivePill(link, animate = true) {
    const pill = document.getElementById('active-background');
    if (!pill || !link) return;
    const parent = pill.parentElement;
    const linkRect = link.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const top = linkRect.top - parentRect.top + parent.scrollTop;
    const left = linkRect.left - parentRect.left + parent.scrollLeft;
    const width = linkRect.width;
    pill.style.position = 'absolute';
    pill.style.left = left + 'px';
    pill.style.top = top + 'px';
    pill.style.width = width + 'px';
    pill.style.height = linkRect.height + 'px';
    pill.style.opacity = '1';
    pill.style.transition = animate
      ? 'top 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), left 0.25s cubic-bezier(0.16,1,0.3,1), width 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease'
      : 'none';
  }

  function sidebarSubpageLabel() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean);
    if (parts[0] !== 'server' && parts[0] !== 'admin') return null;

    if (parts[0] === 'server') {
      const tab = (parts[2] || '').toLowerCase();
      const tabLabel = ({ files: 'Files', players: 'Players', worlds: 'Worlds', startup: 'Startup', settings: 'Settings', console: 'Console' })[tab];
      const name = document.body.getAttribute('data-server-name') || (window.__serverContext && window.__serverContext.name) || 'Server';
      return {
        parentHref: '/server',
        lines: [
          name.length > 18 ? name.slice(0, 18).trim() + '…' : name,
          tabLabel
        ].filter(Boolean)
      };
    }

    const editMap = {
      servers: 'Edit Server',
      nodes: 'Edit Node',
      users: 'Edit User'
    };
    if (parts[1] && editMap[parts[1]]) return { parentHref: '/admin/' + parts[1], lines: [editMap[parts[1]]] };
    return null;
  }

  function insertSidebarSubtree() {
    const info = sidebarSubpageLabel();
    if (!info) return;
    const activeLink = document.querySelector(`.nav-link[href="${info.parentHref}"]`) || document.querySelector(`.nav-link[data-match-prefix="${info.parentHref}"]`);
    if (!activeLink) return;
    const li = activeLink.closest('li');
    if (!li || li.querySelector('.sidebar-subtree')) return;

    const subtree = document.createElement('div');
    subtree.className = 'sidebar-subtree';
    subtree.innerHTML = `
      <div class="sidebar-subtree-inner pl-6 py-1 relative">
        <svg class="sidebar-tree-line absolute left-[1.35rem] top-0 h-full" width="16" height="100%" viewBox="0 0 16 32" aria-hidden="true">
          <path d="M8,0 Q8,12 16,12" stroke="currentColor" stroke-width="1.5" fill="none"></path>
        </svg>
        ${info.lines.map((line, index) => `<span class="sidebar-tree-leaf pl-5 text-xs ${index === 0 ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-700 dark:text-neutral-200 font-medium'} block py-0.5 truncate">${line}</span>`).join('')}
      </div>
    `;
    li.insertAdjacentElement('afterend', subtree);
    requestAnimationFrame(() => {
      subtree.style.maxHeight = subtree.scrollHeight + 'px';
      subtree.classList.add('is-open');
    });
  }

  function setupSidebar() {
    const links = Array.from(document.querySelectorAll('.nav-link'));
    links.forEach((link, index) => {
      link.dataset.stagger = 'true';
      link.style.animationDelay = (index * 40) + 'ms';
      const icon = link.querySelector('svg');
      if (icon) icon.classList.add('nav-icon');
    });

    const active = getSidebarActiveLink();
    if (active) moveActivePill(active, false);
    insertSidebarSubtree();

    const section = Array.from(document.querySelectorAll('p, h2, h3')).find((el) => /Admin Panel/i.test(el.textContent || ''));
    if (section && 'IntersectionObserver' in window) {
      section.classList.add('opacity-0', 'translate-y-2');
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          section.classList.remove('opacity-0', 'translate-y-2');
          section.classList.add('anim-fade-up');
          io.disconnect();
        });
      }, { threshold: 0.1 });
      io.observe(section);
    }
  }

  function setupSearchChrome() {
    const desktopInput = document.getElementById('searchInput');
    const desktopResults = document.getElementById('searchResults');
    if (desktopInput && desktopResults) {
      desktopInput.addEventListener('focus', () => {
        desktopInput.closest('label,div,form')?.classList?.add('search-active');
        desktopResults.classList.remove('hidden');
      });
      desktopInput.addEventListener('blur', () => {
        setTimeout(() => desktopResults.classList.add('hidden'), 150);
      });
    }

    const openBtn = document.getElementById('mobile-search-open');
    const closeBtn = document.getElementById('mobile-search-close');
    const topDefault = document.getElementById('topbar-default');
    const topSearch = document.getElementById('topbar-search');
    const input = document.getElementById('mobileSearchInput');
    const results = document.getElementById('mobileSearchResults');
    function openSearch() {
      if (!topDefault || !topSearch) return;
      topDefault.style.transition = 'opacity 180ms ease, transform 180ms ease';
      topSearch.style.transition = 'opacity 180ms ease, transform 180ms ease';
      topDefault.style.opacity = '0';
      topDefault.style.transform = 'translateX(-10px)';
      topSearch.classList.remove('hidden');
      topSearch.style.opacity = '0';
      topSearch.style.transform = 'translateX(10px)';
      raf(() => {
        topSearch.style.opacity = '1';
        topSearch.style.transform = 'translateX(0)';
      });
      if (input) input.focus();
    }
    function closeSearch() {
      if (!topDefault || !topSearch) return;
      topSearch.style.opacity = '0';
      topSearch.style.transform = 'translateX(10px)';
      topDefault.style.opacity = '1';
      topDefault.style.transform = 'translateX(0)';
      setTimeout(() => topSearch.classList.add('hidden'), 180);
      if (results) results.classList.add('hidden');
    }
    if (openBtn) openBtn.addEventListener('click', openSearch);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
  }

  onReady(() => {
    setupAvatarFallbacks();
    setupTimestamps();
    setupFormLoading();
    setupSheets();
    setupMobileNav();
    setupSidebar();
    setupSearchChrome();
  });

  window.addEventListener('custom:page-ready', setupTimestamps);
  window.addEventListener('al:navigated', () => {
    setupAvatarFallbacks();
    setupTimestamps();
  });

  window.openSheet = window.openSheet || openSheet;
  window.closeSheet = window.closeSheet || closeSheet;
})();
