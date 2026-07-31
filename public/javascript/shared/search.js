const searchButton  = document.getElementById('searchButton');
const searchOverlay = document.getElementById('searchOverlay');
const searchPanel   = document.getElementById('searchPanel');
const searchInput   = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks      = document.querySelectorAll('.nav-link');

if (!searchButton || !searchOverlay || !searchInput || !searchResults) {
  // Search UI not present on this page
} else {

let activeIndex    = -1;
let searchTimeout  = null;
let lastQuery      = '';
let panelClosing   = false;
let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');

const isAdmin = !!document.querySelector('a[href="/admin/overview"]');

const typeIcon = {
  server: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M2.25 6a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V6Zm3.97.47a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 0 1 1.06 1.06l-.97.97.97.97a.75.75 0 1 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 0 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>',
  user:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clip-rule="evenodd"/></svg>',
  node:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M2.25 4.125c0-1.036.84-1.875 1.875-1.875h5.25c1.036 0 1.875.84 1.875 1.875V17.25a4.5 4.5 0 1 1-9 0V4.125Zm4.5 14.25a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25Z" clip-rule="evenodd"/></svg>',
  nav:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clip-rule="evenodd"/></svg>',
  clock:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 shrink-0 text-neutral-400"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  arrow:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 shrink-0 text-neutral-400"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>',
  feature: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5Z" clip-rule="evenodd"/></svg>',
};

function escHtml(t) {
  const d = document.createElement('div');
  d.textContent = t || '';
  return d.innerHTML;
}

function highlightMatch(text, term) {
  if (!term) return escHtml(text);
  const safe  = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(' + safe + ')', 'gi');
  return escHtml(text).replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600/60 text-yellow-950 dark:text-yellow-50 rounded px-0.5">$1</mark>');
}

function saveRecentSearch(term) {
  if (!term || term.length < 2) return;
  recentSearches = recentSearches.filter(function(s) { return s !== term; });
  recentSearches.unshift(term);
  if (recentSearches.length > 5) recentSearches = recentSearches.slice(0, 5);
  localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fuzzyIncludes(token, haystack) {
  if (token.length < 4) return false;
  const words = haystack.split(/\s+/);
  for (const w of words) {
    if (Math.abs(w.length - token.length) > 1) continue;
    if (levenshtein(w, token) <= 1) return true;
  }
  return false;
}

function scoreTerm(term, hay) {
  if (hay === term) return 100;
  if (hay.startsWith(term)) return 80;
  if (hay.includes(term)) return 60;
  const tokens = term.split(' ');
  if (tokens.length > 1 && tokens.every(t => hay.includes(t))) return 45;
  if (tokens.some(t => hay.includes(t))) return 30;
  if (tokens.some(t => fuzzyIncludes(t, hay))) return 15;
  return 0;
}

const navAliases = {
  'servers':       'instances instances container containers game server',
  'overview':      'dashboard home control panel main',
  'settings':      'settings configuration config preferences options',
  'users':         'users members people accounts memberships',
  'nodes':         'nodes machines daemons daemon hosts',
  'images':        'images docker eggs templates boxes',
  'addons':        'addons plugins extensions mods',
  'airlink cloud': 'cloud backup updates airlinkcloud',
  'api keys':      'apikeys api keys tokens access auth',
  'account':       'account profile me my',
  'logout':        'logout signout sign out exit',
};

const pageCatalog = (function() {
  const pages = [
    { label: 'Servers', url: '/server', kw: 'instances containers game list dashboard' },
    { label: 'Dashboard', url: '/', kw: 'home dashboard start main' },
    { label: 'Create Server', url: '/create-server', kw: 'new server instance deploy create' },
    { label: 'Account', url: '/account', kw: 'profile me my settings password avatar email' },
  ];
  if (isAdmin) {
    pages.push(
      { label: 'Admin Overview', url: '/admin/overview', kw: 'dashboard home stats system status' },
      { label: 'Admin Settings', url: '/admin/settings', kw: 'configuration preferences panel options site' },
      { label: 'Admin Servers', url: '/admin/servers', kw: 'manage servers list instances delete' },
      { label: 'Admin Users', url: '/admin/users', kw: 'members accounts people manage delete' },
      { label: 'Admin Nodes', url: '/admin/nodes', kw: 'machines daemons hosts workers allocate' },
      { label: 'Admin Images', url: '/admin/images', kw: 'docker eggs templates boxes images' },
      { label: 'Admin Addons', url: '/admin/addons', kw: 'plugins extensions mods installed' },
      { label: 'Airlink Cloud', url: '/admin/airlink-cloud', kw: 'cloud backup updates airlink' },
      { label: 'API Keys', url: '/admin/apikeys', kw: 'tokens access auth api keys' },
      { label: 'Security', url: '/admin/security', kw: 'ban bans ips rate limit moderation' },
      { label: 'Player Stats', url: '/admin/playerstats', kw: 'players analytics stats leaderboard top' },
      { label: 'Analytics', url: '/admin/analytics', kw: 'charts stats metrics graphs' },
      { label: 'Addon Store', url: '/admin/addons/store', kw: 'plugins store marketplace extensions install' },
      { label: 'Image Store', url: '/admin/images/store', kw: 'images store marketplace eggs templates install' },
      { label: 'API Documentation', url: '/admin/api/docs', kw: 'documentation api reference endpoints docs' },
      { label: 'Create Server', url: '/admin/servers/create', kw: 'new server deploy create admin' },
      { label: 'Create User', url: '/admin/users/create', kw: 'new user account add admin' },
      { label: 'Create Node', url: '/admin/nodes/create', kw: 'new node machine add admin' },
      { label: 'Create Image', url: '/admin/images/create', kw: 'new image docker egg add admin' },
      { label: 'Upload Image', url: '/admin/images/upload', kw: 'upload image docker egg json' },
      { label: 'Radar', url: '/admin/radar/scripts', kw: 'radar scan scripts virustotal virus total' },
      { label: 'Menu', url: '/admin/menu', kw: 'menu navigation sidebar items' }
    );
  }
  return pages;
})();

function getCatalogResults(term) {
  const tNorm = normalize(term);
  const scored = [];
  pageCatalog.forEach(function(page) {
    const hay = normalize(page.label + ' ' + page.kw);
    const score = scoreTerm(tNorm, hay);
    if (score > 0) {
      scored.push({ type: 'nav', label: page.label, sub: '', url: page.url, score: score });
    }
  });
  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, 4);
}

function getNavResults(term) {
  const scopedLinks = Array.from(navLinks).filter(function(link) {
    if (isAdmin) return true;
    return !((link.getAttribute('href') || '').startsWith('/admin'));
  });

  const tNorm = normalize(term);
  const scored = [];
  scopedLinks.forEach(function(link) {
    const label = (link.textContent || '').trim();
    const extra = (link.getAttribute('searchdata') || link.getAttribute('data-search') || '').toLowerCase();
    const alias = navAliases[label.toLowerCase()] || '';
    const hay   = normalize(label + ' ' + extra + ' ' + alias);
    const score = scoreTerm(tNorm, hay);
    if (score > 0) {
      scored.push({ type: 'nav', label: label, sub: '', url: link.href, score: score });
    }
  });
  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, 5);
}

