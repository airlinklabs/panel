# panel
Airlink is a simple to use Game server management panel

> [!CAUTION]
> AirLink was in development for a while and was used by a few people, please wait an release version

## Installation

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
   npm run migrate:deploy
   ```

5. Build the application:
   ```bash
   npm run build
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
