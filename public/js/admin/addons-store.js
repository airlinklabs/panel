(function() {
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function show(id, d='') { const e=document.getElementById(id); if(e) e.style.display=d; }
  function hide(id) { const e=document.getElementById(id); if(e) e.style.display='none'; }

  const INSTALLED = new Set(JSON.parse(document.getElementById('page-data').dataset.installedSlugs || '[]'));
  let allAddons = [], activeTag = null, currentAddon = null;

  function badgeCls(status, inst) {
    if (inst) return 'sb-inst';
    if (status === 'beta') return 'sb-beta';
    if (status === 'wip')  return 'sb-wip';
    return 'sb-working';
  }
  function badgeTxt(status, inst) { return inst ? 'Installed' : (status || 'working'); }

  async function loadStore() {
    show('loadingEl'); hide('tableWrap'); hide('errorEl'); hide('emptyEl');
    document.getElementById('statusText').textContent = '';
    try {
      const res = await fetch('/admin/addons/store/list');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed');
      allAddons = data.addons || [];
      hide('loadingEl');
      buildTags();
      render(filtered());
      document.getElementById('statusText').textContent = allAddons.length + ' addons';
    } catch (err) {
      hide('loadingEl');
      const msg = err.message || '';
      const isRL = msg.includes('rate') || msg.includes('403') || msg.includes('429');
      document.getElementById('errorMsg').textContent = isRL ? 'GitHub rate limit — wait a moment and retry.' : (msg || 'Failed to load addon store.');
      show('errorEl');
    }
  }

  function buildTags() {
    const counts = {};
    allAddons.forEach(a => (a.tags||[]).forEach(t => { counts[t] = (counts[t]||0) + 1; }));
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]);
    const el  = document.getElementById('tagFilters');
    el.innerHTML = '';
    top.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 's-tag'; btn.textContent = tag;
      btn.addEventListener('click', () => {
        activeTag = activeTag === tag ? null : tag;
        el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === activeTag));
        render(filtered());
      });
      el.appendChild(btn);
    });
  }

  function filtered() {
    const q = (document.getElementById('addonStoreFilterInput').value||'').toLowerCase().trim();
    return allAddons.filter(a => {
      const mq = !q || (a.name||'').toLowerCase().includes(q) || (a.description||'').toLowerCase().includes(q);
      const mt = !activeTag || (a.tags||[]).includes(activeTag);
      return mq && mt;
    });
  }

  function render(list) {
    const tbody = document.getElementById('tableBody');
    if (!list.length) { hide('tableWrap'); show('emptyEl'); return; }
    hide('emptyEl'); tbody.innerHTML = '';
    list.forEach((addon, i) => {
      const inst = INSTALLED.has(addon.id);
      const tr = document.createElement('tr');
      tr.style.opacity = '0';
      tr.className = 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer';
      tr.innerHTML =
        `<td class="whitespace-nowrap py-4 pl-6 pr-3 text-sm">` +
          `<p class="font-medium text-neutral-800 dark:text-white">${esc(addon.name)}</p>` +
          (addon.description ? `<p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 max-w-xs truncate">${esc(addon.description)}</p>` : '') +
        `</td>` +
        `<td class="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400 col-hide">${esc(addon.author||'—')}${addon.version?' · v'+esc(addon.version):''}</td>` +
        `<td class="whitespace-nowrap px-3 py-4 text-sm col-hide">` +
          `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeCls(addon.status,inst)}">${esc(badgeTxt(addon.status,inst))}</span>` +
        `</td>` +
        `<td class="whitespace-nowrap px-3 py-4 text-sm">` +
          `<button type="button" class="rounded-xl border border-neutral-800/20 bg-white hover:bg-neutral-300 text-neutral-800 px-3 py-2 text-sm font-medium shadow-lg transition">${inst ? 'Manage' : 'Details'}</button>` +
        `</td>`;
      tr.addEventListener('click', () => openDetail(addon));
      tr.querySelector('button').addEventListener('click', e => { e.stopPropagation(); openDetail(addon); });
      tbody.appendChild(tr);
      setTimeout(() => { tr.style.transition = 'opacity 0.15s'; tr.style.opacity = '1'; setTimeout(() => { tr.style.transition = ''; tr.style.opacity = ''; }, 160); }, i * 18);
    });
    show('tableWrap');
  }

  document.getElementById('addonStoreFilterInput').addEventListener('input', () => render(filtered()));
  document.getElementById('clearSearch').addEventListener('click', () => {
    document.getElementById('addonStoreFilterInput').value = ''; activeTag = null;
    document.querySelectorAll('#tagFilters button').forEach(b => b.classList.remove('on'));
    render(filtered());
  });

  function openDetail(addon) {
    currentAddon = addon;
    const inst = INSTALLED.has(addon.id);
    document.getElementById('dlgName').textContent = addon.name || '';
    const statusEl = document.getElementById('dlgStatus');
    statusEl.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ' + badgeCls(addon.status, inst);
    statusEl.textContent = badgeTxt(addon.status, inst);
    document.getElementById('dlgMeta').textContent = 'by ' + (addon.author||'Unknown') + (addon.version ? ' · v' + addon.version : '');
    document.getElementById('dlgDesc').textContent = addon.description || '';
    document.getElementById('dlgGh').href = addon.github || ('https://github.com/airlinklabs/addons/tree/main/' + (addon.id||''));

    const longEl = document.getElementById('dlgLong');
    longEl.innerHTML = addon.longDescription ? '<p>' + esc(addon.longDescription) + '</p>' : '<p style="font-style:italic;color:#a3a3a3;font-size:12px;">No additional description.</p>';

    const featsEl = document.getElementById('dlgFeats');
    featsEl.innerHTML = '';
    if ((addon.features||[]).length) {
      const lbl = document.createElement('p'); lbl.className = 'text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider'; lbl.textContent = 'Features'; featsEl.appendChild(lbl);
      addon.features.forEach(f => {
        const row = document.createElement('div'); row.className = 'flex gap-2 items-start text-xs text-neutral-500 dark:text-neutral-400';
        row.innerHTML = '<span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0"></span><span>' + esc(f) + '</span>';
        featsEl.appendChild(row);
      });
    }

    hide('termBox'); hide('dlgErr');
    document.getElementById('termLog').innerHTML = '';
    document.getElementById('progFill').style.width = '0%';
    setActionBtn(inst);
    document.getElementById('detailOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); document.body.style.overflow = ''; currentAddon = null; }
  window.closeDetail = closeDetail;
  document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  function setActionBtn(inst) {
    const btn = document.getElementById('actionBtn');
    if (inst) { btn.className = 'w-full rounded-xl bg-red-600 hover:bg-red-500 text-white py-2.5 text-sm font-medium shadow-sm transition'; btn.textContent = 'Uninstall'; }
    else { btn.className = 'w-full border border-neutral-800/20 rounded-xl bg-white hover:bg-neutral-200 dark:hover:bg-neutral-300 text-neutral-800 py-2.5 text-sm font-medium shadow-lg transition'; btn.textContent = 'Install'; }
    btn.disabled = false;
  }

  document.getElementById('actionBtn').addEventListener('click', async function() {
    if (!currentAddon) return;
    const slug = currentAddon.id;
    const inst  = INSTALLED.has(slug);

    if (inst) {
      this.disabled = true; this.textContent = 'Removing…';
      try {
        const res = await fetch('/admin/addons/store/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
        const data = await res.json();
        if (data.success) { INSTALLED.delete(slug); showToast(data.message, 'success'); closeDetail(); render(filtered()); }
        else { showToast(data.message||'Failed', 'error'); setActionBtn(true); }
      } catch { showToast('Something went wrong.', 'error'); setActionBtn(true); }
      return;
    }

    const termBox = document.getElementById('termBox'), termLog = document.getElementById('termLog');
    const termLbl = document.getElementById('termLabel'), termPct = document.getElementById('termPct');
    const progFill = document.getElementById('progFill');
    termBox.style.display = ''; termLog.innerHTML = ''; progFill.style.width = '0%';
    termLbl.textContent = 'Starting…'; termPct.textContent = '0%';
    this.disabled = true; this.textContent = 'Installing…'; hide('dlgErr');

    function log(text, cls) {
      const d = document.createElement('div'); if (cls) d.className = cls;
      d.textContent = text; termLog.appendChild(d); termLog.scrollTop = termLog.scrollHeight;
    }

    try {
      const res = await fetch('/admin/addons/store/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.includes('application/json')) {
        const data = await res.json(); log('Error: ' + (data.message||'Server error'), 'l-err'); termLbl.textContent = 'Failed'; showToast(data.message||'Install failed', 'error'); setActionBtn(false); return;
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', done2 = 0;
      const total = Object.keys(currentAddon.installCommands||{}).length + 3;
      outer: while (true) {
        const { done: end, value } = await reader.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const part of parts) {
          const raw = part.replace(/^data:\s*/m,'').trim(); if (!raw) continue;
          let evt; try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.type === 'step' || evt.type === 'cmd') { done2++; const p = Math.min(Math.round(done2/total*85),85); progFill.style.width=p+'%'; termPct.textContent=p+'%'; termLbl.textContent=evt.step||'Running…'; log((evt.type==='cmd'?'$ ':'> ')+(evt.cmd||evt.step||''), evt.type==='cmd'?'l-cmd':'l-step'); }
          else if (evt.type === 'output') { log(evt.output, 'l-output'); }
          else if (evt.type === 'done') { progFill.style.width='100%'; termPct.textContent='100%'; termLbl.textContent='Installed'; log(evt.message,'l-ok'); INSTALLED.add(slug); setActionBtn(true); showToast(evt.message,'success'); render(filtered()); break outer; }
          else if (evt.type === 'error') { log('Error: '+evt.message,'l-err'); termLbl.textContent='Failed'; showToast(evt.message,'error'); setActionBtn(false); break outer; }
        }
      }
    } catch (err) { log('Error: '+err.message,'l-err'); termLbl.textContent='Failed'; showToast('Installation failed','error'); setActionBtn(false); }
  });

  loadStore();
})();
