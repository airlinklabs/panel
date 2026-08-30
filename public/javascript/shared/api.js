/* Shared JSON API wrapper — one owner for the repeated
   fetch -> json -> !ok -> toast pattern. Drop-in replacement for the
   local `api()` helpers that used to live in schedules/subusers pages.

   Returns parsed JSON on success, or null after showing a toast.
   CSRF is injected globally by js/csrf.js, so no header is set here. */
(function () {
  if (window.api) return;

  window.api = async function (url, method, body) {
    try {
      const res = await fetch(url, {
        method: method || "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(data.error || "Request failed");
        e.status = res.status;
        throw e;
      }
      return data;
    } catch (err) {
      /* HTTP error: toast the server's error text. Network failure: use a
         fixed friendly message (browser error text is not user-facing). */
      const message =
        err && err.status ? err.message : "Request failed. Try again?";
      if (window.showToast) showToast(message, "error");
      return null;
    }
  };
})();
