# Alpine Islands Component Ledger

Phase 05 reference. Every shared component, its lifecycle, state boundaries, and cleanup contract.

## Component Systems (al-* controllers)

| Component | Global | Mount | Scan | Destroy | State Type | Root Selector |
|-----------|--------|-------|------|---------|------------|---------------|
| ALDialog | `window.ALDialog` | `mount(el)` → controller | `scan()` → all `dialog[data-al-dialog]` | `destroyAll()` | Local UI (open/closed, focus trap) | `dialog[data-al-dialog]` |
| ALTabSystem | `window.ALTabSystem` | `mount(root)` → controller | `scan()` → all `[data-al-tabs]` | `destroyAll()` | Local UI (selected tab, hash state) | `[data-al-tabs]` |
| ALField | `window.ALField` | `enhance(root)` → controllers | `enhance(document.body)` | `destroyAll()` | Local UI (error/success, password toggle) | `[data-al-field]` |
| ALStateView | `window.ALStateView` | `mount(el)` → controller | `scan()` → all `[data-al-state]` | `destroyAll()` | Local UI (loading/empty/error panel) | `[data-al-state]` |
| Animate | `window.Animate` | Self-init IIFE | N/A | N/A (permanent) | Local UI (overlay stack, focus trap) | document-level listeners |

## Alpine Data Factories (unused currently)

| Factory | Registration | State Fields | Purpose |
|---------|-------------|--------------|---------|
| `disclosure` | `Alpine.data('disclosure', ...)` | `open` | Open/close toggle for expandable sections |
| `confirmAction` | `Alpine.data('confirmAction', ...)` | `confirming` | Temporary confirmation for destructive actions |
| `formDirty` | `Alpine.data('formDirty', ...)` | `dirty` | Tracks unsaved form changes |
| `tabs` | `Alpine.data('tabs', ...)` | `current` | Client-side tab switching |

## Specialist Islands (no lifecycle yet)

| Integration | Pages | Resources Created | Cleanup Needed |
|-------------|-------|-------------------|----------------|
| Xterm.js terminal | manage.ejs (desktop + mobile) | Terminal instances, WebSocket, fit addon, resize listener | `terminal.dispose()`, socket close, remove resize listener |
| Monaco editor | file.ejs, admin/images/edit.ejs | Editor model, resize listener | `editor.dispose()`, remove resize listener |
| Chart.js charts | manage.ejs (4 desktop + 4 mobile), admin-analytics.js, admin-playerstats.js, admin-node-stats.js | Chart instances | `chart.destroy()` |
| Upload progress | Inline in view scripts | XHR, progress listeners | Abort XHR, remove listeners |
| Drag-and-drop | dashboard.js, admin-images.js | Event listeners on cards/drop zones | Remove event listeners |

## Shared UI Components (legacy)

| Component | Global | Owner | Replacement | Status |
|-----------|--------|-------|-------------|--------|
| Modal/overlay | `window.modal` | modal.ejs | `ALDialog` (native `<dialog>`) | ~44 pages still use legacy |
| Custom select | `window.buildCustomSelect` | custom-select.js | Keep (specialized) | 8 pages |
| Toast | `window.showToast` | toast.ejs | Keep (HTMX `HX-Trigger` wires to it) | Done (Phase 02) |

## Lifecycle Contract

### For al-* component systems
```
destroyAll() → scan() on navigation/swap
```
turbo-shell.js calls this on `turbo:load` and `al:navigated`.

### For specialist islands (future)
```
mount(root, context) → returns cleanup function
destroy() → clears all resources
```
The Islands registry manages this via `destroyWithin(target)` and `mountWithin(target)`.

### For HTMX swaps
```
htmx:beforeSwap → Islands.destroyWithin(target)
htmx:afterSettle → Islands.mountWithin(target)
```
Already wired in htmx-bootstrap.js (lines 101-112), pending Islands module.

## State Boundaries

| State owned by | Examples |
|----------------|----------|
| Server (canonical) | User records, server lists, permissions, settings values |
| Alpine (local UI) | Dialog open/closed, dropdown open, selected tab, form dirty |
| Island (specialist) | Terminal buffer, editor content, chart config, upload progress |
| HTMX (remote) | CRUD data, filtered lists, form submissions, tab content from server |

### Forbidden state in Alpine/Islands
- Server data caches
- User records, server lists
- Permissions or roles
- Long-lived network state (WebSockets owned by specialist islands)
- `x-for` over server lists
