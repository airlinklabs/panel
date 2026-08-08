(function() {
  const pd = document.getElementById('page-data')?.dataset;

  function setMode(mode) {
    const manual = document.getElementById('manualForm');
    const json = document.getElementById('jsonSection');
    const url = document.getElementById('urlSection');
    const manualBtn = document.getElementById('modeManual');
    const jsonBtn = document.getElementById('modeJson');
    const urlBtn = document.getElementById('modeUrl');

    manual.classList.toggle('hidden', mode !== 'manual');
    json.classList.toggle('hidden', mode !== 'json');
    url.classList.toggle('hidden', mode !== 'url');

    manualBtn.style.background = mode === 'manual' ? 'var(--theme-bg-card)' : 'transparent';
    jsonBtn.style.background = mode === 'json' ? 'var(--theme-bg-card)' : 'transparent';
    urlBtn.style.background = mode === 'url' ? 'var(--theme-bg-card)' : 'transparent';
    manualBtn.style.color = mode === 'manual' ? 'var(--theme-text-strong)' : 'var(--theme-text-muted)';
    jsonBtn.style.color = mode === 'json' ? 'var(--theme-text-strong)' : 'var(--theme-text-muted)';
    urlBtn.style.color = mode === 'url' ? 'var(--theme-text-strong)' : 'var(--theme-text-muted)';
  }

  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('modeManual').addEventListener('click', function() { setMode('manual'); });
    document.getElementById('modeJson').addEventListener('click', function() { setMode('json'); });
    document.getElementById('modeUrl').addEventListener('click', function() { setMode('url'); });
    setMode('manual');

    const loader = function() {
      try {
        return showLoadingPopup(pd.submitting, '');
      } catch {
        return { close: function() {}, updateProgress: function() {} };
      }
    };

    const manualForm = document.getElementById('manualForm');
    manualForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const l = loader();
      try {
        const payload = new FormData(manualForm);
        const data = {};
        for (const [key, value] of payload.entries()) data[key] = value;
        const response = await fetch('/my-images/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        l.close();
        if (result.error) {
          showToast(result.error, 'error');
        } else {
          showToast(result.message || 'Submitted', 'success');
          setTimeout(() => { window.location.href = '/my-images'; }, 1000);
        }
      } catch (error) {
        l.close();
        console.error('Failed to submit image:', error);
        showToast(pd.submitError, 'error');
      }
    });

    document.getElementById('submitJsonBtn').addEventListener('click', async function() {
      const raw = document.getElementById('jsonInput').value;
      if (!raw.trim()) { showToast('Paste an egg JSON first.', 'error'); return; }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        showToast('Invalid JSON.', 'error');
        return;
      }
      const l = loader();
      try {
        const response = await fetch('/my-images/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        l.close();
        if (result.error) {
          showToast(result.error, 'error');
        } else {
          showToast(result.message || 'Submitted', 'success');
          setTimeout(() => { window.location.href = '/my-images'; }, 1000);
        }
      } catch (error) {
        l.close();
        console.error('Failed to submit image:', error);
        showToast(pd.submitError, 'error');
      }
    });

    document.getElementById('submitUrlBtn').addEventListener('click', async function() {
      const url = document.getElementById('urlInput').value;
      if (!url.trim()) { showToast('Please enter an image URL.', 'error'); return; }
      const l = loader();
      try {
        const response = await fetch('/my-images/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });
        const result = await response.json();
        l.close();
        if (result.error) {
          showToast(result.error, 'error');
        } else {
          showToast(result.message || 'Imported', 'success');
          setTimeout(() => { window.location.href = '/my-images'; }, 1000);
        }
      } catch (error) {
        l.close();
        console.error('Failed to import image:', error);
        showToast(pd.submitError, 'error');
      }
    });
  });
})();