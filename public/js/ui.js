(function () {
  var sheets = {};
  var dialogs = {};
  var openSheetId = null;

  function byId(id) { return document.getElementById(id); }

  function openSheet(id) {
    closeAllSheets();
    var sheet = byId(id);
    var backdrop = byId(id + '-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.remove('translate-y-full');
    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    openSheetId = id;
    var focusable = sheet.querySelector('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  }

  function closeSheet(id) {
    var sheet = byId(id);
    var backdrop = byId(id + '-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.add('translate-y-full');
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    if (openSheetId === id) openSheetId = null;
  }

  function closeAllSheets() {
    Object.keys(sheets).forEach(closeSheet);
  }

  function registerSheet(id) {
    sheets[id] = true;
    var backdrop = byId(id + '-backdrop');
    if (backdrop) backdrop.addEventListener('click', function () { closeSheet(id); });
    document.querySelectorAll('[data-ui-sheet-close="' + id + '"]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeSheet(id); });
    });
  }

  function openDialog(id) {
    var dialog = byId(id);
    if (!dialog) return;
    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
    var focusable = dialog.querySelector('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  }

  function closeDialog(id) {
    var dialog = byId(id);
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.classList.remove('flex');
  }

  function registerDialog(id) {
    dialogs[id] = true;
    var dialog = byId(id);
    if (!dialog) return;
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog(id);
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
        return window.modal.confirm(config.title, config.body, config.onConfirm, { danger: config.danger, confirmLabel: config.confirmLabel });
      }
    }
  };
})();
