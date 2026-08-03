/* inline script 1 */

(function () {
  if (window.modal) return;

  const overlay  = document.getElementById('globalModal');
  const panel    = document.getElementById('globalModalPanel');
  const title    = document.getElementById('globalModalTitle');
  const body     = document.getElementById('globalModalBody');
  const cancel   = document.getElementById('globalModalCancel');
  const confirmBtn  = document.getElementById('globalModalConfirm');
  const backdrop = document.getElementById('globalModalBackdrop');

  let currentResolve = null;
  let lastFocused = null;

  function focusableElements() {
    return panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  }

  function open({ title: t, body: b, danger = true, confirmLabel = 'Confirm', onConfirm }) {
    lastFocused = document.activeElement;
    title.textContent = t || '';
    body.textContent  = b || '';
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = danger
      ? 'px-4 py-2 text-xs font-medium rounded-xl text-white transition al-btn-danger'
      : 'px-4 py-2 text-xs font-medium rounded-xl text-white transition al-btn-primary';

    currentResolve = onConfirm || null;

    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.setAttribute('data-modal-open', '');
    if (window.Animate) Animate.openModal(overlay, panel);
    else { overlay.classList.add('open'); panel.classList.add('open'); }
    // Focus the neutral action first — never land on the destructive
    // confirm (one accidental Enter should not destroy).
    setTimeout(function () { cancel.focus(); }, 0);
  }

  function close() {
    const done = function () {
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.removeAttribute('data-modal-open');
      currentResolve = null;
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
      lastFocused = null;
    };
    if (window.Animate) Animate.closeModal(overlay, panel, done);
    else { overlay.classList.remove('open'); panel.classList.remove('open'); done(); }
  }

  cancel.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  confirmBtn.addEventListener('click', () => {
    const fn = currentResolve;
    close();
    if (fn) fn();
  });

  overlay.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(focusableElements());
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.modal = { confirm: open };
})();
