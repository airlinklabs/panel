document.getElementById('createNodeBtn').addEventListener('click', async () => {
  const nodeData = {
    name: document.getElementById('nodeName').value,
    ram: document.getElementById('nodeRam').value,
    cpu: document.getElementById('nodeProcessor').value,
    disk: document.getElementById('nodeDisk').value,
    address: document.getElementById('nodeAddress').value,
    port: document.getElementById('nodePort').value
  };

  if (!nodeData.name || !nodeData.address || !nodeData.port) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const loader = showLoadingPopup('Creating Node', 'Initializing node creation...');
  loader.updateProgress(20, 'Sending node configuration...');

  try {
    const response = await fetch('/admin/nodes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData)
    });

    if (response.ok) {
      const data = await response.json();
      loader.updateProgress(100, 'Node created!');
      setTimeout(() => {
        loader.close();
        showToast('Node\'s up and running.', 'success');
        setTimeout(() => {
          window.location.href = '/admin/nodes?err=none';
        }, 1000);
      }, 500);
    } else {
      loader.close();
      throw new Error('Failed to create node');
    }
  } catch (error) {
    loader.close();
    showToast('Error creating node: ' + error.message, 'error');
  }
});
