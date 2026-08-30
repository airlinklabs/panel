/* Shared string escaping helpers — single owner for client-side
   HTML/attribute/JS-context escaping. Loaded non-defer at the top of
   the page body (header.ejs) so inline page scripts can use them.
   Escapes are defensive: safe even when the input is not a string. */
(function () {
  if (window.escHtml) return;

  window.escHtml = function (t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /* Attribute context — same escaping as text content plus quotes. */
  window.escAttr = function (t) {
    return window.escHtml(t);
  };

  /* JS string-literal context: neutralise `</script>` and `<script`
     sequences without changing other characters. */
  window.escJS = function (t) {
    return String(t == null ? "" : t).replace(/</g, "\\x3c");
  };
})();
