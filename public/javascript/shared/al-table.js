/* al-table — responsive table upgrade.
   Reads thead labels and injects them as data-label on each td so the
   CSS card collapse (see .al-table-card in tw.css) can render row-as-card
   on small screens without any markup changes. Tables with 3+ columns are
   auto-upgraded; add data-table-card="off" to opt a table out, or
   data-table-card="on" to force card mode on a smaller table. */
(function () {
  function headerLabels(table) {
    const thead = table.querySelector('thead');
    if (!thead) return [];
    return Array.prototype.slice.call(thead.querySelectorAll('th')).map(function (th) {
      return (th.textContent || '').replace(/\s+/g, ' ').trim();
    });
  }

  function upgrade(table) {
    if (table.dataset.tableCard === 'off') return;

    const labels = headerLabels(table);
    if (labels.length >= 3 && table.dataset.tableCard !== 'on') table.classList.add('al-table-card');
    if (table.dataset.tableCard === 'on') table.classList.add('al-table-card');

    if (!table.classList.contains('al-table-card')) return;

    const rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    rows.forEach(function (row) {
      const cells = Array.prototype.slice.call(row.querySelectorAll('td'));
      cells.forEach(function (td, i) {
        const label = labels[i];
        if (!label || /^actions?$/i.test(label)) return;
        td.setAttribute('data-label', label);
      });
    });
  }

  function scan(root) {
    Array.prototype.slice.call((root || document).querySelectorAll('table.al-table')).forEach(upgrade);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }

  if (window.MutationObserver) {
    let scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        scan(document.body);
      });
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
})();