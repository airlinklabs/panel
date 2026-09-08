function adminSettings() {
  return {
    init() {
      var formAppearance = document.getElementById("form-appearance");
      if (formAppearance) {
        formAppearance
          .querySelectorAll('input[type="text"], input[type="number"]')
          .forEach((input) => {
            input.addEventListener("change", () => this.saveAppearance());
          });
        formAppearance
          .querySelectorAll('input[name="theme"]')
          .forEach((radio) => {
            radio.addEventListener("change", () => this.saveAppearance());
          });
      }
      var serversPanel = document.getElementById("panel-servers");
      if (serversPanel)
        serversPanel.querySelectorAll("input").forEach((input) => {
          input.addEventListener("change", () => this.saveServers());
        });
      var securityPanel = document.getElementById("panel-security");
      if (securityPanel)
        securityPanel.querySelectorAll("input").forEach((input) => {
          input.addEventListener("change", () => this.saveSecurity());
        });
      var featuresPanel = document.getElementById("panel-features");
      if (featuresPanel)
        featuresPanel.querySelectorAll("input").forEach((input) => {
          input.addEventListener("change", () => this.saveFeatures());
        });

      document
        .getElementById("banIpBtn")
        .addEventListener("click", async () => {
          const ip = document.getElementById("banIpInput").value.trim();
          if (!ip) return showToast("Enter an IP address", "error");
          const d = await window.api("/api/v2/admin/settings/ban-ip", "POST", {
            ip,
          });
          if (d && d.success) {
            document.getElementById("banIpInput").value = "";
            showToast("IP banned. Bye bye.", "success");
            this.addBanRow(ip);
          } else if (d) showToast(d.error || "Failed", "error");
        });

      document
        .getElementById("bannedIpList")
        .addEventListener("click", async (e) => {
          var btn = e.target.closest(".unban-btn");
          if (!btn) return;
          const d = await window.api(
            "/api/v2/admin/settings/unban-ip",
            "POST",
            { ip: btn.dataset.ip },
          );
          if (d && d.success) {
            showToast("IP unbanned. Welcome back.", "success");
            this.removeBanRow(btn);
          } else if (d) showToast(d.error || "Failed", "error");
        });

      document
        .getElementById("smtpTestBtn")
        .addEventListener("click", async () => {
          const btn = document.getElementById("smtpTestBtn"),
            result = document.getElementById("smtpTestResult"),
            orig = btn.innerHTML;
          btn.disabled = true;
          btn.textContent = "Testing\u2026";
          result.classList.add("hidden");
          try {
            const d = await fetch("/api/v2/admin/settings/smtp/test", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }).then((r) => r.json());
            result.classList.remove("hidden");
            result.textContent = d.success
              ? "Connection OK."
              : d.error || "Connection failed.";
            result.className =
              "px-5 pb-5 text-xs " +
              (d.success
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400");
          } catch {
            result.classList.remove("hidden");
            result.textContent = "Connection failed.";
            result.className =
              "px-5 pb-5 text-xs text-red-600 dark:text-red-400";
          } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
          }
        });

      document
        .getElementById("s3TestBtn")
        .addEventListener("click", async () => {
          const btn = document.getElementById("s3TestBtn"),
            result = document.getElementById("s3TestResult"),
            orig = btn.innerHTML;
          btn.disabled = true;
          btn.textContent = "Testing\u2026";
          result.classList.add("hidden");
          try {
            const d = await fetch("/api/v2/admin/settings/s3/test", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }).then((r) => r.json());
            result.classList.remove("hidden");
            result.textContent = d.success
              ? d.message || "Connection OK."
              : d.error || "Connection failed.";
            result.className =
              "px-5 pb-5 text-xs " +
              (d.success
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400");
          } catch {
            result.classList.remove("hidden");
            result.textContent = "Connection failed.";
            result.className =
              "px-5 pb-5 text-xs text-red-600 dark:text-red-400";
          } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
          }
        });

      document.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.addEventListener("change", function () {
          var group = document.querySelectorAll(
            'input[name="' + this.name + '"]',
          );
          group.forEach((r) => {
            var label = r.closest("label");
            if (!label) return;
            var ring = label.querySelector(".rounded-full.border-2"),
              dot = ring && ring.querySelector(".al-radio-dot-active");
            if (r.checked) {
              label.classList.add("al-radio-active");
              label.classList.remove(
                "border-neutral-200",
                "dark:border-neutral-600/30",
              );
              if (ring) {
                ring.classList.add("al-radio-ring-active");
                ring.classList.remove(
                  "border-neutral-300",
                  "dark:border-neutral-600",
                );
              }
              if (!dot && ring) {
                var d = document.createElement("span");
                d.className = "w-2.5 h-2.5 rounded-full al-radio-dot-active";
                ring.appendChild(d);
              }
            } else {
              label.classList.remove("al-radio-active");
              label.classList.add(
                "border-neutral-200",
                "dark:border-neutral-600/30",
              );
              if (ring) {
                ring.classList.remove("al-radio-ring-active");
                ring.classList.add(
                  "border-neutral-300",
                  "dark:border-neutral-600",
                );
              }
              if (dot) dot.remove();
            }
          });
        });
      });
    },

    showSaved() {
      var el = document.getElementById("autosave-indicator");
      if (!el) return;
      el.style.opacity = "1";
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => {
        el.style.opacity = "0";
      }, 2000);
    },

    async post(url, body) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || "Failed");
        this.showSaved();
        return d;
      } catch (err) {
        showToast(err.message || "Failed", "error");
        return false;
      }
    },

    applyThemeCss(value) {
      var link = document.getElementById("theme-css");
      if (
        value &&
        value !== "default" &&
        value !== "light" &&
        value !== "dark"
      ) {
        if (!link) {
          link = document.createElement("link");
          link.rel = "stylesheet";
          link.id = "theme-css";
          document.head.appendChild(link);
        }
        try {
          var _u = new URL(value, window.location.origin);
          if (_u.protocol === "https:" || _u.protocol === "http:")
            link.href = _u.href;
        } catch (_e) {}
      } else if (link) link.parentNode.removeChild(link);
    },

    applyThemeFromForm() {
      var formAppearance = document.getElementById("form-appearance");
      if (!formAppearance) return;
      var checked = formAppearance.querySelector('input[name="theme"]:checked'),
        value = checked ? checked.value : "dark";
      this.applyThemeCss(value);
      var isLightTheme =
        value === "light" || (value && value.indexOf("light") !== -1);
      if (isLightTheme) document.documentElement.classList.remove("dark");
      else document.documentElement.classList.add("dark");
      if (window.applyThemeSheets) window.applyThemeSheets();
    },

    applyWallpaperFromResponse(url) {
      var layer = document.getElementById("al-wallpaper-layer"),
        body = document.body;
      if (url) {
        body.classList.add("al-wallpaper");
        body.style.setProperty("--al-wallpaper-image", "url('" + url + "')");
        if (!layer) {
          layer = document.createElement("div");
          layer.id = "al-wallpaper-layer";
          layer.setAttribute("aria-hidden", "true");
          document.body.insertBefore(layer, document.body.firstChild);
        }
      } else {
        body.classList.remove("al-wallpaper");
        body.style.removeProperty("--al-wallpaper-image");
        if (layer) layer.parentNode.removeChild(layer);
      }
    },

    async saveAppearance() {
      var formAppearance = document.getElementById("form-appearance");
      if (!formAppearance) return;
      var fd = new FormData();
      var titleInput = formAppearance.querySelector('input[name="title"]');
      if (titleInput) fd.set("title", titleInput.value);
      var themeRadio = formAppearance.querySelector(
        'input[name="theme"]:checked',
      );
      if (themeRadio) fd.set("theme", themeRadio.value);
      [
        "logo-input",
        "favicon-input",
        "theme-file-input",
        "login-wallpaper-file",
        "register-wallpaper-file",
        "panel-wallpaper-file",
      ].forEach((id) => {
        var el = document.getElementById(id);
        if (el && el._selectedFile) fd.set(el.name, el._selectedFile);
      });
      [
        "login-wallpaper-url",
        "register-wallpaper-url",
        "panel-wallpaper-url",
      ].forEach((id) => {
        var el = document.getElementById(id);
        if (el) fd.set(el.name, el.value);
      });
      const ok = await this.post("/api/v2/admin/settings/general", fd);
      if (ok) {
        this.applyThemeFromForm();
        this.applyWallpaperFromResponse(ok.panelWallpaper);
      }
    },

    saveServers() {
      var stepsJson = document.getElementById("onboardingStepsJson");
      this.post("/api/v2/admin/settings/server-policy", {
        allowUserCreateServer: document.getElementById("allowUserCreateServer")
          .checked,
        allowUserDeleteServer: document.getElementById("allowUserDeleteServer")
          .checked,
        allowUserCreateImages: document.getElementById("allowUserCreateImages")
          .checked,
        onboardingEnabled: document.getElementById("onboardingEnabled").checked,
        onboardingSteps: stepsJson ? stepsJson.value : "[]",
        defaultServerLimit:
          parseInt(document.getElementById("defaultServerLimit").value, 10) ||
          0,
        defaultMaxMemory:
          parseInt(document.getElementById("defaultMaxMemory").value, 10) || 0,
        defaultMaxCpu:
          parseInt(document.getElementById("defaultMaxCpu").value, 10) || 0,
        defaultMaxStorage:
          parseInt(document.getElementById("defaultMaxStorage").value, 10) || 0,
        defaultMaxDatabases:
          parseInt(document.getElementById("defaultMaxDatabases").value, 10) ||
          0,
        defaultOverallocateMemory:
          parseInt(
            document.getElementById("defaultOverallocateMemory").value,
            10,
          ) || 0,
        defaultOverallocateDisk:
          parseInt(
            document.getElementById("defaultOverallocateDisk").value,
            10,
          ) || 0,
        defaultOverallocateCpu:
          parseInt(
            document.getElementById("defaultOverallocateCpu").value,
            10,
          ) || 0,
        uploadLimit:
          parseInt(document.getElementById("uploadLimitInput").value, 10) ||
          100,
      });
    },

    saveSecurity() {
      Promise.all([
        this.post("/api/v2/admin/settings/security", {
          rateLimitEnabled: document.getElementById("rateLimitEnabled").checked,
          rateLimitRpm:
            parseInt(document.getElementById("rateLimitRpm").value, 10) || 0,
          loginMaxAttempts:
            parseInt(document.getElementById("loginMaxAttempts").value, 10) ||
            0,
          loginLockoutMinutes:
            parseInt(
              document.getElementById("loginLockoutMinutes").value,
              10,
            ) || 0,
          enforceDaemonHttps:
            document.getElementById("enforceDaemonHttps").checked,
          require2faForAdmins: document.getElementById("require2faForAdmins")
            .checked,
          behindReverseProxy:
            document.getElementById("behindReverseProxy").checked,
          hashApiKeys: document.getElementById("hashApiKeys").checked,
          virusTotalApiKey:
            document.getElementById("vtKeyInput").value.trim() || null,
        }),
        this.post(
          "/api/v2/admin/settings/general",
          (() => {
            var fd = new FormData();
            var reg = document.getElementById("allowRegistration");
            fd.set("allowRegistration", reg && reg.checked ? "true" : "false");
            return fd;
          })(),
        ),
        this.post("/api/v2/admin/settings/smtp", {
          smtpHost: document.getElementById("smtpHost").value.trim() || null,
          smtpPort:
            parseInt(document.getElementById("smtpPort").value, 10) || 587,
          smtpUser: document.getElementById("smtpUser").value.trim() || null,
          smtpPassword: document.getElementById("smtpPassword").value || null,
          smtpFrom: document.getElementById("smtpFrom").value.trim() || null,
          smtpSecure: document.getElementById("smtpSecure").checked,
          emailCooldown:
            parseInt(document.getElementById("emailCooldown").value, 10) || 0,
        }),
        this.post("/api/v2/admin/settings/s3", {
          s3Enabled: document.getElementById("s3Enabled").checked,
          s3Endpoint:
            document.getElementById("s3Endpoint").value.trim() || null,
          s3Region: document.getElementById("s3Region").value.trim() || null,
          s3Bucket: document.getElementById("s3Bucket").value.trim() || null,
          s3AccessKey:
            document.getElementById("s3AccessKey").value.trim() || null,
          s3SecretKey: document.getElementById("s3SecretKey").value || null,
          s3PathStyle: document.getElementById("s3PathStyle").checked,
        }),
      ]);
    },

    saveFeatures() {
      this.post("/api/v2/admin/settings/features", {
        twoFactorRequired: document.getElementById("twoFactorRequired").checked,
        sftpEnabled: document.getElementById("sftpEnabled").checked,
        backupsEnabled: document.getElementById("backupsEnabled").checked,
        schedulesEnabled: document.getElementById("schedulesEnabled").checked,
        databasesEnabled: document.getElementById("databasesEnabled").checked,
        fileManagerEnabled:
          document.getElementById("fileManagerEnabled").checked,
        consoleEnabled: document.getElementById("consoleEnabled").checked,
        playerTrackingEnabled: document.getElementById("playerTrackingEnabled")
          .checked,
        scannerEnabled: document.getElementById("scannerEnabled").checked,
        airlinkCloudEnabled: document.getElementById("airlinkCloudEnabled")
          .checked,
      });
      this.post("/api/v2/admin/settings/server-policy", {
        defaultMemory:
          parseInt(document.getElementById("featureDefaultMemory").value, 10) ||
          512,
        defaultCpu:
          parseInt(document.getElementById("featureDefaultCpu").value, 10) ||
          100,
        defaultDisk:
          parseInt(document.getElementById("featureDefaultDisk").value, 10) ||
          5120,
        maxServersPerUser:
          parseInt(document.getElementById("maxServersPerUser").value, 10) ||
          10,
      });
    },

    banRowHtml(ip) {
      return (
        '<div class="flex items-center justify-between rounded-xl bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 px-4 py-2.5"><span class="text-sm font-mono text-neutral-700 dark:text-neutral-300">' +
        window.escHtml(ip) +
        '</span><button type="button" class="unban-btn text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition inline-flex items-center gap-1.5" data-ip="' +
        window.escAttr(ip) +
        '">' +
        (window.alIcon
          ? window.alIcon("shield-check", "size-3", { strokeWidth: 1.5 })
          : "") +
        "Unban</button></div>"
      );
    },

    addBanRow(ip) {
      var list = document.getElementById("bannedIpList");
      if (!list) return;
      var hasEmpty = Array.prototype.some.call(
        list.children,
        (child) => child.tagName === "P",
      );
      if (hasEmpty)
        Array.prototype.forEach.call(list.children, (child) => {
          if (child.tagName === "P") child.parentNode.removeChild(child);
        });
      al.addRow(list, this.banRowHtml(ip));
    },

    removeBanRow(btn) {
      var row = btn.closest(".flex.items-center.justify-between");
      if (!row) return;
      var list = document.getElementById("bannedIpList");
      al.removeRow(row).then(() => {
        if (list && !list.querySelector(".unban-btn")) {
          var p = document.createElement("p");
          p.className = "text-sm text-neutral-400";
          p.textContent = "No banned IPs.";
          list.appendChild(p);
        }
      });
    },
  };
}

