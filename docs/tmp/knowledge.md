# Airlink migration knowledge base — mandatory reference

Read this file before every phase, before every route conversion, and before approving a change. It is the authoritative implementation contract for the EJS + HTMX + Alpine migration. If a phase conflicts with this file, stop and update the phase/decision record before writing code.

## 1. The stack and its boundaries

| Layer | It owns | It must not own |
| --- | --- | --- |
| Express + TypeScript | Routes, auth, permissions, validation, services, daemon calls, view models, HTTP status/headers | Browser-only interaction state |
| EJS | Escaped HTML from server view models; full pages, components, fragments | Data access, authorization, business rules, unescaped user data |
| HTMX | Requests and swaps for server-authoritative interactions | Client-side routing, canonical data cache, manual HTML construction |
| Alpine | State local to one rendered component: open/closed, selected tab, temporary confirmation, UI-only filtering | Canonical server records, permissions, business decisions, long-lived network state |
| Island module | Browser integrations that require an imperative API: xterm, Monaco, Chart.js, upload progress, drag/drop, WebSocket stream | Global application lifecycle or unrelated DOM |
| CSS/Tailwind | Existing component vocabulary, responsive layout, themes, motion | New inline style systems or fixed values that bypass `--theme-*` tokens |

The server is always canonical. A browser action either posts a form to a server route or makes an HTMX request that gets server-rendered HTML back. A local Alpine state may describe whether a menu is open; it must not pretend it owns the server list shown inside that menu.

## 2. Existing Airlink contracts that remain in force

- EJS views resolve from `views/`; addons use the explicit resolver in `src/handlers/renderResolver.ts` and their own controlled views roots.
- Feature routers remain in `src/modules/**` and mount through `src/modules/registry.ts`. Keep existing URL paths and route precedence.
- `src/app.ts` provides a fresh CSP nonce in `res.locals.nonce` on every response. Every inline `<script>` must include `nonce="<%- nonce %>"`; prefer external same-origin scripts.
- CSRF is already enforced server-side and the token is exposed in `<meta name="csrf-token">`. HTMX and any island mutation must send it. Never disable or bypass CSRF for convenience.
- Existing Zod validation, authorization, safe client error helpers, request IDs, daemon contracts, path security, and addon containment apply equally to fragment routes.
- The UI remains the one specified in `PRODUCT.md` and `DESIGN.md`. Reuse `public/tw.css` classes and theme variables.

## 3. EJS rules and syntax

### Escaping

Use `<%= value %>` for all ordinary values. It HTML-escapes output.

```ejs
<h1 class="al-page-title"><%= page.title %></h1>
<p class="al-page-desc"><%= page.description %></p>
<input class="al-input" name="name" value="<%= form.name %>">
```

Use `<%- value %>` only for trusted HTML created by a known server-side component/helper, such as a Lucide icon helper or an EJS include. Never pass database text, request input, daemon messages, error text, markdown, URL params, or JSON through `<%-`.

```ejs
<%- include('../components/ui/empty-state', { title, description }) %>
<%- icon('server', { class: 'h-4 w-4', 'aria-hidden': 'true' }) %>
```

Use `<% code %>` only for small presentation branching/loops. Build data and make authorization decisions in TypeScript before rendering.

```ejs
<% if (servers.length === 0) { %>
  <%- include('../components/ui/empty-state', { title: 'No servers yet' }) %>
<% } else { %>
  <% for (const server of servers) { %>
    <li><%= server.name %></li>
  <% } %>
<% } %>
```

### Full pages, components, and fragments

- A **full page** includes header/chrome/main/footer as the existing layout requires.
- A **component** is reusable markup with a narrow input contract, kept in `views/components/` or `views/components/ui/`.
- A **fragment** is the one replaceable region returned to HTMX, kept in `views/fragments/<domain>/`. It must not include `html`, `head`, `body`, header, sidebar, footer, global toast, or global dialog markup.
- Give every replaceable region one stable semantic ID. Never include that ID twice in the page, nested fragment, or a collection row.

```ejs
<!-- views/fragments/admin/users/user-list.ejs -->
<section id="admin-users-list" aria-labelledby="users-heading">
  <% for (const user of users) { %>
    <%- include('../../../components/admin/user-row', { user }) %>
  <% } %>
</section>
```

Fragment inputs are a typed view model prepared by the owner route/service. Do not reach into `req`, `res`, Prisma, or a daemon client from an EJS file.

## 4. Express route and fragment rules

Keep all route security and data preparation shared between full and fragment responses.

```ts
router.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const viewModel = await buildAdminUsersViewModel({
      actor: req.user,
      query: parseAdminUsersQuery(req.query),
    });

    res.vary('HX-Request');
    if (req.get('HX-Request') === 'true') {
      return res.render('fragments/admin/users/user-list', viewModel);
    }

    return res.render('admin/users/users', viewModel);
  } catch (error) {
    return next(error);
  }
});
```

Rules:

