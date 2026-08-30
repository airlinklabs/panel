/* al-table — responsive table upgrade with feature flags.
   Reads thead labels and injects them as data-label on each td so the
   CSS card collapse (see .al-table-card in tw.css) can render row-as-card
   on small screens without any markup changes.

   Feature flags (data attributes on <table>):
     data-table-card="on|off"     — force card mode on/off
     data-table-compact           — compact row padding
     data-table-sticky            — sticky thead
     data-table-search="#input"   — bind search input to filter rows
     data-table-empty="msg"       — show empty state when no rows
     data-table-empty-colspan="n" — colspan for empty state (default: 6)

   Auto-scans on DOMContentLoaded and via MutationObserver.
   Exposes window.alTableScan(root) for manual re-scan after DOM changes.
 *
 * Contract summary:
 *   - Tests:        tests/alTable.test.ts
 *   - Motion:       none required for the fallback; row reveal animations
 *                   live in the view and are collapsed by the reduced-motion
 *                   block (tw.css).
 *   - Mobile:       `.al-table-card` (tw.css) turns rows into stacked cards;
 *                   `data-label` injected here feeds that layout. The sort
 *                   header must be a semantic `<button>` (see the store), not
 *                   a `th onclick`.
 *   - Turbo cleanup: rescan on `al:navigated` (registered below); the sort
 *                   binding in the store panel is owned by the store mount.
 */
(function () {
  function headerLabels(table) {
    var thead = table.querySelector("thead");
    if (!thead) return [];
    return Array.prototype.slice
      .call(thead.querySelectorAll("th"))
      .map(function (th) {
        return (th.textContent || "").replace(/\s+/g, " ").trim();
      });
  }

  function upgrade(table) {
    if (table.dataset.tableCard === "off") return;

    /* ── compact mode ─────────────────────────────────────── */
    if (table.hasAttribute("data-table-compact")) {
      table.classList.add("al-table-compact");
    }

    /* ── sticky header ────────────────────────────────────── */
    if (table.hasAttribute("data-table-sticky")) {
      table.classList.add("al-table-sticky");
      var thead = table.querySelector("thead");
      if (thead) {
        var ths = thead.querySelectorAll("th");
        for (var i = 0; i < ths.length; i++) {
          ths[i].style.position = "sticky";
          ths[i].style.top = "0";
          ths[i].style.zIndex = "2";
          ths[i].style.background = "var(--theme-table-header-bg)";
        }
      }
    }

    /* ── card mode ────────────────────────────────────────── */
    var labels = headerLabels(table);
    if (labels.length >= 3 && table.dataset.tableCard !== "on")
      table.classList.add("al-table-card");
    if (table.dataset.tableCard === "on") table.classList.add("al-table-card");

    if (!table.classList.contains("al-table-card")) return;

    var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    rows.forEach(function (row) {
      var cells = Array.prototype.slice.call(row.querySelectorAll("td"));
      cells.forEach(function (td, i) {
        var label = labels[i];
        if (!label || /^actions?$/i.test(label)) return;
        td.setAttribute("data-label", label);
      });
    });
  }

  /* ── search binding ──────────────────────────────────────── */
  function bindSearch(table) {
    var searchSel = table.dataset.tableSearch;
    if (!searchSel) return;
    var input = document.querySelector(searchSel);
    if (!input || input._alTableBound) return;
    input._alTableBound = true;
    var debounceTimer;
    input.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var query = input.value.toLowerCase();
        var rows = Array.prototype.slice.call(
          table.querySelectorAll("tbody tr"),
        );
        var visible = 0;
        rows.forEach(function (row) {
          if (row.hasAttribute("data-al-empty")) return;
          var text = row.textContent.toLowerCase();
          var match = !query || text.indexOf(query) !== -1;
          row.style.display = match ? "" : "none";
          if (match) visible++;
        });
        /* show/hide empty state */
        var emptyAttr = table.dataset.tableEmpty;
        if (emptyAttr) {
          var existing = table.querySelector("[data-al-empty]");
          if (visible === 0 && !existing) {
            var colspan = parseInt(table.dataset.tableEmptyColspan, 10) || 6;
            var tbody = table.querySelector("tbody");
            if (tbody) {
              var tr = document.createElement("tr");
              tr.setAttribute("data-al-empty", "");
              var td = document.createElement("td");
              td.colSpan = colspan;
              td.className = "px-4 py-8 text-center text-sm";
              td.style.color = "var(--theme-text-muted)";
              td.textContent = emptyAttr;
              tr.appendChild(td);
              tbody.appendChild(tr);
            }
          } else if (visible > 0 && existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
          }
        }
      }, 150);
    });
  }

  /* ── empty state on initial load ─────────────────────────── */
  function checkEmpty(table) {
    var emptyAttr = table.dataset.tableEmpty;
    if (!emptyAttr) return;
    var tbody = table.querySelector("tbody");
    if (!tbody) return;
    var dataRows = Array.prototype.slice
      .call(tbody.querySelectorAll("tr"))
      .filter(function (r) {
        return !r.hasAttribute("data-al-empty");
      });
    var existing = tbody.querySelector("[data-al-empty]");
    if (dataRows.length === 0) {
      var colspan = parseInt(table.dataset.tableEmptyColspan, 10) || 6;
      if (!existing) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-al-empty", "");
        var td = document.createElement("td");
        td.colSpan = colspan;
        td.className = "px-4 py-8 text-center text-sm";
        td.style.color = "var(--theme-text-muted)";
        td.textContent = emptyAttr;
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function scan(root) {
    var tables = Array.prototype.slice.call(
      (root || document).querySelectorAll("table.al-table"),
    );
    tables.forEach(function (table) {
      upgrade(table);
      bindSearch(table);
      checkEmpty(table);
    });
  }

  /* Expose for data-layer.js and manual calls */
  window.alTableScan = scan;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      scan();
    });
  } else {
    scan();
  }

  // Turbo swaps the body without re-firing DOMContentLoaded — rescan tables.
  document.addEventListener("al:navigated", function () {
    scan();
  });

  if (window.MutationObserver) {
    var scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        scan(document.body);
      });
    }).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
