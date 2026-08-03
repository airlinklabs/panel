(function () {
  if (window.loadingPopupSystem) return;

  var overlay = null;
  var panel = null;
  var stepsContainer = null;
  var progressBar = null;
  var progressFill = null;
  var messageEl = null;
  var iconEl = null;
  var currentSteps = [];
  var currentStepIndex = -1;

  function createOverlay() {
    if (overlay) return;
    
    overlay = document.createElement('div');
    overlay.id = 'loadingPopupOverlay';
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center al-modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    
    panel = document.createElement('div');
    panel.className = 'bg-white dark:bg-[#1c1c1c] rounded-2xl shadow-2xl w-full max-w-sm mx-4 al-modal-panel';
    panel.style.border = '1px solid var(--theme-border)';
    
    panel.innerHTML = `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div id="lp-icon" class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:var(--theme-bg-secondary)">
            ${alIcon('loader-circle', 'w-5 h-5 animate-spin', { id: 'lp-spinner', style: 'color:var(--theme-text-muted)' })}
            ${alIcon('check', 'w-5 h-5 hidden', { id: 'lp-check', style: 'color:var(--theme-success)', strokeWidth: 2 })}
            ${alIcon('x', 'w-5 h-5 hidden', { id: 'lp-error', style: 'color:var(--theme-danger)', strokeWidth: 2 })}
          </div>
          <div class="flex-1 min-w-0">
            <h3 id="lp-title" class="text-sm font-semibold" style="color:var(--theme-text-strong)">Loading...</h3>
            <p id="lp-message" class="text-xs mt-0.5" style="color:var(--theme-text-muted)">Please wait</p>
          </div>
        </div>
        <div id="lp-progress-container" class="mb-4 hidden">
          <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--theme-border)">
            <div id="lp-progress-fill" class="h-full rounded-full transition-all duration-300" style="width:0%; background:var(--theme-text-strong)"></div>
          </div>
          <p id="lp-progress-text" class="text-[11px] mt-1.5 text-right" style="color:var(--theme-text-muted)">0%</p>
        </div>
        <div id="lp-steps" class="space-y-2"></div>
      </div>
      <div class="px-6 py-4 border-t flex justify-end gap-2" style="border-color:var(--theme-border)">
        <button id="lp-cancel" class="px-4 py-2 text-xs font-medium rounded-xl transition" style="color:var(--theme-text-muted); background:var(--theme-bg-secondary)">Cancel</button>
        <button id="lp-close" class="px-4 py-2 text-xs font-medium rounded-xl transition hidden" style="background:var(--theme-btn-primary-bg); color:var(--theme-btn-primary-text)">Done</button>
      </div>
    `;
    
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    
    document.getElementById('lp-cancel').addEventListener('click', function() {
      hideLoadingPopup();
    });
    
    document.getElementById('lp-close').addEventListener('click', function() {
      hideLoadingPopup();
    });
  }

  function show() {
    createOverlay();
    currentSteps = [];
    currentStepIndex = -1;
    
    document.getElementById('lp-spinner').classList.remove('hidden');
    document.getElementById('lp-check').classList.add('hidden');
    document.getElementById('lp-error').classList.add('hidden');
    document.getElementById('lp-progress-container').classList.add('hidden');
    document.getElementById('lp-steps').innerHTML = '';
    document.getElementById('lp-cancel').classList.remove('hidden');
    document.getElementById('lp-close').classList.add('hidden');
    document.getElementById('lp-progress-fill').style.width = '0%';
    document.getElementById('lp-progress-text').textContent = '0%';
    
    Animate.openModal(overlay, panel);
  }

  function hide() {
    if (!overlay) return;
    Animate.closeModal(overlay, panel);
  }

  function setTitle(text) {
    document.getElementById('lp-title').textContent = text;
  }

  function setMessage(text) {
    document.getElementById('lp-message').textContent = text;
  }

  function setProgress(percent, message) {
    var container = document.getElementById('lp-progress-container');
    container.classList.remove('hidden');
    document.getElementById('lp-progress-fill').style.width = percent + '%';
    document.getElementById('lp-progress-text').textContent = Math.round(percent) + '%';
    if (typeof message === 'string' && message) setMessage(message);
  }

  function addStep(text, status) {
    status = status || 'pending';
    var stepsEl = document.getElementById('lp-steps');
    var step = document.createElement('div');
    step.className = 'flex items-center gap-2 text-xs';
    step.innerHTML = `
      <span class="step-icon w-4 h-4 rounded-full flex items-center justify-center shrink-0" style="background:var(--theme-border)">
        ${status === 'done' ? alIcon('check', 'w-2.5 h-2.5', { style: 'color:var(--theme-success)', strokeWidth: 3 }) : 
          status === 'error' ? alIcon('x', 'w-2.5 h-2.5', { style: 'color:var(--theme-danger)', strokeWidth: 3 }) :
          '<span class="w-1.5 h-1.5 rounded-full" style="background:var(--theme-text-muted)"></span>'}
      </span>
      <span class="step-text" style="color:var(--theme-text)">${text}</span>
    `;
    stepsEl.appendChild(step);
    currentSteps.push({ el: step, text: text });
    return currentSteps.length - 1;
  }

  function updateStep(index, status, text) {
    if (index < 0 || index >= currentSteps.length) return;
    var step = currentSteps[index];
    var icon = step.el.querySelector('.step-icon');
    
    if (text) step.el.querySelector('.step-text').textContent = text;
    
    if (status === 'done') {
      icon.innerHTML = alIcon('check', 'w-2.5 h-2.5', { style: 'color:var(--theme-success)', strokeWidth: 3 });
      icon.style.background = 'var(--theme-success-bg, rgba(16, 185, 129, 0.1))';
    } else if (status === 'error') {
      icon.innerHTML = alIcon('x', 'w-2.5 h-2.5', { style: 'color:var(--theme-danger)', strokeWidth: 3 });
      icon.style.background = 'var(--theme-danger-bg, rgba(239, 68, 68, 0.1))';
    } else if (status === 'active') {
      icon.innerHTML = '<span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background:var(--theme-text-strong)"></span>';
      icon.style.background = 'var(--theme-accent-subtle)';
    }
  }

  function complete(success, message) {
    document.getElementById('lp-spinner').classList.add('hidden');
    document.getElementById('lp-cancel').classList.add('hidden');
    document.getElementById('lp-close').classList.remove('hidden');
    
    if (success) {
      document.getElementById('lp-check').classList.remove('hidden');
      if (message) setMessage(message);
    } else {
      document.getElementById('lp-error').classList.remove('hidden');
      if (message) setMessage(message);
    }
  }

  window.loadingPopupSystem = {
    open: show,
    close: hide,
    setTitle: setTitle,
    setMessage: setMessage,
    setProgress: setProgress,
    addStep: addStep,
    updateStep: updateStep,
    complete: complete,
    setIcon: function() {},
    setProgress: setProgress
  };

  window.showLoadingPopup = function(title, message) {
    show();
    if (title) setTitle(title);
    if (message) setMessage(message);
    return {
      updateProgress: setProgress,
      updateMessage: setMessage,
      close: hide
    };
  };
  
  window.hideLoadingPopup = hide;
})();
