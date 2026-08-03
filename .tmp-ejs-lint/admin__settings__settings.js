/* inline script 1 */

        (function(){
          var tabBtns = document.querySelectorAll('.tab-btn');
          var tabPanels = document.querySelectorAll('.tab-panel');
          var tabList = document.querySelector('[role="tablist"]');
          var saveBtn = document.getElementById('tab-save-btn');
          var resetBtn = document.getElementById('tab-reset-btn');
          function activate(id) {
            tabBtns.forEach(function(btn) {
              var on = btn.dataset.tab === id;
              btn.setAttribute('aria-selected', on ? 'true' : 'false');
              btn.setAttribute('tabindex', on ? '0' : '-1');
            });
            tabPanels.forEach(function(p) { p.classList.toggle('hidden', p.dataset.tabPanel !== id); });
            rebind(id);
            try { localStorage.setItem('settings_tab', id); } catch {}
          }
          function rebind(id) {
            if (window.tabHandlers && saveBtn) {
              saveBtn.onclick = window.tabHandlers[id] || null;
              saveBtn.textContent = (window.tabLabels && window.tabLabels[id]) || 'Save';
            }
            if (window.tabResetHandlers && resetBtn) {
              resetBtn.onclick = window.tabResetHandlers[id] || null;
            }
          }
          window._rebindTabHandlers = function() {
            var active = document.querySelector('.tab-btn[aria-selected="true"]');
            if (active) rebind(active.dataset.tab);
          };
          tabBtns.forEach(function(btn) { btn.addEventListener('click', function() { activate(this.dataset.tab); }); });
          if (tabList) {
            tabList.addEventListener('keydown', function(e) {
              var tabs = Array.from(tabBtns);
              var currentIndex = tabs.findIndex(function(t) { return t === document.activeElement; });
              if (currentIndex === -1) return;
              var newIndex = currentIndex;
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); newIndex = (currentIndex + 1) % tabs.length; }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); newIndex = (currentIndex - 1 + tabs.length) % tabs.length; }
              else if (e.key === 'Home') { e.preventDefault(); newIndex = 0; }
              else if (e.key === 'End') { e.preventDefault(); newIndex = tabs.length - 1; }
              if (newIndex !== currentIndex) { tabs[newIndex].focus(); activate(tabs[newIndex].dataset.tab); }
            });
          }
          var saved = null;
          try { saved = localStorage.getItem('settings_tab'); } catch {}
          activate(saved || 'appearance');
        })();
        
/* inline script 2 */

/* inline script 3 */

(function() {
  var hasUnsavedChanges = false;

  document.querySelectorAll('input, select, textarea').forEach(function(el) {
    el.addEventListener('change', function() {
      hasUnsavedChanges = true;
    });
  });

  window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  var forms = document.querySelectorAll('form');
  forms.forEach(function(form) {
    form.addEventListener('submit', function() {
      hasUnsavedChanges = false;
    });
  });
})();
