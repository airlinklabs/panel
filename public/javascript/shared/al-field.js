/* Shared field-state controller.
 *
 * One contract for form inputs: error/success messaging with correct ARIA
 * association, and a password visibility toggle. Removes the per-page
 * `border-red-500` + `text-red-500` inline fiddling.
 *
 * Markup contract (progressive enhancement):
 *   <div class="al-field" data-al-field>
 *     <label for="newPassword">New password</label>
 *     <div class="al-field-control">
 *       <input id="newPassword" type="password" data-al-field-input autocomplete="new-password">
 *       <button type="button" class="al-btn-ghost" data-al-field-toggle aria-label="Show password" aria-pressed="false">…</button>
 *     </div>
 *     <p class="al-field-message" data-al-field-message role="alert" hidden></p>
 *   </div>
 *
 * Behaviour:
 *   - `ALField.setError(input, message)` marks the field invalid
 *     (`aria-invalid="true"`, error styling on the wrapper), puts the
 *     message into the field's `[data-al-field-message]`, and associates it
 *     via `aria-describedby` so screen readers announce it with the control.
 *   - `ALField.setSuccess(input, message)` does the same without the
 *     invalid flag (positive state).
 *   - `ALField.clear(input)` removes both.
 *   - Password visibility: a `[data-al-field-toggle]` button inside the
 *     field toggles the input's `type` between `password` and `text`,
 *     updates `aria-pressed`, and swaps a "Show/Hide password" label.
 *   - `ALField.enhance(root)` wires the toggle buttons and exposes an
 *     `al:field-error`/`al:field-clear` CustomEvent on the input so page
 *     scripts can react (e.g. clear a form summary on edit).
 *
 * Exposes `window.ALField` (browser) / `module.exports` (Node tests).
 *
 * Contract summary:
 *   - Tests:        tests/alField.test.ts
 *   - Motion:       none required; validation feedback is a static message
 *                   + color, so reduced motion is a non-issue.
 *   - Mobile:       message + input stack naturally; the toggle button keeps
 *                   the 44px minimum target.
 *   - Turbo cleanup: turbo-shell.js calls `ALField.destroyAll()` on
 *                   `al:navigated`.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.ALField = api;
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

  function fieldFor(input) {
    return input && input.closest ? input.closest("[data-al-field]") : null;
  }

  function messageElFor(input) {
    var field = fieldFor(input);
    if (!field) return null;
    return one(field, "[data-al-field-message]");
  }

  function setMessage(input, message, kind) {
    var field = fieldFor(input);
    var msgEl = messageElFor(input);
    if (field) {
      field.classList.remove("al-field-invalid", "al-field-success");
      field.classList.add(
        kind === "error" ? "al-field-invalid" : "al-field-success",
      );
    }
    if (msgEl) {
      msgEl.textContent = message || "";
      if (message) msgEl.removeAttribute("hidden");
      else msgEl.setAttribute("hidden", "");
    }
    if (message) {
      input.setAttribute("aria-invalid", kind === "error" ? "true" : "false");
      if (msgEl && msgEl.id) input.setAttribute("aria-describedby", msgEl.id);
    } else {
      input.removeAttribute("aria-invalid");
      if (msgEl && input.getAttribute("aria-describedby") === msgEl.id) {
        input.removeAttribute("aria-describedby");
      }
    }
    emit(input, kind === "error" ? "al:field-error" : "al:field-clear", {
      message: message,
    });
  }

  function setError(input, message) {
    setMessage(input, message, "error");
  }

  function setSuccess(input, message) {
    setMessage(input, message, "success");
  }

  function clear(input) {
    setMessage(input, "", null);
  }

  function emit(input, type, detail) {
    if (!currentScope || typeof currentScope.CustomEvent !== "function") return;
    try {
      input.dispatchEvent(
        new currentScope.CustomEvent(type, { bubbles: true, detail: detail }),
      );
    } catch (e) {
      /* CustomEvent unavailable */
    }
  }

  /* Password visibility toggle. */
  function togglePassword(toggleBtn) {
    var field = toggleBtn.closest("[data-al-field]");
    var input = field ? one(field, "input[data-al-field-input]") : null;
    if (!input) return;
    var showing = input.getAttribute("type") === "text";
    input.setAttribute("type", showing ? "password" : "text");
    var pressed = !showing;
    toggleBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
    if (
      toggleBtn.dataset &&
      toggleBtn.dataset.labelShow &&
      toggleBtn.dataset.labelHide
    ) {
      toggleBtn.textContent = pressed
        ? toggleBtn.dataset.labelHide
        : toggleBtn.dataset.labelShow;
    }
    if (toggleBtn.setAttribute) {
      toggleBtn.setAttribute(
        "aria-label",
        pressed ? "Hide password" : "Show password",
      );
    }
    input.focus();
  }

  function onClickToggle(e) {
    var btn =
      e.target && e.target.closest
        ? e.target.closest("[data-al-field-toggle]")
        : null;
    if (!btn) return;
    e.preventDefault();
    togglePassword(btn);
  }

  function controller(field) {
    field.addEventListener("click", onClickToggle, true);
    return {
      root: field,
      destroy: function () {
        field.removeEventListener("click", onClickToggle, true);
      },
    };
  }

  function enhance(root) {
    if (!root) return [];
    var fields = qsAll(root, "[data-al-field]");
    if (root.hasAttribute && root.hasAttribute("data-al-field"))
      fields.unshift(root);
    var out = [];
    fields.forEach(function (field) {
      var c = controller(field);
      mounted.push(c);
      out.push(c);
    });
    return out;
  }

  function destroyAll() {
    mounted.slice().forEach(function (c) {
      c.destroy();
    });
    mounted = [];
  }

  return {
    enhance: enhance,
    destroyAll: destroyAll,
    setError: setError,
    setSuccess: setSuccess,
    clear: clear,
    setScope: setScope,
    VERSION: 1,
  };
});