function showRecommendations() {
  searchResults.innerHTML = '';
  activeIndex = -1;

  const quickLinks = [
    { label: 'Servers', url: '/server', icon: 'server' },
    { label: 'Account', url: '/account', icon: 'user' },
  ];
  if (isAdmin) {
    quickLinks.push({ label: 'Admin Overview', url: '/admin/overview', icon: 'nav' });
    quickLinks.push({ label: 'Admin Servers', url: '/admin/servers', icon: 'server' });
    quickLinks.push({ label: 'Admin Users', url: '/admin/users', icon: 'user' });
  }

  if (quickLinks.length) {
    const hdr = document.createElement('p');
    hdr.className = 'text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1';
    hdr.textContent = 'Quick Links';
    searchResults.appendChild(hdr);

    quickLinks.forEach(function(item) {
      const row = document.createElement('a');
      row.href = item.url;
      row.className = 'search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer';
      row.innerHTML = (typeIcon[item.icon] || typeIcon.nav) +
        '<span class="flex-1 min-w-0"><span class="block truncate">' + escHtml(item.label) + '</span></span>' +
        typeIcon.arrow;
      row.addEventListener('click', function(e) {
        e.preventDefault();
        closeSearch();
        location.href = item.url;
      });
      searchResults.appendChild(row);
    });
  }

  if (recentSearches.length) {
    const hdr = document.createElement('p');
    hdr.className = 'text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1';
    hdr.textContent = 'Recent';
    searchResults.appendChild(hdr);

    recentSearches.forEach(function(term) {
      const row = document.createElement('div');
      row.className = 'search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer';
      row.innerHTML = typeIcon.clock +
        '<span class="flex-1 min-w-0"><span class="block truncate">' + escHtml(term) + '</span></span>' +
        '<button class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-1" data-remove="' + escHtml(term) + '" aria-label="Remove">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>';

      row.addEventListener('click', function(e) {
        if (e.target.closest('[data-remove]')) {
          e.stopPropagation();
          recentSearches = recentSearches.filter(function(s) { return s !== term; });
          localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
          showRecommendations();
          return;
        }
        searchInput.value = term;
        doSearch(term);
      });

      searchResults.appendChild(row);
    });
  }

  searchInput.setAttribute('aria-expanded', 'true');
}

