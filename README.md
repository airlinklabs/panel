> [!NOTE]
> Airlink 2.0.0-rc1 is a release candidate. Core features are stable. Production use is at your own risk until the final release.

# Airlink Panel

**Open-source game server management — v2.0.0-rc1**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/ujXyxwwMHc)

---

## Overview

Airlink Panel is an open-source platform for deploying, monitoring, and managing game servers. It provides a full-featured web UI for both admins and users, a daemon-based node system for running containers, and an addon API for extending functionality without modifying core code.

For full documentation, visit **[airlinklabs.github.io/home/docs/quickstart](https://airlinklabs.github.io/home/docs/quickstart/)**.

---


## Project leads

| Handle | Role |
|--------|------|
| [thavanish](https://github.com/thavanish) | Current maintainer |
| [privt00](https://github.com/privt00) | Project lead |
| [achul123](https://github.com/achul123) | Core developer |

---

## Prerequisites

- Node.js v18 or later
- npm v9 or later
- Git

---

## Installation

### Option 1 — Installer script

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

Manage with systemd:

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
```

### Option 2 — Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

sudo chown -R www-data:www-data /var/www/panel
sudo chmod -R 755 /var/www/panel

npm install --omit=dev
cp example.env .env
# Edit .env — set DATABASE_URL and APP_SECRET at minimum

npm run build
npm start
```

`npm start` applies database migrations automatically before launch.

### Running with pm2

```bash
npm install -g pm2
pm2 start dist/app.js --name airlink-panel
pm2 save
pm2 startup
```

---

## Addon System

Addons extend the panel without modifying core files. They live under `storage/addons/` and are managed from `/admin/addons`.

See [`storage/addons/README.md`](storage/addons/README.md) for structure and API reference.

---

## Star History

<a href="https://www.star-history.com/?repos=airlinklabs%2Fpanel&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&legend=top-left" />
 </picture>
</a>

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'feat: describe your change'`
4. Push and open a pull request against `main`

Run `npm run lint` before submitting. Follow TypeScript best practices and update documentation alongside code changes.

---

## Links

- Website: [airlinklabs.github.io/home](https://airlinklabs.github.io/home/)
- Docs: [airlinklabs.github.io/home/docs/quickstart](https://airlinklabs.github.io/home/docs/quickstart/)
- Discord: [discord.gg/ujXyxwwMHc](https://discord.gg/ujXyxwwMHc)
- GitHub: [github.com/airlinklabs/panel](https://github.com/airlinklabs/panel)

---

## What's new in 2.0.0-rc1

### New features

**User server creation** — Users can now create their own servers directly from the panel when the admin enables it in settings. A dedicated `/create-server` page guides them through image, node, and resource selection. Previously only admins could create servers.

**Server folder system** — Users can organize their servers into folders from the dashboard. Folders are per-user and support drag-and-drop reordering.

**Credits page** — A `/credits` page accessible from the account page lists the project leads, fetches contributors live from the GitHub API (cached in `localStorage` for 6 hours), and links to the website, Discord, and docs. Includes a scrolling `-_-` easter egg background — a nod to the Discord community tradition.

**Dedicated security admin module** — Security settings (rate limiting, IP banning, login lockout, reverse proxy, daemon HTTPS, API key hashing) are now a fully wired backend module with their own routes, previously scattered or missing entirely.

**Egg catalogue service** — A new `eggCatalogueService` handler fetches and caches game image definitions from the Airlink egg repository on startup, with an automatic 2-day refresh cycle.

**Daemon request interceptor** — A new `daemonRequest` utility centralises all panel → daemon HTTP calls. It respects the `enforceDaemonHttps` setting and applies HMAC signing to every outbound request. Previously each module made raw axios calls independently.

**Image store** — A store page for browsing and importing images directly from the catalogue, available on both desktop and mobile.

### Settings restructure

The old settings page had two tabs: **Appearance** and **Configuration**. The new layout has three focused tabs:

| Old | New |
|-----|-----|
| Configuration → General (upload limit, VirusTotal key, allow registration) | Appearance → Registration toggle |
| Configuration → General (upload limit) | Servers → File uploads |
| Configuration → General (VirusTotal key) | Security → VirusTotal |
| (did not exist) | Servers → Default limits (RAM, CPU, disk, server count per user) |
| (did not exist) | Servers → User permissions (allow create/delete) |
| (did not exist) | Security → Login protection (lockout attempts, lockout duration) |
| (did not exist) | Security → Network (reverse proxy, daemon HTTPS, hash API keys) |

New settings fields added to the database schema:
- `allowUserCreateServer` / `allowUserDeleteServer`
- `defaultServerLimit` / `defaultMaxMemory` / `defaultMaxCpu` / `defaultMaxStorage`
- `loginMaxAttempts` / `loginLockoutMinutes`
- `enforceDaemonHttps` / `behindReverseProxy` / `hashApiKeys`
- `loginWallpaper` / `registerWallpaper`

### Analytics rebuilt

The old analytics page had three separate endpoints (`/performance`, `/usage`, and a player stats endpoint) that returned partially broken or empty data. The new page consolidates everything into a single `/api/admin/analytics/summary` endpoint that:

- Pulls servers, users, nodes, images, and login history in one Prisma query
- Checks daemon health live for each node (online/offline, version, server count)
- Returns node capacity vs. allocation for RAM, CPU, and disk
- Provides 30-day login activity for charting
- Surfaces top servers by allocated RAM

The UI has three tabs — **Servers**, **Nodes**, **Activity** — matching the style of the admin overview page. The refresh button shows a spinner and fires a toast on completion.

### UI improvements

**Frosted glass navigation** — The desktop sidebar, desktop topbar, mobile topbar, and mobile bottom nav now use `backdrop-filter: blur` with 8% opacity backgrounds instead of solid fills. Auth pages (login, register) use the same treatment on the form panel.

**Loading overlay** — The page loader uses a frosted glass background (`backdrop-filter: blur(28px) saturate(180%)`) instead of a solid white/dark fill. The text, progress bar, and logo adapt to light and dark mode without a background block.

**Mobile auth wallpaper** — The configured login and register wallpapers now display on mobile. Previously the wallpaper was hidden with `display: none` below 768px. On mobile the wallpaper fills the screen and the form sits on top as a frosted glass panel.

**Card shadows** — Admin panel cards have `shadow-sm` in light mode so they protrude from the background instead of reading flat.

**Admin link hidden from non-admin users on mobile** — The per-server navigation tab strip on mobile previously showed the Admin edit link to all users. It now applies the same `isAdminItem` filter that the desktop already had.

**Delete server on mobile** — The delete button in the per-server settings page on mobile was gated on `user.isAdmin` only. It now also shows when `settings.allowUserDeleteServer` is enabled, matching the desktop behaviour.

**`npm start` runs migrations** — The start script now runs `prisma db push` before launching the app so a fresh database is initialised automatically without manual migration steps.

---


## License

MIT — see [`LICENSE`](LICENSE) for details.