/* Onboarding step builder */
var onbSteps = [];
try {
  onbSteps = JSON.parse(
    document.getElementById("onboardingStepsJson").value || "[]",
  );
} catch (e) {
  onbSteps = [];
}

function syncOnbJson() {
  var ta = document.getElementById("onboardingStepsJson");
  if (ta) ta.value = JSON.stringify(onbSteps);
}

function renderOnbStepList() {
  var list = document.getElementById("onboardingStepList");
  if (!list) return;
  list.innerHTML = "";
  onbSteps.forEach(function (step, i) {
    var card = document.createElement("div");
    card.className = "rounded-xl p-3 mb-2";
    card.style.cssText =
      "background:var(--theme-bg-secondary);border:1px solid var(--theme-border)";
    card.innerHTML =
      '<div class="flex items-center justify-between mb-2">' +
      '<span class="text-xs font-medium" style="color:var(--theme-text-muted)">Step ' +
      (i + 1) +
      "</span>" +
      '<div class="flex gap-1">' +
      (i > 0
        ? '<button type="button" class="al-btn-ghost p-1 rounded" onclick="moveOnbStep(' +
          i +
          ',-1)" title="Move up">&uarr;</button>'
        : "") +
      (i < onbSteps.length - 1
        ? '<button type="button" class="al-btn-ghost p-1 rounded" onclick="moveOnbStep(' +
          i +
          ',1)" title="Move down">&darr;</button>'
        : "") +
      '<button type="button" class="al-btn-ghost p-1 rounded" onclick="removeOnbStep(' +
      i +
      ')" style="color:var(--theme-danger)" title="Remove">&times;</button>' +
      "</div>" +
      "</div>" +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
      '<div><label class="text-xs" style="color:var(--theme-text-muted)">Title</label>' +
      '<input type="text" class="al-input text-xs py-1.5" value="' +
      window.escAttr(step.title || "") +
      '" onchange="onbSteps[' +
      i +
      '].title=this.value;syncOnbJson()"></div>' +
      '<div><label class="text-xs" style="color:var(--theme-text-muted)">Icon (lucide name)</label>' +
      '<input type="text" class="al-input text-xs py-1.5" value="' +
      window.escAttr(step.icon || "") +
      '" placeholder="e.g. server, shield, zap" onchange="onbSteps[' +
      i +
      '].icon=this.value;syncOnbJson()"></div>' +
      '<div class="sm:col-span-2"><label class="text-xs" style="color:var(--theme-text-muted)">Description</label>' +
      '<textarea rows="2" class="al-input text-xs py-1.5" onchange="onbSteps[' +
      i +
      '].text=this.value;syncOnbJson()">' +
      window.escHtml(step.text || "") +
      "</textarea></div>" +
      '<div><label class="text-xs" style="color:var(--theme-text-muted)">CTA text (optional)</label>' +
      '<input type="text" class="al-input text-xs py-1.5" value="' +
      window.escAttr(step.cta || "") +
      '" placeholder="e.g. Get started" onchange="onbSteps[' +
      i +
      '].cta=this.value;syncOnbJson()"></div>' +
      '<div><label class="text-xs" style="color:var(--theme-text-muted)">CTA URL (optional)</label>' +
      '<input type="text" class="al-input text-xs py-1.5" value="' +
      window.escAttr(step.ctaUrl || "") +
      '" placeholder="e.g. /create-server" onchange="onbSteps[' +
      i +
      '].ctaUrl=this.value;syncOnbJson()"></div>' +
      "</div>";
    list.appendChild(card);
  });
  syncOnbJson();
}

