(function() {
  const pd = document.getElementById('page-data').dataset;

  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('editUserForm');
    const isAdminToggle = document.getElementById('isAdmin');
    const adminStatusLabel = document.getElementById('adminStatusLabel');

    isAdminToggle.addEventListener('change', function() {
      adminStatusLabel.textContent = this.checked
        ? pd.enabledText
        : pd.disabledText;
    });

    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password && password !== confirmPassword) {
        showToast(pd.passwordsDoNotMatch, 'error');
        return;
      }

      const formData = new FormData(form);
      const data = {};

      for (const [key, value] of formData.entries()) {
        if (key !== 'confirmPassword') {
          data[key] = value;
        }
      }

      data.isAdmin = isAdminToggle.checked;

      const serverLimitVal = document.getElementById('serverLimit').value;
      data.serverLimit = serverLimitVal === '' ? null : parseInt(serverLimitVal, 10);

      const maxMemoryVal = document.getElementById('maxMemory').value;
      data.maxMemory = maxMemoryVal === '' ? null : parseInt(maxMemoryVal, 10);

      const maxCpuVal = document.getElementById('maxCpu').value;
      data.maxCpu = maxCpuVal === '' ? null : parseInt(maxCpuVal, 10);

      const maxStorageVal = document.getElementById('maxStorage').value;
      data.maxStorage = maxStorageVal === '' ? null : parseInt(maxStorageVal, 10);

      const loader = showLoadingPopup(pd.updatingUser, pd.processingUserUpdate);
      loader.updateProgress(20, pd.sendingUserInformation);

      try {
        const response = await fetch('/admin/users/update/' + pd.userId + '/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const responseData = await response.json();

        if (responseData.error) {
          loader.close();
          showToast(responseData.error, 'error');
        } else {
          loader.updateProgress(100, pd.userUpdatedSuccessfully);
          setTimeout(() => {
            loader.close();
            showToast(responseData.message || pd.userUpdatedSuccessfully, 'success');
            setTimeout(() => {
              window.location.href = '/admin/users';
            }, 1000);
          }, 500);
        }
      } catch (error) {
        loader.close();
        console.error('Error:', error);
        showToast(pd.errorUpdatingUser, 'error');
      }
    });
  });
})();
