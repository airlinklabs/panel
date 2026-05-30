# Product

## Register

Airlink Panel

## Users

Airlink serves two main groups. The first is administrators who operate the panel itself: they create nodes and servers, manage users and permissions, maintain images, review analytics, configure security, and handle addons. The second is server owners and subusers who spend most of their time inside a single server, checking status, opening the console, editing files, changing startup values, managing backups, and reviewing usage.

The interface is built for operational work. Users arrive to fix a problem, provision something new, or verify state quickly. The UI therefore needs to stay readable, compact, and predictable under pressure.

## Product Purpose

Airlink Panel is an open-source game server management panel with a web UI for admins and users, a daemon-based node system for running containers, and an addon system for extending the panel without modifying core code.

The product should make the core control flow obvious: inspect health, provision infrastructure, manage access, edit server settings, and recover from failures without leaving the panel. The codebase shows a clear split between desktop and mobile experiences, but both serve the same operational workflow.

## Actual UI Style

The design language is clean, neutral, and functional rather than decorative.

The visual system is built around General Sans, a neutral grayscale base, and small accent colors used mainly for state. Most surfaces are white or near-black depending on theme, with soft borders, light shadows, and rounded-xl corners. The panel uses dark mode as a first-class state, not as an afterthought.

Desktop layout is anchored by a fixed left sidebar with the logo, account block, and navigation. Content areas are scrollable, dense, and card-based. Mobile swaps that for a frosted top bar and a fixed bottom navigation rail, with search and account actions kept one tap away.

The auth pages use a split-screen treatment on desktop with a wallpaper panel and a centered form column. On mobile, the login experience collapses into a single full-height panel.

The codebase also uses a lot of small interaction cues: toast notifications, inline banners, modal dialogs, dropdowns, custom selects, bulk-action bars, searchable navigation, and subtle loading states. Hidden scrollbars, small animations, and gentle layout transitions keep the interface from feeling noisy.

## Design Principles

1. Lead with state. Server health, node health, resource usage, warnings, and action results should be obvious immediately.
2. Keep controls explicit. Buttons, forms, tabs, tables, dialogs, and confirmation flows should read like tools, not tricks.
3. Keep density high but legible. The panel manages many servers, nodes, images, addons, keys, users, and logs, so compact layouts are useful only when hierarchy stays clear.
4. Use one component vocabulary across desktop and mobile. Shared patterns should feel like the same product, just adapted to screen size.
5. Use accents sparingly. Color should mark status or emphasis, not dominate the page.

## Anti-references

Do not make Airlink look like a glossy SaaS landing page, a neon gamer dashboard, or a heavy glassmorphism demo. It should not drift into loud gradients, oversized shadows, decorative motion, or novelty UI that gets in the way of administration.

Avoid gray-on-gray minimalism that sacrifices scanability. The codebase favors quiet surfaces, but never at the expense of contrast or clear affordances.

## Accessibility & Inclusion

Target WCAG 2.2 AA for authenticated screens. Text, badges, placeholders, and status colors need to remain readable in both themes. Interactive controls should have visible focus states and remain keyboard reachable, especially navigation, server actions, dialogs, file tools, and settings forms.

Status should never rely on color alone. Pair colors with labels, icons, or text. Motion should stay brief and state-driven, with reduced-motion behavior where relevant. Form validation should be explicit and close to the field it affects.

## Product Surface Areas

The product should consistently cover these areas of the codebase:

- Admin overview, settings, security, menu management, analytics, player stats, API keys, images, addons, nodes, servers, and user management
- User dashboard, account page, credits, create-server flow, and per-server pages for manage, files, file detail, backups, settings, startup, players, and worlds
- Shared navigation, search, toasts, loaders, banners, and modal flows across desktop and mobile

## Voice

Copy should be short, concrete, and operational. Labels should name the action or state directly. Messages should explain what happened and what the user can do next. The product voice should feel calm, competent, and practical.
