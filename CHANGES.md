# CHANGES

- `views/components/header.ejs`: body viewport mode classes, server-name data attribute, and the new shared enhancement script include.
- `views/components/template.ejs`: wrapped desktop and mobile chrome in `desktop-only-block` and `mobile-only-block`, fixed viewport-aware sidebar/mobile navigation wiring, and preserved search/navigation behavior.
- `views/components/serverTemplate.ejs`: added server context exposure, scroll fade mask support, and server-tab search metadata for the subnav.
- `views/components/ui/icons.ejs`: added a spinner helper.
- `views/components/ui/button.ejs`: added press-scale behavior.
- `views/components/ui/alert.ejs`, `badge.ejs`, `dialog.ejs`, `sheet.ejs`, `empty-state.ejs`, `toast.ejs`: added entrance/exit motion hooks and updated interaction styling.
- `views/components/ui/card.ejs`, `input.ejs`, `table.ejs`, `pageTitle.ejs`: light-mode polish, focus styles, hover treatment, and typography tweaks.
- `views/components/loading-state.ejs`: animated loading state and button feedback.
- `public/styles.css`: global dual-layout rules, light-mode polish, focus ring, scroll mask, sidebar, and nav animation styles.
- `views/ui/animations.css`, `public/ui/animations.css`: added motion keyframes and animation utility classes.
- `public/js/ui.js`: dialog and sheet open/close animation handling, backdrop behavior, and safer state transitions.
- `public/javascript/page-loader.js`: event-based loader dismissal, critical image readiness, custom page-ready handling, and smooth sidebar pill motion.
- `public/javascript/search.js`: universal search index, desktop/mobile search handling, type badges, and animated results.
- `public/javascript/panel-enhancements.js`: mobile nav ripples and press feedback, sidebar subtree expansion, avatar fallback, timestamp formatting, and submit-button loading states.
- `views/user/server/manage.ejs`: dispatches `custom:page-ready` when the first console data arrives.
