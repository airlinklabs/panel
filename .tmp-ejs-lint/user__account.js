/* inline script 1 */

document.addEventListener('DOMContentLoaded', () => {
  const { showToast } = createToastSystem();
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  let submitting = false;

  async function post(url, data) {
    if (submitting) return { ok: false, text: 'Already saving...' };
    submitting = true;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        body: JSON.stringify(data),
      });
      const text = await res.text();
      return { ok: res.ok, text };
    } finally { submitting = false; }
  }

  document.getElementById('saveAccountBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveAccountBtn');
    btn.disabled = true;
    btn.textContent = 'Saving\u2026';
    let hasError = false;

    const username = document.getElementById('username')?.value?.trim();
    if (username) {
      const r = await post('/update-username', { newUsername: username });
      if (!r.ok) { showToast(r.text || 'Failed to update username', 'error'); hasError = true; }
      else { const sb = document.getElementById('sidebar-username'); if (sb) sb.textContent = username; }
    }

    const email = document.getElementById('email')?.value?.trim();
    if (email) {
      const r = await post('/change-email', { email });
      if (!r.ok) { showToast(r.text || 'Failed to update email', 'error'); hasError = true; }
    }

    const currentPw = document.getElementById('currentPassword')?.value?.trim();
    const newPw = document.getElementById('newPassword')?.value?.trim();
    if (currentPw && newPw) {
      const r = await post('/change-password', { currentPassword: currentPw, newPassword: newPw });
      if (!r.ok) { showToast(r.text || 'Failed to update password', 'error'); hasError = true; }
      else { showToast('Password updated.', 'success'); }
    }

    const desc = document.getElementById('description')?.value?.trim();
    if (desc !== undefined) {
      const r = await post('/update-description', { description: desc });
      if (!r.ok) { showToast(r.text || 'Failed to update description', 'error'); hasError = true; }
    }

    const lang = document.getElementById('language')?.value;
    if (lang) {
      const r = await post('/set-language', { language: lang });
      if (!r.ok) { showToast(r.text || 'Failed to update language', 'error'); hasError = true; }
    }

    btn.disabled = false;
    btn.textContent = 'Save Changes';
    if (!hasError) showToast('All changes saved.', 'success');
  });

  // Username availability check
  const usernameInput = document.getElementById('username');
  const usernameFb = document.getElementById('username-feedback');
  let usernameTimer;
  usernameInput?.addEventListener('input', () => {
    clearTimeout(usernameTimer);
    usernameTimer = setTimeout(async () => {
      const val = usernameInput.value.trim();
      if (!val) { usernameFb.textContent = ''; return; }
      try {
        const res = await fetch(`/check-username?username=${encodeURIComponent(val)}`);
        const { exists } = await res.json();
        usernameFb.textContent = exists ? 'null' : 'null';
      } catch {}
    }, 500);
  });

  // Password validation
  const currentPwInput = document.getElementById('currentPassword');
  const newPwInput = document.getElementById('newPassword');
  const pwFeedback = document.getElementById('current-password-feedback');
  let pwTimer;
  currentPwInput?.addEventListener('input', () => {
    clearTimeout(pwTimer);
    const val = currentPwInput.value.trim();
    if (!val) { pwFeedback.textContent = ''; newPwInput.disabled = true; newPwInput.value = ''; return; }
    pwTimer = setTimeout(async () => {
      try {
        const res = await fetch('/validate-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
          body: JSON.stringify({ currentPassword: val }),
        });
        const { valid } = await res.json();
        pwFeedback.textContent = valid ? 'null' : 'null';
        newPwInput.disabled = !valid;
      } catch { pwFeedback.textContent = 'Could not validate'; newPwInput.disabled = true; }
    }, 500);
  });

  // Avatar
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  avatarInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = evt => openCropPopup(evt.target.result, csrfToken);
    reader.readAsDataURL(file);
    avatarInput.value = '';
  });

  document.getElementById('remove-avatar-btn')?.addEventListener('click', async () => {
    const res = await fetch('/remove-avatar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken } });
    if (res.ok) {
      avatarPreview.src = 'https://api.dicebear.com/9.x/thumbs/svg?seed=null';
      showToast('Profile picture removed.', 'success');
      setTimeout(() => location.reload(), 1200);
    } else showToast('Something went wrong.', 'error');
  });

  // Disable 2FA (requires current password)
  document.getElementById('disable2faBtn')?.addEventListener('click', async () => {
    const password = document.getElementById('disable2faPassword')?.value || '';
    if (!password) { showToast('Enter your current password to disable 2FA.', 'error'); return; }
    const btn = document.getElementById('disable2faBtn');
    btn.disabled = true;
    try {
      const res = await fetch('/account/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-factor authentication disabled.', 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        showToast(data.error || 'Failed to disable 2FA.', 'error');
      }
    } catch { showToast('Something went wrong.', 'error'); }
    btn.disabled = false;
  });

  function openCropPopup(dataUrl, csrf) {
    const overlay = document.createElement('div');
    overlay.className = 'al-sheet-overlay fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="al-sheet-panel rounded-2xl shadow-lg border w-full max-w-lg overflow-hidden" style="background:var(--theme-bg-card);border-color:var(--theme-border);">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b" style="border-color:var(--theme-border);">
          <div>
            <p class="text-sm font-semibold" style="color:var(--theme-text-strong);">Position your photo</p>
            <p class="text-xs mt-0.5" style="color:var(--theme-text-muted);">Drag and resize the selection box.</p>
          </div>
          <button type="button" id="crop-cancel" class="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-75 transition" style="color:var(--theme-text-muted);">
            null
          </button>
        </div>
        <div class="relative bg-neutral-900 dark:bg-neutral-950 select-none overflow-hidden" style="height:340px" id="crop-stage">
          <img id="crop-img" src="${dataUrl}" draggable="false" alt="Crop preview" style="position:absolute;top:0;left:0;user-select:none;max-width:none"/>
          <div id="crop-box" style="position:absolute;border:2px solid white;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);cursor:move;box-sizing:border-box">
            <div class="crop-handle" data-dir="nw" style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:white;border-radius:50%;cursor:nw-resize"></div>
            <div class="crop-handle" data-dir="ne" style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:white;border-radius:50%;cursor:ne-resize"></div>
            <div class="crop-handle" data-dir="sw" style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:white;border-radius:50%;cursor:sw-resize"></div>
            <div class="crop-handle" data-dir="se" style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:white;border-radius:50%;cursor:se-resize"></div>
          </div>
        </div>
        <div class="flex gap-3 px-5 py-4 border-t" style="border-color:var(--theme-border);">
          <button type="button" id="crop-cancel-btn" class="flex-1 rounded-xl border py-2.5 text-sm font-medium transition hover:opacity-85" style="border-color:var(--theme-btn-secondary-border);background:var(--theme-btn-secondary-bg);color:var(--theme-btn-secondary-text);">Cancel</button>
          <button type="button" id="crop-save" class="flex-1 rounded-xl py-2.5 text-sm font-medium transition hover:opacity-85" style="background:var(--theme-btn-primary-bg);color:var(--theme-btn-primary-text);">Save photo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    Animate.openModal(overlay, overlay.querySelector('.al-sheet-panel'));

    const stage = document.getElementById('crop-stage');
    const img   = document.getElementById('crop-img');
    const box   = document.getElementById('crop-box');
    const stageW = stage.offsetWidth, stageH = stage.offsetHeight;

    img.onload = () => {
      const scale = Math.min(stageW / img.naturalWidth, stageH / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      img.style.width = dw + 'px'; img.style.height = dh + 'px';
      img.style.left = ((stageW - dw) / 2) + 'px'; img.style.top = ((stageH - dh) / 2) + 'px';
      img._scale = scale; img._offX = (stageW - dw) / 2; img._offY = (stageH - dh) / 2;
      const bs = Math.min(dw, dh, 200);
      box.style.width = bs + 'px'; box.style.height = bs + 'px';
      box.style.left = ((stageW - bs) / 2) + 'px'; box.style.top = ((stageH - bs) / 2) + 'px';
    };
    if (img.complete) img.onload();

    let action = null, sx, sy, sb;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    box.addEventListener('mousedown', e => {
      if (e.target.classList.contains('crop-handle')) return;
      e.preventDefault(); action = 'move'; sx = e.clientX; sy = e.clientY;
      sb = { l: parseInt(box.style.left), t: parseInt(box.style.top), w: box.offsetWidth, h: box.offsetHeight };
    });
    box.querySelectorAll('.crop-handle').forEach(h => h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation(); action = h.dataset.dir; sx = e.clientX; sy = e.clientY;
      sb = { l: parseInt(box.style.left), t: parseInt(box.style.top), w: box.offsetWidth, h: box.offsetHeight };
    }));

    const onUp = () => action = null;
    const onMove = e => {
      if (!action) return;
      const dx = e.clientX - sx, dy = e.clientY - sy, min = 60;
      if (action === 'move') {
        box.style.left = clamp(sb.l + dx, 0, stageW - sb.w) + 'px';
        box.style.top  = clamp(sb.t + dy, 0, stageH - sb.h) + 'px';
      } else {
        let l = sb.l, t = sb.t, w = sb.w, h = sb.h;
        if (action.includes('e')) w = Math.max(min, sb.w + dx);
        if (action.includes('s')) h = Math.max(min, sb.h + dy);
        if (action.includes('w')) { const nw = Math.max(min, sb.w - dx); l = sb.l + (sb.w - nw); w = nw; }
        if (action.includes('n')) { const nh = Math.max(min, sb.h - dy); t = sb.t + (sb.h - nh); h = nh; }
        l = clamp(l, 0, stageW - min); t = clamp(t, 0, stageH - min);
        w = Math.min(w, stageW - l); h = Math.min(h, stageH - t);
        box.style.left = l + 'px'; box.style.top = t + 'px';
        box.style.width = w + 'px'; box.style.height = h + 'px';
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    const close = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      Animate.closeModal(overlay, overlay.querySelector('.al-sheet-panel'), () => overlay.remove());
    };
    document.getElementById('crop-cancel').addEventListener('click', close);
    document.getElementById('crop-cancel-btn').addEventListener('click', close);

    document.getElementById('crop-save').addEventListener('click', () => {
      const scale = img._scale, offX = img._offX, offY = img._offY;
      const boxL = parseInt(box.style.left), boxT = parseInt(box.style.top);
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      canvas.getContext('2d').drawImage(img, (boxL - offX) / scale, (boxT - offY) / scale, box.offsetWidth / scale, box.offsetHeight / scale, 0, 0, 256, 256);
      canvas.toBlob(async blob => {
        const form = new FormData();
        form.append('avatar', blob, 'avatar.png');
        try {
          const res = await fetch('/upload-avatar', { method: 'POST', headers: { 'CSRF-Token': csrf }, body: form });
          if (res.ok) {
            const { avatar } = await res.json();
            avatarPreview.src = avatar + '?t=' + Date.now();
            showToast('Profile picture updated.', 'success');
            close();
          } else showToast('Failed to upload', 'error');
        } catch { showToast('Failed to upload', 'error'); }
      }, 'image/png');
    });
  }
});
