/* Turbo shell — owns Turbo Drive for the panel server-rendered app.
 *
 * Turbo Drive swaps the <body> on every visit, which re-executes all inline
 * scripts in the freshly injected body (and re-fetches src scripts unless
 * marked data-turbo-eval="false"). Head/defer scripts (page-loader, state,
 * motion, ...) survive the swap untouched, so shared code must be re-armed
 * against the new DOM via the `al:navigated` event, and page scripts must run
 * their DOMContentLoaded work through window.ALMount instead (DOMContentLoaded
 * only ever fires once, on the very first document).
 *
 * Because the old page's inline scripts are discarded along with the swapped
 * body, anything those scripts attached directly to document/window would
 * stack on every visit. This shell therefore provides primitives that are
 * keyed so re-execution replaces instead of accumulates:
 *
 *   window.ALMount(fn)
 *     Queue `fn` to run against whichever page is mounted: once on the initial
 *     DOMContentLoaded, then again right after every Turbo body swap, then the
 *     queue is drained. Replace document.addEventListener('DOMContentLoaded',
 *     fn) with ALMount(fn) so a page re-initialises per rendition.
 *
 *   window.alOnNavigated(key, fn)
 *     Register `fn` per key to fire on every `al:navigated`. Re-registering an
 *     existing key replaces the handler (safe across body swaps). Prefer for
 *     any page code that used to do document.addEventListener('al:navigated').
 *
 *   window.alListener(target, event, key, fn)
 *     Attach at most ONE real listener per (target, event); the current page's
 *     `keyed` handler is the one that fires. Re-executing the page swaps the
 *     handler body without stacking n listeners. Use for document/window
 *     listeners (keydown, beforeunload, resize, ...) declared in page scripts.
 *
 * Turbo Drive stays enabled (it is the navigation engine). The default Turbo
 * progress bar is hidden via CSS in header.ejs because the panel draws its own
 * page loader overlay.
 */
(function () {
  'use strict';

  var T = (typeof window !== 'undefined' && window.Turbo) || null;

  // ALMount must always exist (even if Turbo is absent), so page scripts can
  // rely on it without splitting init paths.
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

  var raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame
    : function (fn) { return setTimeout(fn, 0); };

  /* ------------------------------------------------------------------ *
   * ALMount — per-rendition mount queue (replaces DOMContentLoaded)
   * ------------------------------------------------------------------ */

  var mounts = [];
  var flushing = false;

  window.ALMount = function (fn) {
    if (typeof fn === 'function') {
      mounts.push(fn);
      scheduleFlush();
    }
    return fn;
  };

  function scheduleFlush() {
    if (flushing) return;
    flushing = true;
    raf(function () {
      flushing = false;
      runMounts();
    });
  }

  function runMounts() {
    var pending = mounts;
    mounts = [];
    for (var i = 0; i < pending.length; i++) {
      try { pending[i](); } catch (e) { /* a page must never kill the shell */ }
    }
  }

  /* ------------------------------------------------------------------ *
     al:navigated
     ------------------------------------------------------------------ */

  function dispatchNavigated() {
    if (document.readyState === 'loading') return;
    document.dispatchEvent(new CustomEvent('al:navigated'));
  }

  var navHandlers = Object.create(null);
  window.alOnNavigated = function (key, fn) {
    navHandlers[key] = fn;   // replaces, never stacks
    return fn;
  };

  function runNavHandlers() {
    for (var k in navHandlers) {
      try { navHandlers[k](); } catch (e) { /* isolate */ }
    }
  }

  /* ------------------------------------------------------------------ *
     In-page component controllers (al-tabs, al-dialog, al-field, al-state)
     ------------------------------------------------------------------ */

  // Remount component controllers against the current DOM. destroyAll first
  // keeps this idempotent: the initial DOMContentLoaded and the first
  // turbo:load both fire for the first rendition, and a body swap happens
  // after the old controllers were torn down, so exactly one live set
  // survives.
  var COMPONENT_SYSTEMS = [
    { key: 'ALTabSystem', scan: 'scan' },
    { key: 'ALDialog', scan: 'scan' },
    { key: 'ALField', scan: 'enhance', root: function () { return document.body; } },
    { key: 'ALStateView', scan: 'scan' },
  ];

  function syncComponents() {
    for (var i = 0; i < COMPONENT_SYSTEMS.length; i++) {
      var sys = COMPONENT_SYSTEMS[i];
      var api = window[sys.key];
      if (typeof api !== 'object') continue;
      try {
        if (typeof api.destroyAll === 'function') api.destroyAll();
        var method = api[sys.scan];
        if (typeof method === 'function') {
          if (sys.root) method.call(api, sys.root());
          else method.call(api);
        }
      } catch (e) { /* a component must never kill the shell */ }
    }
  }

  /* ------------------------------------------------------------------ *
     Keyed single listeners for document/window (no stacking on re-run)
     * ------------------------------------------------------------------ */

  var listenerRegistry = {};

  function box(target) {
    var owner = target;
    var key = target === window ? 'window' : (target === document ? 'document' : target.id);
    return listenerRegistry[key] || (listenerRegistry[key] = Object.create(null));
  }

  window.alListener = function (target, event, key, fn) {
    var invokerKey = '__alInvoker';
    var registr = box(target);
    var hand = registr[event] || (registr[event] = Object.create(null));
    hand[key] = fn;
    // Attach a single dispatcher per (target, event).
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

  // The incoming page's body scripts re-register their keyed handler maps (via
  // turbo:before-render below, cleared first). The real addEventListener one-
  // per-(target,event) dispatcher survives; only the per-key handlers drop.
  function dropPageKeyedListeners() {
    listenerRegistry = {};
  }

  /* ------------------------------------------------------------------ *
   *  Timing: initial document + every turbo:load
   * ------------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      runMounts();
      dispatchNavigated();
      runNavHandlers();
      syncComponents();
    });
  } else {
    scheduleFlush();
    dispatchNavigated();
    runNavHandlers();
    syncComponents();
  }

  document.addEventListener('turbo:render', function () { scheduleFlush(); });
  document.addEventListener('turbo:load', function () {
    scheduleFlush();
    dispatchNavigated();
    runNavHandlers();
    syncComponents();
  });

  // Before the refresh body arrives, drop the previous page's keyed listener
  // handlers and tab controllers so nothing leaks into the new rendition.
  document.addEventListener('turbo:before-render', function () {
    dropPageKeyedListeners();
    if (typeof window.ALTabSystem === 'object' && typeof window.ALTabSystem.destroyAll === 'function') {
      try { window.ALTabSystem.destroyAll(); } catch (e) { /* isolate */ }
    }
  });

  // Panel pages still contain route-owned scripts that initialise consoles,
  // charts and form controls. A Turbo snapshot restores their DOM without
  // re-evaluating those scripts, leaving a partially live page on Back/Forward.
  // Keep Drive for navigation, but always render a fresh server response.
  document.addEventListener('turbo:before-cache', function () {
    var turbo = window.Turbo || T;
    if (turbo && turbo.cache && typeof turbo.cache.exemptPageFromCache === 'function') {
      turbo.cache.exemptPageFromCache();
    }
  });

  function updateTurboState() {
    var turbo = window.Turbo || T;
    window.ALTurboAvailable = !!turbo;
    window.ALTurboEnabled = !!(turbo && turbo.session && turbo.session.drive);
  }

  updateTurboState();
  document.addEventListener('DOMContentLoaded', updateTurboState, { once: true });
})();
