/* V2 API Client — typed wrapper around fetch for /api/v2 endpoints.

   Usage:
     Api.servers.list()
     Api.servers.get('uuid')
     Api.admin.users.list({ page: 1 })

   Returns parsed JSON on success, or null after showing a toast.
   CSRF is injected globally by csrf.js. */
(function () {
  if (window.Api) return;

  var BASE = "/api/v2";

  function api(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || "GET",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        opts.headers || {},
      ),
      body: opts.body ? opts.body : undefined,
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok) {
              var e = new Error(data.error || data.message || "Request failed");
              e.status = res.status;
              throw e;
            }
            return data;
          });
      })
      .catch(function (err) {
        var message =
          err && err.status ? err.message : "Request failed. Try again?";
        if (window.showToast) showToast(message, "error");
        return null;
      });
  }

  function qs(params) {
    return params ? "?" + new URLSearchParams(params).toString() : "";
  }

  function post(url, data) {
    return api(url, { method: "POST", body: JSON.stringify(data) });
  }

  function patch(url, data) {
    return api(url, { method: "PATCH", body: JSON.stringify(data) });
  }

  function put(url, data) {
    return api(url, { method: "PUT", body: JSON.stringify(data) });
  }

  function del(url) {
    return api(url, { method: "DELETE" });
  }

  window.Api = {
    // ── Auth: Passkeys ──────────────────────────────────────────────────────
    passkey: {
      authOptions: function () {
        return post(BASE + "/passkey/auth/options");
      },
      authVerify: function (data) {
        return post(BASE + "/passkey/auth/verify", data);
      },
      registerOptions: function (data) {
        return post(BASE + "/passkey/register/options", data);
      },
      registerVerify: function (data) {
        return post(BASE + "/passkey/register/verify", data);
      },
      list: function () {
        return api(BASE + "/account/passkey");
      },
      delete: function (id) {
        return del(BASE + "/account/passkey/" + encodeURIComponent(id));
      },
    },

    // ── Account ─────────────────────────────────────────────────────────────
    account: {
      get: function () {
        return api(BASE + "/account");
      },
      updateUsername: function (data) {
        return patch(BASE + "/account/username", data);
      },
      updateEmail: function (data) {
        return patch(BASE + "/account/email", data);
      },
      updatePassword: function (data) {
        return patch(BASE + "/account/password", data);
      },
      updateDescription: function (data) {
        return patch(BASE + "/account/description", data);
      },
      updatePreferredNode: function (data) {
        return patch(BASE + "/account/preferred-node", data);
      },
      updateLanguage: function (data) {
        return patch(BASE + "/account/language", data);
      },
      deleteAvatar: function () {
        return del(BASE + "/account/avatar");
      },
      twoFaSetup: function () {
        return api(BASE + "/account/2fa/setup");
      },
      twoFaEnable: function (data) {
        return post(BASE + "/account/2fa/enable", data);
      },
      twoFaDisable: function (data) {
        return post(BASE + "/account/2fa/disable", data);
      },
    },

    // ── Servers ─────────────────────────────────────────────────────────────
    servers: {
      list: function (params) {
        return api(BASE + "/servers" + qs(params));
      },
      get: function (id) {
        return api(BASE + "/servers/" + encodeURIComponent(id));
      },
      update: function (id, data) {
        return patch(BASE + "/servers/" + encodeURIComponent(id), data);
      },
      delete: function (id) {
        return del(BASE + "/servers/" + encodeURIComponent(id));
      },
      power: function (id, action) {
        return post(BASE + "/servers/" + encodeURIComponent(id) + "/power", {
          action: action,
        });
      },
      reinstall: function (id) {
        return post(BASE + "/servers/" + encodeURIComponent(id) + "/reinstall");
      },
      status: function (id) {
        return api(BASE + "/servers/" + encodeURIComponent(id) + "/status");
      },
    },

    // ── Files (server-scoped) ───────────────────────────────────────────────
    files: {
      list: function (serverId, params) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/files" +
            qs(params),
        );
      },
      content: function (serverId, file) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/files/content?file=" +
            encodeURIComponent(file),
        );
      },
      write: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/content",
          data,
        );
      },
      delete: function (serverId, data) {
        return del(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files",
        );
      },
      rename: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/rename",
          data,
        );
      },
      mkdir: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/mkdir",
          data,
        );
      },
      copy: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/copy",
          data,
        );
      },
      zip: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/zip",
          data,
        );
      },
      unzip: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/unzip",
          data,
        );
      },
      pull: function (serverId) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/files/pull",
        );
      },
    },

    // ── Databases (server-scoped) ───────────────────────────────────────────
    databases: {
      list: function (serverId, params) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/databases" +
            qs(params),
        );
      },
      create: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/databases",
          data,
        );
      },
      delete: function (serverId, dbId) {
        return del(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/databases/" +
            encodeURIComponent(dbId),
        );
      },
      rotate: function (serverId, dbId) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/databases/" +
            encodeURIComponent(dbId) +
            "/rotate",
        );
      },
    },

    // ── Backups (server-scoped) ─────────────────────────────────────────────
    backups: {
      list: function (serverId, params) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups" +
            qs(params),
        );
      },
      create: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/backups",
          data,
        );
      },
      delete: function (serverId, backupId) {
        return del(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups/" +
            encodeURIComponent(backupId),
        );
      },
      restore: function (serverId, backupId) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups/" +
            encodeURIComponent(backupId) +
            "/restore",
        );
      },
      toggleLock: function (serverId, backupId) {
        return patch(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups/" +
            encodeURIComponent(backupId) +
            "/lock",
        );
      },
      progress: function (serverId) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups/progress",
        );
      },
      restoreProgress: function (serverId) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/backups/restore/progress",
        );
      },
    },

    // ── Schedules (server-scoped) ───────────────────────────────────────────
    schedules: {
      list: function (serverId, params) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules" +
            qs(params),
        );
      },
      create: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/schedules",
          data,
        );
      },
      update: function (serverId, scheduleId, data) {
        return patch(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules/" +
            encodeURIComponent(scheduleId),
          data,
        );
      },
      delete: function (serverId, scheduleId) {
        return del(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules/" +
            encodeURIComponent(scheduleId),
        );
      },
      addTask: function (serverId, scheduleId, data) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules/" +
            encodeURIComponent(scheduleId) +
            "/tasks",
          data,
        );
      },
      removeTask: function (serverId, scheduleId, taskId) {
        return del(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules/" +
            encodeURIComponent(scheduleId) +
            "/tasks/" +
            encodeURIComponent(taskId),
        );
      },
      run: function (serverId, scheduleId) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/schedules/" +
            encodeURIComponent(scheduleId) +
            "/run",
        );
      },
    },

    // ── Sub-users (server-scoped) ───────────────────────────────────────────
    subusers: {
      list: function (serverId, params) {
        return api(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/subusers" +
            qs(params),
        );
      },
      add: function (serverId, data) {
        return post(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/subusers",
          data,
        );
      },
      update: function (serverId, subId, data) {
        return put(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/subusers/" +
            encodeURIComponent(subId),
          data,
        );
      },
      remove: function (serverId, subId) {
        return del(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/subusers/" +
            encodeURIComponent(subId),
        );
      },
    },

    // ── Startup (server-scoped) ─────────────────────────────────────────────
    startup: {
      get: function (serverId) {
        return api(
          BASE + "/servers/" + encodeURIComponent(serverId) + "/startup",
        );
      },
      saveCommand: function (serverId, data) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/startup/command",
          data,
        );
      },
      saveDockerImage: function (serverId, data) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/startup/docker-image",
          data,
        );
      },
      saveVariables: function (serverId, data) {
        return post(
          BASE +
            "/servers/" +
            encodeURIComponent(serverId) +
            "/startup/variables",
          data,
        );
      },
    },

    // ── System ──────────────────────────────────────────────────────────────
    system: {
      status: function () {
        return api(BASE + "/system/status");
      },
      health: function () {
        return api(BASE + "/system/health");
      },
      testNode: function (data) {
        return post(BASE + "/system/test-node", data);
      },
    },

    // ── Admin: Users ────────────────────────────────────────────────────────
    admin: {
      users: {
        list: function (params) {
          return api(BASE + "/admin/users" + qs(params));
        },
        get: function (id) {
          return api(BASE + "/admin/users/" + encodeURIComponent(id));
        },
        create: function (data) {
          return post(BASE + "/admin/users", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/users/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/users/" + encodeURIComponent(id));
        },
        transfer: function (id, data) {
          return post(
            BASE + "/admin/users/" + encodeURIComponent(id) + "/transfer",
            data,
          );
        },
      },

      // ── Admin: Servers ──────────────────────────────────────────────────
      servers: {
        list: function (params) {
          return api(BASE + "/admin/servers" + qs(params));
        },
        get: function (id) {
          return api(BASE + "/admin/servers/" + encodeURIComponent(id));
        },
        create: function (data) {
          return post(BASE + "/admin/servers", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/servers/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/servers/" + encodeURIComponent(id));
        },
        suspend: function (id) {
          return post(
            BASE + "/admin/servers/" + encodeURIComponent(id) + "/suspend",
          );
        },
        unsuspend: function (id) {
          return post(
            BASE + "/admin/servers/" + encodeURIComponent(id) + "/unsuspend",
          );
        },
        transfer: function (id, data) {
          return post(
            BASE + "/admin/servers/" + encodeURIComponent(id) + "/transfer",
            data,
          );
        },
        transferStatus: function (id) {
          return api(
            BASE +
              "/admin/servers/" +
              encodeURIComponent(id) +
              "/transfer/status",
          );
        },
      },

      // ── Admin: Nodes ────────────────────────────────────────────────────
      nodes: {
        list: function (params) {
          return api(BASE + "/admin/nodes" + qs(params));
        },
        listLight: function () {
          return api(BASE + "/admin/nodes/list");
        },
        get: function (id) {
          return api(BASE + "/admin/nodes/" + encodeURIComponent(id));
        },
        create: function (data) {
          return post(BASE + "/admin/nodes", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/nodes/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/nodes/" + encodeURIComponent(id));
        },
        verify: function (id) {
          return post(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/verify",
          );
        },
        toggleMaintenance: function (id) {
          return post(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/maintenance",
          );
        },
        configure: function (id) {
          return api(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/configure",
          );
        },
        stats: function (id) {
          return api(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/stats",
          );
        },
        allocations: function (id) {
          return api(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/allocations",
          );
        },
        addAllocation: function (id, data) {
          return post(
            BASE + "/admin/nodes/" + encodeURIComponent(id) + "/allocations",
            data,
          );
        },
        deleteAllocation: function (id, allocId) {
          return del(
            BASE +
              "/admin/nodes/" +
              encodeURIComponent(id) +
              "/allocations/" +
              encodeURIComponent(allocId),
          );
        },
      },

      // ── Admin: Settings ─────────────────────────────────────────────────
      settings: {
        get: function () {
          return api(BASE + "/admin/settings");
        },
        updateGeneral: function (data) {
          return patch(BASE + "/admin/settings/general", data);
        },
        updateSecurity: function (data) {
          return patch(BASE + "/admin/settings/security", data);
        },
        updateServerPolicy: function (data) {
          return patch(BASE + "/admin/settings/server-policy", data);
        },
        updateSmtp: function (data) {
          return patch(BASE + "/admin/settings/smtp", data);
        },
        testSmtp: function () {
          return post(BASE + "/admin/settings/smtp/test");
        },
        updateS3: function (data) {
          return patch(BASE + "/admin/settings/s3", data);
        },
        testS3: function () {
          return post(BASE + "/admin/settings/s3/test");
        },
        banIp: function (data) {
          return post(BASE + "/admin/settings/ban-ip", data);
        },
        unbanIp: function (data) {
          return post(BASE + "/admin/settings/unban-ip", data);
        },
      },

      // ── Admin: Databases ────────────────────────────────────────────────
      databases: {
        list: function () {
          return api(BASE + "/admin/databases");
        },
        get: function (id) {
          return api(BASE + "/admin/databases/" + encodeURIComponent(id));
        },
        create: function (data) {
          return post(BASE + "/admin/databases", data);
        },
        delete: function (id) {
          return del(BASE + "/admin/databases/" + encodeURIComponent(id));
        },
        test: function (id) {
          return post(
            BASE + "/admin/databases/" + encodeURIComponent(id) + "/test",
          );
        },
      },

      // ── Admin: Images ───────────────────────────────────────────────────
      images: {
        list: function (params) {
          return api(BASE + "/admin/images" + qs(params));
        },
        listLight: function () {
          return api(BASE + "/admin/images/list");
        },
        get: function (id) {
          return api(BASE + "/admin/images/" + encodeURIComponent(id));
        },
        create: function (data) {
          return post(BASE + "/admin/images", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/images/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/images/" + encodeURIComponent(id));
        },
        approve: function (id) {
          return post(
            BASE + "/admin/images/" + encodeURIComponent(id) + "/approve",
          );
        },
        reject: function (id, reason) {
          return post(
            BASE + "/admin/images/" + encodeURIComponent(id) + "/reject",
            { reason: reason },
          );
        },
        catalogue: function () {
          return api(BASE + "/admin/images/store/catalogue");
        },
        refreshStore: function () {
          return post(BASE + "/admin/images/store/refresh");
        },
        installFromStore: function (data) {
          return post(BASE + "/admin/images/store/install", data);
        },
      },

      // ── Admin: Locations ────────────────────────────────────────────────
      locations: {
        list: function () {
          return api(BASE + "/admin/locations");
        },
        create: function (data) {
          return post(BASE + "/admin/locations", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/locations/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/locations/" + encodeURIComponent(id));
        },
      },

      // ── Admin: Mounts ───────────────────────────────────────────────────
      mounts: {
        list: function () {
          return api(BASE + "/admin/mounts");
        },
        create: function (data) {
          return post(BASE + "/admin/mounts", data);
        },
        delete: function (id) {
          return del(BASE + "/admin/mounts/" + encodeURIComponent(id));
        },
      },

      // ── Admin: API Keys ─────────────────────────────────────────────────
      apikeys: {
        list: function () {
          return api(BASE + "/admin/apikeys");
        },
        create: function (data) {
          return post(BASE + "/admin/apikeys", data);
        },
        update: function (id, data) {
          return put(BASE + "/admin/apikeys/" + encodeURIComponent(id), data);
        },
        delete: function (id) {
          return del(BASE + "/admin/apikeys/" + encodeURIComponent(id));
        },
        toggle: function (id) {
          return post(
            BASE + "/admin/apikeys/" + encodeURIComponent(id) + "/toggle",
          );
        },
      },

      // ── Admin: Addons ───────────────────────────────────────────────────
      addons: {
        list: function () {
          return api(BASE + "/admin/addons");
        },
        toggle: function (slug) {
          return post(
            BASE + "/admin/addons/" + encodeURIComponent(slug) + "/toggle",
          );
        },
        reload: function (slug) {
          return post(
            BASE + "/admin/addons/" + encodeURIComponent(slug) + "/reload",
          );
        },
        uninstall: function (slug) {
          return post(
            BASE + "/admin/addons/" + encodeURIComponent(slug) + "/uninstall",
          );
        },
      },

      // ── Admin: Overview / Updates ───────────────────────────────────────
      overview: {
        checkUpdate: function () {
          return api(BASE + "/admin/overview/check-update");
        },
        performUpdate: function () {
          return post(BASE + "/admin/overview/perform-update");
        },
      },

      // ── Admin: Analytics ────────────────────────────────────────────────
      analytics: {
        summary: function () {
          return api(BASE + "/admin/analytics/summary");
        },
      },

      // ── Admin: Radar (security scanning) ────────────────────────────────
      radar: {
        scan: function (serverId) {
          return post(
            BASE + "/admin/radar/scan/" + encodeURIComponent(serverId),
          );
        },
        vtEnabled: function () {
          return api(BASE + "/admin/radar/virustotal-enabled");
        },
        scripts: function () {
          return api(BASE + "/admin/radar/scripts");
        },
        vtScan: function (serverId) {
          return post(
            BASE + "/admin/radar/vtscan/" + encodeURIComponent(serverId),
          );
        },
        vtLookup: function (data) {
          return post(BASE + "/admin/radar/virustotal", data);
        },
      },

      // ── Admin: Player Stats ─────────────────────────────────────────────
      playerstats: {
        list: function () {
          return api(BASE + "/admin/playerstats");
        },
        collect: function () {
          return post(BASE + "/admin/playerstats/collect");
        },
      },
    },
  };
})();
