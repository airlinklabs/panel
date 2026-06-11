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
    var panel = dialog && dialog.querySelector('[data-ui-dialog-panel]');
    if (!dialog) return;
    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
    requestAnimationFrame(function () {
      dialog.classList.remove('opacity-0', 'pointer-events-none');
      if (panel) {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
      }
    });
    var focusable = dialog.querySelector('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  }

  function closeDialog(id) {
    var dialog = byId(id);
    var panel = dialog && dialog.querySelector('[data-ui-dialog-panel]');
    if (!dialog) return;
    if (panel) {
      panel.classList.remove('scale-100');
      panel.classList.add('scale-95');
    }
    dialog.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(function () {
      dialog.classList.add('hidden');
      dialog.classList.remove('flex');
    }, 210);
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
