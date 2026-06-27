/**
 * Custom Animated Dropdown - replaces native <select> elements
 * Usage: Add class="cs-select" to any <select> and call initCustomDropdowns()
 * or call initCustomDropdown(selectElement) for a single select.
 */
(function () {
  'use strict';

  var OPEN_CLASS = 'cs-open';
  var WRAP_CLASS = 'cs-wrap';

  function buildDropdown(select) {
    if (select.dataset.csInit) return;
    select.dataset.csInit = '1';

    var wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    wrap.style.position = 'relative';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var label = document.createElement('span');
    label.className = 'cs-label';
    trigger.appendChild(label);

    var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    var cp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cp.setAttribute('stroke-linecap', 'round');
    cp.setAttribute('stroke-linejoin', 'round');
    cp.setAttribute('d', 'M19 9l-7 7-7-7');
    chevron.appendChild(cp);
    trigger.appendChild(chevron);

    var dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.setAttribute('role', 'listbox');

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);

    function syncOptions() {
      dropdown.innerHTML = '';
      var opts = select.options;
      for (var i = 0; i < opts.length; i++) {
        var opt = opts[i];
        var item = document.createElement('div');
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.setAttribute('data-value', opt.value);
        item.textContent = opt.text;
        if (opt.disabled) {
          item.classList.add('cs-disabled');
        }
        if (opt.selected) {
          item.classList.add('cs-selected');
        }
        if (!opt.disabled) {
          item.addEventListener('click', (function (o) {
            return function (e) {
              e.stopPropagation();
              select.value = o.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              closeAll();
              syncLabel();
            };
          })(opt));
        }
        dropdown.appendChild(item);
      }
    }

    function syncLabel() {
      var sel = select.options[select.selectedIndex];
      if (sel && sel.value) {
        label.textContent = sel.text;
        label.classList.remove('cs-placeholder');
      } else {
        var ph = select.querySelector('option[disabled][selected]');
        label.textContent = ph ? ph.text : 'Select\u2026';
        label.classList.add('cs-placeholder');
      }
      var items = dropdown.querySelectorAll('.cs-option');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('cs-selected', items[i].dataset.value === select.value);
      }
    }

    function closeAll() {
      var allDropdowns = document.querySelectorAll('.cs-dropdown');
      for (var i = 0; i < allDropdowns.length; i++) {
        allDropdowns[i].style.display = 'none';
        allDropdowns[i].previousElementSibling.classList.remove(OPEN_CLASS);
        allDropdowns[i].previousElementSibling.setAttribute('aria-expanded', 'false');
      }
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.style.display === 'block';
      closeAll();
      if (!isOpen) {
        syncOptions();
        dropdown.style.display = 'block';
        trigger.classList.add(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        dropdown.style.display = 'none';
        trigger.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        trigger.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    var obs = new MutationObserver(function () {
      syncOptions();
      syncLabel();
    });
    obs.observe(select, { childList: true, subtree: true, attributes: true });
    select.addEventListener('change', syncLabel);

    syncOptions();
    syncLabel();
  }

  function initCustomDropdowns() {
    var selects = document.querySelectorAll('.cs-select:not([data-cs-init])');
    for (var i = 0; i < selects.length; i++) {
      buildDropdown(selects[i]);
    }
  }

  window.initCustomDropdown = buildDropdown;
  window.initCustomDropdowns = initCustomDropdowns;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
  } else {
    initCustomDropdowns();
  }
})();
