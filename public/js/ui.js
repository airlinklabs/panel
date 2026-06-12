
(function () {
  var sheets = {};
  var dialogs = {};
  var openSheetId = null;

  function byId(id) { return document.getElementById(id); }

  function ensureBackdrop(id) {
    var backdrop = byId(id + '-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = id + '-backdrop';
      backdrop.className = 'fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-200';
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  function openSheet(id) {
    closeAllSheets();
    var sheet = byId(id);
    var backdrop = ensureBackdrop(id);
    if (!sheet || !backdrop) return;

    sheet.style.pointerEvents = 'auto';
    sheet.dataset.open = 'true';
    sheet.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
    sheet.style.filter = 'blur(0)';
    sheet.classList.add('opacity-100');
    requestAnimationFrame(function () {
      backdrop.classList.remove('opacity-0', 'pointer-events-none');
    });

    openSheetId = id;
    var focusable = sheet.querySelector('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeSheet(id) {
    var sheet = byId(id);
    var backdrop = byId(id + '-backdrop');
    if (!sheet || !backdrop) return;

    sheet.dataset.open = 'false';
    sheet.style.pointerEvents = 'none';
    sheet.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
    sheet.style.filter = 'blur(4px)';
    sheet.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0', 'pointer-events-none');

    if (openSheetId === id) openSheetId = null;
  }

  function closeAllSheets() {
    Object.keys(sheets).forEach(closeSheet);
  }

  function registerSheet(id) {
    sheets[id] = true;
    var backdrop = ensureBackdrop(id);
    backdrop.addEventListener('click', function () { closeSheet(id); });

    document.querySelectorAll('[data-ui-sheet-close="' + id + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeSheet(id); });
    });
  }

  function openDialog(id) {
    var dialog = byId(id);
    var panel = dialog && dialog.querySelector('[data-ui-dialog-panel]');
    if (!dialog) return;
    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
    dialog.dataset.open = 'true';
    requestAnimationFrame(function () {
      dialog.classList.remove('opacity-0', 'pointer-events-none');
      if (panel) {
        panel.dataset.open = 'true';
        panel.classList.remove('scale-95', 'translate-y-2', 'opacity-0');
        panel.classList.add('scale-100', 'translate-y-0', 'opacity-100');
      }
    });
    var focusable = dialog.querySelector('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeDialog(id) {
    var dialog = byId(id);
    var panel = dialog && dialog.querySelector('[data-ui-dialog-panel]');
    if (!dialog) return;
    dialog.dataset.open = 'false';
    if (panel) {
      panel.dataset.open = 'false';
      panel.classList.remove('scale-100', 'translate-y-0', 'opacity-100');
      panel.classList.add('scale-95', 'translate-y-2', 'opacity-0');
    }
    dialog.classList.add('opacity-0', 'pointer-events-none');
    var cleanup = function () {
      if (!dialog || dialog.dataset.open === 'true') return;
      dialog.classList.add('hidden');
      dialog.classList.remove('flex');
      dialog.removeEventListener('transitionend', cleanup);
    };
    dialog.addEventListener('transitionend', cleanup);
    requestAnimationFrame(function () {
      dialog.classList.add('opacity-0');
    });
  }

  function registerDialog(id) {
    dialogs[id] = true;
    var dialog = byId(id);
    if (!dialog) return;
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog(id);
    });
    document.querySelectorAll('[data-ui-dialog-close="' + id + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeDialog(id); });
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (openSheetId) closeSheet(openSheetId);
    Object.keys(dialogs).forEach(closeDialog);
  });

  window.ui = {
    openSheet: openSheet,
    closeSheet: closeSheet,
    registerSheet: registerSheet,
    closeAllSheets: closeAllSheets,
    openDialog: openDialog,
    closeDialog: closeDialog,
    registerDialog: registerDialog,
    toast: function (message, type) {
      if (typeof window.showToast === 'function') return window.showToast(message, type);
    },
    confirm: function (config) {
      if (window.modal && typeof window.modal.confirm === 'function') {
        return window.modal.confirm({
          title: config.title,
          body: config.body,
          bodyHtml: config.bodyHtml,
          onConfirm: config.onConfirm,
          danger: config.danger,
          confirmLabel: config.confirmLabel
        });
      }
    }
  };
})();
