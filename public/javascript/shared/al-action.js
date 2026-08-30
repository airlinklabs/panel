/* Shared action-state controller for buttons and links.
 *
 * One contract for buttons that mutate state (save, delete, install) so a
 * busy action is announced, cannot be double-fired, and communicates
 * success/error without re-writing the DOM per page.
 *
 * Markup contract (progressive enhancement; a plain button still works):
 *   <button class="al-btn-primary" data-al-action
 *           data-action-label="Saving…" data-action-confirm="Delete this image?">
 *     Save
 *   </button>
 *
 * Behaviour:
 *   - `ALAction.enhance(root)` mounts every `[data-al-action]` button in the
 *     subtree. On click it runs the associated async handler (via
 *     `data-action-handler` or a bubbling `al:action` CustomEvent), guards
 *     against double-firing while busy, and toggles a loading state:
 *       .al-action-loading  (aria-busy="true", disabled, spinner + label)
 *     `data-action-confirm` shows a native confirm (window.confirm, or
 *     ALDialog.confirm when present) before starting.
 *   - `ALAction.loading(btn, on)` is the low-level toggle used by page
 *     scripts that already own their request lifecycle: it sets
 *     aria-busy/disabled, swaps the label (kept in `data-action-label`),
 *     and preserves the button's original width so the layout does not
 *     jump when the label shortens.
 *   - `ALAction.setResult(btn, 'success'|'error', message)` flashes an
 *     aria-live result on the button (classes `.al-action-success` /
 *     `.al-action-error`) and reverts to the resting state.
 *
 * Reduced motion: the loading spinner is a CSS border animation; it is
 * intentionally small and state-signalling, and motion.css keeps it visible
 * under prefers-reduced-motion (opacity-only) rather than killing it.
 *
 * Exposes `window.ALAction` (browser) / `module.exports` (Node tests).
 *
 * Contract summary:
 *   - Tests:        tests/alAction.test.ts
 *   - Motion:       spinner + label swap use `--motion-default`; reduced
 *                   motion swaps rotation for an opacity pulse (tw.css).
 *   - Mobile:       `.al-btn-*` carry a 44px minimum practical target.
 *   - Turbo cleanup: turbo-shell.js calls `ALAction.destroyAll()` on
 *                   `al:navigated`.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.ALAction = api;
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
  var busyButtons = new Set();

  function saveOriginal(btn) {
    if (!btn.dataset) btn.dataset = {};
    if (btn.dataset.alActionOriginal === undefined) {
      btn.dataset.alActionOriginal = btn.textContent || "";
    }
  }

  function restoreLabel(btn) {
    if (btn.dataset && btn.dataset.alActionOriginal !== undefined) {
      btn.textContent = btn.dataset.alActionOriginal;
    }
  }

  /* Swap in the loading label, preserving width so no layout shift. */
  function setLoadingLabel(btn) {
    var label = btn.dataset && btn.dataset.actionLabel;
    if (label) {
      btn.textContent = label;
    }
    if (typeof btn.style !== "undefined" && btn.style) {
      btn.style.minWidth = btn.offsetWidth ? btn.offsetWidth + "px" : "";
    }
  }

  function loading(btn, on) {
    if (!btn) return;
    if (on) {
      saveOriginal(btn);
      setLoadingLabel(btn);
      busyButtons.add(btn);
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("disabled", "");
      btn.classList.add("al-action-loading");
    } else {
      restoreLabel(btn);
      busyButtons.delete(btn);
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("disabled");
      btn.classList.remove("al-action-loading");
    }
  }

  function isBusy(btn) {
    return (
      busyButtons.has(btn) ||
      (btn.getAttribute && btn.getAttribute("aria-busy") === "true")
    );
  }

  function setResult(btn, kind, message) {
    if (!btn) return;
    btn.classList.remove("al-action-success", "al-action-error");
    btn.classList.add(
      kind === "error" ? "al-action-error" : "al-action-success",
    );
    if (message) {
      saveOriginal(btn);
      btn.textContent = message;
    }
    if (typeof setTimeout === "function") {
      setTimeout(function () {
        restoreLabel(btn);
        btn.classList.remove("al-action-success", "al-action-error");
      }, 2600);
    } else {
      restoreLabel(btn);
      btn.classList.remove("al-action-success", "al-action-error");
    }
  }

  function confirmStep(btn) {
    var msg = btn.dataset && btn.dataset.actionConfirm;
    if (!msg) return Promise.resolve(true);
    if (
      typeof ALDialog !== "undefined" &&
      ALDialog &&
      typeof ALDialog.confirm === "function"
    ) {
      return ALDialog.confirm({
        title: "Confirm",
        body: msg,
        confirmLabel: "Confirm",
      });
    }
    return Promise.resolve(
      Boolean(currentScope.confirm && currentScope.confirm(msg)),
    );
  }

  function runHandler(btn, e) {
    // Prefer a bubbling CustomEvent the page listens for; fall back to an
    // inline data-action-handler function reference.
    if (currentScope && typeof currentScope.CustomEvent === "function") {
      var detail = { button: btn, originalEvent: e };
      try {
        btn.dispatchEvent(
          new currentScope.CustomEvent("al:action", {
            bubbles: true,
            detail: detail,
          }),
        );
      } catch (err) {
        /* CustomEvent unavailable */
      }
    }
    var handler = btn.dataset && btn.dataset.actionHandler;
    if (
      handler &&
      currentScope &&
      typeof currentScope[handler] === "function"
    ) {
      currentScope[handler](btn, e);
    }
  }

  function onClick(e) {
    var btn =
      e.target && e.target.closest
        ? e.target.closest("[data-al-action]")
        : null;
    if (!btn || !btn.getAttribute || !btn.hasAttribute("data-al-action"))
      return;
    if (isBusy(btn)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    confirmStep(btn).then(function (ok) {
      if (!ok) return;
      runHandler(btn, e);
    });
  }

  function controller(btn) {
    btn.addEventListener("click", onClick, true);
    return {
      root: btn,
      loading: function (on) {
        loading(btn, on);
      },
      setResult: function (kind, message) {
        setResult(btn, kind, message);
      },
      isBusy: function () {
        return isBusy(btn);
      },
      destroy: function () {
        btn.removeEventListener("click", onClick, true);
      },
    };
  }

  function enhance(root) {
    if (!root) return [];
    var buttons = Array.prototype.slice.call(
      root.querySelectorAll("[data-al-action]"),
    );
    var out = [];
    buttons.forEach(function (btn) {
      var c = controller(btn);
      mounted.push(c);
      out.push(c);
    });
    return out;
  }

  function mount(btn) {
    if (!btn) return null;
    var c = controller(btn);
    mounted.push(c);
    return c;
  }

  function destroyAll() {
    mounted.slice().forEach(function (c) {
      c.destroy();
    });
    mounted = [];
  }

  return {
    enhance: enhance,
    mount: mount,
    destroyAll: destroyAll,
    loading: loading,
    isBusy: isBusy,
    setResult: setResult,
    setScope: setScope,
    VERSION: 1,
  };
});
