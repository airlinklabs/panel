(function () {

  function animateCheckbox(cb) {
    cb.style.transition = 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)';
    // Checked: scale up spring pop. Unchecked: slight shrink then back.
    cb.style.transform = cb.checked ? 'scale(1.3)' : 'scale(0.75)';
    setTimeout(function () {
      cb.style.transform = 'scale(1)';
      setTimeout(function () {
        cb.style.transition = '';
        cb.style.transform  = '';
      }, 200);
    }, 160);
  }

  function attachTo(cb) {
    // Skip sr-only toggle-switch checkboxes (they're hidden and drive CSS peers)
    if (cb.classList.contains('sr-only')) return;
    if (cb.dataset.cbAnim) return;
    cb.dataset.cbAnim = '1';
    cb.addEventListener('change', function () { animateCheckbox(this); });
  }

  function attachAll() {
    document.querySelectorAll('input[type="checkbox"]').forEach(attachTo);
  }

  // Attach on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAll);
  } else {
    attachAll();
  }

  // Re-attach after SPA navigation (new checkboxes may be added)
  document.addEventListener('al:navigated', function () {
    setTimeout(attachAll, 80);
  });

  // Also watch for dynamically added checkboxes (file lists, etc.)
  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'INPUT' && node.type === 'checkbox') {
          attachTo(node);
        } else {
          node.querySelectorAll && node.querySelectorAll('input[type="checkbox"]').forEach(attachTo);
        }
      });
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    mo.observe(document.body, { childList: true, subtree: true });
  });

  // Expose so pages can call it for programmatic toggles (e.g. row click)
  window.animateCheckbox = animateCheckbox;

})();
