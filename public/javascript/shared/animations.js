/* ============================================
   AIRLINK ANIMATION HELPERS
   Physics-free, class-driven motion.
   All durations/easing live in /styles/motion.css.
   ============================================ */
(function () {
  if (window.Animate) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EXIT_MS = REDUCED ? 0 : 200; /* >= --dur-exit (180ms) */

  /* Open a modal: display the overlay, then transition the panel
     from scale(0.96) translateY(8px) → rest (CSS .al-modal-panel). */
  function openModal(overlay, panel) {
    if (!overlay) return;
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
     hidden state and run optional cleanup. */
  function closeModal(overlay, panel, done) {
    if (!overlay) return;
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

  /* Toggle a dropdown/popover with the .al-dropdown reveal. */
  function toggleDropdown(el, force) {
    if (!el) return;
    var shouldOpen = force !== undefined ? force : !el.classList.contains('open');
    el.classList.toggle('open', shouldOpen);
  }

  window.Animate = {
    openModal: openModal,
    closeModal: closeModal,
    toggleDropdown: toggleDropdown
  };
})();
