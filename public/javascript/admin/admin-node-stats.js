(function () {
  var isDark = function () {
    return document.documentElement.classList.contains("dark");
  };
  var rootStyle = getComputedStyle(document.documentElement);
  var TICK = rootStyle.getPropertyValue("--theme-text").trim() || "#fff";
  var GRID = "rgba(255,255,255,0.08)";
  var ACCENT = rootStyle.getPropertyValue("--theme-accent").trim() || "#3b82f6";
  var DANGER = rootStyle.getPropertyValue("--theme-danger").trim() || "#ef4444";
  var BAR_COLOR =
    rootStyle.getPropertyValue("--theme-text-strong").trim() || "#fafafa";

  var pd = document.getElementById("page-data");
  var nodeId = pd.dataset.nodeId;
  var allocatedRam = parseFloat(pd.dataset.ram) || 0;
  var allocatedCpu = parseFloat(pd.dataset.cpu) || 0;
  var allocatedDisk = parseFloat(pd.dataset.disk) || 0;
  var MAX_PTS = 30;

  function fmtBytes(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
    if (b >= 1048576) return (b / 1048576).toFixed(0) + " MB";
    return (b / 1024).toFixed(0) + " KB";
  }
  function fmtMB(mb) {
    return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb.toFixed(0) + " MB";
  }
  function pctColor(p) {
    return p >= 90 ? DANGER : BAR_COLOR;
  }

  function setBar(id, pct, text) {
    var bar = document.getElementById(id + "-bar");
    var pctEl = document.getElementById(id + "-pct");
    var textEl = document.getElementById(id + "-text");
    var c = pctColor(pct);
    if (bar) {
      bar.style.width = Math.min(pct, 100) + "%";
      bar.style.background = c;
    }
    if (pctEl) {
      pctEl.textContent = pct.toFixed(1) + "%";
      pctEl.style.color = c;
    }
    if (textEl) textEl.textContent = text;
  }

  function timeNow() {
    return new Date().toLocaleTimeString();
  }
  function el(id) {
    return document.getElementById(id);
  }
  function setText(id, text) {
    var e = el(id);
    if (e) e.textContent = text;
  }

  var textColor = function () {
    return isDark() ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";
  };
  var gridColor = function () {
    return isDark() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  };

  var ramChart = new Chart(el("ramChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "RAM (MB)",
          data: [],
          borderColor: ACCENT,
          backgroundColor: ACCENT + "33",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: textColor(), maxTicksLimit: 8, maxRotation: 0 },
          grid: { color: gridColor() },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor() },
          grid: { color: gridColor() },
          title: { display: true, text: "MB", color: textColor() },
        },
      },
    },
  });

  var cpuChart = new Chart(el("cpuChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "CPU (%)",
          data: [],
          borderColor: "#f97316",
          backgroundColor: "#f9731633",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: textColor(), maxTicksLimit: 8, maxRotation: 0 },
          grid: { color: gridColor() },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: { color: textColor() },
          grid: { color: gridColor() },
          title: { display: true, text: "%", color: textColor() },
        },
      },
    },
  });

  function pushChart(chart, value) {
    chart.data.labels.push(timeNow());
    chart.data.datasets[0].data.push(value);
    if (chart.data.labels.length > MAX_PTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update("none");
  }

  function fmtUptime(s) {
    if (typeof s === "string") return s;
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var parts = [];
    if (d) parts.push(d + "d");
    if (h) parts.push(h + "h");
    if (m || !parts.length) parts.push(m + "m");
    return parts.join(" ");
  }

  function handleData(d) {
    var h = d.host || {};
    var ts = (d.stats || {}).totalStats || [];
    var uptime =
      (d.stats || {}).uptime || (h.uptime ? fmtUptime(h.uptime) : "--");
    var latest = d.current || (ts.length ? ts[ts.length - 1] : null);

    if (h.ram) {
      setText("host-ram", (h.ram.used / 1073741824).toFixed(1) + " GB");
      setText(
        "host-ram-detail",
        "of " + (h.ram.total / 1073741824).toFixed(1) + " GB",
      );
    }
    if (latest) {
      var cpuPct = parseFloat(latest.Cores.replace("%", ""));
      setText("host-cpu", cpuPct.toFixed(1) + "%");
      setText("host-cpu-detail", (h.cpu ? h.cpu.cores : "--") + " cores");
    }
    if (h.disk && h.disk.total > 0) {
      setText("host-disk", fmtBytes(h.disk.used));
      setText("host-disk-detail", "of " + fmtBytes(h.disk.total));
    }
    if (uptime) setText("host-uptime", uptime);

    if (allocatedRam > 0 && h.ram) {
      var usedMB = h.ram.used / 1048576;
      var allocMB = allocatedRam * 1024;
      setBar(
        "alloc-ram",
        (usedMB / allocMB) * 100,
        fmtMB(usedMB) + " / " + fmtMB(allocMB),
      );
    } else if (h.ram) {
      setBar(
        "alloc-ram",
        (h.ram.used / h.ram.total) * 100,
        fmtBytes(h.ram.used) + " / " + fmtBytes(h.ram.total),
      );
    }
    if (latest && allocatedCpu > 0) {
      var cv = parseFloat(latest.Cores.replace("%", ""));
      setBar("alloc-cpu", cv, cv.toFixed(1) + "% of " + allocatedCpu + "%");
    }
    if (h.disk && h.disk.total > 0 && allocatedDisk > 0) {
      var duGB = h.disk.used / 1073741824;
      setBar(
        "alloc-disk",
        (duGB / allocatedDisk) * 100,
        duGB.toFixed(1) + " GB / " + allocatedDisk + " GB",
      );
    } else if (h.disk && h.disk.total > 0) {
      setBar(
        "alloc-disk",
        (h.disk.used / h.disk.total) * 100,
        fmtBytes(h.disk.used) + " / " + fmtBytes(h.disk.total),
      );
    }

    if (d.instances !== undefined) setText("count-instances", d.instances);
    if (d.allocationsInUse !== undefined)
      setText("count-alloc", d.allocationsInUse + "/" + d.allocations);

    if (latest) {
      pushChart(ramChart, parseFloat(latest.Ram.replace(" MB", "")));
      pushChart(cpuChart, parseFloat(latest.Cores.replace("%", "")));
    }
  }

  // Initial render from server-side data
  var initHost = {};
  var initStats = [];
  try {
    initHost = JSON.parse(pd.dataset.host || "{}");
  } catch (_) {}
  try {
    initStats = JSON.parse(pd.dataset.stats || "[]");
  } catch (_) {}

  if (initStats.length || Object.keys(initHost).length) {
    handleData({
      host: initHost,
      stats: { totalStats: initStats, uptime: "--" },
      current: initStats.length ? initStats[initStats.length - 1] : null,
      instances: parseInt(pd.dataset.instances) || 0,
      allocations: parseInt(pd.dataset.allocations) || 0,
      allocationsInUse: parseInt(pd.dataset.allocationsInUse) || 0,
    });
  }

  // WebSocket for live updates
  function connect() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var ws = new WebSocket(
      proto + "//" + location.host + "/ws/node/" + nodeId + "/stats",
    );

    ws.onmessage = function (evt) {
      try {
        var data = JSON.parse(evt.data);
        if (data.event === "nodestats" && data.data) {
          handleData(data.data);
        }
      } catch (_) {}
    };

    ws.onclose = function () {
      setTimeout(connect, 3000);
    };

    ws.onerror = function () {
      ws.close();
    };
  }

  connect();
})();
