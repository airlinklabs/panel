(function() {
  if (window.unitToggle) return;

  window.unitToggle = function(btn) {
    var hidden = document.getElementById(btn.dataset.hidden);
    var display = btn.previousElementSibling;
    var a = btn.dataset.a, b = btn.dataset.b;
    var ma = parseFloat(btn.dataset.ma), mb = parseFloat(btn.dataset.mb);
    var cur = btn.textContent.trim();
    var val = parseFloat(display.value);

    if (cur === a) {
      btn.textContent = b;
      display.value = isNaN(val) ? '' : Math.round(val * ma);
    } else {
      btn.textContent = a;
      display.value = isNaN(val) ? '' : (val / ma);
    }

    var newCur = btn.textContent.trim();
    var mult = newCur === a ? ma : mb;
    var dv = parseFloat(display.value);
    hidden.value = isNaN(dv) ? '' : Math.round(dv * mult);
  };

  window.unitInit = function(displayId, hiddenId) {
    var display = document.getElementById(displayId);
    var hidden = document.getElementById(hiddenId);
    if (!display || !hidden) return;
    display.addEventListener('input', function() {
      var btn = display.nextElementSibling;
      var val = parseFloat(display.value) || 0;
      var cur = btn.textContent.trim();
      var mult = cur === btn.dataset.a ? parseFloat(btn.dataset.ma) : parseFloat(btn.dataset.mb);
      hidden.value = Math.round(val * mult);
    });
  };

  // Auto-init all unit buttons on the page
  function autoInit() {
    document.querySelectorAll('.unit-btn').forEach(function(btn) {
      var display = btn.previousElementSibling;
      var hidden = document.getElementById(btn.dataset.hidden);
      if (!display || !hidden) return;
      var fn = function() {
        var val = parseFloat(display.value) || 0;
        var cur = btn.textContent.trim();
        var mult = cur === btn.dataset.a ? parseFloat(btn.dataset.ma) : parseFloat(btn.dataset.mb);
        hidden.value = Math.round(val * mult);
      };
      display.addEventListener('input', fn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
