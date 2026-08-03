/* inline script 1 */

  document.addEventListener('DOMContentLoaded', function() {
    var emptyBtn = document.getElementById('createButtonEmpty');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', function() {
        window.location.href = '/admin/users/create';
      });
    }
  });

/* inline script 2 */
