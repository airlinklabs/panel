const CAT_CLS   = { game: 'cat-game', application: 'cat-application', generic: 'cat-generic' };
const CAT_LABEL = { game: 'Game', application: 'App', generic: 'Generic' };

let allImages = [], viewMode = 'all', searchQ = '', pendingEgg = null;

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s) { return s.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase()); }
function show(id, d='block') { const e=document.getElementById(id); if(e) e.style.display=d; }
function hide(id) { const e=document.getElementById(id); if(e) e.style.display='none'; }

function mdToHtml(md) {
  if (!md) return '<p style="font-style:italic;color:#a3a3a3;font-size:12px;">No readme available.</p>';
  let h = esc(md);
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => '<pre><code>' + c.trim() + '</code></pre>');
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^---+$/gm, '<hr>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*?<\/li>(\n|$))+/g, m => '<ul>' + m + '</ul>');
  h = h.split('\n\n').map(b => {
    b = b.trim(); if (!b) return '';
    if (/^<(h[1-6]|ul|ol|pre|hr)/.test(b)) return b;
    return '<p>' + b.replace(/\n/g, ' ') + '</p>';
  }).join('');
  return h;
}

async function loadCatalogue() {
  show('loadingEl'); hide('allView'); hide('appView'); hide('errorEl'); hide('emptyEl');
  document.getElementById('statusText').textContent = '';
  try {
    const res = await fetch('/admin/images/store/catalogue');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    allImages = (data.images || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    hide('loadingEl');
    const age = data.builtAt ? Math.round((Date.now() - data.builtAt) / 60000) : 0;
    document.getElementById('statusText').textContent = allImages.length + ' images · ' + (age < 1 ? 'fresh' : age + 'm old');
    render();
  } catch {
    hide('loadingEl'); show('errorEl');
  }
}

async function doRefresh() {
  document.getElementById('refreshBtn').disabled = true;
  document.getElementById('statusText').textContent = 'Refreshing…';
  await fetch('/admin/images/store/refresh', { method: 'POST' });
  allImages = [];
  show('loadingEl'); hide('allView'); hide('appView');
  await loadCatalogue();
  document.getElementById('refreshBtn').disabled = false;
}

function filtered() {
  const q = searchQ.toLowerCase().trim();
  if (!q) return allImages;
  if (viewMode === 'all') {
    return allImages.filter(i => i.name.toLowerCase().includes(q));
  } else {
    return allImages.filter(i => i.group.toLowerCase().includes(q) || cap(i.group).toLowerCase().includes(q));
  }
}

function setView(mode) {
  viewMode = mode;
  document.getElementById('btnAll').classList.toggle('active', mode === 'all');
  document.getElementById('btnApp').classList.toggle('active', mode === 'app');
  render();
}

function render() {
  const list = filtered();
  hide('allView'); hide('appView'); hide('emptyEl');
  if (!list.length && allImages.length) { show('emptyEl'); return; }
  if (viewMode === 'all') renderAll(list);
  else renderApp(list);
}

function catBadge(cat) {
  return `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${CAT_CLS[cat]||''}">${CAT_LABEL[cat]||cat}</span>`;
}

function renderAll(list) {
  const tbody = document.getElementById('allBody');
  tbody.innerHTML = '';
  list.forEach(img => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer';
    tr.innerHTML =
      `<td class="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-neutral-800 dark:text-white">${esc(img.name)}</td>` +
      `<td class="whitespace-nowrap px-3 py-4 text-sm col-hide">${catBadge(img.category)}</td>` +
      `<td class="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400 col-hide">${esc(img.author||'—')}</td>` +
      `<td class="whitespace-nowrap px-3 py-4 text-sm">` +
        `<button type="button" class="rounded-xl border border-neutral-800/20 bg-white hover:bg-neutral-300 text-neutral-800 px-3 py-2 text-sm font-medium shadow-lg transition">Install</button>` +
      `</td>`;
    tr.addEventListener('click', () => openEgg(img));
    tr.querySelector('button').addEventListener('click', e => { e.stopPropagation(); openEgg(img); });
    tbody.appendChild(tr);
  });
  show('allView');
}

