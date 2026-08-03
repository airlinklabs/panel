/* inline script 1 */

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.getElementById('authPanel').classList.add('visible');
    });
  });

  var recoveryMode = false;
  var tokenInput = document.getElementById('token');
  var tokenLabel = document.getElementById('tokenLabel');
  var toggleBtn = document.getElementById('toggleRecovery');

  toggleBtn.addEventListener('click', function () {
    recoveryMode = !recoveryMode;
    if (recoveryMode) {
      tokenInput.type = 'text';
      tokenInput.removeAttribute('inputmode');
      tokenInput.removeAttribute('pattern');
      tokenInput.maxLength = 14;
      tokenInput.autocomplete = 'off';
      tokenInput.placeholder = 'XXXX-XXXX-XXXX';
      tokenInput.value = '';
      tokenLabel.textContent = 'Recovery code';
      toggleBtn.textContent = 'Use the 6-digit code instead';
    } else {
      tokenInput.type = 'text';
      tokenInput.setAttribute('inputmode', 'numeric');
      tokenInput.setAttribute('pattern', '[0-9]*');
      tokenInput.maxLength = 6;
      tokenInput.autocomplete = 'one-time-code';
      tokenInput.placeholder = '••••••';
      tokenInput.value = '';
      tokenLabel.textContent = '6-digit code';
      toggleBtn.textContent = 'Use a recovery code instead';
    }
    tokenInput.focus();
  });

  document.getElementById('verifyForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    var csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    var token = document.getElementById('token').value.trim();

    try {
      var res = await fetch('/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        body: JSON.stringify({ token: token }),
      });
      var data = await res.json();
      if (res.ok && data.success) {
        window.location.href = data.redirect || '/';
        return;
      }
      var fb = document.getElementById('feedback');
      fb.textContent = data.error || 'Invalid code. Try again.';
      fb.classList.remove('hidden');
    } catch (err) {
      var fb2 = document.getElementById('feedback');
      fb2.textContent = 'Something went wrong. Try again.';
      fb2.classList.remove('hidden');
    }
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    document.getElementById('token').focus();
  });
