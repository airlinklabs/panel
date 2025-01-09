#!/bin/bash

# ANSI escape codes for colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'    # No Color

# Function to display a header
header() {
  echo -e "${BLUE}================================================${NC}"
  echo -e "${BLUE}        AirLink Panel Installation Script        ${NC}"
  echo -e "${BLUE}================================================${NC}"
}

# Function to display a section header
section() {
  echo -e "\n${YELLOW}==> ${1} ${NC}"
}

# Function to display a success message
success() {
  echo -e "${GREEN}✔ ${1}${NC}"
}

# Function to display an error message
error() {
  echo -e "${RED}✖ ${1}${NC}"
}

# Function to ask for user confirmation
confirm() {
  read -r -p "$1 [y/N]: " response
  case "$response" in
    [yY][eE][sS]|[yY])
      true
      ;;
    *)
      false
      ;;
  esac
}

# Check if the script is run with sudo
if [[ $EUID -ne 0 ]]; then
  error "This script must be run with sudo."
  exit 1
fi

header

# Agreement
section "License Agreement"
echo "By proceeding, you agree to the terms of the MIT License."
if ! confirm "Do you agree to the license terms?"; then
  error "Installation cancelled due to license disagreement."
  exit 1
fi
success "License agreement accepted."

# Installation directory
INSTALL_DIR="/var/www/panel"

# 1. Clone the repository
section "1. Cloning the repository"
if [ ! -d "/var/www" ]; then
    mkdir -p /var/www
fi
if [ -d "$INSTALL_DIR" ]; then
  if confirm "An existing installation was found at $INSTALL_DIR. Do you want to overwrite it?"; then
    rm -rf "$INSTALL_DIR"
  else
    error "Installation cancelled."
    exit 1
  fi
fi
echo "Cloning the repository into $INSTALL_DIR..."
git clone https://github.com/AirlinkLabs/panel.git "$INSTALL_DIR"
if [ $? -ne 0 ]; then
  error "Failed to clone the repository."
  exit 1
fi
success "Repository cloned successfully."

# 2. Set permissions
section "2. Setting permissions"
echo "Setting permissions for $INSTALL_DIR..."
chown -R www-data:www-data "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
if [ $? -ne 0 ]; then
  error "Failed to set permissions."
  exit 1
fi
success "Permissions set successfully."

# 3. Install dependencies
section "3. Installing dependencies"
echo "Installing TypeScript globally..."
npm install -g typescript
if [ $? -ne 0 ]; then
  error "Failed to install TypeScript."
  exit 1
fi
echo "Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install --production
if [ $? -ne 0 ]; then
  error "Failed to install npm dependencies."
  exit 1
fi
success "Dependencies installed successfully."

# 4. Configure Prisma and run migrations
section "4. Configuring Prisma and running migrations"
echo "Running Prisma migrations..."
npm run migrate:dev
if [ $? -ne 0 ]; then
  error "Failed to run Prisma migrations."
  exit 1
fi
success "Prisma migrations completed successfully."

# 5. Build the application
section "5. Building the application"
echo "Building the application..."
npm run build-ts
if [ $? -ne 0 ]; then
  error "Failed to build the application."
  exit 1
fi
success "Application built successfully."

# 6. Run the application
section "6. Running the application"
echo "Starting the application..."
npm run start &
if [ $? -ne 0 ]; then
  error "Failed to start the application."
  exit 1
fi
success "Application started successfully."

# Optional pm2 setup
section "7. Optional pm2 setup"
if confirm "Do you want to set up pm2 for process management?"; then
  echo "Installing pm2 globally..."
  npm install pm2 -g
  if [ $? -ne 0 ]; then
    error "Failed to install pm2."
  else
    echo "Starting application with pm2..."
    pm2 start dist/app.js --name "panel"
    if [ $? -ne 0 ]; then
      error "Failed to start application with pm2."
    else
      echo "Setting up pm2 to auto-start on server reboot..."
      pm2 save
      pm2 startup
      success "pm2 setup complete."
    fi
  fi
fi

# Completion message
echo -e "\n${GREEN}🎉 AirLink Panel installation complete!${NC}"
echo -e "${BLUE}================================================${NC}" 
