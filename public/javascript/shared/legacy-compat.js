/* Legacy compatibility shim — provides ALMount and alListener
   which were defined in turbo-shell.js (now deleted).
   Page scripts still reference these; remove when all consumers migrate. */
(function () {
  'use strict';

  /* ── ALMount(fn) ────────────────────────────────────────────────
     Queue fn to run on DOMContentLoaded. If DOM is already loaded,
     run immediately. Used by page scripts in place of
     document.addEventListener('DOMContentLoaded', fn). */
  if (typeof window.ALMount !== 'function') {
    window.ALMount = function (fn) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
      } else {
        fn();
      }
      return fn;
    };
  }

  /* ── alListener(target, event, key, fn) ─────────────────────────
     Attach at most ONE real listener per (target, event). The
     current page's keyed handler is the one that fires.
     Re-executing the page swaps the handler body without stacking
     n listeners. */
  var listenerRegistry = {};

  function box(target) {
    var key = '_alListeners';
    if (!target[key]) target[key] = {};
    return target[key];
  }

  window.alListener = function (target, event, key, fn) {
    var registr = box(target);
    var hand = registr[event] || (registr[event] = Object.create(null));
    hand[key] = fn;
    if (!target['__alInvoker' + event]) {
      target['__alInvoker' + event] = true;
      target.addEventListener(event, function (e) {
        var current = box(target)[event];
        if (!current) return;
        for (var k in current) {
          try { current[k](e); } catch (err) { /* isolate */ }
        }
      });
    }
  };
})();
