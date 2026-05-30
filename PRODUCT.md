# Product

## Register

product

## Users

Airlink serves people who deploy, operate, and manage game servers through a web panel. The primary users are hosting administrators and self-hosting server owners who need to configure nodes, create server instances, manage users, assign resources, install addons, and keep the panel healthy. A second user group is server owners or subusers who need fast access to their assigned servers, console, files, settings, resource usage, and account controls.

Users are usually in an operational context: checking a server state, recovering a failed instance, adding capacity, editing configuration, or giving someone access. They need the interface to be predictable, readable, and quick under pressure.

## Product Purpose

Airlink Panel is an open-source game server management panel. It provides a full-featured web UI for deploying, monitoring, and administering game servers, backed by a daemon-based node system for running containers and an addon API for extending the panel without modifying core code.

Success means an administrator can understand fleet health, create and manage nodes, provision servers, manage users and permissions, configure images, install addons, and recover from common failures without leaving the panel. For end users, success means they can find their servers, understand status and usage, open the management tools they need, and complete routine changes without admin help.

## Brand Personality

Airlink should feel competent, direct, and durable. The product voice should be practical and calm, with labels that describe concrete actions and status messages that explain what happened and what to do next.

The interface should earn trust through consistency, clear information hierarchy, and restrained visual decisions. It can acknowledge the game-server domain with icons, server-state affordances, and resource-focused UI, but the core personality is an operations tool, not a gaming theme.

## Anti-references

Airlink should not look like a generic SaaS analytics dashboard, a decorative landing page, or a loud gamer UI with RGB accents and novelty styling. It should also avoid an over-muted enterprise admin look where every screen becomes gray, low-contrast, and hard to scan.

Avoid decorative glassmorphism, oversized rounded cards, gratuitous shadows, repeated marketing-card grids, heavy page-load motion, and visual effects that do not help users understand state. Do not hide operational controls behind clever affordances; standard buttons, forms, tables, tabs, and navigation are correct when they help the task.

## Design Principles

1. Lead with operational state. Server status, node health, resource usage, permissions, and failure conditions should be easy to see before secondary decoration.
2. Keep workflows explicit. Creation, deletion, restart, install, permission changes, and configuration edits need clear labels, confirmation where risk is real, and visible outcomes.
3. Preserve density without sacrificing readability. Admins need to scan many nodes, servers, users, images, and addons; compact UI is useful only when contrast, spacing, and hierarchy remain strong.
4. Use one component vocabulary. Buttons, inputs, dialogs, tabs, tables, toasts, empty states, and nav items should behave consistently across desktop, mobile, admin, and user surfaces.
5. Respect the game-server domain without themed clutter. Domain cues should appear in meaningful places such as world icons, server status, console controls, and resource displays, not as decorative noise.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the authenticated panel. Body text, muted text, placeholders, badges, and state colors need sufficient contrast in both light and dark modes. All interactive controls must be keyboard reachable with visible focus states, especially server action buttons, dialogs, dropdowns, tabs, search, addon actions, and file-management controls.

Motion should be brief and state-driven, with reduced-motion alternatives. Status should not depend on color alone; pair color with text, icons, or labels for online, offline, warning, error, success, selected, disabled, and loading states. Forms should use explicit labels, actionable validation messages, and clear required indicators.
