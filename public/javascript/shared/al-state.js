/* Shared section-state controller (loading / empty / error / offline).
 *
 * One contract for content regions that swap between async states — a list,
 * a dashboard card, a settings panel. The page renders every state panel
 * server-side and the controller reveals the active one, so no-JS keeps the
 * initial (usually loading or empty) state visible.
 *
 * Markup contract (progressive enhancement):
 *   <div class="al-state" data-al-state data-al-state-default="loading">
 *     <div data-al-state-panel="loading" aria-busy="true">
 *       <div class="al-skeleton" aria-hidden="true"></div>
 *       <div class="al-skeleton"></div>
 *     </div>
 *     <div data-al-state-panel="empty" hidden>
 *       <p>No servers yet.</p>
 *       <a href="/servers/new">Create one</a>
 *     </div>
 *     <div data-al-state-panel="error" hidden data-al-state-error="load">
 *       <p>Could not load servers.</p>
 *       <button type="button" data-al-state-retry>Retry</button>
 *     </div>
 *   </div>
 *
 * Behaviour:
 *   - `ALState.set(el, 'loading'|'empty'|'error'|'offline'|name, opts)`
 *     reveals the matching `[data-al-state-panel]` and hides the rest.
 *     The container gets `data-al-state="<name>"` and `aria-busy` reflects
 *     the loading state.
 *   - `data-al-state-error="<name>"` keys an error panel to a named load so
 *     a failed `load` shows the right retry affordance. `opts.errorKey`
 *     selects it; unknown keys fall back to the first error panel.
 *   - A `[data-al-state-retry]` button inside the revealed panel re-fires
 *     the request via `ALState.retry(el, loadFn)`; while loading it is
 *     disabled and shows a spinner label (`data-al-state-retry-loading`).
 *   - `ALState.mount(el, loadFn)` binds retry and returns the controller
 *     with `{ set, retry, current }`.
 *   - Fires `al:state-change` with `{ root, name }` on every transition.
 *
 * Exposes `window.ALState` (browser) / `module.exports` (Node tests).
 *
 * Contract summary:
 *   - Tests:        tests/alState.test.ts
 *   - Motion:       busy icon spins via `--motion-default`; the
 *                   reduced-motion block swaps rotation for an opacity pulse.
 *   - Mobile:       panels stack; buttons keep the 44px minimum target.
 *   - Turbo cleanup: turbo-shell.js calls `ALState.destroyAll()` on
 *                   `al:navigated`.
 *
 * NOTE: there is also a shared data-cache facade under the same `ALState`
 * name (state.js). This file only sets `window.ALStateView` in the browser so
 * the two never collide; the Node export is `ALStateView`'s module.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.ALStateView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (rootScope) {
  "use strict";

  var currentScope = rootScope;
  var doc = (currentScope && currentScope.document) || null;

  function setScope(s) {
    currentScope = s || null;
    doc = (currentScope && currentScope.document) || null;
  }

  var mounted = [];

  function qsAll(rootEl, sel) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return [];
    return Array.prototype.slice.call(rootEl.querySelectorAll(sel));
  }

  function one(rootEl, sel) {
    return qsAll(rootEl, sel)[0] || null;
  }

  function panelsFor(el) {
    return qsAll(el, "[data-al-state-panel]");
  }

  function panelByName(el, name) {
    for (var i = 0; i < panelsFor(el).length; i++) {
      if (panelsFor(el)[i].getAttribute("data-al-state-panel") === name)
        return panelsFor(el)[i];
    }
    return null;
  }

  /* Resolve an error panel for a load key; fall back to the first error. */
  function errorPanelFor(el, errorKey) {
    var all = panelsFor(el);
    var firstError = null;
    for (var i = 0; i < all.length; i++) {
      var n = all[i].getAttribute("data-al-state-panel");
      if (n === "error") firstError = all[i];
      if (errorKey && all[i].getAttribute("data-al-state-error") === errorKey)
        return all[i];
    }
    return firstError;
  }

  function defaultNameFor(el) {
    var d = el.getAttribute("data-al-state-default");
    if (d) return d;
    var first = one(el, "[data-al-state-panel]");
    return first ? first.getAttribute("data-al-state-panel") : "loading";
  }

  function emit(el, name) {
    if (!currentScope || typeof currentScope.CustomEvent !== "function") return;
    try {
      el.dispatchEvent(
        new currentScope.CustomEvent("al:state-change", {
          bubbles: true,
          detail: { root: el, name: name },
        }),
      );
    } catch (e) {
      /* CustomEvent unavailable */
    }
  }

  function set(el, name, opts) {
    opts = opts || {};
    if (!el) return;
    var target = panelByName(el, name);
    if (!target && name === "error") target = errorPanelFor(el, opts.errorKey);
    if (!target) return;
    var all = panelsFor(el);
    for (var i = 0; i < all.length; i++) {
      var on = all[i] === target;
      if (on) all[i].removeAttribute("hidden");
      else all[i].setAttribute("hidden", "");
    }
    el.setAttribute("data-al-state", name);
    if (name === "loading") el.setAttribute("aria-busy", "true");
    else el.removeAttribute("aria-busy");
    emit(el, name);
    return target;
  }

  function retry(el, loadFn) {
    if (typeof loadFn === "function") loadFn(el);
  }

  function controller(el, loadFn) {
    var current = defaultNameFor(el);

    function onRetryClick(e) {
      var btn =
        e.target && e.target.closest
          ? e.target.closest("[data-al-state-retry]")
          : null;
      if (!btn || !el.contains(btn)) return;
      e.preventDefault();
      btn.setAttribute("disabled", "");
      var label = btn.getAttribute("data-al-state-retry-loading");
      if (label) btn.textContent = label;
      retry(el, loadFn);
      // The loadFn is expected to call ctrl.set(...) when the request lands;
      // if it throws synchronously, restore the retry affordance.
      if (btn.setAttribute) btn.setAttribute("disabled", "");
    }

    el.addEventListener("click", onRetryClick, true);

    var ctrl = {
      root: el,
      set: function (name, opts) {
        current = set(el, name, opts) ? name : current;
        return current;
      },
      retry: function () {
        retry(el, loadFn);
      },
      current: function () {
        return current;
      },
      destroy: function () {
        el.removeEventListener("click", onRetryClick, true);
        var idx = mounted.indexOf(ctrl);
        if (idx !== -1) mounted.splice(idx, 1);
      },
    };

    mounted.push(ctrl);
    return ctrl;
  }

  function mount(el, loadFn) {
    if (!el) return null;
    return controller(el, loadFn);
  }

  function scan(options) {
    if (!doc) return [];
    var roots = qsAll(doc, "[data-al-state]");
    var out = [];
    roots.forEach(function (el) {
      var c = controller(el, options && options.loadFn);
      out.push(c);
    });
    return out;
  }

  function destroyAll() {
    mounted.slice().forEach(function (c) {
      c.destroy();
    });
  }

  return {
    mount: mount,
    scan: scan,
    destroyAll: destroyAll,
    setScope: setScope,
    set: set,
    retry: retry,
    VERSION: 1,
  };
});
