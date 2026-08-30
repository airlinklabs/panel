/**
 * Islands registry — central lifecycle manager for component systems.
 *
 * Owns the mount/destroy cycle for:
 * - al-* component controllers (ALDialog, ALTabSystem, ALField, ALStateView)
 * - Specialist islands (xterm, Monaco, Chart.js, upload, drag/drop) — future
 *
 * Replaces the inline syncComponents() in turbo-shell.js with a single
 * registry that supports both full-document and subtree-scoped operations.
 *
 * Contract:
 * - destroyWithin(target) tears down only controllers whose root is inside target
 * - mountWithin(target) scans and mounts only controllers inside target
 * - sync() does full-document destroyAll then scan (for Turbo navigation)
 * - No mutation-observer auto-magic; all scanning is explicit
 *
 * Exposes `window.Islands` (browser) / `module.exports` (Node tests).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof window !== "undefined") window.Islands = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (rootScope) {
  "use strict";

  var doc = (rootScope && rootScope.document) || null;

  // ── Component system registry ─────────────────────────────────────────
  // Each entry: { key, scanMethod, rootFn? }
  // scanMethod: name of the method on window[key] that scans/mounts
  // rootFn: optional function returning the root element for scoped scan

  var systems = [];
  var mountedControllers = []; // { root, destroy, systemKey }

  /**
   * Register a component system.
   * @param {string} key - Global name (e.g. 'ALDialog')
   * @param {string} scanMethod - Method name for scanning (e.g. 'scan', 'enhance')
   * @param {Function} [rootFn] - Returns root element for scoped scan
   */
  function register(key, scanMethod, rootFn) {
    systems.push({ key: key, scanMethod: scanMethod, rootFn: rootFn || null });
  }

  // ── Destroy operations ────────────────────────────────────────────────

  /**
   * Destroy all controllers whose root is inside `target`.
   * Safe to call with a removed node (no-op).
   */
  function destroyWithin(target) {
    if (!target) return;
    for (var i = mountedControllers.length - 1; i >= 0; i--) {
      var ctrl = mountedControllers[i];
      if (!ctrl || !ctrl.root) {
        mountedControllers.splice(i, 1);
        continue;
      }
      // Check if the controller's root is inside the target (or is the target)
      if (target.contains && target.contains(ctrl.root)) {
        try {
          ctrl.destroy();
        } catch (e) {
          /* isolate */
        }
        mountedControllers.splice(i, 1);
      }
    }
  }

  /**
   * Destroy all mounted controllers (full document cleanup).
   */
  function destroyAll() {
    for (var i = 0; i < mountedControllers.length; i++) {
      try {
        mountedControllers[i].destroy();
      } catch (e) {
        /* isolate */
      }
    }
    mountedControllers = [];
  }

  // ── Mount operations ──────────────────────────────────────────────────

  /**
   * Mount/scan component systems within `target`.
   * For each registered system, queries target for the appropriate roots
   * and calls the scan/enhance method.
   */
  function mountWithin(target) {
    if (!target) return;
    for (var i = 0; i < systems.length; i++) {
      var sys = systems[i];
      var api = window[sys.key];
      if (typeof api !== "object" || api === null) continue;

      var method = api[sys.scanMethod];
      if (typeof method !== "function") continue;

      try {
        if (sys.rootFn) {
          // ALField uses enhance(root) with a specific root
          var root = sys.rootFn();
          if (target.contains && target.contains(root)) {
            var controllers = method.call(api, root);
            trackControllers(controllers, sys.key);
          }
        } else {
          // For scan-based systems, we need scoped scanning
          // The scan methods query the full document, so we destroy
          // within target first, then let scan re-mount what's there
          var controllers = method.call(api);
          trackControllers(controllers, sys.key);
        }
      } catch (e) {
        /* isolate */
      }
    }
  }

  /**
   * Track controllers returned by scan methods so destroyWithin can find them.
   */
  function trackControllers(controllers, systemKey) {
    if (!controllers || !Array.isArray(controllers)) return;
    for (var i = 0; i < controllers.length; i++) {
      var ctrl = controllers[i];
      if (ctrl && ctrl.root && typeof ctrl.destroy === "function") {
        // Avoid duplicates
        var exists = false;
        for (var j = 0; j < mountedControllers.length; j++) {
          if (mountedControllers[j].root === ctrl.root) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          mountedControllers.push({
            root: ctrl.root,
            destroy: ctrl.destroy,
            systemKey: systemKey,
          });
        }
      }
    }
  }

  // ── Full sync (for Turbo navigation) ─────────────────────────────────

  /**
   * Full-document sync: destroy all, then scan all systems.
   * Replaces turbo-shell.js syncComponents().
   */
  function sync() {
    destroyAll();
    for (var i = 0; i < systems.length; i++) {
      var sys = systems[i];
      var api = window[sys.key];
      if (typeof api !== "object" || api === null) continue;

      var method = api[sys.scanMethod];
      if (typeof method !== "function") continue;

      try {
        var controllers;
        if (sys.rootFn) {
          controllers = method.call(api, sys.rootFn());
        } else {
          controllers = method.call(api);
        }
        trackControllers(controllers, sys.key);
      } catch (e) {
        /* isolate */
      }
    }
  }

  // ── Specialist island registry (future) ──────────────────────────────
  // For islands that implement mount(root, context) → cleanup function

  var specialistRegistry = [];

  /**
   * Register a specialist island module.
   * @param {string} name - Identifier (e.g. 'xterm', 'monaco', 'chart')
   * @param {Function} mountFn - mount(root, context) returns cleanup function
   */
  function registerIsland(name, mountFn) {
    specialistRegistry.push({ name: name, mountFn: mountFn });
  }

  /**
   * Auto-mount specialist islands within target by scanning for
   * [data-island="<name>"] elements.
   */
  function mountIslandsWithin(target) {
    if (!target || !target.querySelectorAll) return;
    for (var i = 0; i < specialistRegistry.length; i++) {
      var island = specialistRegistry[i];
      var roots = target.querySelectorAll(
        '[data-island="' + island.name + '"]',
      );
      for (var j = 0; j < roots.length; j++) {
        var root = roots[j];
        // Skip if already mounted
        if (root.__islandCleanup) continue;
        try {
          var cleanup = island.mountFn(root, {
            nonce:
              root.dataset.nonce ||
              (doc && doc.querySelector('meta[name="csrf-token"]')?.content),
          });
          if (typeof cleanup === "function") {
            root.__islandCleanup = cleanup;
            mountedControllers.push({
              root: root,
              destroy: function () {
                if (root.__islandCleanup) {
                  root.__islandCleanup();
                  root.__islandCleanup = null;
                }
              },
              systemKey: "island:" + island.name,
            });
          }
        } catch (e) {
          /* isolate */
        }
      }
    }
  }

  // ── Initialize default al-* systems ──────────────────────────────────

  function init() {
    register("ALTabSystem", "scan");
    register("ALDialog", "scan");
    register("ALField", "enhance", function () {
      return doc ? doc.body : null;
    });
    register("ALStateView", "scan");
    sync();
  }

  if (doc && doc.readyState !== "loading") {
    init();
  } else if (doc) {
    doc.addEventListener("DOMContentLoaded", init);
  }

  return {
    // Core API
    register: register,
    destroyWithin: destroyWithin,
    destroyAll: destroyAll,
    mountWithin: function (target) {
      mountWithin(target);
      mountIslandsWithin(target);
    },
    sync: sync,

    // Specialist islands
    registerIsland: registerIsland,

    // Diagnostics
    get mounted() {
      return mountedControllers.slice();
    },
    get systems() {
      return systems.slice();
    },
    VERSION: 1,
  };
});
