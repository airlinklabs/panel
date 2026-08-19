# Phase 08 — migrate live and specialist surfaces as explicit islands

## Goal

Handle the interfaces that need browser-native capability without pretending they are ordinary HTML swaps.

## Read first

- `docs/tmp/knowledge.md` (mandatory)
- Phase 05 island lifecycle contract and the relevant specialist surface source/tests

## A. Server manage / console

1. Keep xterm, WebSocket, resource charts, and console commands in a route-owned `server-console` island module. Extract the existing inline code incrementally; preserve its one socket initialization, reconnect policy, unload teardown, abort/supersede log requests, and `server.Storage` disk limit behavior documented in `docs/ui-repair/ownership-map.md`.
2. Use EJS/HTMX for stable surrounding regions: server summary, feature/install banner, action controls, notices, and non-streaming settings. Do not swap the terminal root while connected. When a server event changes shell data, request the smallest safe fragment or update a dedicated accessible status region.
3. Test reconnect, permission loss, installation completion, power action failure, navigation away/back, reduced motion, and mobile stats.

## B. File editor and uploads

1. Keep Monaco in a `file-editor` island with a defined model disposal policy. EJS renders file metadata and editor container; a narrowly scoped endpoint supplies content/save response as appropriate.
2. Keep large/multipart uploads in an upload island using XHR/fetch only if progress support requires it. It must use the central CSRF/session policy, an AbortController, clear error state, and an HTMX listing refresh upon completion.
3. Keep image viewer and SFTP dialogs as shared dialog content, not independent global modal implementations.

## C. Charts, drag/drop, custom selection

1. Chart.js instances are islands that destroy before target replacement and resize safely.
2. Dashboard folder drag/drop remains an island; persist only through an authorized server route then request canonical card/list HTML.
3. Consolidate custom selects and ports allocator into the selected shared owner. Alpine may own open/active-option state, but options/selection that change permissions or server configuration are posted back to the server.

## Acceptance criteria

- Every island has an explicit mount root, cleanup test or testable teardown contract, and no dependence on Turbo lifecycle events.
- HTMX never replaces a live root unless the island is cleanly destroyed first.
- Console/editor/uploads retain all current security and recovery behavior, with fewer global side effects than before.
