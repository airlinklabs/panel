(function () {
  const tabBtns   = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  let data        = null;
  let loginChart  = null;

  function activateTab(id) {
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle('border-neutral-800',      on);
      btn.classList.toggle('dark:border-white',       on);
      btn.classList.toggle('text-neutral-800',        on);
      btn.classList.toggle('dark:text-white',         on);
      btn.classList.toggle('border-transparent',      !on);
      btn.classList.toggle('text-neutral-500',        !on);
      btn.classList.toggle('dark:text-neutral-400',   !on);
    });
    tabPanels.forEach(p => p.classList.toggle('hidden', p.dataset.tabPanel !== id));
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
  activateTab('servers');

  const isDark    = () => document.documentElement.classList.contains('dark');
  const textColor = () => isDark() ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
  const gridColor = () => isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  function fmt(n) { return n.toLocaleString(); }

  function bar(label, value, max) {
    const pct   = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : '#3b82f6';
    const label2 = max > 0 ? pct + '%' : '—';
    return `<div>
      <div class="flex justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">
        <span class="truncate max-w-[60%] font-medium">${label}</span>
        <span class="shrink-0 tabular-nums">${fmt(value)} <span class="text-neutral-400">(${label2})</span></span>
      </div>
      <div class="h-1.5 rounded-full bg-neutral-200 dark:bg-white/5">
        <div class="h-1.5 rounded-full transition-all duration-500" style="width:${max > 0 ? pct : 0}%;background:${color}"></div>
      </div>
    </div>`;
  }

  function renderServers(d) {
    const s = d.servers;
    document.getElementById('sv-total').textContent   = fmt(s.total);
    document.getElementById('sv-ram').textContent     = s.totalRamMb >= 1024 ? (s.totalRamMb / 1024).toFixed(1) + ' GB' : s.totalRamMb + ' MB';
    document.getElementById('sv-cpu').textContent     = s.totalCpuPct + '%';
    document.getElementById('sv-storage').textContent = s.totalStorageGb + ' GB';

    const suspLabel = document.getElementById('sv-suspended-label');
    if (s.suspended > 0) {
      suspLabel.textContent = s.suspended + ' suspended';
      suspLabel.className   = 'text-xs text-amber-600 dark:text-amber-400 mt-1';
    } else {
      suspLabel.textContent = 'none suspended';
      suspLabel.className   = 'text-xs text-neutral-500 mt-1';
    }

    const imgEl = document.getElementById('sv-images');
    if (s.topImages.length) {
      const maxCount = s.topImages[0].count;
      imgEl.innerHTML = s.topImages.map(i =>
        bar(i.name || 'Unknown', i.count, maxCount)
      ).join('');
    } else {
      imgEl.innerHTML = '<p class="text-sm text-neutral-400">No servers yet.</p>';
    }

    const heavyEl = document.getElementById('sv-heavy');
    heavyEl.innerHTML = s.topServers.map(sv => `
      <div class="flex items-center gap-4 px-5 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-neutral-700 dark:text-neutral-300 truncate font-medium">${sv.name}</p>
          <p class="text-xs text-neutral-400">${sv.owner} · ${sv.image}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
          <span>${fmt(sv.memory)} MB</span>
          <span class="text-neutral-300 dark:text-neutral-600">·</span>
          <span>${sv.cpu}%</span>
          <span class="text-neutral-300 dark:text-neutral-600">·</span>
          <span>${sv.storage} GB</span>
        </div>
        ${sv.suspended ? '<span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">Suspended</span>' : ''}
      </div>`).join('') || '<p class="px-5 py-4 text-sm text-neutral-400">No servers.</p>';
  }

  function renderNodes(d) {
    const nodes = d.nodes;
    const online  = nodes.filter(n => n.online).length;
    const offline = nodes.filter(n => !n.online).length;
    document.getElementById('nd-total').textContent  = fmt(nodes.length);
    document.getElementById('nd-online').textContent  = fmt(online);
    document.getElementById('nd-offline').textContent = fmt(offline);

    const listEl = document.getElementById('nd-list');
    if (!nodes.length) {
      listEl.innerHTML = '<p class="text-sm text-neutral-400">No nodes configured.</p>';
      return;
    }
    listEl.innerHTML = nodes.map(n => `
      <div class="rounded-xl bg-neutral-50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-white/5 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full ${n.online ? 'bg-emerald-500' : 'bg-red-500'} shrink-0"></span>
            <div>
              <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.name}</p>
              <p class="text-xs text-neutral-400 font-mono">${n.address}:${n.port}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 text-xs text-neutral-500">
            ${n.online && n.versionRelease ? `<span class="font-mono bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 px-2 py-0.5 rounded-md">${n.versionRelease}</span>` : ''}
            <span>${n.serverCount} server${n.serverCount !== 1 ? 's' : ''}</span>
            <span class="px-2 py-0.5 rounded-md text-xs font-medium ${n.online ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'}">${n.online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        ${n.ram > 0 || n.cpu > 0 || n.disk > 0 ? `
        <div class="grid grid-cols-3 gap-4">
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">RAM limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.ram >= 1024 ? (n.ram/1024).toFixed(1)+' GB' : n.ram+' MB'}</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">CPU limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.cpu}%</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Disk limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.disk} GB</p>
          </div>
        </div>` : '<p class="text-xs text-neutral-400">No capacity limits configured for this node.</p>'}
      </div>`).join('');
  }

  function renderActivity(d) {
    const a = d.activity;
    const totalLogins = Object.values(a.loginsByDay).reduce((s, v) => s + v, 0);
    const avgPerDay   = Math.round(totalLogins / 30);

    document.getElementById('ac-users').textContent  = fmt(a.totalUsers);
    document.getElementById('ac-images').textContent = fmt(a.totalImages);
    document.getElementById('ac-logins').textContent = fmt(totalLogins);
    document.getElementById('ac-avg').textContent    = fmt(avgPerDay);
    document.getElementById('ac-admins-label').textContent = a.adminCount + ' admin' + (a.adminCount !== 1 ? 's' : '');

    const labels = Object.keys(a.loginsByDay).map(d => d.slice(5));
    const values = Object.values(a.loginsByDay);

    if (loginChart) loginChart.destroy();
    loginChart = new Chart(document.getElementById('loginChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data:            values,
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor:     '#3b82f6',
          borderWidth:     1,
          borderRadius:    4,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: textColor(), maxTicksLimit: 10 } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), stepSize: 1 }, min: 0 },
        },
      },
    });

    const tbody = document.getElementById('ac-logins-table');
    tbody.innerHTML = (a.recentLogins || []).map(l => `
      <tr class="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition">
        <td class="px-5 py-3 text-xs font-mono text-neutral-500">#${l.userId}</td>
        <td class="px-5 py-3 text-xs font-mono text-neutral-600 dark:text-neutral-400">${l.ipAddress || 'Unknown'}</td>
        <td class="px-5 py-3 text-xs text-neutral-500">${new Date(l.timestamp).toLocaleString()}</td>
      </tr>`).join('') || '<tr><td colspan="3" class="px-5 py-5 text-center text-sm text-neutral-400">No login history.</td></tr>';
  }

  async function load() {
    const icon    = document.getElementById('refreshIcon');
    const loading = document.getElementById('loading-state');
    icon.classList.add('animate-spin');
    loading.classList.remove('hidden');
    tabPanels.forEach(p => p.classList.add('hidden'));

    try {
      const res = await fetch('/api/admin/analytics/summary');
      if (!res.ok) throw new Error('Request failed');
      data = await res.json();

      loading.classList.add('hidden');
      activateTab(document.querySelector('.tab-btn:not([class*="border-transparent"])')?.dataset.tab || 'servers');

      renderServers(data);
      renderNodes(data);
      renderActivity(data);
      showToast('Analytics refreshed. Fresh data.', 'success');
    } catch {
      loading.classList.add('hidden');
      showToast('Failed to load analytics', 'error');
    } finally {
      icon.classList.remove('animate-spin');
    }
  }

  document.getElementById('refreshBtn').addEventListener('click', load);
  load();
})();
