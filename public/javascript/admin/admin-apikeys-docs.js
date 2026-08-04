const apiKeySelect = document.getElementById('apiKeySelect');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const testButtons = document.querySelectorAll('.test-endpoint-btn');
let selectedApiKey = sessionStorage.getItem('apiTestKey') || '';
let selectedApiKeyPermissions = [];

if (selectedApiKey) {
  const storedPermissions = sessionStorage.getItem('apiTestKeyPermissions');
  if (storedPermissions) {
    try {
      selectedApiKeyPermissions = JSON.parse(storedPermissions);
      enableTestButtons();
    } catch (e) {
      console.error('Error parsing stored permissions:', e);
      sessionStorage.removeItem('apiTestKeyPermissions');
    }
  }
}

if (selectedApiKey && apiKeySelect) {
  for (let i = 0; i < apiKeySelect.options.length; i++) {
    if (apiKeySelect.options[i].value === selectedApiKey) {
      apiKeySelect.selectedIndex = i;
      saveApiKeyBtn.disabled = false;
      break;
    }
  }
}

apiKeySelect.addEventListener('change', function () {
  saveApiKeyBtn.disabled = this.value === '';
});

saveApiKeyBtn.addEventListener('click', function () {
  const selectedKey = apiKeySelect.value;
  const selectedOption = apiKeySelect.options[apiKeySelect.selectedIndex];

  if (selectedKey) {
    selectedApiKey = selectedKey;
    sessionStorage.setItem('apiTestKey', selectedKey);

    const permissionsAttr = selectedOption.getAttribute('data-permissions');
    try {
      selectedApiKeyPermissions = JSON.parse(permissionsAttr || '[]');
      sessionStorage.setItem('apiTestKeyPermissions', permissionsAttr || '[]');
      enableTestButtons();
      showToast('API key selected for testing', 'success');
    } catch (e) {
      console.error('Error parsing permissions:', e);
      selectedApiKeyPermissions = [];
      sessionStorage.setItem('apiTestKeyPermissions', '[]');
      showToast('Could not load key permissions', 'error');
    }
  }
});

function enableTestButtons() {
  testButtons.forEach(button => {
    const requiredPermission = button.getAttribute('data-permission');
    const hasPermission = selectedApiKeyPermissions.includes(requiredPermission);
    button.disabled = !hasPermission;

    if (hasPermission) {
      button.title = 'Test this endpoint';
    } else {
      button.title = 'API key does not have the required permission';
    }
  });
}

testButtons.forEach(button => {
  button.addEventListener('click', async function () {
    const method = this.getAttribute('data-method');

    let path = this.getAttribute('data-path');
    const parentSection = this.closest('.mt-4');

    const paramInputs = parentSection.querySelectorAll('[data-param-name]');
    paramInputs.forEach(input => {
      const paramName = input.getAttribute('data-param-name');
      const paramValue = input.value.trim();
      if (paramValue) {
        path = path.replace(`:${paramName}`, encodeURIComponent(paramValue));
      }
    });

    const responseContainer = parentSection.querySelector('.response-container');
    const responseOutput = parentSection.querySelector('.response-output code');
    const responseStatus = parentSection.querySelector('.response-status');

    responseContainer.classList.remove('hidden');

    let requestBody = null;
    if (method !== 'GET') {
      const textArea = parentSection.querySelector('.request-body');
      if (textArea) {
        try {
          requestBody = textArea.value.trim();
          if (requestBody) {
            JSON.parse(requestBody);
          }
        } catch (e) {
          responseOutput.textContent = `Error: Invalid JSON in request body - ${e.message}`;
          responseStatus.textContent = 'Error';
          responseStatus.className = 'response-status text-xs font-medium text-red-500';
          return;
        }
      }
    }

    this.disabled = true;
    this.textContent = 'Testing...';
    responseOutput.textContent = 'Loading...';
    responseStatus.textContent = '';

    try {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${selectedApiKey}`,
          'Content-Type': 'application/json'
        }
      };

      if (requestBody && method !== 'GET') {
        options.body = requestBody;
      }

      const response = await fetch(path, options);
      const responseData = await response.text();

      try {
        const jsonData = JSON.parse(responseData);
        responseOutput.textContent = JSON.stringify(jsonData, null, 2);
      } catch (e) {
        responseOutput.textContent = responseData;
      }

      if (response.ok) {
        responseStatus.textContent = `${response.status} ${response.statusText}`;
        responseStatus.className = 'response-status text-xs font-medium text-green-500';
      } else {
        responseStatus.textContent = `${response.status} ${response.statusText}`;
        responseStatus.className = 'response-status text-xs font-medium text-red-500';
      }
    } catch (error) {
      responseOutput.textContent = `Error: ${error.message}`;
      responseStatus.textContent = 'Error';
      responseStatus.className = 'response-status text-xs font-medium text-red-500';
    } finally {
      this.disabled = false;
      this.textContent = 'Test';
    }
  });
});
