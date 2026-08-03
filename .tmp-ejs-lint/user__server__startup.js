/* inline script 1 */

                          document.getElementById('toggle_null').addEventListener('change', function() {
                            document.getElementById('label_null').textContent = this.checked ? 'Enabled' : 'Disabled';
                          });
                        
/* inline script 2 */

  document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    const message = urlParams.get('message');

    if (message) {
      if (success === 'true') {
        showMessage(message, 'success');
      } else if (error === 'true') {
        showMessage(message, 'error');
      }
    }

    function showMessage(message, type) {
      const messageContainer = document.getElementById('message-container');
      const messageElement = document.createElement('div');
      messageElement.className = `p-4 mb-4 rounded-xl shadow-lg ${type === 'success' ? 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30' : 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30'}`;
      
      const flex = document.createElement('div');
      flex.className = 'flex items-center';
      
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'w-5 h-5 mr-2');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('viewBox', '0 0 20 20');
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('clip-rule', 'evenodd');
      if (type === 'success') {
        path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z');
      } else {
        path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z');
      }
      svg.appendChild(path);
      
      const span = document.createElement('span');
      span.textContent = message;
      
      flex.appendChild(svg);
      flex.appendChild(span);
      messageElement.appendChild(flex);

      messageContainer.appendChild(messageElement);

      setTimeout(() => {
        messageElement.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => {
          messageContainer.removeChild(messageElement);
        }, 500);
      }, 5000);
    }
    const startupForm = document.getElementById('startupForm');
    const dockerImageForm = document.getElementById('dockerImageForm');
    const variablesForm = document.getElementById('variablesForm');

    startupForm.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitButton = startupForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      submitButton.textContent = 'Saving...';
      submitButton.disabled = true;

      // Prepare form data
      const formData = new FormData(startupForm);

      // Submit via fetch (CSRF token will be added automatically by csrf.js)
      fetch(startupForm.action, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        },
        body: formData
      })
      .then(response => {
        if (response.ok) {
          return response.json().catch(() => ({ success: true }));
        } else {
          return response.json().then(data => Promise.reject(data));
        }
      })
      .then(data => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;

        if (data.success !== false) {
          showMessage('Startup command saved successfully!', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showMessage(data.error || 'Failed to save startup command', 'error');
        }
      })
      .catch(error => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
        showMessage(error.message || error.error || 'Failed to save startup command', 'error');
      });
    });

    dockerImageForm.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitButton = dockerImageForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      submitButton.textContent = 'Updating...';
      submitButton.disabled = true;

      // Prepare form data
      const formData = new FormData(dockerImageForm);

      // Submit via fetch (CSRF token will be added automatically by csrf.js)
      fetch(dockerImageForm.action, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        },
        body: formData
      })
      .then(response => {
        if (response.ok) {
          return response.json().catch(() => ({ success: true }));
        } else {
          return response.json().then(data => Promise.reject(data));
        }
      })
      .then(data => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;

        if (data.success !== false) {
          showMessage('Docker image updated successfully! Server will be restarted if it was running.', 'success');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          showMessage(data.error || 'Failed to update Docker image', 'error');
        }
      })
      .catch(error => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
        showMessage(error.message || error.error || 'Failed to update Docker image', 'error');
      });
    });

    variablesForm.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitButton = variablesForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      submitButton.textContent = 'Saving...';
      submitButton.disabled = true;

      // Prepare form data as URL-encoded
      const formData = new FormData(variablesForm);
      const urlEncodedData = new URLSearchParams();

      // Convert FormData to URLSearchParams
      for (let [key, value] of formData.entries()) {
        urlEncodedData.append(key, value);
      }

      // Submit via fetch (CSRF token will be added automatically by csrf.js)
      fetch(variablesForm.action, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: urlEncodedData
      })
      .then(response => {
        if (response.ok) {
          return response.json().catch(() => ({ success: true }));
        } else {
          return response.json().then(data => Promise.reject(data));
        }
      })
      .then(data => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;

        if (data.success !== false) {
          showMessage('Variables saved successfully!', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showMessage(data.error || 'Failed to save variables', 'error');
        }
      })
      .catch(error => {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
        showMessage(error.message || error.error || 'Failed to save variables', 'error');
      });
    });
  });
