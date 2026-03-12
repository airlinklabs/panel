> [!CAUTION]
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->
> AirLink is currently in active development. A stable release has not yet shipped use in production at your own risk.

# Airlink Panel

**Open-source game server management**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/D8YbT9rDqz)

---

## Overview

Airlink Panel is an open-source platform for deploying, monitoring, and managing game servers. It ships with an addon system that lets you extend core functionality without modifying the base installation.

For full documentation, visit **[airlinklabs.github.io/home](https://airlinklabs.github.io/home)**.

---

## Prerequisites

- Node.js v16 or later
- npm v8 or later
- Git
- PostgreSQL or MySQL

---

## Installation

### Option 1 — Installer script

Run as root:
- **run `sudo su` then run the below script.**
```bash
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

Manage the panel with systemd:

```bash
systemctl start airlink-panel 
```
```
systemctl stop airlink-panel
```

### Option 2 — Manual

1. Clone the repository:
   ```bash
   cd /var/www/
   git clone https://github.com/AirlinkLabs/panel.git
   cd panel
   ```

2. Set permissions:
   ```bash
   sudo chown -R www-data:www-data /var/www/panel
   sudo chmod -R 755 /var/www/panel
   ```

3. Install dependencies:
   ```bash
   npm install -g typescript
   npm install --omit=dev
   ```

4. Run database migrations:
   ```bash
   npm run migrate:dev
   ```

5. Build and start:
   ```bash
   npm run build
   npm run start
   ```

### Running with pm2 (optional)

```bash
npm install pm2 -g
pm2 start dist/app.js --name "panel"
pm2 save
pm2 startup
```

---

## Addon System

Addons let you add features, modify existing behavior, and integrate with external services — without touching the core codebase.

To create an addon:

1. Create a directory under `panel/storage/addons/` named after your addon's slug
2. Add a `package.json` with your addon's metadata
3. Create an entry point (default: `index.ts`)
4. Implement your addon's logic

**Documentation:**
- [Quick Start Guide](docs/addon-quickstart.md)
- [Full Addon Reference](docs/addons.md)
- [Database Migrations](docs/addon-migrations.md)

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
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a pull request

**Guidelines:** follow TypeScript best practices, write tests for new features, keep code readable, and update docs alongside code changes.

---

## License

MIT see [`LICENSE`](LICENSE) for details.

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://jakebolam.com"><img src="https://avatars.githubusercontent.com/u/3534236?v=4?s=100" width="100px;" alt="Jake Bolam"/><br /><sub><b>Jake Bolam</b></sub></a><br /><a href="#infra-jakebolam" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/airlinklabs/panel/commits?author=jakebolam" title="Tests">⚠️</a> <a href="https://github.com/airlinklabs/panel/commits?author=jakebolam" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!