/* Shared native <dialog> controller.
 *
 * One dialog implementation for the whole panel. Replaces the custom
 * `al-sheet-overlay` div with a real `<dialog>` element so the browser
 * supplies top-layer stacking, `::backdrop`, and native Escape handling
 * (`cancel`), while this controller owns the parts the browser does not:
 * focus return, scroll lock, focus trap, body-node restore for rich
 * sheets, and a Promise-based confirm/alert API.
 *
 * Markup contract (all optional, all progressive):
 *   <dialog class="al-dialog" data-al-dialog>
 *     <div class="al-dialog-header">
 *       <p class="al-dialog-title"></p>
 *       <button type="button" class="al-btn-ghost" data-al-dialog-close aria-label="Close">…</button>
 *     </div>
 *     <div class="al-dialog-content"></div>
 *     <div class="al-dialog-footer">
 *       <button type="button" class="al-btn-secondary" data-al-dialog-dismiss>Cancel</button>
 *       <button type="button" class="al-btn-primary" data-al-dialog-confirm>Confirm</button>
 *     </div>
 *   </dialog>
 *
 * Behaviour:
 *   - `ALDialog.confirm(opts)` shows the single global dialog as a
 *     confirmation and resolves the returned Promise with true/false.
 *     opts: { title, body, danger, confirmLabel, dismissLabel, onConfirm }
 *     `danger` styles the confirm button (al-btn-danger).
 *   - `ALDialog.alert(opts)` is a confirm with only a Close action.
 *   - `ALDialog.show(opts)` moves a bodyNode into the dialog (rich sheet)
 *     and restores it to its page position on close, so getElementById
 *     still works for the next step of a multi-step flow.
 *   - `ALDialog.mount(dialogEl)` wires a declarative `<dialog data-al-dialog>`:
 *     `data-al-dialog-close` / `data-al-dialog-dismiss` close it,
 *     `data-al-dialog-confirm` closes it and resolves the pending confirm.
 *   - Focus returns to the element that was active before opening; while a
 *     dialog is open, Tab is trapped inside and the body scroll is locked.
 *   - Nested dialogs are supported: opening a dialog on top of another
 *     pushes a stack; closing pops it and restores focus to the opener.
 *   - Reduced motion: the controller only toggles `[open]`; entrance/exit
 *     animation is CSS-only (see motion.css, .al-dialog rules) and obeys
 *     prefers-reduced-motion without a global kill switch.
 *
 * Exposes `window.ALDialog` (browser) / `module.exports` (Node tests).
 *
 * Contract summary:
 *   - Tests:        tests/alDialog.test.ts
 *   - Motion:       tokens `--dur-enter`/`--dur-exit`; reduced-motion block
 *                   in tw.css keeps the fade, drops the travel/scale.
 *   - Mobile:       panel fills the viewport; body scroll is locked (see
 *                   scroll-lock test), safe-area padding from the view.
 *   - Turbo cleanup: turbo-shell.js calls `ALDialog.destroyAll()` on
 *                   `al:navigated` so no dialog survives a page swap.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.ALDialog = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (rootScope) {
  "use strict";

  /* The root scope (window in the browser) is read from `currentScope` at
     call time so tests can inject a shim via `ALDialog.setScope()`. */
  var currentScope = rootScope;
  var doc = (currentScope && currentScope.document) || null;

  function setScope(s) {
    currentScope = s || null;
    doc = (currentScope && currentScope.document) || null;
  }

  function qsAll(rootEl, sel) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return [];
    return Array.prototype.slice.call(rootEl.querySelectorAll(sel));
  }

  function one(rootEl, sel) {
    return qsAll(rootEl, sel)[0] || null;
  }

  /* Global single-dialog instance (mirrors the old #globalModal). Looked up
     on every use so a test scope swap picks up the right element. */
  var globalDialogEl = null;

  var stack = []; // currently open dialogs, innermost last
  var lastFocused = null; // element to return focus to on close
  var pendingResolve = null; // Promise resolver for the active confirm
  var onCloseHook = null;
  var bodyOrigins = typeof WeakMap === "function" ? new WeakMap() : null;

  function activeDialog() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  function isOpen(el) {
    return (
      !!el && (el.open === true || (el.hasAttribute && el.hasAttribute("open")))
    );
  }

  function focusableIn(el) {
    return qsAll(
      el,
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ).filter(function (el2) {
      return !el2.disabled;
    });
  }

  function lockScroll() {
    if (doc && doc.documentElement) {
      doc.documentElement.setAttribute("data-modal-open", "");
    }
    if (doc && doc.body) {
      doc.body.classList.add("no-scroll");
    }
  }

  function unlockScroll() {
    if (stack.length) return; // a nested dialog is still open
    if (doc && doc.documentElement) {
      doc.documentElement.removeAttribute("data-modal-open");
    }
    if (doc && doc.body) {
      doc.body.classList.remove("no-scroll");
    }
  }

  function restoreFocus() {
    if (
      !stack.length &&
      lastFocused &&
      typeof lastFocused.focus === "function"
    ) {
      try {
        lastFocused.focus();
      } catch (e) {
        /* element detached */
      }
    }
    lastFocused = null;
  }

  /* Body-node tracking for rich sheets: the node is moved into the dialog
     and always restored to its page position on close (no clones). */
  var bodyNode = null;

  function restoreBody() {
    if (!bodyNode) return;
    var o = bodyOrigins && bodyOrigins.get(bodyNode);
    if (o && o.parent && o.parent.parentNode) {
      bodyNode.style.display = "none";
      o.parent.insertBefore(bodyNode, o.ref || null);
    }
    bodyNode = null;
  }

  function closeDialog(el, opts) {
    if (isOpen(el)) {
      try {
        el.close();
      } catch (e) {
        /* shim may not implement close() */
      }
      if (el.hasAttribute && el.hasAttribute("open"))
        el.removeAttribute("open");
    }
    var idx = stack.indexOf(el);
    if (idx !== -1) stack.splice(idx, 1);
    unlockScroll();
    restoreFocus();
    if (opts && opts.hook) {
      var hook = opts.hook;
      try {
        hook();
      } catch (e) {
        /* isolate */
      }
    }
  }

  function openDialog(el) {
    if (isOpen(el)) return;
    lastFocused = (doc && doc.activeElement) || null;
    if (typeof el.showModal === "function") {
      try {
        el.showModal();
      } catch (e) {
        /* already open or unsupported */
      }
    }
    if (!isOpen(el) && el.setAttribute) el.setAttribute("open", "");
    stack.push(el);
    lockScroll();
  }

  /* Focus the first focusable element, or the dialog itself, or the close
     button — mirroring the old modal's "focus close" affordance. */
  function focusDialog(el) {
    var focusable = focusableIn(el);
    var target = focusable[0] || one(el, "[data-al-dialog-close]") || el;
    if (target && typeof target.focus === "function") {
      try {
        target.focus();
      } catch (e) {
        /* noop */
      }
    }
  }

  /* ── Promise API (window.modal-compatible) ────────────────────── */

  function currentEl() {
    if (!doc) return null;
    globalDialogEl = doc.getElementById("globalModal");
    return globalDialogEl;
  }

  function fill(opts) {
    var el = currentEl();
    if (!el) return null;
    var title = one(el, "[data-al-dialog-title], #globalModalTitle");
    var body = one(el, "[data-al-dialog-body], #globalModalBody");
    var confirmBtn = one(el, "[data-al-dialog-confirm], #globalModalConfirm");
    if (title) title.textContent = opts.title || "";
    if (body) body.textContent = opts.body || "";
    if (confirmBtn) {
      confirmBtn.textContent = opts.confirmLabel || "Confirm";
      confirmBtn.className = opts.danger ? "al-btn-danger" : "al-btn-primary";
    }
    return el;
  }

  function confirm(opts) {
    opts = opts || {};
    var el = fill(opts);
    if (!el) return Promise.resolve(false);
    pendingResolve = null;
    onCloseHook = null;
    return new Promise(function (resolve) {
      pendingResolve = resolve;
      if (typeof opts.onConfirm === "function") {
        // Legacy callers pass onConfirm; keep them working.
        var fn = opts.onConfirm;
        pendingResolve = function (v) {
          resolve(v);
          if (v) fn();
        };
      }
      openDialog(el);
      focusDialog(el);
    });
  }

  function alert(opts) {
    if (typeof opts === "string" || opts == null)
      opts = { title: "Error", body: String(opts || "") };
    if (opts && opts.confirmLabel === undefined)
      opts = Object.assign({}, opts, { confirmLabel: "Close" });
    return confirm(opts);
  }

  function show(opts) {
    opts = opts || {};
    var el = currentEl();
    if (!el) return;
    var content = one(el, "[data-al-dialog-content], #globalModalContent");
    var title = one(el, "[data-al-dialog-title], #globalModalTitle");
    if (title) title.textContent = opts.title || "";
    if (content && opts.bodyNode) {
      if (bodyOrigins && !bodyOrigins.has(opts.bodyNode)) {
        bodyOrigins.set(opts.bodyNode, {
          parent: opts.bodyNode.parentNode,
          ref: opts.bodyNode.nextSibling,
        });
      }
      content.innerHTML = "";
      content.appendChild(opts.bodyNode);
      opts.bodyNode.style.display = "";
      bodyNode = opts.bodyNode;
    }
    onCloseHook = opts.onClose || null;
    openDialog(el);
    focusDialog(el);
  }

  function close() {
    var el = activeDialog() || currentEl();
    var hook = onCloseHook;
    onCloseHook = null;
    if (!el) {
      if (hook) hook();
      return;
    }
    restoreBody();
    closeDialog(el, { hook: hook });
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
    }
  }

  /* ── Declarative mount ────────────────────────────────────────── */

  var mounted = []; // every live controller, in mount order

  function controller(el) {
    var destroyed = false;

    function onCancel(e) {
      // Native Escape: only the topmost dialog cancels.
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      resolve(false);
      closeDialog(el);
    }

    function onClick(e) {
      var target = e && e.target;
      var closeBtn =
        target && target.closest
          ? target.closest("[data-al-dialog-close], [data-al-dialog-dismiss]")
          : null;
      var confirmBtn =
        target && target.closest
          ? target.closest("[data-al-dialog-confirm]")
          : null;
      if (closeBtn) {
        e.preventDefault();
        resolve(false);
        closeDialog(el);
        return;
      }
      if (confirmBtn) {
        e.preventDefault();
        resolve(true);
        closeDialog(el);
      }
    }

    function onKeydown(e) {
      if (!isOpen(el)) return;
      if (e.key === "Tab") {
        var focusable = focusableIn(el);
        if (!focusable.length) {
          e.preventDefault();
          focusDialog(el);
          return;
        }
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        var active = (doc && doc.activeElement) || null;
        if (e.shiftKey && (active === first || active === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    function resolve(value) {
      if (pendingResolve && el === activeDialog()) {
        var fn = pendingResolve;
        pendingResolve = null;
        fn(value);
      }
    }

    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKeydown);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKeydown);
      var idx = mounted.indexOf(ctrl);
      if (idx !== -1) mounted.splice(idx, 1);
    }

    var ctrl = { root: el, destroy: destroy };

    mounted.push(ctrl);
    return ctrl;
  }

  function mount(rootEl, options) {
    if (!rootEl) return null;
    var c = controller(rootEl);
    if (options && typeof options.onReady === "function") options.onReady(c);
    return c;
  }

  function scan(options) {
    if (!doc) return [];
    var roots = qsAll(doc, "dialog[data-al-dialog]");
    var out = [];
    roots.forEach(function (el) {
      var c = controller(el);
      if (options && typeof options.onReady === "function") options.onReady(c);
      out.push(c);
    });
    return out;
  }

  function destroyAll() {
    mounted.slice().forEach(function (c) {
      c.destroy();
    });
  }

  /* Full lifecycle reset: closes nothing but clears every piece of module
     state so a fresh page rendition (or a test) starts clean. */
  function reset() {
    stack = [];
    lastFocused = null;
    pendingResolve = null;
    onCloseHook = null;
    bodyNode = null;
    if (doc) {
      if (
        doc.documentElement &&
        typeof doc.documentElement.removeAttribute === "function"
      ) {
        doc.documentElement.removeAttribute("data-modal-open");
      }
      if (
        doc.body &&
        doc.body.classList &&
        typeof doc.body.classList.remove === "function"
      ) {
        doc.body.classList.remove("no-scroll");
      }
    }
  }

  return {
    mount: mount,
    scan: scan,
    destroyAll: destroyAll,
    reset: reset,
    setScope: setScope,
    confirm: confirm,
    alert: alert,
    show: show,
    close: close,
    isOpen: isOpen,
    VERSION: 1,
  };
});
