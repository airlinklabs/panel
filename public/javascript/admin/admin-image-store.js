const CAT_CLS   = { game: 'cat-game', application: 'cat-application', generic: 'cat-generic' };
const CAT_LABEL = { game: 'Game', application: 'App', generic: 'Generic' };
const CAT_COLOR = { game: '#7c3aed', application: '#0284c7', generic: '#16a34a' };

let allImages = [], pendingEgg = null, mdParse = null;
let searchQuery = '', sortBy = 'app', sortDir = 'asc';

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s) { return s.replace(/[-_]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}); }
function show(id, d) { var e=document.getElementById(id); if(e) e.style.display=d||'block'; }
function hide(id) { var e=document.getElementById(id); if(e) e.style.display='none'; }

function catDot(cat,size) {
  var c=CAT_COLOR[cat]||'#999';
  return '<span style="display:inline-block;width:'+(size||8)+'px;height:'+(size||8)+'px;border-radius:50%;background:'+c+';flex-shrink:0"></span>';
}
function catBadge(cat) {
  return '<span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset '+(CAT_CLS[cat]||'')+'">'+catDot(cat,6)+(CAT_LABEL[cat]||cat)+'</span>';
}

function escHtml(s) { return esc(s||'').replace(/"/g,'&quot;'); }

function groupData() {
  var map = {};
  allImages.forEach(function(img) {
    if (!map[img.group]) map[img.group] = { imgs:[], desc: img.description||'', readme: img.groupReadme||'' };
    map[img.group].imgs.push(img);
    if (img.description && !map[img.group].desc) map[img.group].desc = img.description;
  });
  var q = searchQuery.toLowerCase().trim();
  var out = [];
  Object.keys(map).forEach(function(g) {
    var entry = { group: g, imgs: map[g].imgs, desc: map[g].desc, readme: map[g].readme };
    if (q && !g.toLowerCase().includes(q)) return;
    // dominant category
    var counts = {};
    entry.imgs.forEach(function(i){ counts[i.category] = (counts[i.category]||0)+1; });
    entry.domCat = Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]})[0] || 'game';
    out.push(entry);
  });
  out.sort(function(a,b) {
    var va, vb;
    if (sortBy === 'type') { va = CAT_LABEL[a.domCat]||''; vb = CAT_LABEL[b.domCat]||''; }
    else if (sortBy === 'author') { va = a.imgs.length; vb = b.imgs.length; }
    else if (sortBy === 'desc') { va = a.desc||''; vb = b.desc||''; }
    else { va = a.group; vb = b.group; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return out;
}

function sortKey(col) {
  if (col === sortBy) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortBy = col; sortDir = 'asc'; }
  updateSortArrows();
  render();
}

function updateSortArrows() {
  var cols = { app: 'sortApp', type: 'sortType', author: 'sortAuthor', desc: 'sortDesc' };
  Object.keys(cols).forEach(function(k) {
    var el = document.getElementById(cols[k]);
    if (el) el.textContent = k === sortBy ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '';
  });
}

async function loadCatalogue() {
  show('loadingEl'); hide('listEl'); hide('errorEl'); hide('emptyEl');
  var st = document.getElementById('statusText');
  if (st) st.textContent = '';
  try {
    var res = await fetch('/admin/images/store/catalogue');
    if (!res.ok) throw new Error(res.status);
    var data = await res.json();
    allImages = data.images || [];
    hide('loadingEl');
    var age = data.builtAt ? Math.round((Date.now() - data.builtAt) / 60000) : 0;
    if (st) st.textContent = allImages.length + ' images \u00B7 ' + (age < 1 ? 'fresh' : age + 'm old');
    updateCount();
    render();
  } catch(e) {
    hide('loadingEl'); show('errorEl');
  }
}

async function doRefresh() {
  document.getElementById('refreshBtnLoad').disabled = true;
  var st = document.getElementById('statusText');
  if (st) st.textContent = 'Refreshing\u2026';
  var before = 0;
  try { before = (await(await fetch('/admin/images/store/catalogue')).json()).builtAt || 0; } catch(e) {}
  try {
    var refreshRes = await fetch('/admin/images/store/refresh', { method: 'POST' });
    if (!refreshRes.ok) throw new Error('Refresh failed');
  } catch(e) {
    document.getElementById('refreshBtnLoad').disabled = false;
    if (st) st.textContent = '';
    if (typeof showToast === 'function') showToast('Could not refresh the catalogue', 'error');
    return;
  }
  for (var i = 0; i < 60; i++) {
    await new Promise(function(r){setTimeout(r,1000)});
    try { var cur = (await(await fetch('/admin/images/store/catalogue')).json()).builtAt || 0; if (cur !== before) break; } catch(e) {}
  }
  allImages = [];
  show('loadingEl'); hide('listEl'); hide('emptyEl');
  await loadCatalogue();
  document.getElementById('refreshBtnLoad').disabled = false;
}

function updateCount() {
  var groups = groupData();
  var el = document.getElementById('countLabel');
  if (el) el.textContent = groups.length + ' / ' + Object.keys(allImages.reduce(function(m,i){m[i.group]=1;return m},{})).length;
}

function render() {
  var groups = groupData();
  hide('listEl'); hide('emptyEl');
  updateCount();
  if (!groups.length) {
    document.getElementById('emptyTxt').textContent = allImages.length ? 'No apps match your search.' : 'The image catalogue is empty.';
    show('emptyEl'); return;
  }
  var body = document.getElementById('listBody');
  body.innerHTML = '';
  groups.forEach(function(g) {
    body.appendChild(makeGroupRow(g));
  });
  show('listEl');
}

function makeGroupRow(g) {
  var tr = document.createElement('tr');
  tr.className = 'al-table-tr transition-colors cursor-pointer group-hdr-tr';
  tr.innerHTML =
    '<td class="al-table-td whitespace-nowrap py-4 pl-6 pr-3">' +
      '<div class="flex items-center gap-2.5">' +
        catDot(g.domCat) +
        '<span class="text-sm font-medium truncate" style="color:var(--theme-text-strong)">' + esc(cap(g.group)) + '</span>' +
      '</div>' +
    '</td>' +
    '<td class="al-table-td whitespace-nowrap px-3 py-4">' + catBadge(g.domCat) + '</td>' +
    '<td class="al-table-td whitespace-nowrap px-3 py-4 text-sm" style="color:var(--theme-text-muted)">' + g.imgs.length + ' image' + (g.imgs.length !== 1 ? 's' : '') + '</td>' +
    '<td class="al-table-td px-3 py-4 text-sm" style="color:var(--theme-text-muted)">' + (g.readme ? esc(g.readme.replace(/[#*`\[\]]/g,'')) : esc(g.desc||'')) + '</td>';
  tr.addEventListener('click', function(){openGroup(g.group, g.imgs)});
  return tr;
}

function openGroup(group, imgs) {
  var s = imgs.slice().sort(function(a,b){return a.name.localeCompare(b.name)});
  document.getElementById('grpTitle').textContent = cap(group);
  document.getElementById('grpCount').textContent = s.length + ' image' + (s.length !== 1 ? 's' : '');
  var list = document.getElementById('grpSubList');
  list.innerHTML = '';
  s.forEach(function(img, i) {
    var row = document.createElement('div');
    row.className = 'grp-img-row';
    var subLabel = img.subGroup && img.subGroup !== img.group ? img.subGroup.replace(img.group + '/', '') : '';
    row.innerHTML =
      '<div class="flex items-center gap-2 min-w-0">' +
        catDot(img.category) +
        '<div class="min-w-0">' +
          '<p class="text-xs font-medium truncate" style="color:var(--theme-text-strong)">' + esc(img.name) + '</p>' +
          (subLabel ? '<p class="text-[11px] font-mono truncate" style="color:var(--theme-text-muted)">' + esc(subLabel) + '</p>' : '') +
        '</div>' +
      '</div>' +
      '<button type="button" class="al-btn-secondary px-2 py-1 text-xs font-medium shrink-0">Install</button>';
    row.style.animationDelay = Math.min(i * 20, 300) + 'ms';
    row.addEventListener('click', function(){closeGroup();openEgg(img)});
    row.querySelector('button').addEventListener('click', function(e){e.stopPropagation();closeGroup();openEgg(img)});
    list.appendChild(row);
  });
  renderMd(imgs[0]?.groupReadme||'', document.getElementById('grpReadme'));
  const overlay = document.getElementById('groupOverlay');
  overlay.classList.add('open');
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.set(panel, { y: 16, scale: 0.95, opacity: 0 }); Phys.to(panel, { y: 0, scale: 1, opacity: 1 }, { stiffness: 320, damping: 21 }); }
  document.body.style.overflow = 'hidden';
}

function closeGroup() {
  const overlay = document.getElementById('groupOverlay');
  const done = function () { overlay.classList.remove('open'); };
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.exit(overlay, { panel: panel, done: done }); } else done();
  document.body.style.overflow = '';
}
document.getElementById('groupOverlay').addEventListener('click', function(e){if(e.target===e.currentTarget)closeGroup()});

async function getMd() {
  if (mdParse) return mdParse;
  try {
    var mod = await import('https://cdn.jsdelivr.net/npm/marked@15.0.6/+esm');
    mdParse = mod.marked;
    mdParse.setOptions({gfm:true, breaks:true});
  } catch(e) {
    mdParse = { parse: function(s){ return esc(s).replace(/\n/g,'<br>'); } };
  }
  return mdParse;
}

async function renderMd(md, el) {
  el.innerHTML = '<p class="text-xs" style="color:var(--theme-text-muted);font-style:italic">Rendering\u2026</p>';
  try {
    var m = await getMd();
    el.innerHTML = '<div class="md-body">' + (md ? m.parse(md) : '<p style="font-style:italic;color:#a3a3a3;font-size:12px;">No readme available.</p>') + '</div>';
  } catch(e) {
    el.innerHTML = '<div class="md-body">' + esc(md||'') + '</div>';
  }
}

function openEgg(img) {
  pendingEgg = img;
  document.getElementById('eggTitle').textContent = img.name;
  var catEl = document.getElementById('eggCat');
  catEl.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ring-1 ring-inset ' + (CAT_CLS[img.category]||'');
  catEl.innerHTML = catDot(img.category, 6) + (CAT_LABEL[img.category]||img.category);
  document.getElementById('eggDesc').textContent = img.description||'';
  document.getElementById('eggAuthor').textContent = img.author ? 'by ' + img.author : '';
  renderMd(img.fullReadme||img.readme||'', document.getElementById('eggReadme'));
  hide('eggErr');
  var btn = document.getElementById('eggInstallBtn');
  btn.innerHTML = 'Install'; btn.disabled = false;
  const overlay = document.getElementById('eggOverlay');
  overlay.classList.add('open');
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.set(panel, { y: 16, scale: 0.95, opacity: 0 }); Phys.to(panel, { y: 0, scale: 1, opacity: 1 }, { stiffness: 320, damping: 21 }); }
  document.body.style.overflow = 'hidden';
}

function closeEgg() {
  const overlay = document.getElementById('eggOverlay');
  const done = function () { overlay.classList.remove('open'); };
  if (window.Phys) { const panel = overlay.querySelector('.modal-box'); Phys.exit(overlay, { panel: panel, done: done }); } else done();
  document.body.style.overflow = '';
  pendingEgg = null;
}
document.getElementById('eggOverlay').addEventListener('click', function(e){if(e.target===e.currentTarget)closeEgg()});
document.addEventListener('keydown', function(e){if(e.key==='Escape'){closeGroup();closeEgg()}});

async function confirmInstall() {
  if (!pendingEgg) return;
  var btn = document.getElementById('eggInstallBtn');
  btn.disabled = true; btn.textContent = 'Installing\u2026';
  hide('eggErr');
  try {
    var res = await fetch('/admin/images/store/install', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(pendingEgg.egg),
    });
    var body = await res.json();
    if (!res.ok) {
      document.getElementById('eggErrTxt').textContent = body.error || 'Installation failed.';
      show('eggErr'); btn.disabled = false; btn.innerHTML = 'Install'; return;
    }
    closeEgg();
    if (typeof showToast === 'function') showToast('"' + pendingEgg.name + '" installed successfully.', 'success');
  } catch(err) {
    console.error('Image install error:', err);
    document.getElementById('eggErrTxt').textContent = 'Installation failed. Try again.';
    show('eggErr'); btn.disabled = false; btn.innerHTML = 'Install';
  }
}

function doSearch(val) {
  searchQuery = val;
  render();
}
document.getElementById('searchInput').addEventListener('input', function() {
  doSearch(this.value);
});

loadCatalogue();
