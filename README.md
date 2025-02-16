> [!CAUTION]
> AirLink is in development for a while and is getting used by a few people, please wait an release version

# Airlink Panel 🚀

**Streamlined Game Server Management**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
  
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/D8YbT9rDqz)

## 📖 Overview

Airlink Panel is an advanced, open-source game server management platform designed to simplify server deployment, monitoring, and administration.

## 🛠 Prerequisites

- Node.js (v16+)
- npm (v8+)
- Git
- Supported Database (PostgreSQL/MySQL)

## 💾 Installation

1. Clone the repository:
   ```bash
   cd /var/www/
   git clone https://github.com/AirlinkLabs/panel.git
   cd panel
   ```

2. Set 755 permissions on the panel directory:
   ```bash
   sudo chown -R www-data:www-data /var/www/panel
   sudo chmod -R 755 /var/www/panel
   ```

3. Install dependencies:
   ```bash
    npm install -g typescript
    npm install --production
   ```

4. Configure the Prisma database and run migrations:
   ```bash
   npm run migrate:dev
   ```

5. Build the application:
   ```bash
   npm run build-ts
   ```

6. Run the application:
   ```bash
   npm run start
   ```

## Running with pm2 (Optional)

1. Install pm2:
   ```bash
   npm install pm2 -g
   ```

2. Start the application using pm2:
   ```bash
   pm2 start dist/app.js --name "panel"
   ```

3. Set up pm2 to auto-start on server reboot:
   ```bash
   pm2 save
   pm2 startup
   ```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow TypeScript best practices
- Write unit tests for new features
- Maintain clean, readable code
- Update documentation

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<div align="center">
  Made with ❤️ by AirLink Labs
</div>
