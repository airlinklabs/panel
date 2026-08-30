/* ============================================
   AIRLINK ANIMATION HELPERS
   Physics-free, class-driven motion.
   All durations/easing live in /styles/motion.css.

   Central popup manager:
   - every popup animates in and out (open/close classes)
   - clicking the scrim (empty space around the panel) closes it
   - Escape closes the topmost popup
   - only one popup can be open at a time — opening a new one
     closes any currently open popup/dropdown first
   - opening moves focus into the popup, closing restores it
   - Tab is contained inside the topmost popup
   ============================================ */
(function () {
  if (window.Animate) return;

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EXIT_MS = REDUCED
    ? 0
    : 200; /* >= --dur-exit (180ms) and al-sheet-out (200ms) */
  let openOverlays = [];

  function focusables(root) {
    return root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
  }

  function panelOf(overlay) {
    if (!overlay) return null;
    return overlay.querySelector(
      ".al-sheet-panel, .al-modal-panel, .modal-box, .m-dialog, .confirm-box",
    );
  }

  /* Close any dropdowns that are not attached to a popup overlay —
     per-dropdown click-away handlers own the ones that live inside
     overlays (e.g. the command palette). */
  function closeFloatingDropdowns() {
    document.querySelectorAll(".al-dropdown.open").forEach(function (dd) {
      if (!dd.closest(".al-sheet-overlay")) dd.classList.remove("open");
    });
  }

  /* Open a modal: display the overlay, then transition the panel
     from scale(0.96) translateY(8px) → rest (CSS .al-modal-panel).
     Only one popup at a time: everything else is closed first.
     The pre-state (hidden → flex, opacity 0) is applied first and
     flushed with a reflow so the reveal transition actually plays;
     without this, .open landing in the same style recalc as the
     display switch makes the entrance snap (transitions need a
     computed before-state, animations do not). */
  function openModal(overlay, panel) {
    if (!overlay) return;
    if (overlay.classList.contains("open")) {
      // Re-showing an already-open overlay (e.g. swapping the body of a
      // 2-step dialog): the caller (window.modal.show) resets the panel's
      // className on every open, which drops the `open` class — so re-apply
      // it here or the new panel body stays invisible (opacity 0) and the
      // step appears to open and instantly close. Also make sure a stale
      // exit animation can never take it down: remove any leftover closing
      // state so the pending closeModal timer sees .open and backs off.
      overlay.classList.remove("closing");
      if (panel) {
        panel.classList.remove("closing");
        panel.classList.add("open");
        // Step transition: when one popup step is swapped for another,
        // play a short re-enter so the new step doesn't just pop in.
        // Restart from a clean state so re-swapping mid-animation works.
        panel.classList.remove("al-modal-reenter");
        void panel.offsetWidth;
        panel.classList.add("al-modal-reenter");
      }
      return;
    }

    openOverlays.slice().forEach(function (ov) {
      if (ov !== overlay) closeModal(ov, panelOf(ov));
    });
    closeFloatingDropdowns();
    document
      .querySelectorAll(".al-sheet-overlay:not(.hidden):not(.open)")
      .forEach(function (ov) {
        if (ov === overlay) return;
        ov.classList.add("hidden");
        ov.classList.remove("flex");
        ov.querySelectorAll(".al-dropdown").forEach(function (dd) {
          dd.classList.remove("open");
        });
        const btn = ov.querySelector('[aria-expanded="true"]');
        if (btn) btn.setAttribute("aria-expanded", "false");
      });

    overlay._lastFocused = document.activeElement;
    if (openOverlays.indexOf(overlay) === -1) openOverlays.push(overlay);
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    overlay.classList.remove("opacity-0", "pointer-events-none", "closing");
    overlay.classList.add("al-modal-overlay");
    overlay.setAttribute("aria-hidden", "false");
    if (panel) {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      panel.classList.add("al-modal-panel");
      panel.classList.remove("closing");
    }

    // Flush the pre-state so the transition starts from it.
    void overlay.offsetWidth;

    requestAnimationFrame(function () {
      overlay.classList.add("open");
      if (panel) panel.classList.add("open");
    });

    // Move focus into the popup. Callers may override this with a
    // more specific focus target (first input, cancel button, ...);
    // this guarantees focus never stays on the page behind the popup.
    requestAnimationFrame(function () {
      if (!openOverlays.length) return;
      if (openOverlays[openOverlays.length - 1] !== overlay) return;
      const root = panel || overlay;
      const first = focusables(root)[0];
      const target = first || panel || overlay;
      if (target && typeof target.focus === "function") {
        try {
          target.focus({ preventScroll: true });
        } catch (e) {
          target.focus();
        }
      }
    });
  }

  /* Close a modal: exit the panel fast (ease-in), then restore the
     hidden state and run optional cleanup. Idempotent — closing an
     already-closed overlay only runs the cleanup. */
  function closeModal(overlay, panel, done) {
    if (!overlay) return;
    // Caller hook: return false to veto the close (e.g. dirty-state
    // confirmations). Re-entrant guard flag prevents a loop when the
    // veto handler itself closes the overlay after confirming.
    if (
      !overlay._closingVeto &&
      overlay._beforeClose &&
      overlay._beforeClose() === false
    )
      return;
    const idx = openOverlays.indexOf(overlay);
    if (idx === -1) {
      if (typeof done === "function") done();
      return;
    }
    overlay._closingVeto = true;
    openOverlays.splice(idx, 1);
    const lastFocused = overlay._lastFocused || null;
    overlay._lastFocused = null;
    if (panel) {
      panel.classList.remove("open");
      panel.classList.add("closing");
    }
    overlay.classList.remove("open");
    overlay.classList.add("closing");
    setTimeout(function () {
      // If the overlay was re-opened during the exit animation (e.g. a
      // second confirm dialog chained in the first one's onConfirm),
      // leave it visible — do not clobber the newer modal.
      if (overlay.classList.contains("open")) return;
      overlay.classList.add("hidden");
      overlay.classList.add("opacity-0", "pointer-events-none");
      overlay.classList.remove("flex", "closing");
      overlay.setAttribute("aria-hidden", "true");
      overlay._closingVeto = false;
      if (panel) panel.classList.remove("closing");
      // Restore focus to whatever opened the popup — unless a caller's
      // done() already moved it somewhere intentional.
      if (
        lastFocused &&
        lastFocused.isConnected &&
        document.activeElement === document.body
      ) {
        try {
          lastFocused.focus({ preventScroll: true });
        } catch (e) {
          lastFocused.focus();
        }
      }
      if (typeof done === "function") done();
    }, EXIT_MS);
  }

  /* Close the topmost open popup. */
  function closeTop() {
    if (!openOverlays.length) return;
    const ov = openOverlays[openOverlays.length - 1];
    closeModal(ov, panelOf(ov));
  }

  /* Toggle a dropdown/popover with the .al-dropdown reveal. When a
     trigger is passed its aria-expanded stays in sync. */
  function toggleDropdown(el, force, trigger) {
    if (!el) return;
    const shouldOpen =
      force !== undefined ? force : !el.classList.contains("open");
    el.classList.toggle("open", shouldOpen);
    if (trigger && typeof trigger.setAttribute === "function") {
      trigger.setAttribute("aria-expanded", "" + shouldOpen);
    }
  }

  /* Scrim click → close. Outside click → close floating dropdowns. */
  document.addEventListener("click", function (e) {
    openOverlays.slice().forEach(function (ov) {
      if (e.target === ov) closeModal(ov, panelOf(ov));
    });
    closeFloatingDropdowns();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openOverlays.length) {
      e.preventDefault();
      closeTop();
      return;
    }
    // Contain Tab inside the topmost popup: wrap at the edges and
    // pull focus back in if it has wandered out (or onto <body>).
    // Surfaces with their own trap (e.g. the global confirm modal)
    // handle it first and preventDefault, so skip those.
    if (e.key === "Tab" && openOverlays.length && !e.defaultPrevented) {
      const top = openOverlays[openOverlays.length - 1];
      const root = panelOf(top) || top;
      const f = Array.prototype.slice.call(focusables(root));
      const active = document.activeElement;
      if (!f.length) return;
      if (!root.contains(active)) {
        e.preventDefault();
        try {
          f[0].focus({ preventScroll: true });
        } catch (err) {
          f[0].focus();
        }
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && active === first) {
        e.preventDefault();
        try {
          last.focus({ preventScroll: true });
        } catch (err) {
          last.focus();
        }
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        try {
          first.focus({ preventScroll: true });
        } catch (err) {
          first.focus();
        }
      }
    }
  });

  window.Animate = {
    openModal: openModal,
    closeModal: closeModal,
    toggleDropdown: toggleDropdown,
    closeTop: closeTop,
  };
})();
