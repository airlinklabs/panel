# Addon UI Contract

What the panel guarantees about the UI an addon renders, and what the store requires in return. Store review rejects submissions that violate any item below. This contract is a living document — PRs that change the referenced mechanisms must update it in the same commit.

## 1. Render inside the panel layout

Addon pages render through the panel's shell — the header, nav, theme variables, and toasts/modal containers are present on every addon route. Do not build your own page chrome.

- Panel templates expose `al-page-body`, `al-card`, `al-btn` and the `--theme-*` CSS variables; use them for visual parity.
- Your page is a fragment: the panel already supplies `<html>`, layout chrome, and the CSP meta.

## 2. Shared components, not your own

You **must not** ship your own modal, confirm, or toast implementations. Use the panel-provided ones, which are guaranteed present:

| Primitive | API |
|-----------|-----|
| Confirm / modal | `window.modal.confirm({ title, body, danger, confirmLabel, onConfirm })` — `views/components/modal.ejs:102` |
| Toast | `window.showToast(message, type)` where `type` is `success`, `error`, or `info` — `views/components/toast.ejs:220` |
| Components | `al-page-body`, `al-card`, `al-btn` and sibling `al-*` classes |

Reference implementation of safe usage:

```js
const toast = window.showToast || function (m, t) { console.warn('[addon]', m); };
window.modal.confirm({
  title: 'Restart server?',
  body: 'Players will be disconnected.',
  danger: true,
  confirmLabel: 'Restart',
  onConfirm: () => { /* your action */ },
});
```

If your addon ships its own modal or toast, the store review rejects it.

## 3. Localization

Do not hardcode display strings in a single language. Addon metadata carries per-locale labels and descriptions; the panel applies them.

- Localize every user-visible string. The panel's `data-lang="en"` example at `views/components/store.ejs:730` exists only for an external embed (giscus); it is not a pattern for addon UI.
- Use the addon config/translation mechanism to resolve the active locale's strings; fall back to a default locale when a key is missing.
- Never gate UI copy behind the panel's internal translation tables — those are not part of the addon API.

## 4. CSP: no inline scripts

The panel enforces a strict Content Security Policy in production (`src/app.ts:243`): `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'`. Only `<script>` blocks carrying the per-request nonce execute.

- Addon pages receive the nonce via the render context (`src/handlers/addonHandler.ts:387,421`) — attach it to every `<script>` tag you emit: `<script nonce="<%- nonce %>">…</script>`.
- Never add an inline event handler as a script-execution path for logic (the CSP scopes `script-src-attr` to attributes only, and it is not a license for script blocks).
- Never attempt to bypass or relax the policy. Store review runs the submitted page against the production CSP; bypasses are a hard rejection.

## 5. Version gating

Addons declare the minimum panel version in their metadata. The loader refuses to start modules whose declared version is newer than the running panel (`src/handlers/modulesLoader.ts:83`).

- Declare the minimum version you actually use; bump it when you depend on newer mechanisms.
- Feature-detect before using newer APIs even when the declared version looks satisfied — the store may run against a newer panel than your test instance.

## 6. Accessibility parity

Addon UI must hold the same accessibility bar as the rest of the panel:

- Keyboard-operable controls; visible focus states.
- Real `<button>`/`<a>` elements rather than clickable `<div>`s.
- Labels (`aria-label`, `aria-selected`, `role="tab"` etc.) on interactive elements that lack visible text.
- No color-only meaning; text labels or `aria` states for status.
- Touch targets no smaller than the panel's own controls.

## Store review checklist

The store reviewer verifies, for every submission:

- [ ] Pages render through the panel layout (`al-*` classes, theme variables)
- [ ] No custom modal/toast — uses `window.modal.confirm` / `window.showToast`
- [ ] All UI strings resolved per locale; no hardcoded single-language copy
- [ ] Every `<script>` carries the provided nonce; no CSP bypass
- [ ] Declared minimum panel version matches the mechanisms used
- [ ] Keyboard-operable, labelled, focus-visible, non-color-only UI
- [ ] No inline script blocks without a nonce attribute
