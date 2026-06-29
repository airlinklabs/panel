# Airlink Panel — UI Fix Prompt

You are working on **panel-3**, the Airlink game server management panel. The design system is documented in `PRODUCT.md` and `DESIGN.md`. The stack is EJS templates + Tailwind v4 + vanilla JS. Do not change any backend logic, routes, or Prisma schema. Only modify `.ejs`, `.css`, and `.js` UI files.

---

## Priority 1 — Dropdown System Rewrite (Critical Bug)

The current dropdown system is broken in multiple ways. Fix all of the following in one coherent pass.

### Bug 1A — `overflow-hidden` clips dropdown panels

`cs-select` elements are placed inside ancestor containers that have `overflow: hidden` (e.g. `rounded-xl ... overflow-hidden` cards in `startup.ejs`, `manage.ejs`, and others). Since `.cs-dropdown` uses `position: absolute` relative to `.cs-wrap`, the browser clips it at the overflow boundary and it is invisible or partially hidden.

**Fix:** Rewrite `buildDropdown()` and `initPortalDropdown()` in `public/js/core/custom-dropdown.js` to use a **body portal with `position: fixed`**. On open, append (or move) the panel to `document.body`, compute the trigger's `getBoundingClientRect()`, and set the panel's `top`/`left`/`width` using `position: fixed`. On close, return the panel to its original parent or detach it. This makes the dropdown immune to any `overflow: hidden` ancestor.

```js
// Correct positionPanel implementation:
function positionPanel(panel, trigger) {
  var rect = trigger.getBoundingClientRect();
  var panelHeight = 240; // max-height
  var spaceBelow = window.innerHeight - rect.bottom;
  var openAbove = spaceBelow < panelHeight && rect.top > panelHeight;

  panel.style.position = 'fixed';
  panel.style.width = rect.width + 'px';
  panel.style.left = rect.left + 'px';
  panel.style.zIndex = '2147483647';

  if (openAbove) {
    panel.style.top = '';
    panel.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
  } else {
    panel.style.bottom = '';
    panel.style.top = (rect.bottom + 2) + 'px';
  }
}
```

Remove the `.cs-dropdown` rule `position: absolute; top: calc(100% + 2px); left: 0; right: 0;` from `custom-dropdown.css` — position is now always set inline by JS with `position: fixed`.

Also add `.cs-portaled` class when portaling to `<body>` so CSS can scope any needed overrides.

### Bug 1B — `positionPanel()` clears z-index instead of setting it

The current `positionPanel()` function runs `panel.style.zIndex = ''` — this actively removes any z-index that was set. Combined with the CSS `z-index: 2147483647 !important` on `.cs-dropdown`, this creates a race where the inline style of `""` may win. After the fix in 1A, `positionPanel()` must always set `panel.style.zIndex = '2147483647'` explicitly in JS, and the CSS `!important` can stay as a fallback.

### Bug 1C — `filter-menu` in `filter-sort.js` is also un-portaled

`buildFilterBar()` in `public/js/core/filter-sort.js` appends `.filter-menu` panels as `position: absolute` children of a `.relative` wrapper. Apply the same fixed-portal approach for filter menus. The open/close logic in `filter-sort.js` should also call a shared `positionMenuFixed(btn, menu)` utility (extract from the fixed `positionPanel`) so the pattern is consistent.

### Bug 1D — Dropdown z-index vs modal z-index is inverted

The z-index scale in `tw.css` and `styles.css` sets `--z-dropdown: 2147483647` but `--z-modal: 60` and `--z-toast: 70`. This means dropdowns will render on top of modals and toasts when open inside a modal. Fix the z-index scale to be rational and layered:

```css
--z-nav:            10;
--z-floating:       20;
--z-sticky:         30;
--z-dropdown:       40;   /* was 2147483647 — fix this */
--z-modal-backdrop: 50;
--z-modal:          60;
--z-toast:          70;
--z-tooltip:        80;
--z-loading:        90;
```

Dropdowns inside modals need to respect `--z-modal` + an offset (e.g. `--z-modal-dropdown: 65`). Add this token and use it when `initPortalDropdown` or `buildDropdown` detects the trigger is inside `[role="dialog"]` or `#globalModal`.

Update all hardcoded `z-index: 2147483647 !important` references in:
- `public/styles/custom-dropdown.css`
- `public/tw.css` (the dropdown enforcement block)
- `public/styles.css` (compiled — rebuild after tw.css change)

### Bug 1E — `addReposition` listeners are not cleaned up properly on portal panels

When a portaled panel is moved to `document.body`, the scroll/resize reposition listeners must update the panel's `fixed` position coordinates, not its `absolute` position. Update `addReposition()` to call `positionPanel()` (the fixed version), and ensure the cleanup function (`_ddReposCleanup`) is always called before a new listener pair is registered to prevent accumulation.

### Bug 1F — Dropdown does not close on scroll of the trigger's scroll container

