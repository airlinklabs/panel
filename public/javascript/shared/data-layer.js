/* Shared client-side data layer — replaces location.reload() patterns.
   Provides in-place DOM updates for lists, tables, and status elements.

   Usage:
     al.fetch(url, opts)           — fetch + JSON + error toast
     al.refresh(url, renderFn)     — fetch + render into target
     al.removeRow(tr)              — animate row removal and reconcile empties
     al.addRow(tbody, html)        — animate row insertion and remove empties
     al.patchEl(sel, html)         — replace innerHTML with fade
     al.showEmpty(tbody, msg)      — show empty state row
     al.hideEmpty(tbody)           — remove empty state row

   All functions return promises. CSRF handled by csrf.js patch. */
(function () {
  if (window.al) return;

  var EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
  var EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
  var DUR_ENTER = 280;
  var DUR_EXIT = 180;

  /* ── fetch wrapper ─────────────────────────────────────────── */
  async function alFetch(url, opts) {
    opts = opts || {};
    var method = opts.method || (opts.body ? "POST" : "GET");
    var headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {},
    );
    try {
      var res = await fetch(url, {
        method: method,
        headers: headers,
        body: opts.body
          ? typeof opts.body === "string"
            ? opts.body
            : JSON.stringify(opts.body)
          : undefined,
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        var e = new Error(data.error || data.message || "Request failed");
        e.status = res.status;
        e.data = data;
        throw e;
      }
      return data;
    } catch (err) {
      var msg = err && err.status ? err.message : "Request failed. Try again?";
      if (window.showToast) showToast(msg, "error");
      return null;
    }
  }

  /* ── refresh: fetch URL, call renderFn with data, replace target ── */
  async function alRefresh(url, renderFn, target) {
    var data = await alFetch(url);
    if (data === null) return null;
    var html = renderFn(data);
    if (target) {
      if (typeof target === "string") target = document.querySelector(target);
      if (target) {
        target.innerHTML = html;
        if (window.alTableScan) alTableScan(target);
      }
    }
    return data;
  }

  /* ── removeRow: animate tr out, then remove from DOM ───────── */
  function alRemoveRow(tr) {
    if (!tr) return Promise.resolve();
    return new Promise(function (resolve) {
      tr.style.transition =
        "opacity " +
        DUR_EXIT +
        "ms " +
        EASE_IN +
        ", transform " +
        DUR_EXIT +
        "ms " +
        EASE_IN;
      tr.style.opacity = "0";
      tr.style.transform = "translateX(20px)";
      setTimeout(function () {
        var parent = tr.parentNode;
        if (parent) parent.removeChild(tr);
        // After removing a row, check if the table is now empty and reconcile
        if (parent) {
          var table = parent.closest ? parent.closest("table.al-table") : null;
          if (table && window.alTableScan) {
            alTableScan(table);
          }
          // If tbody has no real rows left, show the empty placeholder
          if (
            parent.tagName === "TBODY" ||
            (parent.closest && parent.closest("tbody"))
          ) {
            var tbody =
              parent.tagName === "TBODY" ? parent : parent.closest("tbody");
            var realRows = Array.prototype.slice
              .call(tbody.querySelectorAll("tr"))
              .filter(function (r) {
                return !r.hasAttribute("data-al-empty");
              });
            if (realRows.length === 0) {
              var emptyMsg = table ? table.dataset.tableEmpty : null;
              if (emptyMsg) {
                var colspan =
                  parseInt(table ? table.dataset.tableEmptyColspan : "", 10) ||
                  6;
                alShowEmpty(tbody, emptyMsg, colspan);
              }
            }
          }
        }
        resolve();
      }, DUR_EXIT);
    });
  }

  /* ── addRow: inject HTML, animate in ───────────────────────── */
  function alAddRow(tbody, html) {
    if (!tbody) return null;
    var temp = document.createElement("tbody");
    temp.innerHTML = html;
    var row = temp.firstElementChild;
    if (!row) return null;
    // The empty placeholder and a real row are mutually exclusive. Remove it
    // before insertion so every list changes state atomically.
    Array.prototype.slice
      .call(tbody.querySelectorAll("[data-al-empty]"))
      .forEach(function (empty) {
        empty.remove();
      });
    row.style.opacity = "0";
    row.style.transform = "translateY(-8px)";
    tbody.insertBefore(row, tbody.firstChild);
    // Trigger reflow then animate
    void row.offsetWidth;
    row.style.transition =
      "opacity " +
      DUR_ENTER +
      "ms " +
      EASE_OUT +
      ", transform " +
      DUR_ENTER +
      "ms " +
      EASE_OUT;
    row.style.opacity = "1";
    row.style.transform = "translateY(0)";
    if (window.alTableScan) {
      alTableScan(
        tbody.closest ? tbody.closest("table.al-table") || tbody : tbody,
      );
    }
    return row;
  }

  /* ── patchEl: replace innerHTML with crossfade ──────────────── */
  function alPatchEl(sel, html) {
    var el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    el.style.transition = "opacity 120ms ease";
    el.style.opacity = "0.4";
    setTimeout(function () {
      el.innerHTML = html;
      el.style.opacity = "1";
      if (window.alTableScan) alTableScan(el);
    }, 120);
  }

  /* ── showEmpty / hideEmpty ─────────────────────────────────── */
  function alShowEmpty(tbody, msg, colspan) {
    if (!tbody) return;
    var existing = tbody.querySelector("[data-al-empty]");
    if (existing) return;
    colspan = colspan || 6;
    var tr = document.createElement("tr");
    tr.setAttribute("data-al-empty", "");
    var td = document.createElement("td");
    td.colSpan = colspan;
    td.className = "px-4 py-8 text-center text-sm";
    td.style.color = "var(--theme-text-muted)";
    td.textContent = msg || "Nothing here yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function alHideEmpty(tbody) {
    if (!tbody) return;
    var empty = tbody.querySelector("[data-al-empty]");
    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
  }

  /* ── table scan hook (called by al-table.js after DOM changes) ── */
  function alTableScan(root) {
    if (window.alTableScan) window.alTableScan(root);
  }

  window.al = {
    fetch: alFetch,
    refresh: alRefresh,
    removeRow: alRemoveRow,
    addRow: alAddRow,
    patchEl: alPatchEl,
    showEmpty: alShowEmpty,
    hideEmpty: alHideEmpty,
  };
})();
