/* Shared hash-backed tab controller.
 *
 * One controller for every in-page tablist on the panel, replacing the
 * page-specific `.tab-btn` + `localStorage` + `window.tabHandlers` copies.
 * A selected in-page surface is local view state, so it lives in the URL
 * hash — `/admin/settings#appearance`, `/admin/images#store`,
 * `/account#images` — and Back/Forward switches the tab without a network
 * visit.
 *
 * Markup contract (all optional, all progressive):
 *   <div data-al-tabs data-tabs-default="installed">
 *     <div role="tablist" aria-label="...">
 *       <button role="tab" data-tab="installed" aria-selected="true"  tabindex="0"  aria-controls="panel-installed">Installed</button>
 *       <button role="tab" data-tab="approvals" aria-selected="false" tabindex="-1" aria-controls="panel-approvals">Approvals</button>
 *       <button role="tab" data-tab="store"     aria-selected="false" tabindex="-1" aria-controls="panel-store">Store</button>
 *     </div>
 *     <div role="tabpanel" data-tab-panel="installed" id="panel-installed">...</div>
 *     <div role="tabpanel" data-tab-panel="approvals" id="panel-approvals" hidden>...</div>
 *     <div role="tabpanel" data-tab-panel="store"     id="panel-store"     hidden data-tab-src="/admin/images/store/panel">...</div>
 *   </div>
 *
 *   data-tabs-default  — name to fall back to when the hash is absent or
 *                        unknown (required; the server renders that panel
 *                        visible so no-JS keeps working).
 *   data-tabs-hash     — drive the fragment with this controller (default on
 *                        for the primary surface; omit for nested tablists
 *                        like the image editor's, which must not fight the
 *                        page's own hash).
 *   data-tab-src       — lazy-load a panel's content from this URL the first
 *                        time it is selected (aborted if the tab changes
 *                        while in flight).
 *
 * Behaviour:
 *   - Initial load selects `location.hash` when it names a known tab,
 *     otherwise the named default. Corrective/default state uses
 *     `history.replaceState`; intentional user changes use `pushState`.
 *   - Unknown hashes fall back to the default without throwing.
 *   - Keyboard: Left/Right (or Up/Down) move and select, Home/End jump.
 *   - `al:tabs-change` bubbles a CustomEvent with
 *     `{ root, name, panel }` so feature scripts can own per-tab work.
 *   - `destroy()` removes every listener and aborts in-flight lazy loads.
 *
 * Exposes `window.ALTabSystem` (browser) / `module.exports` (Node tests).
 *
 * Contract summary:
 *   - Tests:        tests/alTabs.test.ts
 *   - Motion:       selection is an instant state change; the sliding
 *                   indicator is a CSS transform on `--dur-enter` that the
 *                   reduced-motion block collapses (tw.css).
 *   - Mobile:       tab labels are truncated by the view; on phones the
 *                   bottom nav (or a nested hashless tablist) supplies the
 *                   primary surface.
 *   - Turbo cleanup: turbo-shell.js calls `ALTabSystem.destroyAll()` on
 *                   `al:navigated`; hashchange listeners are removed by
 *                   `destroy()`.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.ALTabSystem = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (rootScope) {
  "use strict";

  /* The root scope (window in the browser) is read from `currentScope` at
     call time so tests can inject a shim via `ALTabSystem.setScope()`; in the
     browser it stays window, which is also where the global `document` and
     `fetch` live. */
  var currentScope = rootScope;
  var doc = (currentScope && currentScope.document) || null;
  var hist = (currentScope && currentScope.history) || null;

  function setScope(s) {
    currentScope = s || null;
    doc = (currentScope && currentScope.document) || null;
    hist = (currentScope && currentScope.history) || null;
  }

  var registered = []; // every live controller, in mount order

  function tabName(btn) {
    return btn ? btn.getAttribute("data-tab") : null;
  }

  function readTabButtons(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll('[role="tab"][data-tab]'),
    );
  }

  function readTabPanels(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll('[role="tabpanel"][data-tab-panel]'),
    );
  }

  function currentHashName() {
    if (!currentScope || typeof currentScope.location === "undefined")
      return null;
    var h = String(currentScope.location.hash || "");
    return h ? h.replace(/^#/, "") : null;
  }

  function setHash(name, method) {
    if (!hist || !currentScope || typeof currentScope.location === "undefined")
      return;
    var url =
      currentScope.location.pathname +
      currentScope.location.search +
      "#" +
      name;
    try {
      if (method === "replace") hist.replaceState(null, "", url);
      else hist.pushState(null, "", url);
    } catch (e) {
      /* some sandboxes block history; local tab state still works */
    }
  }

  function controller(root) {
    var defaultName = root.getAttribute("data-tabs-default") || "";
    var hashMode = root.hasAttribute("data-tabs-hash");
    var current = defaultName;
    var buttons = readTabButtons(root);
    var panels = readTabPanels(root);
    var lazy = {}; // name -> AbortController while a lazy load is in flight
    var loaded = {}; // name -> true once content has been fetched
    var destroyed = false;

    function knownName(name) {
      return buttons.some(function (b) {
        return tabName(b) === name;
      });
    }

    function panelFor(name) {
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].getAttribute("data-tab-panel") === name) return panels[i];
      }
      return null;
    }

    function applySelection(name, source) {
      if (destroyed) return;
      if (!knownName(name)) name = defaultName;
      if (!knownName(name)) return; // empty tablist
      current = name;
      buttons.forEach(function (btn) {
        var on = tabName(btn) === name;
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.setAttribute("tabindex", on ? "0" : "-1");
      });
      panels.forEach(function (p) {
        var on = p.getAttribute("data-tab-panel") === name;
        if (on) {
          p.removeAttribute("hidden");
          if (p.classList) {
            p.classList.remove("tab-panel");
            void p.offsetHeight;
            p.classList.add("tab-panel");
          }
        } else {
          p.setAttribute("hidden", "");
        }
      });
      if (hashMode) {
        if (source === "user") setHash(name, "push");
        else if (source === "corrective") setHash(name, "replace");
      }
      activateLazy(name);
      emit(name);
    }

    function select(name, source) {
      applySelection(name, source || "user");
    }

    function currentName() {
      return current;
    }

    function selectFromHash(notify) {
      var name = currentHashName();
      if (name && knownName(name)) {
        applySelection(name, notify ? "hash" : "hash");
      } else if (hashMode) {
        applySelection(defaultName, "corrective");
      }
    }

    function emit(name) {
      if (!currentScope || !currentScope.CustomEvent) return;
      var panel = panelFor(name);
      var detail = { root: root, name: name, panel: panel };
      try {
        root.dispatchEvent(
          new currentScope.CustomEvent("al:tabs-change", {
            bubbles: true,
            detail: detail,
          }),
        );
        if (currentScope.document && currentScope.document.dispatchEvent) {
          currentScope.document.dispatchEvent(
            new currentScope.CustomEvent("al:tabs-change", { detail: detail }),
          );
        }
      } catch (e) {
        /* CustomEvent unavailable */
      }
    }

    function activateLazy(name) {
      var panel = panelFor(name);
      if (!panel) return;
      var src = panel.getAttribute("data-tab-src");
      if (!src || loaded[name] || lazy[name]) return;
      loaded[name] = true;
      var controller = new AbortController();
      lazy[name] = controller;

      var loading = (
        doc ||
        (currentScope && currentScope.document)
      ).createElement("div");
      loading.className = "al-tab-loading";
      loading.setAttribute("aria-busy", "true");
      loading.textContent = "Loading\u2026";
      panel.textContent = "";
      panel.appendChild(loading);

      var fetcher = (currentScope && currentScope.fetch) || fetch;
      fetcher(src, {
        signal: controller.signal,
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (html) {
          if (destroyed || controller.signal.aborted) return;
          panel.innerHTML = html;
          delete lazy[name];
          if (currentScope && currentScope.CustomEvent) {
            root.dispatchEvent(
              new currentScope.CustomEvent("al:tabs-loaded", {
                bubbles: true,
                detail: { root: root, name: name, panel: panel },
              }),
            );
          }
        })
        .catch(function (err) {
          if (destroyed) return;
          if (err && err.name === "AbortError") return;
          panel.textContent = "";
          var msg = (
            doc ||
            (currentScope && currentScope.document)
          ).createElement("p");
          msg.className = "al-tab-error";
          msg.textContent = "Could not load this section.";
          panel.appendChild(msg);
          delete lazy[name];
          loaded[name] = false; // allow retry
        });
    }

    function onClick(e) {
      var btn =
        e.target && e.target.closest
          ? e.target.closest('[role="tab"][data-tab]')
          : null;
      if (!btn || !root.contains(btn)) return;
      var list = root.querySelector('[role="tablist"]');
      if (list && !list.contains(btn)) return;
      var name = tabName(btn);
      if (!name || !knownName(name)) return;
      e.preventDefault();
      applySelection(name, "user");
      btn.focus();
    }

    function onKeydown(e) {
      var tablist = root.querySelector('[role="tablist"]');
      if (!tablist || !tablist.contains(e.target)) return;
      var btn = e.target.closest
        ? e.target.closest('[role="tab"][data-tab]')
        : null;
      var idx = buttons.indexOf(btn);
      if (idx === -1) return;
      var next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next = buttons[(idx + 1) % buttons.length];
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        next = buttons[(idx - 1 + buttons.length) % buttons.length];
      } else if (e.key === "Home") {
        e.preventDefault();
        next = buttons[0];
      } else if (e.key === "End") {
        e.preventDefault();
        next = buttons[buttons.length - 1];
      }
      if (next) {
        applySelection(tabName(next), "user");
        next.focus();
      }
    }

    function onHashChange() {
      if (!hashMode || destroyed) return;
      selectFromHash(false);
    }

    function destroy() {
      destroyed = true;
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("keydown", onKeydown, true);
      if (hashMode && typeof currentScope.removeEventListener === "function") {
        currentScope.removeEventListener("hashchange", onHashChange);
      }
      Object.keys(lazy).forEach(function (name) {
        try {
          lazy[name].abort();
        } catch (e) {
          /* already aborted */
        }
      });
      lazy = {};
      var idx = registered.indexOf(ctrl);
      if (idx !== -1) registered.splice(idx, 1);
    }

    var ctrl = {
      root: root,
      select: select,
      current: currentName,
      destroy: destroy,
      get defaultName() {
        return defaultName;
      },
    };

    bind();
    registered.push(ctrl);

    function bind() {
      root.addEventListener("click", onClick, true);
      root.addEventListener("keydown", onKeydown, true);
      if (hashMode && typeof currentScope.addEventListener === "function") {
        currentScope.addEventListener("hashchange", onHashChange);
      }
    }

    // Initial selection: hash first, then the named default. The server has
    // already rendered the default panel visible, so this only corrects to
    // match the URL when needed.
    selectFromHash(true);
    return ctrl;
  }

  /* Walk ancestors (excluding the element itself) for a tabs root, so an
     inner tablist nested inside another `[data-al-tabs]` is owned by the
     outer controller, not scanned twice. */
  function insideTabsRoot(el) {
    var n =
      el &&
      (el.parentElement ||
        (el.parentNode && el.parentNode.nodeType === 1 ? el.parentNode : null));
    while (n) {
      if (n.hasAttribute && n.hasAttribute("data-al-tabs")) return n;
      n = n.parentElement;
    }
    return null;
  }

  /* Mount one controller on an explicit root (used by turbo-shell mounts).
     The root must have data-tabs-default; hash mode is opt-in via
     data-tabs-hash so nested/editor tablists never fight the page hash. */
  function mount(root, options) {
    if (!root) return null;
    if (insideTabsRoot(root)) return null; // inner tablist: parent owns it
    var c = controller(root);
    if (options && typeof options.onReady === "function") options.onReady(c);
    return c;
  }

  /* Scan the document for top-level tab containers and mount them. */
  function scan(options) {
    if (!doc) return [];
    var roots = doc.querySelectorAll("[data-al-tabs]");
    var out = [];
    for (var i = 0; i < roots.length; i++) {
      if (insideTabsRoot(roots[i])) continue; // nested root: parent owns it
      var c = controller(roots[i]);
      if (c) {
        if (options && typeof options.onReady === "function")
          options.onReady(c);
        out.push(c);
      }
    }
    return out;
  }

  function destroyAll() {
    registered.slice().forEach(function (c) {
      c.destroy();
    });
  }

  return {
    mount: mount,
    scan: scan,
    destroyAll: destroyAll,
    setScope: setScope,
    VERSION: 1,
  };
});