When the page scrolls, the portaled fixed-position panel will visually drift away from the trigger but stay open. Fix: in `addReposition`, also listen on all scrollable ancestors of the trigger (use a `getScrollParents()` helper that walks up the DOM and collects elements with `overflow: auto/scroll/overlay`). On scroll of any ancestor, either reposition if the trigger is still in viewport, or close the dropdown if the trigger has scrolled out of view.

---

## Priority 2 — Stacking Context Audit on Cards

In `startup.ejs` (and other pages where `cs-select` appears inside sections), the card wrapper `rounded-xl ... overflow-hidden` is the clipping culprit at the DOM level. After the portal fix (Priority 1), `overflow-hidden` on card wrappers no longer clips dropdowns. However, there are cards in `manage.ejs` that use `backdrop-blur-sm` — this creates a CSS stacking context. The portaled panel's `position: fixed` with a sufficiently high z-index will render above these, so no EJS changes are needed. Just verify after implementing Priority 1.

**One exception:** The topbar (`al-topbar fixed ... z-10`) and sidebar (`lg:fixed lg:z-10`) both have the `transition` CSS property set on them, which creates a stacking context. Portaled fixed panels with `z-index: 40+` will still render above these since `z-10 = 10 < 40`. No changes needed here, just document this so future developers know why the portal approach is required.

---

## Priority 3 — Other UI Issues Found in Audit

### 3A — Hardcoded inline colors not using theme tokens (127 instances)

There are 127+ inline `style="color:#..."` or `style="background:#..."` attributes hardcoded in EJS files (identified in admin/addons/store.ejs, admin/servers/servers.ejs, and the store component). These bypass dark mode and theming entirely. Fix the most egregious ones:

1. In `views/admin/addons/store.ejs` and `views/components/store.ejs`, the dynamically built label elements use `lbl.style.cssText = 'font-size:10px;color:#404040;...'` — replace the hardcoded color with `var(--theme-text-muted, #737373)` and let dark mode handle it.
2. In `views/admin/servers/servers.ejs` around line 649, the dynamically built HTML string uses hardcoded `border-neutral-200 dark:border-neutral-700/40` which is fine, but any inline `color:` or `background:` values should be converted to theme tokens.
3. Do not touch font-size or layout properties in this pass — only fix the color hardcoding.

### 3B — `text-[10px]` on mobile nav labels is too small

In `views/components/template.ejs`, mobile bottom nav labels use `text-[10px]`. This is below the WCAG AA minimum for body text and feels cramped. Change to `text-[11px]`. Do not change icon sizes.

Affected lines: the `<span class="text-[10px] font-medium">` instances inside the mobile bottom nav `<ul>` (navServers, item.label, navMore, navMenu, navLogout). Change all to `text-[11px]`.

### 3C — Modal uses `--z-modal-backdrop` for the entire modal container

In `views/components/modal.ejs`, `#globalModal` (the fixed overlay) has `z-index: var(--z-modal-backdrop)` (= 50). The inner `#globalModalPanel` has no explicit z-index. Since the panel is a child of the overlay, it inherits the stacking context from `--z-modal-backdrop`. After the z-index fix in Priority 1D (dropdown = 40, modal-backdrop = 50), any open dropdown **behind** a modal will correctly be hidden by the backdrop. No change needed to modal.ejs — but verify after implementing 1D.

### 3D — `#globalModal` uses `transition-opacity` but the backdrop panel uses `transform` for animation — they share no coordinated timing

The modal backdrop transitions `opacity` at `200ms`, and the panel transitions `transform` at `200ms` independently. These already match so no change is needed, but note: if you open a modal while a dropdown is open (which is possible), the dropdown may flash above the backdrop for one frame. Fix this by adding to `views/components/modal.ejs` JS (already has an `open()` function): before showing the backdrop, call `window.closeAllDropdowns?.()`.

Export a `closeAllDropdowns` helper from `custom-dropdown.js`:
```js
window.closeAllDropdowns = function() {
  for (var i = openInstances.length - 1; i >= 0; i--) {
    openInstances[i].close();
  }
};
```

### 3E — `filter-menu` items use inline style for the active dot indicator

In `filter-sort.js`, the active-state dot indicator sets `item.querySelector('.filter-dot').style.background = 'currentColor'` and `'transparent'` — this is fine for light mode but in dark mode `currentColor` resolves to the element's text color which may be `neutral-300`. This is acceptable as-is, but add a data attribute approach for clarity: `item.dataset.active = 'true'` when selected and target `.filter-dot[data-active="true"]` in CSS with `background: currentColor`. Remove the inline `style.background` JS manipulation and use the data-attribute toggle instead. This makes state legible in DevTools.

### 3F — Toggle switch borders use hardcoded `#a3a3a3` / `#525252`

In `tw.css`, the toggle switch rule:
```css
.peer.rounded-full { border: 1px solid #a3a3a3; }
html.dark .peer.rounded-full { border: 1px solid #525252; }
```
Replace the hex values with theme tokens:
```css
.peer.rounded-full { border: 1px solid var(--theme-border, #a3a3a3); }
html.dark .peer.rounded-full { border: 1px solid var(--theme-border-subtle, #525252); }
```

