/**
 * Alpine.js bootstrap module — shared data factories for repeated local behaviour.
 *
 * Registered factories:
 * - al.disclosure: open/closed toggle for expandable sections
 * - al.confirmAction: temporary confirmation state for destructive actions
 * - al.formDirty: tracks whether a form has unsaved changes
 *
 * Does NOT:
 * - Create a global store for server records
 * - Cache API data
 * - Own canonical domain state
 */
(function () {
  if (window.__alpineBootstrap) return;
  window.__alpineBootstrap = true;

  // Wait for Alpine to be ready
  document.addEventListener('alpine:init', function () {
    // ── Disclosure factory ─────────────────────────────────────────────
    // Usage: <div x-data="al.disclosure()"> ... </div>
    Alpine.data('disclosure', function () {
      return {
        open: false,
        toggle: function () {
          this.open = !this.open;
        },
      };
    });

    // ── Confirm action factory ─────────────────────────────────────────
    // Usage: <div x-data="al.confirmAction({ onConfirm: () => ... })">
    //   <button @click="requestConfirm()">Delete</button>
    //   <div x-show="confirming" x-transition>
    //     <button @click="confirm()">Yes, delete</button>
    //     <button @click="cancel()">Cancel</button>
    //   </div>
    // </div>
    Alpine.data('confirmAction', function (opts) {
      return {
        confirming: false,
        requestConfirm: function () {
          this.confirming = true;
        },
        confirm: function () {
          this.confirming = false;
          if (opts && typeof opts.onConfirm === 'function') {
            opts.onConfirm();
          }
        },
        cancel: function () {
          this.confirming = false;
        },
      };
    });

    // ── Form dirty tracker factory ─────────────────────────────────────
    // Usage: <form x-data="al.formDirty()" @input="dirty = true" @submit="dirty = false">
    Alpine.data('formDirty', function () {
      return {
        dirty: false,
        reset: function () {
          this.dirty = false;
        },
      };
    });

    // ── Tab switcher factory ───────────────────────────────────────────
    // Usage: <div x-data="al.tabs({ initial: 'general' })">
    //   <button @click="select('general')" :class="active('general')">General</button>
    //   <div x-show="current === 'general'">...</div>
    // </div>
    Alpine.data('tabs', function (opts) {
      var initial = (opts && opts.initial) || 'general';
      return {
        current: initial,
        select: function (tab) {
          this.current = tab;
        },
        isActive: function (tab) {
          return this.current === tab;
        },
      };
    });
  });

  // Expose factories globally for documentation purposes
  window.al = window.al || {};
  window.al.disclosure = function () { return { open: false, toggle: function () { this.open = !this.open; } }; };
  window.al.confirmAction = function (opts) {
    return {
      confirming: false,
      requestConfirm: function () { this.confirming = true; },
      confirm: function () { this.confirming = false; if (opts && typeof opts.onConfirm === 'function') opts.onConfirm(); },
      cancel: function () { this.confirming = false; },
    };
  };
  window.al.formDirty = function () { return { dirty: false, reset: function () { this.dirty = false; } }; };
  window.al.tabs = function (opts) {
    var initial = (opts && opts.initial) || 'general';
    return { current: initial, select: function (t) { this.current = t; }, isActive: function (t) { return this.current === t; } };
  };
})();