- Reuse one `build*ViewModel()` path for initial page and fragment response. It must return all fragment data and deterministic state/IDs.
- Call `res.vary('HX-Request')` whenever a route has different full-page and fragment representations.
- Fragment routes use existing route auth/permission middleware. An `HX-Request` header is never authentication or authorization.
- Preserve normal HTTP status codes. A successful update is normally 200 with canonical HTML. Missing/forbidden/conflict/validation failures retain 404/403/409/422. Do not return an HTTP 200 error toast just to simplify client code.
- For a full non-HTMX form POST, use current redirect-after-POST behaviour. For an HTMX request, return the changed canonical region or a clearly scoped error region.
- Use existing safe error helpers. Do not expose `err.message`, daemon response bodies, stacks, or `JSON.stringify(error)`.

## 5. HTMX syntax and rules

HTMX turns ordinary elements into HTML requests. Use explicit attributes; do not globally boost every link/form.

```ejs
<form
  hx-post="/admin/users"
  hx-target="#admin-users-list"
  hx-swap="outerHTML"
  hx-disabled-elt="find button[type='submit']"
  hx-indicator="#admin-user-form-status">
  <!-- server-rendered fields -->
  <p id="admin-user-form-status" class="htmx-indicator" aria-live="polite">Saving…</p>
  <button class="al-btn-primary" type="submit">Create user</button>
</form>
```

### Attributes to use intentionally

| Attribute | Use |
| --- | --- |
| `hx-get`, `hx-post`, `hx-put`, `hx-patch`, `hx-delete` | Same-origin server request for the owning feature |
| `hx-target` | Exact region that owns the response |
| `hx-swap="outerHTML"` | Default when response contains the region root with same stable ID |
| `hx-swap="innerHTML"` | Only when response is child markup, not a region root |
| `hx-include` | Include a nearby filter/input only when it is not already part of the submitted form |
| `hx-vals` | Static, trusted values only; never interpolate untrusted strings into JSON attributes |
| `hx-trigger` | Delayed search, change, load, or named event when the interaction warrants it |
| `hx-indicator` | A visible scoped busy indicator; preserve text/status feedback under reduced motion |
| `hx-disabled-elt` | Prevent repeat mutations while request is active |
| `hx-push-url` | Bookmarkable filter/pagination/tab state, using server-validated query values |
| `hx-confirm` | Only for a simple browser-confirm fallback. Prefer the project’s accessible explicit dialog for destructive actions. |

### Response headers

- `HX-Trigger`: send a small documented event payload after successful action, for example `{"al:toast":{"type":"success","message":"User created"}}`. Treat messages as server-created safe text.
- `HX-Redirect`: move to another URL after a successful HTMX mutation when a full page is needed.
- `HX-Location`: use only when HTMX must make a follow-up client request; document why a direct fragment response cannot work.
- `HX-Retarget` / `HX-Reswap`: exceptional recovery tools, not a substitute for stable fragment design.

### HTMX event lifecycle

Use one central bridge, not per-page global handlers:

```js
document.body.addEventListener('htmx:beforeSwap', (event) => {
  Islands.destroyWithin(event.detail.target);
});

document.body.addEventListener('htmx:afterSettle', (event) => {
  Islands.mountWithin(event.detail.target);
});
```

The actual implementation must protect non-island areas and tolerate a target that was removed. It must not evaluate inline scripts from server fragments, reinitialize the entire document, or stack event listeners after each swap.

### HTMX anti-patterns

- No document/body-level `hx-boost` rollout.
- No JSON endpoint followed by client string interpolation to build HTML.
- No indefinite polling. Poll only a named active job region, use a sensible interval, and stop on terminal state/removal/navigation.
- No swapping the root of a live terminal, editor, upload, chart, or socket without its cleanup contract.
- No state mutation based solely on a successful request; render the server’s canonical post-mutation response.

## 6. Alpine syntax and rules

Use Alpine for narrowly scoped ephemeral state. Place `x-data` on the smallest component root that owns the interaction.

```ejs
<section x-data="{ open: false }">
  <button
    class="al-btn-secondary"
    type="button"
    @click="open = !open"
    :aria-expanded="open.toString()"
    aria-controls="advanced-options">
    Advanced options
  </button>
  <div id="advanced-options" x-show="open" x-cloak>
    <!-- server-rendered form fields -->
  </div>
</section>
```

Use `x-bind` / `:` for ARIA and classes, `x-show` for local visibility, `x-transition` only with the existing motion/reduced-motion requirements, and `@event` for component-local events. Use `$refs` sparingly for focus management. Use `x-id` when a component needs generated ARIA IDs, but keep HTMX fragment root IDs server-stable.

Do not use:

- `x-html` with user/server data.
- an Alpine global store for servers, users, jobs, permissions, or API caches.
- `x-for` to reconstruct a server-rendered list/table.
- Alpine `fetch()` for normal CRUD that HTMX can perform.
- nested components with two sources of truth for the same `open`, selected, or busy state.

When an HTMX response replaces an Alpine root, Alpine initializes that new markup. The old local state is intentionally gone unless the value is represented in the URL, form input, or server model. Do not silently persist stale local state into `localStorage`.

