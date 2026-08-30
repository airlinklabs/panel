import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loader = readFileSync(
  resolve(__dirname, "../public/javascript/shared/page-loader.js"),
  "utf8",
);
const htmx = readFileSync(
  resolve(__dirname, "../public/javascript/shared/htmx-bootstrap.js"),
  "utf8",
);

describe("shared page loading feedback", () => {
  it("uses one indeterminate top loading line instead of an activity chip", () => {
    expect(loader).toContain("loaderEl.id = 'al-page-loader'");
    expect(loader).toContain("al-page-loader-sweep");
    expect(loader).not.toContain("al-activity-chip");
  });

  it("keeps HTMX requests out of hard-navigation handling and gives them loader feedback", () => {
    expect(loader).toContain(
      "form.matches('[hx-get], [hx-post], [hx-put], [hx-patch], [hx-delete]')",
    );
    expect(htmx).toContain("htmx:beforeRequest");
    expect(htmx).toContain("window.ALPageActivity.start()");
    expect(htmx).toContain("htmx:afterRequest");
  });

  it("does not execute scripts returned by a fragment", () => {
    expect(htmx).toContain("window.htmx.config.allowScriptTags = false");
  });

  it("keeps an invalid HTMX CSRF token in place instead of forcing a logout", () => {
    const csrf = readFileSync(
      resolve(__dirname, "../src/handlers/utils/security/csrfProtection.ts"),
      "utf8",
    );
    expect(csrf).toContain("'HX-Trigger'");
    expect(csrf).toContain(
      "Your security token expired. Refresh the page and try again.",
    );
    expect(csrf).not.toContain("'HX-Redirect', '/login?err=session_expired'");
  });
});
