// ── HTML/JS Escaping Utilities ──
// For safe injection of dynamic content into HTML and JS contexts.

/**
 * Escape HTML entities for safe injection into HTML content.
 * Use inside EJS <%= %> for auto-escaping, or explicitly for <%- %> raw output.
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Escape a string for safe use inside a JavaScript string literal within a <script> tag.
 * Prevents </script> breakout and string delimiter injection.
 */
export function escapeJsString(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, '<\\/')
    .replace(/\/>/g, '\\/>');
}

/**
 * Escape a string for use in an HTML attribute value.
 */
export function escapeAttr(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize a URL for safe href/src attributes.
 * Only allows http/https protocols.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Not a valid URL — return empty
  }
  return '';
}