function renderApp(list) {
  const container = document.getElementById('appView');
  container.innerHTML = '';

  const groups = new Map();
  list.forEach(img => {
    if (!groups.has(img.group)) groups.set(img.group, []);
    groups.get(img.group).push(img);
  });

  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([group, imgs]) => {
    const wrap = document.createElement('div');
    wrap.className = 'overflow-hidden shadow-sm rounded-xl border border-neutral-200 dark:border-neutral-800/40';

    const hdr = document.createElement('div');
    hdr.className = 'grp-row bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800/70 cursor-pointer';
    hdr.innerHTML =
      `<span class="flex-1 text-sm font-medium text-neutral-800 dark:text-white">${esc(cap(group))}</span>` +
      `<span class="text-xs text-neutral-400 dark:text-neutral-500 mr-3">${imgs.length} image${imgs.length !== 1 ? 's' : ''}</span>` +
      `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-neutral-400"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>`;
    hdr.addEventListener('click', () => openGroup(group, imgs));
    wrap.appendChild(hdr);
    container.appendChild(wrap);
  });
  show('appView');
}

function openGroup(group, imgs) {
  document.getElementById('grpTitle').textContent = cap(group);
  document.getElementById('grpCount').textContent = imgs.length + ' image' + (imgs.length !== 1 ? 's' : '');

  const list = document.getElementById('grpSubList');
  list.innerHTML = '';
  imgs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(img => {
    const row = document.createElement('div');
    row.className = 'sub-row';
    const subLabel = img.subGroup && img.subGroup !== img.group ? img.subGroup.replace(img.group + '/', '') : '';
    row.innerHTML =
      `<div class="min-w-0">` +
        `<p class="text-xs font-medium text-neutral-800 dark:text-white truncate">${esc(img.name)}</p>` +
        (subLabel ? `<p class="text-[10px] text-neutral-400 font-mono truncate">${esc(subLabel)}</p>` : '') +
      `</div>` +
      `<button type="button" class="flex-shrink-0 rounded-xl border border-neutral-800/20 bg-white hover:bg-neutral-300 text-neutral-800 px-2 py-1 text-xs font-medium shadow transition">Install</button>`;
    row.addEventListener('click', () => { closeGroup(); openEgg(img); });
    row.querySelector('button').addEventListener('click', e => { e.stopPropagation(); closeGroup(); openEgg(img); });
    list.appendChild(row);
  });

  document.getElementById('grpReadme').innerHTML = mdToHtml(imgs[0]?.groupReadme || '');
  document.getElementById('groupOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeGroup() {
  document.getElementById('groupOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('groupOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeGroup(); });

function openEgg(img) {
  pendingEgg = img;
  document.getElementById('eggTitle').textContent = img.name;
  const catEl = document.getElementById('eggCat');
  catEl.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ' + (CAT_CLS[img.category] || '');
  catEl.textContent = CAT_LABEL[img.category] || img.category;
  document.getElementById('eggDesc').textContent = img.description || '';
  document.getElementById('eggAuthor').textContent = img.author ? 'by ' + img.author : '';
  document.getElementById('eggReadme').innerHTML = mdToHtml(img.fullReadme || img.readme || '');
  hide('eggErr');
  const btn = document.getElementById('eggInstallBtn');
  btn.textContent = 'Install'; btn.disabled = false;
  document.getElementById('eggOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEgg() {
  document.getElementById('eggOverlay').classList.remove('open');
  document.body.style.overflow = '';
  pendingEgg = null;
}
document.getElementById('eggOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeEgg(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeGroup(); closeEgg(); } });

async function confirmInstall() {
  if (!pendingEgg) return;
  const btn = document.getElementById('eggInstallBtn');
  btn.disabled = true; btn.textContent = 'Installing…';
  hide('eggErr');
  try {
    const res = await fetch('/admin/images/store/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingEgg.egg),
    });
    const body = await res.json();
    if (!res.ok) {
      document.getElementById('eggErrTxt').textContent = body.error || 'Installation failed.';
      show('eggErr'); btn.disabled = false; btn.textContent = 'Install'; return;
    }
    closeEgg();
    showToast('"' + pendingEgg.name + '" installed. Nice.', 'success');
  } catch (err) {
    document.getElementById('eggErrTxt').textContent = err.message || 'Network error.';
    show('eggErr'); btn.disabled = false; btn.textContent = 'Install';
  }
}

document.getElementById('imageFilterInput').addEventListener('input', function() {
  searchQ = this.value;
  render();
});

loadCatalogue().then(() => setView('app'));
