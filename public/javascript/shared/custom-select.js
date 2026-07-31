/* Shared custom select — replaces native <select> with a styled dropdown.
 *
 * Markup:
 *   <select id="x" class="cs-native">…options…</select>
 *   <div class="custom-select" data-for="x"></div>
 * (or: the select is hidden and the .custom-select container replaces it visually)
 *
 * Behavior: trigger shows current option, dropdown reveals with a CSS
 * transition (.al-dropdown pattern), options keep the native select in
 * sync and dispatch change events.
 */
(function () {
  if (window.__customSelectLoaded) return;
  window.__customSelectLoaded = true;

  function buildCustomSelect(container) {
    if (container.dataset.built) return;
    const select = document.getElementById(container.dataset.for);
    if (!select) return;

    select.classList.add('cs-native');

    const trigger = document.createElement('div');
    trigger.className = 'cs-trigger';
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'cs-label';
    trigger.appendChild(label);

    const ns = 'http://www.w3.org/2000/svg';
    const arrow = document.createElementNS(ns, 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('d', 'M19 9l-7 7-7-7');
    arrow.appendChild(p);
    trigger.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown al-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';

    container.appendChild(trigger);
    container.appendChild(dropdown);
    container.dataset.built = '1';

    function syncLabel() {
      const sel = select.options[select.selectedIndex];
      if (sel && !sel.disabled && sel.value) {
        label.textContent = sel.text;
        label.classList.remove('cs-placeholder');
      } else {
        const ph = Array.from(select.options).find(function (o) { return o.disabled && o.selected; });
        label.textContent = ph ? ph.text : 'Select…';
        label.classList.add('cs-placeholder');
      }
      Array.from(dropdown.children).forEach(function (item) {
        item.classList.toggle('selected', item.dataset.value === select.value);
      });
    }

    function syncFromSelect() {
      dropdown.innerHTML = '';
      Array.from(select.options).forEach(function (opt) {
        const item = document.createElement('div');
        item.className = 'cs-option' + (opt.disabled ? ' disabled' : '');
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        if (!opt.disabled) {
          item.setAttribute('role', 'option');
          item.addEventListener('click', function (e) {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncLabel();
            close();
          });
        }
        dropdown.appendChild(item);
      });
    }

    function open() {
      if (dropdown.style.display !== 'none') return;
      syncFromSelect();
      dropdown.style.display = 'block';
      trigger.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      // CSS transition on .al-dropdown handles the reveal
      requestAnimationFrame(function () {
        dropdown.classList.add('open');
      });
    }

    function close() {
      if (dropdown.style.display === 'none') return;
      trigger.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      const done = function () {
        dropdown.style.display = 'none';
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dropdown.classList.remove('open');
        done();
        return;
      }
      dropdown.classList.add('closing');
      dropdown.classList.remove('open');
      setTimeout(function () {
        dropdown.classList.remove('closing');
        done();
      }, 200);
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.style.display === 'none') open();
      else close();
    });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.style.display === 'none') open();
      } else if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'Tab') {
        close();
      }
    });

    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) close();
    });
    document.addEventListener('al:navigated', close);

    const mo = new MutationObserver(function () {
      if (select.options.length !== dropdown.children.length) syncFromSelect();
      syncLabel();
    });
    mo.observe(select, { childList: true });

    select.addEventListener('change', syncLabel);
    syncLabel();
  }

  function attachAll(root) {
    (root || document).querySelectorAll('.custom-select').forEach(buildCustomSelect);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attachAll(); });
  } else {
    attachAll();
  }
  document.addEventListener('al:navigated', function () { setTimeout(function () { attachAll(); }, 80); });

  window.buildCustomSelect = buildCustomSelect;
})();
