(function () {
  const display = document.getElementById('serverCPUDisplay');
  const hidden  = document.getElementById('serverCPU');
  const unit    = document.getElementById('serverCPUUnit');

  function syncHidden() {
    const val = parseFloat(display.value) || 0;
    hidden.value = unit.value === 'cores'
      ? String(Math.round(val * 100))
      : String(Math.round(val));
  }

  unit.addEventListener('change', syncHidden);
  display.addEventListener('input', syncHidden);

  syncHidden();
})();
