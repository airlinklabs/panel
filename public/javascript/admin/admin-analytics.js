(function () {
  var _rootStyle = getComputedStyle(document.documentElement);
  const ACTIVITY_PERIOD_DAYS = 30;
  const BAR_HIGH_THRESHOLD = 90;
  const BAR_MEDIUM_THRESHOLD = 70;
  var BAR_COLOR_HIGH =
    _rootStyle.getPropertyValue("--theme-danger").trim() || "#ef4444";
  var BAR_COLOR_MEDIUM =
    _rootStyle.getPropertyValue("--theme-warning").trim() || "#f97316";
  var BAR_COLOR_LOW =
    _rootStyle.getPropertyValue("--theme-info").trim() || "#3b82f6";
  const CHART_BORDER_RADIUS = 4;
  const MAX_TICKS = 10;

  let analyticsData = null;
  let loginChart = null;
  let activityChart = null;
  let systemChart = null;
  let logPage = 1;
  let sysPage = 1;
  const isOwner = document.getElementById("tab-system") !== null;

  const isDark = () => document.documentElement.classList.contains("dark");
  const textColor = () =>
    isDark() ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";
  const gridColor = () =>
    isDark() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

  function fmt(n) {
    return n.toLocaleString();
  }

  function severityColor(s) {
    if (s === "critical")
      return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20";
    if (s === "error")
      return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20";
    if (s === "warning")
      return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20";
    return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20";
  }

  function categoryBadge(c) {
    const map = {
      user_action:
        "text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 border-neutral-200 dark:border-white/10",
      security:
        "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20",
      system_error:
        "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",
      server_lifecycle:
        "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20",
    };
    return (
      map[c] ||
      "text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 border-neutral-200 dark:border-white/10"
    );
  }

  function bar(label, value, max) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const color =
      pct >= BAR_HIGH_THRESHOLD
        ? BAR_COLOR_HIGH
        : pct >= BAR_MEDIUM_THRESHOLD
          ? BAR_COLOR_MEDIUM
          : BAR_COLOR_LOW;
    const label2 = max > 0 ? pct + "%" : "—";
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
    document.getElementById("sv-total").textContent = fmt(s.total);
    document.getElementById("sv-ram").textContent =
      s.totalRamMb >= 1024
        ? (s.totalRamMb / 1024).toFixed(1) + " GB"
        : s.totalRamMb + " MB";
    document.getElementById("sv-cpu").textContent = s.totalCpuPct + "%";
    document.getElementById("sv-storage").textContent =
      s.totalStorageGb + " GB";

    const suspLabel = document.getElementById("sv-suspended-label");
    if (s.suspended > 0) {
      suspLabel.textContent = s.suspended + " suspended";
      suspLabel.className = "text-xs text-amber-600 dark:text-amber-400 mt-1";
    } else {
      suspLabel.textContent = "none suspended";
      suspLabel.className = "text-xs text-neutral-500 mt-1";
    }

    const imgEl = document.getElementById("sv-images");
    if (s.topImages.length) {
      const maxCount = s.topImages[0].count;
      imgEl.innerHTML = s.topImages
        .map((i) => bar(i.name || "Unknown", i.count, maxCount))
        .join("");
    } else {
      imgEl.innerHTML =
        '<p class="text-sm text-neutral-400">No servers yet.</p>';
    }

    const heavyEl = document.getElementById("sv-heavy");
    heavyEl.innerHTML =
      s.topServers
        .map(
          (sv) => `
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
        ${sv.suspended ? '<span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">Suspended</span>' : ""}
      </div>`,
        )
        .join("") ||
      '<p class="px-5 py-4 text-sm text-neutral-400">No servers.</p>';
  }

  function renderNodes(d) {
    const nodes = d.nodes;
    const online = nodes.filter((n) => n.online).length;
    const offline = nodes.filter((n) => !n.online).length;
    document.getElementById("nd-total").textContent = fmt(nodes.length);
    document.getElementById("nd-online").textContent = fmt(online);
    document.getElementById("nd-offline").textContent = fmt(offline);

    const listEl = document.getElementById("nd-list");
    if (!nodes.length) {
      listEl.innerHTML =
        '<p class="text-sm text-neutral-400">No nodes configured.</p>';
      return;
    }
    listEl.innerHTML = nodes
      .map(
        (n) => `
      <div class="rounded-xl bg-neutral-50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-white/5 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full ${n.online ? "bg-emerald-500" : "bg-red-500"} shrink-0"></span>
            <div>
              <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.name}</p>
              <p class="text-xs text-neutral-400 font-mono">${n.address}:${n.port}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 text-xs text-neutral-500">
            ${n.online && n.versionRelease ? `<span class="font-mono bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 px-2 py-0.5 rounded-md">${n.versionRelease}</span>` : ""}
            <span>${n.serverCount} server${n.serverCount !== 1 ? "s" : ""}</span>
            <span class="px-2 py-0.5 rounded-md text-xs font-medium ${n.online ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20"}">${n.online ? "Online" : "Offline"}</span>
          </div>
        </div>
        ${
          n.ram > 0 || n.cpu > 0 || n.disk > 0
            ? `
        <div class="grid grid-cols-3 gap-4">
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">RAM limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.ram >= 1024 ? (n.ram / 1024).toFixed(1) + " GB" : n.ram + " MB"}</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">CPU limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.cpu}%</p>
          </div>
          <div>
            <p class="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Disk limit</p>
            <p class="text-sm font-medium text-neutral-800 dark:text-white">${n.disk} GB</p>
          </div>
        </div>`
            : '<p class="text-xs text-neutral-400">No capacity limits configured for this node.</p>'
        }
      </div>`,
      )
      .join("");
  }

  function renderActivity(d) {
    const a = d.activity;
    const totalLogins = Object.values(a.loginsByDay).reduce((s, v) => s + v, 0);
    const avgPerDay = Math.round(totalLogins / ACTIVITY_PERIOD_DAYS);

    document.getElementById("ac-users").textContent = fmt(a.totalUsers);
    document.getElementById("ac-images").textContent = fmt(a.totalImages);
    document.getElementById("ac-logins").textContent = fmt(totalLogins);
    document.getElementById("ac-avg").textContent = fmt(avgPerDay);
    document.getElementById("ac-admins-label").textContent =
      a.adminCount + " admin" + (a.adminCount !== 1 ? "s" : "");

    const labels = Object.keys(a.loginsByDay).map((d) => d.slice(5));
    const values = Object.values(a.loginsByDay);

    if (loginChart) loginChart.destroy();
    loginChart = new Chart(document.getElementById("loginChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: "rgba(59,130,246,0.5)",
            borderColor:
              _rootStyle.getPropertyValue("--theme-info").trim() || "#3b82f6",
            borderWidth: 1,
            borderRadius: CHART_BORDER_RADIUS,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: gridColor() },
            ticks: { color: textColor(), maxTicksLimit: MAX_TICKS },
          },
          y: {
            grid: { color: gridColor() },
            ticks: { color: textColor(), stepSize: 1 },
            min: 0,
          },
        },
      },
    });

    const tbody = document.getElementById("ac-logins-table");
    tbody.innerHTML =
      (a.recentLogins || [])
        .map(
          (l) => `
      <tr class="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition">
        <td class="px-5 py-3 text-xs font-mono text-neutral-500">#${l.userId}</td>
        <td class="px-5 py-3 text-xs font-mono text-neutral-600 dark:text-neutral-400">${l.ipAddress || "Unknown"}</td>
        <td class="px-5 py-3 text-xs text-neutral-500">${new Date(l.timestamp).toLocaleString()}</td>
      </tr>`,
        )
        .join("") ||
      '<tr><td colspan="3" class="px-5 py-5 text-center text-sm text-neutral-400">No login history.</td></tr>';
  }

  // ── Activity Logs ──────────────────────────────────────────────────────────

  async function loadActivityLogsSummary() {
    try {
      const res = await fetch("/api/v2/admin/activity-logs/summary");
      if (!res.ok) return;
      const body = await res.json();
      const d = body.data;

      document.getElementById("log-total").textContent = fmt(d.total);
      document.getElementById("log-24h").textContent = fmt(d.last24h);
      document.getElementById("log-7d").textContent = fmt(d.last7d);
      document.getElementById("log-categories").textContent = fmt(
        d.byCategory.length,
      );

      // Events over time chart
      if (activityChart) activityChart.destroy();
      const dayLabels = d.byDay.map((r) => r.date.slice(5));
      const dayValues = d.byDay.map((r) => r.count);
      activityChart = new Chart(document.getElementById("activityChart"), {
        type: "line",
        data: {
          labels: dayLabels,
          datasets: [
            {
              data: dayValues,
              borderColor:
                _rootStyle.getPropertyValue("--theme-info").trim() || "#3b82f6",
              backgroundColor: "rgba(59,130,246,0.1)",
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 0,
              pointHitRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { color: gridColor() },
              ticks: { color: textColor(), maxTicksLimit: MAX_TICKS },
            },
            y: {
              grid: { color: gridColor() },
              ticks: { color: textColor(), stepSize: 1 },
              min: 0,
            },
          },
        },
      });
    } catch {
      /* ignore */
    }
  }

  async function loadActivityLogs() {
    const category =
      document.getElementById("log-filter-category")?.value || "";
    const severity =
      document.getElementById("log-filter-severity")?.value || "";
    const search = document.getElementById("log-filter-search")?.value || "";

    const params = new URLSearchParams({
      page: String(logPage),
      perPage: "25",
    });
    if (category) params.set("category", category);
    if (severity) params.set("severity", severity);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/v2/admin/activity-logs?${params}`);
      if (!res.ok) return;
      const body = await res.json();
      const logs = body.data || [];
      const meta = body.meta;

      const tbody = document.getElementById("log-feed-table");
      if (!logs.length) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="px-5 py-5 text-center text-sm text-neutral-400">No activity logs found.</td></tr>';
        return;
      }

      tbody.innerHTML = logs
        .map(
          (l) => `
        <tr class="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition">
          <td class="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">${new Date(l.createdAt).toLocaleString()}</td>
          <td class="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400">${l.actor ? l.actor.username || l.actor.email || "#" + l.actor.id : "System"}</td>
          <td class="px-4 py-3 text-xs font-mono text-neutral-700 dark:text-neutral-300">${l.event}</td>
          <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-md border ${categoryBadge(l.category)}">${l.category}</span></td>
          <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-md border ${severityColor(l.severity)}">${l.severity}</span></td>
          <td class="px-4 py-3 text-xs font-mono text-neutral-500">${l.ip || "—"}</td>
        </tr>
      `,
        )
        .join("");

      // Pagination
      const pag = document.getElementById("log-pagination");
      if (meta && meta.last_page > 1) {
        pag.innerHTML = `
          <span class="text-xs text-neutral-500">Page ${meta.current_page} of ${meta.last_page} (${meta.total} total)</span>
          <div class="flex gap-2">
            <button id="log-prev" class="al-btn-secondary text-xs px-3 py-1" ${meta.current_page <= 1 ? "disabled" : ""}>Previous</button>
            <button id="log-next" class="al-btn-secondary text-xs px-3 py-1" ${meta.current_page >= meta.last_page ? "disabled" : ""}>Next</button>
          </div>`;
        document.getElementById("log-prev")?.addEventListener("click", () => {
          logPage = Math.max(1, logPage - 1);
          loadActivityLogs();
        });
        document.getElementById("log-next")?.addEventListener("click", () => {
          logPage = Math.min(meta.last_page, logPage + 1);
          loadActivityLogs();
        });
      } else {
        pag.innerHTML = `<span class="text-xs text-neutral-500">${meta?.total || 0} total</span><span></span>`;
      }
    } catch {
      /* ignore */
    }
  }

  // ── System Logs ────────────────────────────────────────────────────────────

  async function loadSystemLogsSummary() {
    if (!isOwner) return;
    try {
      const res = await fetch("/api/v2/admin/system-logs/summary");
      if (!res.ok) return;
      const body = await res.json();
      const d = body.data;

      document.getElementById("sys-total").textContent = fmt(d.total);
      document.getElementById("sys-24h").textContent = fmt(d.last24h);
      document.getElementById("sys-components").textContent = fmt(
        d.byComponent.length,
      );

      // Severity donut chart
      if (systemChart) systemChart.destroy();
      const labels = d.bySeverity.map((r) => r.severity);
      const values = d.bySeverity.map((r) => r.count);
      const colors = labels.map((s) => {
        if (s === "critical") return "#ef4444";
        if (s === "error") return "#f97316";
        if (s === "warning") return "#eab308";
        return "#3b82f6";
      });
      systemChart = new Chart(document.getElementById("systemChart"), {
        type: "doughnut",
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: { color: textColor(), padding: 12 },
            },
          },
        },
      });
    } catch {
      /* ignore */
    }
  }

  async function loadSystemLogs() {
    if (!isOwner) return;
    const severity =
      document.getElementById("sys-filter-severity")?.value || "";
    const component =
      document.getElementById("sys-filter-component")?.value || "";
    const search = document.getElementById("sys-filter-search")?.value || "";

    const params = new URLSearchParams({
      page: String(sysPage),
      perPage: "25",
    });
    if (severity) params.set("severity", severity);
    if (component) params.set("component", component);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/v2/admin/system-logs?${params}`);
      if (!res.ok) return;
      const body = await res.json();
      const logs = body.data || [];
      const meta = body.meta;

      const tbody = document.getElementById("sys-log-table");
      if (!logs.length) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="px-5 py-5 text-center text-sm text-neutral-400">No system logs found.</td></tr>';
        return;
      }

      tbody.innerHTML = logs
        .map(
          (l) => `
        <tr class="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition">
          <td class="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">${new Date(l.createdAt).toLocaleString()}</td>
          <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-md border ${severityColor(l.severity)}">${l.severity}</span></td>
          <td class="px-4 py-3 text-xs font-mono text-neutral-600 dark:text-neutral-400">${l.component}</td>
          <td class="px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300 max-w-md truncate">${l.message}</td>
        </tr>
      `,
        )
        .join("");

      const pag = document.getElementById("sys-pagination");
      if (meta && meta.last_page > 1) {
        pag.innerHTML = `
          <span class="text-xs text-neutral-500">Page ${meta.current_page} of ${meta.last_page} (${meta.total} total)</span>
          <div class="flex gap-2">
            <button id="sys-prev" class="al-btn-secondary text-xs px-3 py-1" ${meta.current_page <= 1 ? "disabled" : ""}>Previous</button>
            <button id="sys-next" class="al-btn-secondary text-xs px-3 py-1" ${meta.current_page >= meta.last_page ? "disabled" : ""}>Next</button>
          </div>`;
        document.getElementById("sys-prev")?.addEventListener("click", () => {
          sysPage = Math.max(1, sysPage - 1);
          loadSystemLogs();
        });
        document.getElementById("sys-next")?.addEventListener("click", () => {
          sysPage = Math.min(meta.last_page, sysPage + 1);
          loadSystemLogs();
        });
      } else {
        pag.innerHTML = `<span class="text-xs text-neutral-500">${meta?.total || 0} total</span><span></span>`;
      }
    } catch {
      /* ignore */
    }
  }

  // ── Main load ──────────────────────────────────────────────────────────────

  async function load() {
    const icon = document.getElementById("refreshIcon");
    const loading = document.getElementById("loading-state");
    icon.classList.add("animate-spin");
    loading.classList.remove("hidden");

    try {
      const res = await fetch("/api/v2/admin/analytics/summary");
      if (!res.ok) throw new Error("Request failed");
      analyticsData = await res.json();

      loading.classList.add("hidden");

      renderServers(analyticsData);
      renderNodes(analyticsData);
      renderActivity(analyticsData);
      loadActivityLogsSummary();
      loadActivityLogs();
      loadSystemLogsSummary();
      loadSystemLogs();
      showToast("Analytics refreshed. Fresh data.", "success");
    } catch {
      loading.classList.add("hidden");
      showToast("Failed to load analytics", "error");
    } finally {
      icon.classList.remove("animate-spin");
    }
  }

  document.getElementById("refreshBtn").addEventListener("click", load);

  // Filter buttons
  document.getElementById("log-filter-apply")?.addEventListener("click", () => {
    logPage = 1;
    loadActivityLogs();
  });
  document.getElementById("sys-filter-apply")?.addEventListener("click", () => {
    sysPage = 1;
    loadSystemLogs();
  });

  // Auto-refresh every 30 seconds
  setInterval(load, 30000);

  load();
})();
