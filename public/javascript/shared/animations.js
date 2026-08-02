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
   ============================================ */
(function () {
  if (window.Animate) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EXIT_MS = REDUCED ? 0 : 200; /* >= --dur-exit (180ms) */
  var openOverlays = [];

  function panelOf(overlay) {
    if (!overlay) return null;
    return overlay.querySelector('.al-sheet-panel, .al-modal-panel, .modal-box, .m-dialog, .confirm-box');
  }

  /* Close any dropdowns that are not attached to a popup overlay —
     per-dropdown click-away handlers own the ones that live inside
     overlays (e.g. the command palette). */
  function closeFloatingDropdowns() {
    document.querySelectorAll('.al-dropdown.open').forEach(function (dd) {
      if (!dd.closest('.al-sheet-overlay')) dd.classList.remove('open');
    });
  }

  /* Open a modal: display the overlay, then transition the panel
     from scale(0.96) translateY(8px) → rest (CSS .al-modal-panel).
     Only one popup at a time: everything else is closed first. */
  function openModal(overlay, panel) {
    if (!overlay) return;
    if (overlay.classList.contains('open')) return;

    openOverlays.slice().forEach(function (ov) {
      if (ov !== overlay) closeModal(ov, panelOf(ov));
    });
    closeFloatingDropdowns();
    document.querySelectorAll('.al-sheet-overlay:not(.hidden):not(.open)').forEach(function (ov) {
      if (ov === overlay) return;
      ov.classList.add('hidden');
      ov.classList.remove('flex');
      ov.querySelectorAll('.al-dropdown').forEach(function (dd) { dd.classList.remove('open'); });
      var btn = ov.querySelector('[aria-expanded="true"]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });

    openOverlays.push(overlay);
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.classList.add('al-modal-overlay', 'open');
    if (panel) {
      panel.classList.add('al-modal-panel');
      panel.classList.remove('closing');
      panel.classList.add('open');
    }
  }

  /* Close a modal: exit the panel fast (ease-in), then restore the
     hidden state and run optional cleanup. Idempotent — closing an
     already-closed overlay only runs the cleanup. */
  function closeModal(overlay, panel, done) {
    if (!overlay) return;
    var idx = openOverlays.indexOf(overlay);
    if (idx === -1) {
      if (typeof done === 'function') done();
      return;
    }
    openOverlays.splice(idx, 1);
    if (panel) {
      panel.classList.remove('open');
      panel.classList.add('closing');
    }
    overlay.classList.remove('open');
    setTimeout(function () {
      // If the overlay was re-opened during the exit animation (e.g. a
      // second confirm dialog chained in the first one's onConfirm),
      // leave it visible — do not clobber the newer modal.
      if (overlay.classList.contains('open')) return;
      overlay.classList.add('hidden');
      overlay.classList.add('opacity-0', 'pointer-events-none');
      overlay.classList.remove('flex');
      if (panel) panel.classList.remove('closing');
      if (typeof done === 'function') done();
    }, EXIT_MS);
  }

  /* Close the topmost open popup. */
  function closeTop() {
    if (!openOverlays.length) return;
    var ov = openOverlays[openOverlays.length - 1];
    closeModal(ov, panelOf(ov));
  }

  /* Toggle a dropdown/popover with the .al-dropdown reveal. */
  function toggleDropdown(el, force) {
    if (!el) return;
    var shouldOpen = force !== undefined ? force : !el.classList.contains('open');
    el.classList.toggle('open', shouldOpen);
  }

  /* Scrim click → close. Outside click → close floating dropdowns. */
  document.addEventListener('click', function (e) {
    openOverlays.slice().forEach(function (ov) {
      if (e.target === ov) closeModal(ov, panelOf(ov));
    });
    closeFloatingDropdowns();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openOverlays.length) {
      e.preventDefault();
      closeTop();
    }
  });

  window.Animate = {
    openModal: openModal,
    closeModal: closeModal,
    toggleDropdown: toggleDropdown,
    closeTop: closeTop
  };
})();