function addOnbStep() {
  onbSteps.push({
    title: "",
    text: "",
    icon: "layout-dashboard",
    cta: "",
    ctaUrl: "",
  });
  renderOnbStepList();
}

function removeOnbStep(i) {
  onbSteps.splice(i, 1);
  renderOnbStepList();
}

function moveOnbStep(i, dir) {
  var j = i + dir;
  if (j < 0 || j >= onbSteps.length) return;
  var tmp = onbSteps[i];
  onbSteps[i] = onbSteps[j];
  onbSteps[j] = tmp;
  renderOnbStepList();
}

function previewOnboarding() {
  var steps =
    onbSteps.length > 0
      ? onbSteps
      : [
          {
            title: "Your dashboard",
            text: "This is where all your servers live.",
            icon: "layout-dashboard",
          },
          {
            title: "Create your first server",
            text: "Pick an image, choose a node, and allocate resources.",
            icon: "server",
          },
          {
            title: "Make it yours",
            text: "Set your avatar and profile in Account settings.",
            icon: "user",
          },
        ];
  var iconPaths = {
    "layout-dashboard":
      '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v-5H3z"/>',
    server:
      '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  };
  var cur = 0;
  function svgIcon(n) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--theme-text)">' +
      (iconPaths[n] || iconPaths["layout-dashboard"]) +
      "</svg>"
    );
  }

  var overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center p-4";
  overlay.style.cssText = "background:rgba(0,0,0,0.5)";
  var panel = document.createElement("div");
  panel.className = "rounded-2xl max-w-md w-full shadow-xl p-6";
  panel.style.cssText =
    "background:var(--theme-bg-card);border:1px solid var(--theme-border)";
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function renderPreview() {
    var s = steps[cur];
    var dots = steps
      .map(function (_, i) {
        return (
          '<div class="flex-1 h-1 rounded-full" style="background:' +
          (i <= cur ? "var(--theme-text)" : "var(--theme-border-subtle)") +
          '"></div>'
        );
      })
      .join("");
    var ctaHtml =
      s.cta && s.ctaUrl
        ? '<a href="' +
          s.ctaUrl +
          '" class="inline-flex items-center gap-1.5 mt-3 text-sm font-medium" style="color:var(--theme-text)">' +
          s.cta +
          " &rarr;</a>"
        : "";
    panel.innerHTML =
      '<div class="flex items-start justify-between mb-5"><div><h2 class="text-base font-semibold" style="color:var(--theme-text-strong)">Welcome to the panel!</h2><p class="text-xs mt-0.5" style="color:var(--theme-text-muted)">A few quick tips to get you started.</p></div><button type="button" class="al-btn-ghost p-2 rounded-lg" onclick="this.closest(\'.fixed\').remove()">&times;</button></div>' +
      '<div class="mb-5"><div class="flex gap-2 mb-4">' +
      dots +
      "</div>" +
      '<div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style="background:var(--theme-bg-secondary)">' +
      svgIcon(s.icon || "layout-dashboard") +
      "</div>" +
      '<h3 class="text-sm font-semibold mb-1.5" style="color:var(--theme-text-strong)">' +
      window.escHtml(s.title || "Untitled step") +
      "</h3>" +
      '<p class="text-sm leading-relaxed" style="color:var(--theme-text-muted)">' +
      window.escHtml(s.text || "") +
      "</p>" +
      ctaHtml +
      "</div>" +
      '<div class="flex items-center justify-between gap-3">' +
      '<button type="button" class="al-btn-ghost px-3 py-2 text-xs font-medium" ' +
      (cur === 0 ? 'style="visibility:hidden"' : "") +
      ' onclick="previewPrev()">&larr; Back</button>' +
      '<span class="flex-1"></span>' +
      (cur < steps.length - 1
        ? '<button type="button" class="al-btn-primary px-4 py-2 text-sm font-medium" onclick="previewNext()">Next &rarr;</button>'
        : '<button type="button" class="al-btn-primary px-4 py-2 text-sm font-medium" onclick="this.closest(\'.fixed\').remove()">Done</button>') +
      "</div>";
  }
  window.previewNext = function () {
    if (cur < steps.length - 1) {
      cur++;
      renderPreview();
    }
  };
  window.previewPrev = function () {
    if (cur > 0) {
      cur--;
      renderPreview();
    }
  };
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
  renderPreview();
}

/* Init step list on page load */
document.addEventListener("DOMContentLoaded", function () {
  renderOnbStepList();
});
