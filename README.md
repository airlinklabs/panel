# panel
Airlink is a simple to use Game server managment panel

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