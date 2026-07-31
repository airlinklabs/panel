/* Shared "Resource Format Switcher".
 *
 * Markup pattern:
 *   <input type="hidden" id="x" name="x" value="512">      (always holds base unit)
 *   <div class="flex items-stretch gap-0">
 *     <input id="xDisplay" type="number" class="al-input rounded-l-xl flex-1 border-r-0">
 *     <button type="button" class="al-format-switcher"
 *       data-format-switcher data-display="xDisplay" data-hidden="x"
 *       data-units="1:MB,1024:GB" data-default-unit="MB">MB</button>
 *   </div>
 *
 * data-units: comma-separated multiplier:label pairs. The hidden field always
 * stores the base unit; display value = hidden / multiplier. Clicking the
 * button switches to the next unit and converts the displayed value.
 */
(function () {
  function parseUnits(str) {
    return str.split(',').map(function (pair) {
      var parts = pair.split(':');
      return { multiplier: parseFloat(parts[0]), label: parts[1].trim() };
    }).sort(function (a, b) { return a.multiplier - b.multiplier; });
  }

  function roundDisplay(v) {
    var r = Math.round(v * 100) / 100;
    return r === -0 ? 0 : r;
  }

  function initSwitcher(btn) {
    var display = document.getElementById(btn.dataset.display);
    var hidden  = document.getElementById(btn.dataset.hidden);
    var units   = parseUnits(btn.dataset.units);
    if (!display || !hidden || units.length === 0) return;

    function pickUnit() {
      var v = parseFloat(hidden.value);
      if (!isFinite(v) || v <= 0) {
        var def = btn.dataset.defaultUnit;
        for (var i = 0; i < units.length; i++) {
          if (units[i].label === def) return units[i];
        }
        return units[0];
      }
      var chosen = units[0];
      units.forEach(function (u) {
        if (v / u.multiplier >= 1) chosen = u;
      });
      return chosen;
    }

    var current = pickUnit();

    function syncDisplay() {
      var v = parseFloat(hidden.value);
      if (!isFinite(v)) { display.value = ''; return; }
      display.value = roundDisplay(v / current.multiplier);
    }

    function syncHidden() {
      var v = parseFloat(display.value);
      if (!isFinite(v)) { hidden.value = ''; return; }
      hidden.value = String(Math.round(v * current.multiplier));
    }

    function render() {
      btn.textContent = current.label;
    }

    btn.addEventListener('click', function () {
      syncHidden();
      var idx = units.indexOf(current);
      current = units[(idx + 1) % units.length];
      syncDisplay();
      render();
    });

    display.addEventListener('input', syncHidden);

    syncDisplay();
    render();
  }

  function initAll() {
    document.querySelectorAll('[data-format-switcher]').forEach(initSwitcher);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
