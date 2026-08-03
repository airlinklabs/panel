/* inline script 1 */

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.getElementById('authPanel').classList.add('visible');
    });
  });

  var pwToggle = document.getElementById('pwToggle');
  var pwInput  = document.getElementById('password');
  pwToggle.addEventListener('click', function () {
    var show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    document.getElementById('eyeIcon').innerHTML = show
      ? '<path fill-rule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clip-rule="evenodd"/><path d="M10.748 13.93l2.523 2.524a10.065 10.065 0 0 1-5.27 0l-1.978-1.978a4 4 0 0 0 .005-5.53l-.738-.738A8.003 8.003 0 0 0 1.834 9.587a1.651 1.651 0 0 0 0 1.186A10.004 10.004 0 0 0 10 17c1.09 0 2.14-.175 3.124-.497l-2.376-2.573Z"/>'
      : '<path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clip-rule="evenodd"/>';
  });

  pwInput.addEventListener('input', function () {
    var v = pwInput.value;
    var score = [v.length >= 8, /[A-Za-z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
    var colors = ['var(--theme-danger)','var(--theme-warning)','var(--theme-info)','var(--theme-success)'];
    var labels = ['Too short','Weak','Fair','Strong'];
    var widths = ['25%','50%','75%','100%'];
    var bar  = document.getElementById('pwBar');
    var hint = document.getElementById('pwHint');
    if (!v) { bar.style.width = '0%'; hint.textContent = '8+ characters, one letter, one number.'; hint.style.color = ''; return; }
    var idx = Math.max(0, score - 1);
    bar.style.width = widths[idx]; bar.style.background = colors[idx];
    hint.textContent = labels[idx]; hint.style.color = colors[idx];
  });

  document.getElementById('registerForm').addEventListener('submit', function (e) {
    var username = document.getElementById('username').value.trim();
    var email    = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    var ok = true;
    ['username','email','password'].forEach(function (id) { document.getElementById(id).classList.remove('invalid'); });
    if (username.length < 3 || !/^[A-Za-z0-9]+$/.test(username)) { document.getElementById('username').classList.add('invalid'); ok = false; }
    if (!email.includes('@') || !email.includes('.')) { document.getElementById('email').classList.add('invalid'); ok = false; }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) { document.getElementById('password').classList.add('invalid'); ok = false; }
    if (!ok) { e.preventDefault(); return; }
    document.getElementById('submitBtn').classList.add('loading');
    document.getElementById('submitBtn').disabled = true;
  });

  ['username','email','password'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () { this.classList.remove('invalid'); });
  });
