const usernameInput = document.getElementById('userUsername');
const passwordInput = document.getElementById('userPassword');
const createBtn = document.getElementById('createuserBtn');

function setCrit(id, passing) {
  const el = document.getElementById(id);
  const icon = el.querySelector('.crit-icon');
  if (passing) {
    el.classList.remove('text-neutral-400', 'text-red-500');
    el.classList.add('text-green-500');
    icon.textContent = '✓';
  } else {
    el.classList.remove('text-neutral-400', 'text-green-500');
    el.classList.add('text-red-500');
    icon.textContent = '✗';
  }
}

function resetCrit(id) {
  const el = document.getElementById(id);
  const icon = el.querySelector('.crit-icon');
  el.classList.remove('text-green-500', 'text-red-500');
  el.classList.add('text-neutral-400');
  icon.textContent = '—';
}

function checkUsername() {
  const val = usernameInput.value;
  if (!val) {
    resetCrit('crit-username-length');
    resetCrit('crit-username-chars');
    return false;
  }
  const lengthOk = val.length >= 3 && val.length <= 20;
  const charsOk = /^[a-zA-Z0-9]+$/.test(val);
  setCrit('crit-username-length', lengthOk);
  setCrit('crit-username-chars', charsOk);
  return lengthOk && charsOk;
}

function checkPassword() {
  const val = passwordInput.value;
  if (!val) {
    resetCrit('crit-length');
    resetCrit('crit-letter');
    resetCrit('crit-number');
    return false;
  }
  const lengthOk = val.length >= 8;
  const letterOk = /[A-Za-z]/.test(val);
  const numberOk = /\d/.test(val);
  setCrit('crit-length', lengthOk);
  setCrit('crit-letter', letterOk);
  setCrit('crit-number', numberOk);
  return lengthOk && letterOk && numberOk;
}

usernameInput.addEventListener('input', checkUsername);
passwordInput.addEventListener('input', checkPassword);

createBtn.addEventListener('click', async () => {
  const emailVal = document.getElementById('userEmail').value.trim();
  const usernameVal = usernameInput.value.trim();
  const passwordVal = passwordInput.value;
  const isAdmin = document.getElementById('userIsAdminSwitch').checked;

  if (!emailVal || !usernameVal || !passwordVal) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  if (!checkUsername()) {
    showToast('Username must be 3–20 characters, letters and numbers only.', 'error');
    return;
  }
  if (!checkPassword()) {
    showToast('Password must be at least 8 characters with a letter and number.', 'error');
    return;
  }

  const loader = showLoadingPopup('Creating User', 'Processing user creation...');
  loader.updateProgress(20, 'Sending user information...');

  try {
    const response = await fetch('/admin/users/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, username: usernameVal, password: passwordVal, isAdmin }),
    });

    if (response.ok) {
      loader.updateProgress(100, 'User created successfully!');
      setTimeout(() => {
        loader.close();
        showToast('User added. Welcome to the team.', 'success');
        setTimeout(() => { window.location.href = '/admin/users?err=none'; }, 1000);
      }, 500);
    } else {
      const err = await response.json().catch(() => ({ message: 'Unknown error' }));
      loader.close();
      showToast(err.message || 'Failed to create user.', 'error');
    }
  } catch (error) {
    loader.close();
    showToast('Failed to create user: ' + error.message, 'error');
  }
});
