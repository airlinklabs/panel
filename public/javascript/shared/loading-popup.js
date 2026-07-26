(function () {
  if (window.loadingPopupSystem) return;

  // Loading popup system is disabled — the panel uses the page-loader
  // overlay for all loading transitions instead of a separate modal.

  window.loadingPopupSystem = {
    open: function () {},
    close: function () {},
    addStep: function () {},
    setIcon: function () {},
    setProgress: function () {},
    setMessage: function () {}
  };

  window.showLoadingPopup = function () {
    return {
      updateProgress: function () {},
      updateMessage:  function () {},
      close:          function () {}
    };
  };
  window.hideLoadingPopup = function () {};

  var afFadeTimer = null;
  window.actionFeedback = {
    show: function (msg) {
      if (afFadeTimer) { clearTimeout(afFadeTimer); afFadeTimer = null; }
      var bar = document.getElementById('actionFeedback');
      if (!bar) return;
      document.getElementById('afSpinner').classList.remove('hidden');
      document.getElementById('afCheck').classList.add('hidden');
      bar.style.setProperty('--af-color', 'var(--theme-text-muted, #6b7280)');
      document.getElementById('afText').textContent = msg + '...';
      bar.classList.remove('fading');
      bar.classList.add('visible');
    },
    done: function (msg) {
      var bar = document.getElementById('actionFeedback');
      if (!bar) return;
      document.getElementById('afSpinner').classList.add('hidden');
      document.getElementById('afCheck').classList.remove('hidden');
      bar.style.setProperty('--af-color', 'var(--theme-success, #10b981)');
      document.getElementById('afText').textContent = msg;
      bar.classList.remove('fading');
      afFadeTimer = setTimeout(function () {
        bar.classList.add('fading');
        setTimeout(function () {
          bar.classList.remove('visible', 'fading');
          document.getElementById('afSpinner').classList.remove('hidden');
          document.getElementById('afCheck').classList.add('hidden');
        }, 320);
      }, 2200);
    },
    hide: function () {
      if (afFadeTimer) { clearTimeout(afFadeTimer); afFadeTimer = null; }
      var bar = document.getElementById('actionFeedback');
      if (bar) bar.classList.remove('visible', 'fading');
    }
  };
})();
