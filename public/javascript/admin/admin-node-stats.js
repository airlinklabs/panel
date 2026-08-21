(function() {
  var rootStyle = getComputedStyle(document.documentElement);
  var TICK = rootStyle.getPropertyValue('--theme-text').trim() || '#fff';
  var GRID = 'rgba(255,255,255,0.08)';
  var ACCENT = rootStyle.getPropertyValue('--theme-accent').trim() || '#3b82f6';
  var SUCCESS = rootStyle.getPropertyValue('--theme-success').trim() || '#22c55e';
  var DANGER = rootStyle.getPropertyValue('--theme-danger').trim() || '#ef4444';

  var pd = document.getElementById('page-data');
  var nodeId = pd.dataset.nodeId;
  var allocatedRam = parseFloat(pd.dataset.ram) || 0;
  var allocatedCpu = parseFloat(pd.dataset.cpu) || 0;
  var allocatedDisk = parseFloat(pd.dataset.disk) || 0;
  var MAX_PTS = 30;
  var POLL = 3000;

  function fmtBytes(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(0) + ' MB';
    return (b / 1024).toFixed(0) + ' KB';
  }
  function fmtMB(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(0) + ' MB'; }
  function pctColor(p) { return p >= 90 ? DANGER : p >= 70 ? '#f59e0b' : SUCCESS; }

  function setBar(id, pct, text) {
    var bar = document.getElementById(id + '-bar');
    var pctEl = document.getElementById(id + '-pct');
    var textEl = document.getElementById(id + '-text');
    var c = pctColor(pct);
    if (bar) { bar.style.width = Math.min(pct, 100) + '%'; bar.style.background = c; }
    if (pctEl) { pctEl.textContent = pct.toFixed(1) + '%'; pctEl.style.color = c; }
    if (textEl) textEl.textContent = text;
  }

  function timeNow() { return new Date().toLocaleTimeString(); }

  var initStats = JSON.parse(pd.dataset.stats || '[]');
  var initHost = JSON.parse(pd.dataset.host || '{}');
  var ramL = initStats.map(function(s) { return new Date(s.timestamp).toLocaleTimeString(); });
  var ramD = initStats.map(function(s) { return parseFloat(s.Ram.replace(' MB', '')); });
  var cpuL = ramL.slice();
  var cpuD = initStats.map(function(s) { return parseFloat(s.Cores.replace('%', '')); });

  var ramChart = new Chart(document.getElementById('ramChart').getContext('2d'), {
    type: 'line',
    data: { labels: ramL, datasets: [{ label: 'RAM (MB)', data: ramD, borderColor: ACCENT, backgroundColor: ACCENT + '33', borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: TICK, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: GRID } }, y: { beginAtZero: true, ticks: { color: TICK }, grid: { color: GRID }, title: { display: true, text: 'MB', color: TICK } } } }
  });

  var cpuChart = new Chart(document.getElementById('cpuChart').getContext('2d'), {
    type: 'line',
    data: { labels: cpuL, datasets: [{ label: 'CPU (%)', data: cpuD, borderColor: '#f97316', backgroundColor: '#f9731633', borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: TICK, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: GRID } }, y: { beginAtZero: true, suggestedMax: 100, ticks: { color: TICK }, grid: { color: GRID }, title: { display: true, text: '%', color: TICK } } } }
  });

  function push(chart, labels, data, label, value) {
    labels.push(label); data.push(value);
    if (labels.length > MAX_PTS) { labels.shift(); data.shift(); }
    chart.update('none');
  }

  function updateCards(d) {
    var h = d.host || {};
    var s = d.stats || {};
    var ts = s.totalStats || [];
    var latest = ts.length ? ts[ts.length - 1] : null;

    if (h.ram) {
      document.getElementById('host-ram').textContent = (h.ram.used / 1073741824).toFixed(1) + ' GB';
      document.getElementById('host-ram-detail').textContent = 'of ' + (h.ram.total / 1073741824).toFixed(1) + ' GB';
    }
    if (latest) {
      var cpuPct = parseFloat(latest.Cores.replace('%', ''));
      document.getElementById('host-cpu').textContent = cpuPct.toFixed(1) + '%';
      document.getElementById('host-cpu-detail').textContent = (h.cpu ? h.cpu.cores : '--') + ' cores';
    }
    if (h.disk && h.disk.total > 0) {
      document.getElementById('host-disk').textContent = fmtBytes(h.disk.used);
      document.getElementById('host-disk-detail').textContent = 'of ' + fmtBytes(h.disk.total);
    }
    if (s.uptime) document.getElementById('host-uptime').textContent = s.uptime;

    if (allocatedRam > 0 && h.ram) {
      var usedMB = h.ram.used / 1048576;
      var allocMB = allocatedRam * 1024;
      setBar('alloc-ram', (usedMB / allocMB * 100), fmtMB(usedMB) + ' / ' + fmtMB(allocMB));
    } else if (h.ram) {
      setBar('alloc-ram', (h.ram.used / h.ram.total * 100), fmtBytes(h.ram.used) + ' / ' + fmtBytes(h.ram.total));
    }
    if (latest && allocatedCpu > 0) {
      var cv = parseFloat(latest.Cores.replace('%', ''));
      setBar('alloc-cpu', cv, cv.toFixed(1) + '% of ' + allocatedCpu + '%');
    }
    if (h.disk && h.disk.total > 0 && allocatedDisk > 0) {
      var duGB = h.disk.used / 1073741824;
      setBar('alloc-disk', (duGB / allocatedDisk * 100), duGB.toFixed(1) + ' GB / ' + allocatedDisk + ' GB');
    } else if (h.disk && h.disk.total > 0) {
      setBar('alloc-disk', (h.disk.used / h.disk.total * 100), fmtBytes(h.disk.used) + ' / ' + fmtBytes(h.disk.total));
    }

    if (d.instances !== undefined) document.getElementById('count-instances').textContent = d.instances;
    if (d.allocationsInUse !== undefined) document.getElementById('count-alloc').textContent = d.allocationsInUse + '/' + d.allocations;

    if (latest) {
      push(ramChart, ramChart.data.labels, ramChart.data.datasets[0].data, timeNow(), parseFloat(latest.Ram.replace(' MB', '')));
      push(cpuChart, cpuChart.data.labels, cpuChart.data.datasets[0].data, timeNow(), parseFloat(latest.Cores.replace('%', '')));
    }
  }

  if (initStats.length || Object.keys(initHost).length) {
    updateCards({
      stats: { totalStats: initStats, uptime: '--' },
      host: initHost,
      instances: parseInt(pd.dataset.instances) || 0,
      allocations: parseInt(pd.dataset.allocations) || 0,
      allocationsInUse: parseInt(pd.dataset.allocationsInUse) || 0
    });
  }

  setInterval(function() {
    fetch('/admin/node/' + nodeId + '/stats/live').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { if (d) updateCards(d); }).catch(function() {});
  }, POLL);
})();