function renderResults(items, term) {
  searchResults.innerHTML = '';
  activeIndex = -1;
  searchInput.setAttribute('aria-activedescendant', '');

  if (!items.length) {
    const msg = document.createElement('p');
    msg.textContent = 'No results.';
    msg.className   = 'text-sm text-neutral-500 dark:text-neutral-400 px-3 py-4 text-center';
    searchResults.appendChild(msg);
    searchInput.setAttribute('aria-expanded', 'true');
    return;
  }

  const groups = {};
  items.forEach(function(item) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  });

  const order  = ['server', 'user', 'node', 'feature', 'nav'];
  const labels = { server: 'Servers', user: 'Users', node: 'Nodes', feature: 'Features', nav: 'Pages' };

  order.forEach(function(type) {
    if (!groups[type]) return;

    (groups[type] || []).sort(function(a, b) { return (b.score || 0) - (a.score || 0); });

    const hdr = document.createElement('p');
    hdr.className   = 'text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1';
    hdr.textContent = labels[type];
    searchResults.appendChild(hdr);

    groups[type].forEach(function(item) {
      const row = document.createElement('a');
      row.href      = item.url;
      row.id        = 'search-result-' + type + '-' + searchResults.querySelectorAll('.search-result').length;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.className = 'search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer';
      row.innerHTML = (typeIcon[item.type] || typeIcon.nav) +
        '<span class="flex-1 min-w-0">' +
          '<span class="block truncate">' + highlightMatch(item.label, term) + '</span>' +
          (item.sub ? '<span class="block text-[11px] text-neutral-400 truncate">' + escHtml(item.sub) + '</span>' : '') +
        '</span>';

      row.addEventListener('click', function(e) {
        e.preventDefault();
        saveRecentSearch(term);
        closeSearch();
        location.href = item.url;
      });

      searchResults.appendChild(row);
    });
  });
  searchInput.setAttribute('aria-expanded', 'true');
}

async function doSearch(term) {
  if (!term) {
    showRecommendations();
    return;
  }
  searchInput.setAttribute('aria-expanded', 'true');

  const navItems  = getNavResults(term);
  const catalogItems = getCatalogResults(term);
  try {
    const r    = await fetch('/api/search?q=' + encodeURIComponent(term));
    const data = await r.json();
    renderResults((data.results || []).concat(navItems, catalogItems), term);
  } catch {
    renderResults(navItems.concat(catalogItems), term);
  }
}

function updateActiveResult() {
  const rows = searchResults.querySelectorAll('.search-result');
  rows.forEach(function(row, i) {
    const active = i === activeIndex;
    row.classList.toggle('bg-neutral-100', active);
    row.classList.toggle('dark:bg-neutral-700/50', active);
    row.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const activeRow = rows[activeIndex];
  searchInput.setAttribute('aria-activedescendant', activeRow ? activeRow.id : '');
}

function openSearch(fromKeyboard) {
  if (panelClosing) return;
  searchOverlay.classList.remove('hidden');
  searchOverlay.classList.add('flex');

  const panel = searchPanel.getBoundingClientRect();
  let ox, oy;
  if (fromKeyboard) {
    ox = panel.width / 2;
    oy = panel.height / 2;
  } else {
    const btn = searchButton.getBoundingClientRect();
    ox = btn.left + btn.width / 2 - panel.left;
    oy = btn.top + btn.height / 2 - panel.top;
  }
  searchPanel.style.transformOrigin = ox + 'px ' + oy + 'px';

  searchPanel.classList.remove('search-pop-out');
  searchPanel.classList.add('search-pop-in');
  searchButton.setAttribute('aria-expanded', 'true');

  if (!searchInput.value.trim()) showRecommendations();
  requestAnimationFrame(function() { searchInput.focus(); });
}

function closeSearch() {
  if (searchOverlay.classList.contains('hidden') || panelClosing) return;
  panelClosing = true;
  searchButton.setAttribute('aria-expanded', 'false');
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.setAttribute('aria-activedescendant', '');
  const done = function() {
    searchOverlay.classList.add('hidden');
    searchOverlay.classList.remove('flex');
    panelClosing = false;
  };
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    done();
    return;
  }
  searchPanel.classList.remove('search-pop-in');
  searchPanel.classList.add('search-pop-out');
  searchPanel.addEventListener('animationend', done, { once: true });
}

searchButton.addEventListener('click', function() {
  openSearch(false);
});

searchOverlay.addEventListener('click', function(e) {
  if (e.target === searchOverlay) closeSearch();
});

searchInput.addEventListener('input', function() {
  const term = searchInput.value.trim().toLowerCase();
  if (term === lastQuery) return;
  lastQuery = term;
  clearTimeout(searchTimeout);
  if (!term) {
    showRecommendations();
    return;
  }
  searchTimeout = setTimeout(function() { doSearch(term); }, 150);
});

searchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
    searchInput.blur();
    return;
  }
  const rows = searchResults.querySelectorAll('.search-result');
  if (!rows.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % rows.length;
    updateActiveResult();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + rows.length) % rows.length;
    updateActiveResult();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && rows[activeIndex]) rows[activeIndex].click();
    else if (rows.length === 1) rows[0].click();
  }
});

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (searchOverlay.classList.contains('hidden')) {
      openSearch(true);
    } else {
      searchInput.focus();
      searchInput.select();
    }
  } else if (e.key === 'Escape' && !searchOverlay.classList.contains('hidden')) {
    closeSearch();
  }
});

}
