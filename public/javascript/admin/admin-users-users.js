(function() {
  const STAGGER_DELAY_MS = 30;
  const ROW_ANIMATION_DURATION_MS = 200;

  const pageData = document.getElementById('page-data').dataset;

  function handleRowClick(event, url) {
    if (!event.target.closest('button, a')) {
      window.location = url;
    }
  }
  window.handleRowClick = handleRowClick;

  document.getElementById('createButton').addEventListener('click', () => {
    location.href = '/admin/users/create';
  });

  window.deleteUser = function(userId) {
    window.modal.confirm({
      title: pageData.deleteUserTitle || 'Delete User',
      body: pageData.deleteUserBody || 'Are you sure you want to delete this user?',
      danger: true,
      confirmLabel: 'Yeah, delete it',
      onConfirm: () => {
        fetch(`/admin/users/delete/${userId}`, { method: 'DELETE' })
          .then(response => {
            if (response.ok) {
              showToast('User deleted.', 'success');
              location.reload();
            } else {
              showToast('Failed to delete user.', 'error');
            }
          })
          .catch(() => showToast('Failed to delete user.', 'error'));
      }
    });
  };

  (function staggerRows() {
    const rows = document.querySelectorAll('#userTable tbody tr');
    rows.forEach(function(row, i) {
      row.style.opacity = '0';
      row.style.transform = 'translateY(5px)';
      row.style.transition = 'none';
      setTimeout(function() {
        row.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
        setTimeout(function() {
          row.style.transition = '';
          row.style.opacity = '';
          row.style.transform = '';
        }, ROW_ANIMATION_DURATION_MS);
      }, i * STAGGER_DELAY_MS);
    });
  })();
})();