### 3G — `cs-option` has `white-space: nowrap` causing content to overflow in narrow containers

In `custom-dropdown.css`, `.cs-option` has `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. This is fine in most contexts, but in the server-edit page, port select dropdowns are built inside table cells that are very narrow. Change to `white-space: normal; overflow-wrap: break-word;` specifically for `.cs-sm .cs-dropdown .cs-option` (or add a `.cs-wrap.cs-narrow .cs-option` variant). For all standard-width dropdowns, keep `nowrap`.

### 3H — `backdrop-blur` on dashboard empty-state cards creates unnecessary stacking context

In `views/user/dashboard.ejs`, the empty-state section uses `backdrop-blur` on a `<section>` element. This creates a stacking context even though the blur adds no visual benefit on a flat background. The sections at lines ~86 and ~448 use `backdrop-blur dark:border-white/10 dark:bg-white/[0.045]`. Remove `backdrop-blur` from these two empty-state `<section>` elements — the visual appearance is identical since there is nothing behind them to blur. This eliminates two unnecessary stacking contexts.

---

## Priority 4 — Animation / Motion Cleanup

### 4A — `motion.css` defines `filter: blur(4px)` on `.motion-blur-in` animation

The `motion-blur-in` keyframe in `public/styles/motion.css` animates `filter: blur()`. The CSS `filter` property creates a stacking context when non-zero. This means any element currently animating with `data-animate="blur"` will temporarily break dropdown z-indexing during its entrance. Fix: change the `motion-blur-in` keyframe to only use `opacity` (no `filter`). The "blur in" effect can be approximated with opacity alone for a product panel:

```css
@keyframes motion-blur-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

If a blur entrance is strongly desired, limit `data-animate="blur"` to elements that will never contain dropdowns (icons, images, decorative elements). Add a comment to `motion.css` documenting this constraint.

---

## Implementation Order

Apply changes in this sequence to avoid regressions:

1. **`public/js/core/custom-dropdown.js`** — portal rewrite (Bugs 1A, 1B, 1D partial, 1E, 1F) + `closeAllDropdowns` export (Bug 3D)
2. **`public/styles/custom-dropdown.css`** — remove absolute positioning rules now handled by JS, keep appearance rules (Bug 1A)
3. **`public/tw.css`** — fix z-index scale (Bug 1D), fix toggle switch borders (Bug 3F), update enforcement block z-values
4. **`public/js/core/filter-sort.js`** — portal fix for filter-menu (Bug 1C), data-attribute dot fix (Bug 3E)
5. **`views/components/template.ejs`** — mobile nav label size (Bug 3B)
6. **`views/components/modal.ejs`** — call `closeAllDropdowns` on modal open (Bug 3D)
7. **`views/user/dashboard.ejs`** — remove `backdrop-blur` from empty-state sections (Bug 3H)
8. **`views/admin/addons/store.ejs`** and **`views/components/store.ejs`** — fix hardcoded label colors (Bug 3A)
9. **`public/styles/motion.css`** — fix `motion-blur-in` stacking context (Bug 4A)

After each step, verify the following manually:
- Open a `cs-select` dropdown inside a card with `overflow-hidden` — it must not be clipped
- Open a dropdown, then open the confirm modal — the dropdown must close or appear behind the modal backdrop
- Filter menus in admin server/user list pages must open and be clickable
- Scroll the page with a dropdown open — it must reposition or close correctly
- Dark mode: dropdown panels must be `#262626` background with `#404040` border (not transparent)
- Light mode: dropdown panels must be `#ffffff` background with `#e5e5e5` border

---

## Files To Modify

| File | Changes |
|------|---------|
| `public/js/core/custom-dropdown.js` | Portal rewrite, fixed positioning, z-index fix, closeAllDropdowns export |
| `public/styles/custom-dropdown.css` | Remove absolute positioning from `.cs-dropdown`, keep appearance styles |
| `public/tw.css` | Fix z-index scale, fix toggle borders, update enforcement block |
| `public/js/core/filter-sort.js` | Portal fix for filter-menu, data-attribute dot state |
| `views/components/template.ejs` | `text-[10px]` → `text-[11px]` on mobile nav labels |
| `views/components/modal.ejs` | Call `closeAllDropdowns` before showing modal |
| `views/user/dashboard.ejs` | Remove `backdrop-blur` from empty-state sections |
| `views/admin/addons/store.ejs` | Fix hardcoded label colors |
| `views/components/store.ejs` | Fix hardcoded label colors |
| `public/styles/motion.css` | Remove `filter: blur()` from `motion-blur-in` keyframe |

**Do not** modify:
- Any server-side `.ts` files
- Prisma schema
- `pnpm-lock.yaml` or `package.json`
- Any file under `storage/`
- Theme CSS files (`solarized-*.css`, `theme-base.css`, user themes)
- `DESIGN.md` or `PRODUCT.md`
