> [!NOTE]
> Airlink 2.5.128 is stable and ready for production. If it breaks, check your `SESSION_SECRET` first -_-

# Airlink Panel

**Open-source game server management that works -_-**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/ujXyxwwMHc)

---

## What is this?

Airlink Panel is a web-based control center for deploying, monitoring, and managing game servers across multiple machines. The panel talks to the daemon so you don't have to -_-

**What you get:**
- Full web UI for admins and users (EJS templates, not React)
- Node-based architecture: one panel, many daemons, infinite game servers
- Addon system for extending functionality without touching core code
- REST API (v1 + legacy) for automation and third-party integrations
- Real-time console, file manager, backups, SFTP, and more

Full documentation at **[airlinklabs.xyz/docs/quick-start/](https://airlinklabs.xyz/docs/quick-start/)**.

---

## Project Leads

| Handle | Role | What they do |
|--------|------|--------------|
| [thavanish](https://github.com/thavanish) | Maintainer | Keeps the lights on and the semicolons in place |
| [privt00](https://github.com/privt00) | Project lead | The one who said "let's build a game panel" and meant it |
| [achul123](https://github.com/achul123) | Core developer | Writes code that works on the first try (sometimes) |

---

## Prerequisites

- Node.js v18 or later
- pnpm v8 or later (`npm install -g pnpm`)
- Git

---

## Installation

### Option 1: Installer script (recommended)

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

The installer handles everything: Node.js, Docker, database, build, and the systemd service.

Manage with systemd:

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
journalctl -u airlink-panel -f
```

### Option 2: Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

# Set permissions
chown -R www-data:www-data /var/www/panel
chmod -R 755 /var/www/panel

# Install dependencies
pnpm install

# Set up environment
cp example.env .env
# Edit .env - set PORT, URL, SESSION_SECRET, and DATABASE_URL

# Build everything
pnpm run setup

# Start the panel
pnpm run start
```

`pnpm run setup` installs deps, generates the Prisma client, pushes the database schema, and builds TypeScript + CSS.

### Running with pm2

```bash
npm install -g pm2
pm2 start "pnpm run start" --name airlink-panel
pm2 save
pm2 startup
```

---

## Configuration

Copy `example.env` to `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NAME` | No | Panel display name (default: Airlink) |
| `NODE_ENV` | Yes | Set to `production` for live deployments |
| `URL` | Yes | Full URL the panel is served from, e.g. `http://192.168.1.10:3000` |
| `PORT` | Yes | Port to listen on |
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./storage/dev.db` |
| `SESSION_SECRET` | Yes | Random secret for session signing - use `openssl rand -hex 32` |

> [!IMPORTANT]
> `DATABASE_URL` must be an **absolute path** in production (e.g. `file:/var/www/panel/storage/dev.db`). Relative paths break when started from a different working directory (e.g. via systemd).

> [!IMPORTANT]
> `URL` should be the actual IP or hostname the panel is accessible from. Setting it to `http://localhost` will prevent network access and cause CSP issues.

---

## API Reference

The panel exposes a full REST API. See [`docs/specsheet.md`](docs/specsheet.md) for the complete route catalog with request/response formats, authentication details, and daemon communication.

138 HTTP routes, 4 WebSocket endpoints, HMAC-signed daemon communication, scoped API keys with granular permissions.

---

## Addon System

Addons extend the panel without modifying core files. They live under `storage/addons/` and are managed from `/admin/addons`.

See [`storage/addons/README.md`](storage/addons/README.md) for structure and API reference.

---

## Development

```bash
# Install deps
pnpm install

# Start in dev mode (auto-restart on changes)
pnpm run dev

# Typecheck
pnpm run typecheck

# Lint
pnpm run lint

# Build for production
pnpm run build
```

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

Run `pnpm run lint` and `pnpm run typecheck` before submitting.

---

## Links

- Website: [airlinklabs.xyz](https://airlinklabs.xyz/)
- Docs: [airlinklabs.xyz/docs/quick-start](https://airlinklabs.xyz/docs/quick-start/)
- Discord: [discord.gg/ujXyxwwMHc](https://discord.gg/ujXyxwwMHc)
- GitHub: [github.com/airlinklabs/panel](https://github.com/airlinklabs/panel)

## License

MIT. See [`LICENSE`](LICENSE) for details.
