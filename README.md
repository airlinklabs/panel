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
npm run start
```

`npm run start` applies database migrations automatically before launch.

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


## License

MIT — see [`LICENSE`](LICENSE) for details.
