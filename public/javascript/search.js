
(function () {
  const configs = [
    { input: document.getElementById('searchInput'), results: document.getElementById('searchResults'), mode: 'desktop' },
    { input: document.getElementById('mobileSearchInput'), results: document.getElementById('mobileSearchResults'), mode: 'mobile' }
  ].filter((cfg) => cfg.input && cfg.results);

  if (!configs.length) return;

  const typeBadges = {
    Page: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    Setting: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    Server: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    User: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    Node: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    Action: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
  };

  const staticIndex = [
    { label: 'Dashboard', sublabel: 'Server list', url: '/', keywords: ['home', 'servers', 'instances'], type: 'Page' },
    { label: 'Account', sublabel: 'Profile settings', url: '/account', keywords: ['profile', 'avatar', 'username'], type: 'Page' },
    { label: 'Create Server', sublabel: 'Provision a new server', url: '/create-server', keywords: ['new server', 'instance'], type: 'Page' },
    { label: 'Admin Overview', sublabel: 'System status', url: '/admin/overview', keywords: ['overview', 'admin'], type: 'Page' },
    { label: 'Server Console', sublabel: 'Live terminal', url: '/server/:uuid', keywords: ['console', 'terminal', 'server tab'], type: 'Server' }
  ];

  function esc(text) {
    return String(text || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function norm(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function collectDomIndex() {
    const items = [];
    const seen = new Set();
    document.querySelectorAll('[data-search], a[href], button, label, h1, h2, h3, h4, h5, th').forEach((el) => {
      const label = norm(el.getAttribute('data-search') || el.textContent || '');
      if (!label) return;
      const href = el.getAttribute && el.getAttribute('href');
      const url = href && href !== '#' ? href : el.dataset.href || null;
      const type = (el.getAttribute('data-search') || '').match(/^(page|setting|server|user|node|action)/i)?.[1];
      const item = {
        label: el.textContent.trim().replace(/\s+/g, ' '),
        sublabel: el.getAttribute('data-search') || '',
        url,
        keywords: label.split(/\s+/),
        type: type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : (href ? 'Page' : 'Action')
      };
      const key = [item.label, item.url, item.type].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
    return items;
  }

  function staticMatches(term) {
    return staticIndex.filter((item) => {
      const hay = norm([item.label, item.sublabel, (item.keywords || []).join(' ')].join(' '));
      return hay.includes(term);
    });
  }

  function domMatches(term) {
    return collectDomIndex().filter((item) => {
      const hay = norm([item.label, item.sublabel, (item.keywords || []).join(' ')].join(' '));
      return hay.includes(term);
    });
  }

  function search(term) {
    const matches = [];
    const seen = new Set();

    [...staticMatches(term), ...domMatches(term)].forEach((item) => {
      const key = [item.label, item.url || '', item.type].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      matches.push(item);
    });

    return matches.slice(0, 24);
  }

  function badge(type) {
    const cls = typeBadges[type] || typeBadges.Page;
    return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}">${esc(type)}</span>`;
  }

  function highlight(text, term) {
    if (!term) return esc(text);
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp(`(${safe})`, 'ig'), '<mark class="rounded bg-yellow-200/80 dark:bg-yellow-500/30 text-inherit">$1</mark>');
  }

  function render(cfg, term) {
    const { results } = cfg;
    results.innerHTML = '';
    const rows = search(term);
    if (!rows.length) {
      results.classList.remove('hidden');
      results.innerHTML = '<div class="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400">No results.</div>';
      return;
    }

    results.classList.remove('hidden');
    rows.forEach((item, index) => {
      const a = document.createElement(item.url ? 'a' : 'button');
      if (item.url) a.href = item.url;
      else a.type = 'button';
      a.className = 'search-result group flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 hover:bg-neutral-100 dark:hover:bg-white/5';
      a.style.animationDelay = `${index * 20}ms`;
      a.style.animationDuration = '150ms';
      a.style.animationTimingFunction = 'cubic-bezier(0.16,1,0.3,1)';
      a.style.animationFillMode = 'both';
      a.style.animationName = 'fadeDown';
      a.innerHTML = `
        <div class="mt-0.5 shrink-0">${badge(item.type)}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">${highlight(item.label, term)}</span>
          </div>
          ${item.sublabel ? `<div class="truncate text-xs text-neutral-500 dark:text-neutral-400">${esc(item.sublabel)}</div>` : ''}
        </div>
      `;
      a.addEventListener('click', (event) => {
        if (!item.url) return;
        event.preventDefault();
        window.location.href = item.url;
      });
      results.appendChild(a);
    });
  }

  function setup(cfg) {
    const { input, results, mode } = cfg;
    let timer = 0;
    let focused = false;

    function update() {
      const term = norm(input.value);
      if (!term) {
        results.classList.add('hidden');
        results.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      render(cfg, term);
      input.setAttribute('aria-expanded', 'true');
      results.style.display = 'block';
      results.classList.remove('hidden');
      results.style.opacity = '0';
      results.style.transform = 'translateY(-8px)';
      results.style.transition = 'opacity 200ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1)';
      requestAnimationFrame(() => {
        results.style.opacity = '1';
        results.style.transform = 'translateY(0)';
      });
    }

    input.addEventListener('focus', () => {
      focused = true;
      input.parentElement?.classList?.add('ring-2', 'ring-neutral-500/30');
      update();
      if (mode === 'mobile') {
        results.classList.remove('hidden');
      }
    });
    input.addEventListener('blur', () => {
      focused = false;
      setTimeout(() => {
        if (!focused) {
          results.classList.add('hidden');
          results.setAttribute('aria-expanded', 'false');
        }
      }, 150);
      input.parentElement?.classList?.remove('ring-2', 'ring-neutral-500/30');
    });

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        results.classList.add('hidden');
        input.blur();
      }
    });

    document.addEventListener('click', (event) => {
      if (!input.contains(event.target) && !results.contains(event.target)) {
        results.classList.add('hidden');
      }
    });
  }

  configs.forEach(setup);
})();
