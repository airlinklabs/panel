(function() {
  const pd = document.getElementById('page-data')?.dataset;

  window.ALMount(function() {
    const form = document.getElementById('imageEditForm');
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      let loader;
      try { loader = showLoadingPopup('Saving...', ''); } catch { loader = { close: function() {} }; }

      const formData = new FormData(form);
      const data = {};
      for (const [key, value] of formData.entries()) data[key] = value;

      try {
        const response = await fetch('/my-images/update/' + pd.imageId + '/' + pd.state, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        loader.close();
        if (result.error) {
          showToast(result.error, 'error');
        } else {
          showToast(pd.updated, 'success');
          setTimeout(() => { window.location.href = '/my-images'; }, 1000);
        }
      } catch (error) {
        loader.close();
        console.error('Failed to update image:', error);
        showToast(pd.submitError, 'error');
      }
    });
  });
})();