## 7. Specialist islands

An island is a small external JavaScript module with an explicit lifecycle.

```ts
export function mountServerConsole(root: HTMLElement, context: ServerConsoleContext) {
  const controller = new AbortController();
  const terminal = createTerminal(root, context);
  const socket = connectConsole(context, controller.signal);

  return () => {
    controller.abort();
    socket.close();
    terminal.dispose();
  };
}
```

Every island documents:

1. Its root selector and the data attributes/view model it accepts.
2. Its owning route/feature.
3. All created resources: event listeners, timers, `AbortController`, WebSocket, observers, chart/editor instances, object URLs.
4. Its cleanup function and the lifecycle event that invokes it.
5. Error, offline, permission-loss, mobile, and reduced-motion behavior.

Use islands for xterm, Monaco, Chart.js, uploads with progress, drag/drop, and realtime subscriptions. HTMX can refresh adjacent stable fragments after an island completes an operation.

## 8. Forms, validation, loading, and feedback

- Use semantic `<form>`, `<label for>`, `name`, `button type`, and native input attributes. HTMX enhances a real form; it does not replace one.
- Validate on the server with existing Zod schemas. Render field errors next to their field with stable IDs and `aria-describedby`; set `aria-invalid="true"` on invalid controls.
- Disable the actual submit/action button while a mutation is pending. Do not disable the entire page or remove a user’s ability to read errors.
- Use an `aria-live="polite"` scoped result region for normal saves. Use `role="alert"` only for urgent failures.
- Preserve user input on validation errors. For success, replace with the server’s canonical data and announce a concise outcome.
- Destructive, power, and irreversible actions require explicit confirmation and understandable consequences. A danger color is not confirmation.

## 9. Accessibility and visual rules

- Use the product components/classes in `public/tw.css`: `al-btn-*`, `al-input`, `al-label`, `al-card`, badges, table classes, and state components. Expand an existing owner rather than inventing duplicates.
- Use `--theme-*` values. Never hard-code a light/dark color that bypasses the user’s selected theme.
- All interactive controls are keyboard-reachable with visible focus. Icon-only buttons have an accessible name and at least the documented practical touch target.
- Status uses a label/icon and color. Error/success/loading changes are perceivable without motion or color alone.
- A dialog controls focus, supports Escape where safe, prevents background interaction, returns focus to its opener, and has one global owner.
- A fragment swap must preserve or deliberately restore focus. Do not steal focus for routine list refreshes.
- Test desktop/mobile, light/dark/custom themes, keyboard, reduced motion, empty/loading/error/permission states every time a shared primitive changes.

## 10. Security rules

- All untrusted output is escaped by default. Attribute values also use `<%=`; never concatenate raw request data into `hx-*`, `data-*`, URLs, style, script, or HTML strings.
- Keep CSP strict. External assets are local. Every inline script uses the per-response nonce.
- Send CSRF headers only to same-origin unsafe requests. Keep cookie/session handling and 401 redirect behaviour coherent with the current app.
- Authorization happens before fetching/rendering a full page or fragment. Do not trust resource IDs from DOM attributes.
- Keep path validation and daemon boundaries server-side. A fragment endpoint has no extra authority.
- Use `textContent`/server-rendered escaped fragments for user-visible messages. Do not insert backend responses with `innerHTML`.
- Maintain `Vary: HX-Request` and appropriate private/no-store caching where page contents depend on a session or representation.

## 11. Testing and verification

For each migrated route or shared primitive:

1. Typecheck and run the relevant Vitest suite.
2. Test both full page and `HX-Request` response: status, auth, CSRF, output shape, `Vary`, IDs, success, empty, validation failure, error, and permission denial.
3. Exercise the actual task in a browser: initial load, refresh, Back/Forward, repeated action, slow/failing network, desktop/mobile, keyboard-only, light/dark theme, and relevant realtime state.
4. For an island, prove teardown after a swap/navigation: no duplicate listener, socket, timer, request, chart, editor, or upload remains.
5. Run `pnpm run typecheck`, relevant `pnpm test` tests, and `pnpm run build` at phase boundaries. Record commands/results in `docs/tmp/migration-log.md`.

## 12. Mandatory pre-change checklist

Before changing a route or component, the implementing agent must answer in its working notes:

1. Which feature/router owns it, and which permission/validation/service path already applies?
2. Is this initial-page data, a server fragment, local Alpine state, or a specialist island?
3. What is the stable fragment root ID and swap mode? Does it collide elsewhere?
4. What happens on success, validation failure, authorization failure, daemon/transport failure, empty data, slow request, and navigation away?
5. How are CSRF, CSP nonce, escaping, error sanitization, theme tokens, focus, and keyboard behavior preserved?
6. Which existing implementation becomes obsolete, and what evidence will permit deletion?
7. Which tests and visual checks prove it is safe?

If any answer is unclear, stop and update `docs/tmp/architecture-decisions.md` or the applicable phase before implementation.
