const searchInput   = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks      = document.querySelectorAll('.nav-link');

let activeIndex   = -1;
let searchTimeout = null;
let lastQuery     = '';

const isAdmin = !!document.querySelector('a[href="/admin/overview"]');

const typeIcon = {
  server: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M2.25 6a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V6Zm3.97.47a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 0 1 1.06 1.06l-.97.97.97.97a.75.75 0 1 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 0 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>',
  user:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clip-rule="evenodd"/></svg>',
  node:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M2.25 4.125c0-1.036.84-1.875 1.875-1.875h5.25c1.036 0 1.875.84 1.875 1.875V17.25a4.5 4.5 0 1 1-9 0V4.125Zm4.5 14.25a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25Z" clip-rule="evenodd"/></svg>',
  nav:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0 text-neutral-400"><path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clip-rule="evenodd"/></svg>',
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
  return escHtml(text).replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600/60 text-neutral-900 dark:text-white rounded px-0.5">$1</mark>');
}

function getNavResults(term) {
  const scopedLinks = Array.from(navLinks).filter(function(link) {
    if (isAdmin) return true;
    return !((link.getAttribute('href') || '').startsWith('/admin'));
  });

  return scopedLinks
    .filter(function(link) {
      const text  = link.textContent.trim().toLowerCase();
      const extra = (link.getAttribute('searchdata') || link.getAttribute('data-search') || '').toLowerCase();
      return text.includes(term) || extra.includes(term);
    })
    .slice(0, 5)
    .map(function(link) {
      return { type: 'nav', label: link.textContent.trim(), sub: '', url: link.href };
    });
}

function renderResults(items, term) {
  searchResults.innerHTML = '';
  activeIndex = -1;

  if (!items.length) {
    const msg = document.createElement('p');
    msg.textContent = 'No results.';
    msg.className   = 'text-sm text-neutral-500 dark:text-neutral-400 px-3 py-4 text-center';
    searchResults.appendChild(msg);
    return;
  }

  const groups = {};
  items.forEach(function(item) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  });

  const order  = ['server', 'user', 'node', 'nav'];
  const labels = { server: 'Servers', user: 'Users', node: 'Nodes', nav: 'Pages' };

  order.forEach(function(type) {
    if (!groups[type]) return;

    const hdr = document.createElement('p');
    hdr.className   = 'text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1';
    hdr.textContent = labels[type];
    searchResults.appendChild(hdr);

    groups[type].forEach(function(item) {
      const row = document.createElement('a');
      row.href      = item.url;
      row.className = 'search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer';
      row.innerHTML = (typeIcon[item.type] || typeIcon.nav) +
        '<span class="flex-1 min-w-0">' +
          '<span class="block truncate">' + highlightMatch(item.label, term) + '</span>' +
          (item.sub ? '<span class="block text-[11px] text-neutral-400 truncate">' + escHtml(item.sub) + '</span>' : '') +
        '</span>';

      row.addEventListener('click', function(e) {
        e.preventDefault();
        searchResults.classList.add('hidden');
        searchInput.value = '';
        location.href = item.url;
      });

      searchResults.appendChild(row);
    });
  });
}

async function doSearch(term) {
  if (!term) { searchResults.classList.add('hidden'); return; }
  searchResults.classList.remove('hidden');

  const navItems = getNavResults(term);
  try {
    const r    = await fetch('/api/search?q=' + encodeURIComponent(term));
    const data = await r.json();
    renderResults((data.results || []).concat(navItems), term);
  } catch (_) {
    renderResults(navItems, term);
  }
}

function updateActiveResult() {
  const rows = searchResults.querySelectorAll('.search-result');
  rows.forEach(function(row, i) {
    row.classList.toggle('bg-neutral-100', i === activeIndex);
    row.classList.toggle('dark:bg-neutral-700/50', i === activeIndex);
  });
}

searchInput.addEventListener('input', function() {
  const term = searchInput.value.trim().toLowerCase();
  if (term === lastQuery) return;
  lastQuery = term;
  clearTimeout(searchTimeout);
  if (!term) { searchResults.classList.add('hidden'); return; }
  searchTimeout = setTimeout(function() { doSearch(term); }, 150);
});

searchInput.addEventListener('keydown', function(e) {
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
  } else if (e.key === 'Escape') {
    searchResults.classList.add('hidden');
    searchInput.blur();
  }
});

document.addEventListener('click', function(e) {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.classList.add('hidden');
  }
});

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});
