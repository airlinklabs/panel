/* inline script 1 */

document.addEventListener('DOMContentLoaded', () => {
  const { showToast } = createToastSystem();
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  const form = document.getElementById('enable2faForm');
  const btn = document.getElementById('enableBtn');
  const feedback = document.getElementById('feedback');
  const tokenInput = document.getElementById('totpToken');
  const copySecretBtn = document.getElementById('copySecret');
  const recoveryPanel = document.getElementById('recoveryCodesPanel');
  const recoveryList = document.getElementById('recoveryCodesList');
  let recoveryCodes = [];

  copySecretBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('null').then(
      () => showToast('Secret key copied to clipboard.', 'success'),
      () => showToast('Could not copy secret key.', 'error'),
    );
  });

  document.getElementById('copyRecoveryCodes').addEventListener('click', () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n')).then(
      () => showToast('Recovery codes copied.', 'success'),
      () => showToast('Could not copy recovery codes.', 'error'),
    );
  });

  document.getElementById('ackRecoveryCodes').addEventListener('click', () => {
    window.location.href = '/account';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    feedback.classList.add('hidden');
    try {
      const res = await fetch('/account/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        body: JSON.stringify({ token: tokenInput.value }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-factor authentication enabled.', 'success');
        recoveryCodes = data.recoveryCodes || [];
        recoveryList.innerHTML = recoveryCodes.map(code =>
          '<code class="select-all rounded-lg px-3 py-2 text-xs font-mono text-center" style="background:var(--theme-bg-secondary);color:var(--theme-text-strong)">' + code + '</code>'
        ).join('');
        form.closest('.al-card').classList.add('hidden');
        recoveryPanel.classList.remove('hidden');
        document.getElementById('recoveryCodesPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        feedback.textContent = data.error || 'Something went wrong. Try again.';
        feedback.classList.remove('hidden');
      }
    } catch {
      feedback.textContent = 'Something went wrong. Try again.';
      feedback.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
});
