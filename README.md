# panel
Airlink is a simple to use Game server management panel

## Installation

1. Clone the repository:
   ```bash
   cd /var/www/
   git clone https://github.com/AirlinkLabs/panel.git
   cd panel
   ```

2. Install dependencies:
   ```bash
    npm install --production
   ```

3. Configure the Prisma database and run migrations:
   ```bash
   npm run migrate:deploy
   ```

4. Build the application:
   ```bash
   npm run build
   ```

5. Run the application:
   ```bash
   npm run start
   ```

## Running with pm2

1. Start the application using pm2:
   ```bash
   pm2 start npm --name "panel" -- run start
   ```

2. (Optional) Set up pm2 to auto-start on server reboot:
   ```bash
   pm2 save
   pm2 startup
   ```