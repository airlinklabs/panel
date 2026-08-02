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
    dropdown.setAttribute('id', 'cs-list-' + (container.dataset.for || '') + '-' + Math.random().toString(36).slice(2, 8));
    dropdown.style.display = 'none';

    container.appendChild(trigger);
    container.appendChild(dropdown);
    container.dataset.built = '1';

    let activeIndex = -1;

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
        if (item.hasAttribute('aria-selected')) {
          item.setAttribute('aria-selected', String(item.dataset.value === select.value));
        }
      });
    }

    function syncFromSelect() {
      dropdown.innerHTML = '';
      activeIndex = -1;
      trigger.removeAttribute('aria-activedescendant');
      Array.from(select.options).forEach(function (opt) {
        const item = document.createElement('div');
        item.className = 'cs-option' + (opt.disabled ? ' disabled' : '');
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        if (!opt.disabled) {
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', String(opt.value === select.value));
          item.setAttribute('id', dropdown.id + '-o' + select.options.length + '-' + (item.dataset.value || '').replace(/[^a-z0-9]/gi, ''));
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
      trigger.setAttribute('aria-controls', dropdown.id);
    }

    function setActive(index) {
      const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
      if (!options.length) return;
      if (index < 0) index = options.length - 1;
      if (index >= options.length) index = 0;
      // Skip disabled options from the requested position (guarded: a
      // fully-disabled list must not spin forever).
      for (let guard = 0; guard < options.length && options[index].classList.contains('disabled'); guard++) {
        index = (index + 1) % options.length;
      }
      if (options[index].classList.contains('disabled')) return;
      activeIndex = index;
      const item = options[activeIndex];
      item.classList.add('cs-active');
      options.forEach((o, i) => { if (i !== activeIndex) o.classList.remove('cs-active'); });
      dropdown.setAttribute('aria-activedescendant', item.id || '');
      item.scrollIntoView({ block: 'nearest' });
    }

    function moveActive(dir) {
      const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
      if (!options.length) return;
      let next = activeIndex;
      for (let guard = 0; guard < options.length; guard++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next].classList.contains('disabled')) break;
      }
      setActive(next);
    }

    function selectActive() {
      const item = dropdown.querySelector('[role="option"].cs-active');
      if (item) {
        item.click();
        return true;
      }
      return false;
    }

    function positionDropdown() {
      const rect = trigger.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.width = rect.width + 'px';
      dropdown.style.maxHeight = '200px';
      const spaceBelow = window.innerHeight - rect.bottom - 6;
      const spaceAbove = rect.top - 6;
      let opensUp = false;
      if (spaceBelow < 140 && spaceAbove > spaceBelow) {
        dropdown.style.top = 'auto';
        dropdown.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
        opensUp = true;
      } else {
        dropdown.style.top = (rect.bottom + 5) + 'px';
        dropdown.style.bottom = 'auto';
      }
      // Scale from the anchor edge, not always the top.
      dropdown.style.transformOrigin = opensUp ? 'bottom center' : 'top center';
      return opensUp;
    }

    function open() {
      if (dropdown.style.display !== 'none') return;
      syncFromSelect();
      // Portal to <body> so clipping ancestors (overflow:hidden cards,
      // scroll containers) cannot cut the dropdown off.
      positionDropdown();
      document.body.appendChild(dropdown);
      dropdown.style.display = 'block';
      trigger.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      // CSS transition on .al-dropdown handles the reveal
      requestAnimationFrame(function () {
        dropdown.classList.add('open');
      });
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }

    function close() {
      if (dropdown.style.display === 'none') return;
      trigger.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      activeIndex = -1;
      const done = function () {
        dropdown.removeAttribute('style');
        dropdown.style.display = 'none';
        container.appendChild(dropdown);
        window.removeEventListener('resize', close);
        window.removeEventListener('scroll', close, true);
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
      const isOpen = dropdown.style.display !== 'none';
      if ((e.key === 'Enter' || e.key === ' ') && isOpen) {
        e.preventDefault();
        if (selectActive()) close();
      } else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && !isOpen) {
        e.preventDefault();
        open();
      } else if (isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        moveActive(e.key === 'ArrowDown' ? 1 : -1);
      } else if (isOpen && (e.key === 'Home' || e.key === 'End')) {
        e.preventDefault();
        const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
        setActive(e.key === 'Home' ? 0 : options.length - 1);
      } else if (e.key === 'Escape' || e.key === 'Tab') {
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
