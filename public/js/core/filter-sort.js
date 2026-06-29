(function () {
  'use strict';

  /* ── Skeleton loader ─────────────────────────────────────────── */
  function createSkeletonRows(container, count, type) {
    type = type || 'table';
    var html = '';
    if (type === 'table') {
      for (var i = 0; i < count; i++) {
        html += '<tr class="skeleton-row">' +
          '<td class="px-4 py-3"><div class="skeleton-bar h-4 w-3/4 rounded"></div></td>' +
          '<td class="px-4 py-3"><div class="skeleton-bar h-4 w-1/2 rounded"></div></td>' +
          '<td class="px-4 py-3"><div class="skeleton-bar h-4 w-1/3 rounded"></div></td>' +
          '<td class="px-4 py-3"><div class="skeleton-bar h-4 w-1/4 rounded"></div></td>' +
          '</tr>';
      }
    } else {
      for (var i = 0; i < count; i++) {
        html += '<div class="skeleton-card rounded-xl border border-neutral-200 dark:border-white/5 bg-white dark:bg-neutral-800/20 p-4">' +
          '<div class="flex items-center gap-3 mb-3">' +
          '<div class="skeleton-bar h-9 w-9 rounded-lg shrink-0"></div>' +
          '<div class="flex-1 space-y-2">' +
          '<div class="skeleton-bar h-4 w-2/3 rounded"></div>' +
          '<div class="skeleton-bar h-3 w-1/3 rounded"></div>' +
          '</div>' +
          '<div class="skeleton-bar h-6 w-16 rounded-full"></div>' +
          '</div>' +
          '<div class="flex gap-2">' +
          '<div class="skeleton-bar h-3 w-1/4 rounded"></div>' +
          '<div class="skeleton-bar h-3 w-1/4 rounded"></div>' +
          '<div class="skeleton-bar h-3 w-1/4 rounded"></div>' +
          '</div>' +
          '</div>';
      }
    }
    container.innerHTML = html;
  }

  /* ── Filter bar builder ──────────────────────────────────────── */
  function buildFilterBar(opts) {
    var container = opts.container;
    var filters = opts.filters || [];
    var onFilter = opts.onFilter;
    var searchPlaceholder = opts.searchPlaceholder || 'Search\u2026';

    var bar = document.createElement('div');
    bar.className = 'flex items-center gap-3 flex-wrap mb-4';

    var searchWrap = document.createElement('div');
    searchWrap.className = 'relative flex-1 min-w-[200px]';
    searchWrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>' +
      '</svg>' +
      '<input type="text" class="filter-search w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition" placeholder="' + searchPlaceholder + '">';
    bar.appendChild(searchWrap);

    filters.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'relative';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-dropdown flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition whitespace-nowrap';
      btn.innerHTML = '<span class="filter-label">' + escHtml(f.label) + '</span>' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-neutral-400"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>';
      var dropdown = document.createElement('div');
      dropdown.className = 'filter-menu hidden absolute top-full left-0 mt-1 z-dropdown min-w-[160px] rounded-xl py-1';
      f.options.forEach(function (opt) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition flex items-center gap-2 rounded-lg mx-1';
        item.dataset.value = opt.value;
        item.innerHTML = '<span class="filter-dot w-1.5 h-1.5 rounded-full shrink-0" style="background:transparent"></span>' + escHtml(opt.label);
        if (opt.value === f.defaultValue) {
          item.classList.add('bg-neutral-100', 'dark:bg-white/10');
          item.querySelector('.filter-dot').style.background = 'currentColor';
        }
        item.addEventListener('click', function () {
          dropdown.querySelectorAll('button').forEach(function (b) {
            b.classList.remove('bg-neutral-100', 'dark:bg-white/10');
            b.querySelector('.filter-dot').style.background = 'transparent';
          });
          item.classList.add('bg-neutral-100', 'dark:bg-white/10');
          item.querySelector('.filter-dot').style.background = 'currentColor';
          btn.querySelector('.filter-label').textContent = opt.label;
          dropdown.classList.add('hidden');
          f.currentValue = opt.value;
          fireFilter();
        });
        dropdown.appendChild(item);
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        document.querySelectorAll('.filter-menu').forEach(function (m) { if (m !== dropdown) m.classList.add('hidden'); });
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
          var firstItem = dropdown.querySelector('button');
          if (firstItem) firstItem.focus();
        }
      });

      var filterFocusedIdx = -1;
      function highlightFilterItem(idx) {
        var items = dropdown.querySelectorAll('button');
        if (!items.length) return;
        items.forEach(function (el) { el.classList.remove('cs-focused'); });
        if (idx < 0) idx = items.length - 1;
        if (idx >= items.length) idx = 0;
        filterFocusedIdx = idx;
        items[filterFocusedIdx].classList.add('cs-focused');
        items[filterFocusedIdx].scrollIntoView({ block: 'nearest' });
      }
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          dropdown.classList.remove('hidden');
          highlightFilterItem(filterFocusedIdx + (e.key === 'ArrowDown' ? 1 : -1));
        }
      });
      dropdown.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { dropdown.classList.add('hidden'); btn.focus(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); highlightFilterItem(filterFocusedIdx + 1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); highlightFilterItem(filterFocusedIdx - 1); return; }
        if (e.key === 'Enter' && filterFocusedIdx >= 0) {
          e.preventDefault();
          var items = dropdown.querySelectorAll('button');
          if (items[filterFocusedIdx]) items[filterFocusedIdx].click();
        }
      });
      wrap.appendChild(btn);
      wrap.appendChild(dropdown);
      bar.appendChild(wrap);
    });

    document.addEventListener('click', function () {
      document.querySelectorAll('.filter-menu').forEach(function (m) { m.classList.add('hidden'); });
    });

    container.insertBefore(bar, container.firstChild);

    var state = { search: '', filters: {} };
    filters.forEach(function (f) { state.filters[f.key] = f.defaultValue || ''; });

    var searchInput = bar.querySelector('.filter-search');
    var debounce;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.search = searchInput.value.trim().toLowerCase();
        fireFilter();
      }, 150);
    });

    function fireFilter() {
      state.search = searchInput.value.trim().toLowerCase();
      filters.forEach(function (f) { state.filters[f.key] = f.currentValue || f.defaultValue || ''; });
      onFilter(state);
    }

    return {
      getState: function () { return state; },
      refresh: function () { fireFilter(); }
    };
  }

  /* ── Sort controller ─────────────────────────────────────────── */
  function enableTableSort(table, opts) {
    opts = opts || {};
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var headers = table.querySelectorAll('thead th[data-sort]');
    var currentSort = { key: null, dir: 'asc' };

    headers.forEach(function (th) {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.classList.add('hover:bg-neutral-100', 'dark:hover:bg-white/5', 'transition-colors');
      var arrow = document.createElement('span');
      arrow.className = 'sort-arrow ml-1 text-neutral-300 dark:text-neutral-600 text-[10px]';
      arrow.textContent = '\u25B2';
      th.appendChild(arrow);

      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (currentSort.key === key) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.key = key;
          currentSort.dir = 'asc';
        }
        headers.forEach(function (h) {
          var a = h.querySelector('.sort-arrow');
          if (a) {
            a.textContent = h.dataset.sort === currentSort.key
              ? (currentSort.dir === 'asc' ? '\u25B2' : '\u25BC')
              : '\u25B2';
            a.classList.toggle('text-neutral-800', h.dataset.sort === currentSort.key);
            a.classList.toggle('dark:text-white', h.dataset.sort === currentSort.key);
            a.classList.toggle('text-neutral-300', h.dataset.sort !== currentSort.key);
            a.classList.toggle('dark:text-neutral-600', h.dataset.sort !== currentSort.key);
          }
        });
        var rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort(function (a, b) {
          var aVal = (a.dataset[currentSort.key] || a.textContent || '').toLowerCase();
          var bVal = (b.dataset[currentSort.key] || b.textContent || '').toLowerCase();
          var aNum = parseFloat(aVal);
          var bNum = parseFloat(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return currentSort.dir === 'asc' ? aNum - bNum : bNum - aNum;
          }
          return currentSort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  }

  /* ── Lazy loading (IntersectionObserver) ─────────────────────── */
  function enableLazyLoad(container, loadMore, opts) {
    opts = opts || {};
    var batchSize = opts.batchSize || 20;
    var sentinel = document.createElement('div');
    sentinel.className = 'lazy-sentinel h-4 w-full';
    container.appendChild(sentinel);
    var loading = false;
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !loading) {
        loading = true;
        loadMore(batchSize, function () {
          loading = false;
        });
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return {
      disconnect: function () { observer.disconnect(); },
      check: function () { if (!loading) { loading = true; loadMore(batchSize, function () { loading = false; }); } }
    };
  }

  /* ── Progressive reveal (for server-rendered lists) ───────────── */
  function enableProgressiveReveal(container, opts) {
    opts = opts || {};
    var batchSize = opts.batchSize || 25;
    var selector = opts.itemSelector || ':scope > *';
    var items = Array.from(container.querySelectorAll(selector));
    var shown = batchSize;

    // Hide items beyond initial batch
    items.forEach(function (item, i) {
      if (i >= batchSize) item.style.display = 'none';
    });

    if (items.length <= batchSize) return { loaded: true };

    // Add load-more button
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full py-2.5 mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-white/5 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700/60 transition';
    btn.textContent = 'Load more (' + (items.length - batchSize) + ' remaining)';
    container.parentElement.appendChild(btn);

    btn.addEventListener('click', function () {
      var end = Math.min(shown + batchSize, items.length);
      for (var i = shown; i < end; i++) {
        items[i].style.display = '';
      }
      shown = end;
      var remaining = items.length - shown;
      if (remaining <= 0) {
        btn.remove();
      } else {
        btn.textContent = 'Load more (' + remaining + ' remaining)';
      }
    });

    // Also support IntersectionObserver auto-load
    if (opts.autoLoad !== false) {
      var sentinel = document.createElement('div');
      sentinel.className = 'lazy-sentinel h-1 w-full';
      container.parentElement.appendChild(sentinel);
      var loading = false;
      var observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !loading && shown < items.length) {
          loading = true;
          var end = Math.min(shown + batchSize, items.length);
          for (var i = shown; i < end; i++) {
            items[i].style.display = '';
          }
          shown = end;
          var remaining = items.length - shown;
          if (remaining <= 0) {
            btn.remove();
            observer.disconnect();
          } else {
            btn.textContent = 'Load more (' + remaining + ' remaining)';
          }
          loading = false;
        }
      }, { rootMargin: '300px' });
      observer.observe(sentinel);
    }

    return {
      loaded: shown >= items.length,
      loadAll: function () {
        items.forEach(function (item) { item.style.display = ''; });
        shown = items.length;
        btn.remove();
      }
    };
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function matchesRow(row, state, fields) {
    if (state.search) {
      var text = '';
      fields.forEach(function (f) { text += ' ' + (row.dataset[f] || ''); });
      text += ' ' + row.textContent;
      if (!text.toLowerCase().includes(state.search)) return false;
    }
    for (var key in state.filters) {
      var val = state.filters[key];
      if (val && val !== 'all') {
        var rowVal = (row.dataset[key] || '').toLowerCase();
        if (rowVal !== val.toLowerCase()) return false;
      }
    }
    return true;
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.AlFilter = {
    createSkeletonRows: createSkeletonRows,
    buildFilterBar: buildFilterBar,
    enableTableSort: enableTableSort,
    enableLazyLoad: enableLazyLoad,
    enableProgressiveReveal: enableProgressiveReveal,
    matchesRow: matchesRow,
    escHtml: escHtml
  };
})();
