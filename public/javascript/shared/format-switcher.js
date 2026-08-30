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
  const ROUND_PRECISION = 100;

  function parseUnits(str) {
    return str
      .split(",")
      .map(function (pair) {
        const parts = pair.split(":");
        return { multiplier: parseFloat(parts[0]), label: parts[1].trim() };
      })
      .sort(function (a, b) {
        return a.multiplier - b.multiplier;
      });
  }

  function roundDisplay(v) {
    const r = Math.round(v * ROUND_PRECISION) / ROUND_PRECISION;
    return r === -0 ? 0 : r;
  }

  function initSwitcher(btn) {
    const display = document.getElementById(btn.dataset.display);
    const hidden = document.getElementById(btn.dataset.hidden);
    const units = parseUnits(btn.dataset.units);
    if (!display || !hidden || units.length === 0) return;

    function pickUnit() {
      const v = parseFloat(hidden.value);
      if (!isFinite(v) || v <= 0) {
        const def = btn.dataset.defaultUnit;
        for (let i = 0; i < units.length; i++) {
          if (units[i].label === def) return units[i];
        }
        return units[0];
      }
      let chosen = units[0];
      units.forEach(function (u) {
        if (v / u.multiplier >= 1) chosen = u;
      });
      return chosen;
    }

    let current = pickUnit();

    function syncDisplay() {
      const v = parseFloat(hidden.value);
      if (!isFinite(v)) {
        display.value = "";
        return;
      }
      display.value = roundDisplay(v / current.multiplier);
    }

    function syncHidden() {
      const v = parseFloat(display.value);
      if (!isFinite(v)) {
        hidden.value = "";
        return;
      }
      hidden.value = "" + Math.round(v * current.multiplier);
    }

    function render() {
      btn.textContent = current.label;
    }

    btn.addEventListener("click", function () {
      syncHidden();
      const idx = units.indexOf(current);
      current = units[(idx + 1) % units.length];
      syncDisplay();
      render();
    });

    display.addEventListener("input", syncHidden);

    syncDisplay();
    render();
  }

  function initAll() {
    document.querySelectorAll("[data-format-switcher]").forEach(initSwitcher);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  // Turbo swaps the body without re-firing DOMContentLoaded — rescan the
  // fresh initialisers/selects after every navigation.
  document.addEventListener("al:navigated", function () {
    initAll();
  });
})();
