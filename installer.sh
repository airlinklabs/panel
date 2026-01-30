#!/bin/bash
############################################################################
# Copyright [2026] [thavanish]
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
############################################################################ 

set -euo pipefail

# Configuration
readonly VERSION="3.0.6-Stable"
readonly LOG="/tmp/airlink.log"
readonly NODE_VER="20"
readonly TEMP="/tmp/airlink-tmp"
readonly PRISMA_VER="6.19.1"
readonly PANEL_REPO="https://github.com/airlinklabs/panel.git"
readonly DAEMON_REPO="https://github.com/airlinklabs/daemon.git"

# ============================================================================
# ADDON CONFIGURATION - Add new addons here
# Format: "display_name|repo_url|branch|directory_name"
# ============================================================================
declare -a ADDONS=(
    "Modrinth|https://github.com/g-flame-oss/airlink-addons.git|modrinth-addon|modrinth-store"
    "Parachute|https://github.com/g-flame-oss/airlink-addons.git|parachute|parachute"
    # Add more addons below following the same format:
    # "Display Name|https://github.com/user/repo.git|branch-name|folder-name"
)
# ============================================================================

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' N='\033[0m'

# Logging
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }
info() { echo -e "${C}[INFO]${N} $*"; log "INFO: $*"; }
ok() { echo -e "${G}[OK]${N} $*"; log "OK: $*"; }
warn() { echo -e "${Y}[WARN]${N} $*"; log "WARN: $*"; }
err() { echo -e "${R}[ERROR]${N} $*"; log "ERROR: $*"; exit 1; }

# Loading spinner
show_loading() {
    local pid=$1
    local spin='-\|/'
    local i=0
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) %4 ))
        printf "\r${spin:$i:1}"
        sleep .1
    done
    printf "\r"
}

# Run command with loading indicator
run_with_loading() {
    local message=$1
    shift
    info "$message"
    "$@" &>/dev/null &
    local pid=$!
    show_loading $pid
    wait $pid
    local status=$?
    if [ $status -eq 0 ]; then
        ok "$message completed"
    else
        err "$message failed"
    fi
}

# Parse addon configuration
get_addon_field() {
    local addon_string=$1
    local field=$2
    echo "$addon_string" | cut -d'|' -f"$field"
}

# Detect OS
detect_os() {
    info "Detecting operating system..."
    if [[ -f /etc/os-release ]]; then
        # Read os-release without sourcing VERSION variable
        OS=$(grep '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
        VER=$(grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
    else
        err "Cannot detect OS"
    fi
    
    case "$OS" in
        ubuntu|debian|linuxmint|pop) FAM="debian"; PKG="apt";;
        fedora|centos|rhel|rocky|almalinux) FAM="redhat"; PKG=$(command -v dnf &>/dev/null && echo "dnf" || echo "yum");;
        arch|manjaro) FAM="arch"; PKG="pacman";;
        alpine) 
            FAM="alpine"; PKG="apk"
            warn "Alpine Linux detected - systemd services are required but Alpine uses OpenRC"
            warn "Installation may fail. Consider using a systemd-based distribution."
            dialog --yesno "Alpine Linux is not fully supported (requires systemd). Continue anyway?" 8 60 || exit 1
            ;;
        *) err "Unsupported OS: $OS";;
    esac
    ok "Detected: $OS ($FAM)"
}

# Check if systemd is available
check_systemd() {
    if ! command -v systemctl &>/dev/null; then
        err "systemd is required but not found. This installer requires a systemd-based distribution."
    fi
}

# Package installation
pkg_install() {
    info "Installing packages: $*"
    case "$PKG" in
        apt) apt-get update -qq && apt-get install -y -qq "$@";;
        dnf|yum) $PKG install -y -q "$@";;
        pacman) pacman -Sy --noconfirm --quiet "$@";;
        apk) apk add --no-cache -q "$@";;
    esac
    ok "Packages installed: $*"
}

# Check root
[[ $EUID -eq 0 ]] || { dialog --msgbox "Run as root/sudo" 6 30 2>/dev/null || echo "Run as root"; exit 1; }
 

# Detect system
detect_os

# Check for systemd (required for services)
check_systemd

# Install dependencies
info "Checking dependencies..."
deps=(curl wget dialog git jq openssl)
missing=()
for d in "${deps[@]}"; do command -v "$d" &>/dev/null || missing+=("$d"); done
if [[ ${#missing[@]} -gt 0 ]]; then
    info "Installing missing dependencies: ${missing[*]}"
    pkg_install "${missing[@]}"
else
    ok "All dependencies already installed"
fi

# Node.js setup
setup_node() {
    info "Setting up Node.js..."
    if command -v node &>/dev/null; then
        INSTALLED_VER=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$INSTALLED_VER" = "$NODE_VER" ]; then
            ok "Node.js $NODE_VER already installed, skipping"
            return
        else
            warn "Node.js version mismatch (found $(node -v)), reinstalling $NODE_VER"
        fi
    else
        info "Node.js not found, installing $NODE_VER"
    fi
    
    case "$FAM" in
        debian)
            run_with_loading "Adding NodeSource repository" bash -c "curl -fsSL 'https://deb.nodesource.com/setup_${NODE_VER}.x' | bash -"
            pkg_install nodejs
            ;;
        redhat)
            run_with_loading "Adding NodeSource repository" bash -c "curl -fsSL 'https://rpm.nodesource.com/setup_${NODE_VER}.x' | bash -"
            pkg_install nodejs
            ;;
        arch) pkg_install nodejs npm ;;
        alpine) pkg_install nodejs npm ;;
    esac
    
    if command -v node &>/dev/null; then
        ok "Node.js $(node -v) installed"
    else
        err "Node.js install failed"
    fi
    
    info "Checking TypeScript..."
    if npm list -g typescript &>/dev/null; then
        ok "TypeScript already installed"
    else
        run_with_loading "Installing TypeScript globally" npm install -g typescript
    fi
}

# Docker setup
setup_docker() {
    info "Checking for Docker..."
    if command -v docker &>/dev/null; then
        ok "Docker already installed"
        return 0
    fi
    
    info "Installing Docker..."
    case "$FAM" in
        debian|redhat) 
            run_with_loading "Downloading and installing Docker" bash -c "curl -fsSL https://get.docker.com | sh";;
            
        arch) pkg_install docker;;
        
        alpine) 
            pkg_install docker
            info "Adding Docker to boot..."
            rc-update add docker boot &>/dev/null
            ;;
    esac
    
    info "Enabling Docker service..."
    systemctl enable --now docker &>/dev/null
    
    if command -v docker &>/dev/null; then
        ok "Docker installed successfully"
    else
        err "Docker install failed"
    fi
}

# Select addons for installation (stores selection, doesn't install)
select_addons_for_install() {
    # Build dynamic menu items
    local menu_items=()
    local idx=1
    
    # Add individual addon options
    for addon in "${ADDONS[@]}"; do
        local display_name=$(get_addon_field "$addon" 1)
        menu_items+=("$idx" "Install $display_name")
        ((idx++))
    done
    
    # Add "Install All" option
    menu_items+=("$idx" "Install All Addons")
    local install_all_idx=$idx
    ((idx++))
    
    # Add skip option
    menu_items+=("$idx" "Skip Addons")
    local skip_idx=$idx
    
    # Show menu
    ADDON_CHOICES=$(dialog --title "Select Addon to Install" \
        --menu "Choose which addon to install:" \
        $((15 + ${#ADDONS[@]})) 70 $((${#ADDONS[@]} + 2)) \
        "${menu_items[@]}" 3>&1 1>&2 2>&3) || ADDON_CHOICES="$skip_idx"
}

# Collect all configuration upfront
collect_all_config() {
    info "Collecting configuration for all components..."
    
    # Panel configuration
    PANEL_NAME=$(dialog --inputbox "Panel name" 8 40 "Airlink" 3>&1 1>&2 2>&3) || PANEL_NAME="Airlink"
    PANEL_PORT=$(dialog --inputbox "Panel Port" 8 40 "3000" 3>&1 1>&2 2>&3) || PANEL_PORT=3000
    
    # Daemon configuration
    PANEL_ADDRESS=$(dialog --inputbox "Panel ip/hostname" 8 40 "127.0.0.1" 3>&1 1>&2 2>&3) || PANEL_ADDRESS="127.0.0.1"
    DAEMON_PORT=$(dialog --inputbox "Daemon Port" 8 40 "3002" 3>&1 1>&2 2>&3) || DAEMON_PORT=3002
    DAEMON_KEY=$(dialog --inputbox "Daemon Auth Key" 8 40 3>&1 1>&2 2>&3) || DAEMON_KEY="get from panel's node setup page"
    
    # Admin user configuration
    ADMIN_EMAIL=$(dialog --inputbox "Admin Email:" 8 50 "admin@example.com" 3>&1 1>&2 2>&3) || ADMIN_EMAIL="admin@example.com"
    ADMIN_USERNAME=$(dialog --inputbox "Admin Username (3-20 chars, letters/numbers only):" 8 60 "admin" 3>&1 1>&2 2>&3) || ADMIN_USERNAME="admin"
    
    # Password with validation
    while true; do
        ADMIN_PASSWORD=$(dialog --inputbox "Admin Password (min 8 chars, must have letter & number):" 8 70 3>&1 1>&2 2>&3)
        
        # Validate password
        if [[ ${#ADMIN_PASSWORD} -ge 8 ]] && [[ "$ADMIN_PASSWORD" =~ [A-Za-z] ]] && [[ "$ADMIN_PASSWORD" =~ [0-9] ]]; then
            break
        else
            dialog --msgbox "Password must be at least 8 characters with at least one letter and one number. Please try again." 8 60
        fi
    done
    
    # Validate username
    if [[ ! "$ADMIN_USERNAME" =~ ^[A-Za-z0-9]{3,20}$ ]]; then
        warn "Invalid username format. Using default: admin"
        ADMIN_USERNAME="admin"
    fi
    
    # Addon selection
    select_addons_for_install
    
     
    ok "Configuration collected"
}

# Create admin user using the panel's registration API
create_admin_user() {
    local use_collected=${1:-false}
    
    info "Creating admin user via registration API..."
    
    # Get user details via dialog only if not already collected
    if [ "$use_collected" = false ]; then
        ADMIN_EMAIL=$(dialog --inputbox "Admin Email:" 8 50 "admin@example.com" 3>&1 1>&2 2>&3) || ADMIN_EMAIL="admin@example.com"
        ADMIN_USERNAME=$(dialog --inputbox "Admin Username (3-20 chars, letters/numbers only):" 8 60 "admin" 3>&1 1>&2 2>&3) || ADMIN_USERNAME="admin"
        
        # Password with validation
        while true; do
            ADMIN_PASSWORD=$(dialog --inputbox "Admin Password (min 8 chars, must have letter & number):" 8 70 3>&1 1>&2 2>&3)
            
            # Validate password
            if [[ ${#ADMIN_PASSWORD} -ge 8 ]] && [[ "$ADMIN_PASSWORD" =~ [A-Za-z] ]] && [[ "$ADMIN_PASSWORD" =~ [0-9] ]]; then
                break
            else
                dialog --msgbox "Password must be at least 8 characters with at least one letter and one number. Please try again." 8 60
            fi
        done
        
         
        
        # Validate username
        if [[ ! "$ADMIN_USERNAME" =~ ^[A-Za-z0-9]{3,20}$ ]]; then
            warn "Invalid username format. Using default: admin"
            ADMIN_USERNAME="admin"
        fi
    else
        # Using pre-collected variables, just validate username
        if [[ ! "$ADMIN_USERNAME" =~ ^[A-Za-z0-9]{3,20}$ ]]; then
            warn "Invalid username format. Using default: admin"
            ADMIN_USERNAME="admin"
        fi
    fi
    
    # Wait for panel to be fully running
    info "Waiting for panel to start..."
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -s "http://localhost:${PANEL_PORT}" > /dev/null 2>&1; then
            ok "Panel is responding on port ${PANEL_PORT}"
            break
        fi
        sleep 2
        waited=$((waited + 2))
    done
    
    if [ $waited -ge $max_wait ]; then
        warn "Panel took longer than expected to start, continuing anyway..."
    fi
    
    # Get CSRF token first
    info "Getting CSRF token..."
    CSRF_TOKEN=$(curl -s -c /tmp/cookies.txt "http://localhost:${PANEL_PORT}/register" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -n1)
    
    if [ -z "$CSRF_TOKEN" ]; then
        warn "Could not get CSRF token, trying without it..."
    else
        info "CSRF token obtained"
    fi
    
    # Make registration request
    info "Registering admin user..."
    RESPONSE=$(curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt \
        -X POST "http://localhost:${PANEL_PORT}/register" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "username=${ADMIN_USERNAME}" \
        --data-urlencode "email=${ADMIN_EMAIL}" \
        --data-urlencode "password=${ADMIN_PASSWORD}" \
        --data-urlencode "_csrf=${CSRF_TOKEN}" \
        -w "\n%{http_code}" \
        -L)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    # Clean up cookies
    rm -f /tmp/cookies.txt
    
    # Check response
    if [[ "$HTTP_CODE" == "302" ]] || [[ "$HTTP_CODE" == "200" ]]; then
        # Check if redirected to error
        if echo "$BODY" | grep -q "err="; then
            ERROR_TYPE=$(echo "$BODY" | sed -n 's/.*err=\([^&"]*\).*/\1/p' | head -n1)
            case "$ERROR_TYPE" in
                "user_already_exists")
                    warn "User already exists with this email/username"
                    ;;
                "invalid_username")
                    err "Invalid username format"
                    ;;
                "weak_password")
                    err "Password does not meet security requirements"
                    ;;
                *)
                    info "Registration completed (status: $ERROR_TYPE)"
                    ;;
            esac
            return 1
        else
            ok "Admin user created successfully!"
            info "Login credentials:"
            echo -e "  ${C}Username:${N} ${ADMIN_USERNAME}"
            echo -e "  ${C}Email:${N} ${ADMIN_EMAIL}"
            sleep 3
            return 0
        fi
    else
        warn "Registration returned HTTP $HTTP_CODE, user may already exist"
        return 1
    fi
}

# Panel installation
install_panel() {
    local skip_config=${1:-false}
    
    info "Starting Panel installation..."
    
    # Get ALL configuration upfront if not already collected
    if [ "$skip_config" = false ]; then
        PANEL_NAME=$(dialog --inputbox "Panel name" 8 40 "Airlink" 3>&1 1>&2 2>&3) || PANEL_NAME="Airlink"
        PANEL_PORT=$(dialog --inputbox "Panel Port" 8 40 "3000" 3>&1 1>&2 2>&3) || PANEL_PORT=3000
        
        # Collect admin user info upfront
        ADMIN_EMAIL=$(dialog --inputbox "Admin Email:" 8 50 "admin@example.com" 3>&1 1>&2 2>&3) || ADMIN_EMAIL="admin@example.com"
        ADMIN_USERNAME=$(dialog --inputbox "Admin Username (3-20 chars, letters/numbers only):" 8 60 "admin" 3>&1 1>&2 2>&3) || ADMIN_USERNAME="admin"
        
        # Password with validation
        while true; do
            ADMIN_PASSWORD=$(dialog --inputbox "Admin Password (min 8 chars, must have letter & number):" 8 70 3>&1 1>&2 2>&3)
            
            # Validate password
            if [[ ${#ADMIN_PASSWORD} -ge 8 ]] && [[ "$ADMIN_PASSWORD" =~ [A-Za-z] ]] && [[ "$ADMIN_PASSWORD" =~ [0-9] ]]; then
                break
            else
                dialog --msgbox "Password must be at least 8 characters with at least one letter and one number. Please try again." 8 60
            fi
        done
        
        # Validate username
        if [[ ! "$ADMIN_USERNAME" =~ ^[A-Za-z0-9]{3,20}$ ]]; then
            warn "Invalid username format. Using default: admin"
            ADMIN_USERNAME="admin"
        fi
        
        # Select addons upfront
        select_addons_for_install
        
         
    fi
    
    # Clone and setup
    info "Preparing directories..."
    [ -d /var/www ] || mkdir -p /var/www
    cd /var/www || err "Cannot access /var/www"
    
    info "Deleting old panel folder if it exists (last warning)..."
    for i in {5..1}; do
        echo -ne "\rWaiting: $i seconds remaining..."
        sleep 1
    done
    echo -e "\rProceeding...                    "
    
    rm -rf panel
    run_with_loading "Cloning Panel repository" git clone ${PANEL_REPO}
    
    cd panel

    # Set permissions
    info "Setting permissions..."
    chown -R www-data:www-data /var/www/panel
    chmod -R 755 /var/www/panel
    ok "Permissions set"
    
    # Create .env
    info "Creating .env file..."
    cat > .env << EOF
NAME=${PANEL_NAME}
NODE_ENV="development"
URL="http://localhost:${PANEL_PORT}"
PORT=${PANEL_PORT}
DATABASE_URL="file:./dev.db" 
SESSION_SECRET=$(openssl rand -hex 32)
EOF
    ok ".env file created"
    
    # Install dependencies
    run_with_loading "Installing npm dependencies" npm install --omit=dev
    
    # Install bcrypt for password hashing
    info "Installing bcrypt..."
    npm install bcrypt &>/dev/null || warn "Bcrypt install warning"
    
    # Install Prisma
    info "Checking Prisma installation..."
    if command -v prisma &>/dev/null; then
        INSTALLED_VER=$(prisma -v | grep "prisma" | head -n1 | awk '{print $2}')
        if [ "$INSTALLED_VER" = "$PRISMA_VER" ]; then
            ok "Prisma $PRISMA_VER already installed"
        else
            warn "Prisma version mismatch (found $INSTALLED_VER), reinstalling $PRISMA_VER"
            info "Uninstalling old Prisma..."
            npm uninstall -g prisma &>/dev/null
            npm uninstall prisma @prisma/client &>/dev/null
            npm cache clean --force &>/dev/null
            run_with_loading "Installing Prisma $PRISMA_VER" npm install prisma@$PRISMA_VER @prisma/client@$PRISMA_VER
        fi
    else
        run_with_loading "Installing Prisma $PRISMA_VER" npm install prisma@$PRISMA_VER @prisma/client@$PRISMA_VER
    fi

    run_with_loading "Running database migrations" bash -c "CI=true npm run migrate:dev"
    
    info "Building Panel (this will show build output)..."
    npm run build || err "Build failed"
    ok "Panel build completed"
    
    run_with_loading "Seeding database with images" npm run seed

    # Enable registration temporarily - FIXED VERSION
    info "Enabling registration for first admin user..."
    cat > enable-reg.js << 'EOFJS'
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const panelName = process.env.PANEL_NAME || "Airlink";

async function enableRegistration() {
    try {
        let settings = await prisma.settings.findFirst();
        
        if (!settings) {
            await prisma.settings.create({
                data: {
                    allowRegistration: true,
                    title: panelName,
                    description: 'AirLink is a free and open source project by AirlinkLabs',
                    logo: '../assets/logo.png',
                    favicon: '../assets/favicon.ico',
                    theme: 'default',
                    language: 'en'
                }
            });
            console.log("Settings created with registration enabled");
        } else {
            await prisma.settings.update({
                where: { id: settings.id },
                data: { allowRegistration: true }
            });
            console.log("Registration enabled");
        }
        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Error:", error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
}

enableRegistration();
EOFJS

    PANEL_NAME="${PANEL_NAME}" node enable-reg.js
    rm -f enable-reg.js
    ok "Registration enabled"

    # Install and start PM2 temporarily for user creation
    info "Installing PM2..."
    npm install -g pm2 &>/dev/null || err "PM2 install failed"

    info "Starting panel temporarily with PM2..."
    cd /var/www/panel
    pm2 start npm --name "airlink-panel-temp" -- run start &>/dev/null
    ok "Panel started temporarily"

    # Create admin user via API (skip prompt if called from install_all)
    if [ "$skip_config" = false ]; then
        # Always use pre-collected variables (true) since we now collect them at the start
        create_admin_user true
            #warn "Admin user creation encountered an issue"
            #SERVER_IP=$(hostname -I | awk '{print $1}')
            #info "You can create it manually at: http://${SERVER_IP}:${PANEL_PORT}/register"
        
    else
        # When skip_config is true (from install_all), create user automatically without prompting
         
        create_admin_user true
            #warn "Admin user creation encountered an issue"
            #SERVER_IP=$(hostname -I | awk '{print $1}')
            #info "You can create it manually at: http://${SERVER_IP}:${PANEL_PORT}/register"
    
    fi

    # Disable registration after first user
    info "Disabling public registration..."
    cat > disable-reg.js << 'EOFJS'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function disableRegistration() {
    try {
        const settings = await prisma.settings.findFirst();
        if (settings) {
            await prisma.settings.update({
                where: { id: settings.id },
                data: { allowRegistration: false }
            });
            console.log("Registration disabled");
        }
        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Error:", error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
}

disableRegistration();
EOFJS

    node disable-reg.js
    rm -f disable-reg.js
    ok "Registration disabled"

    # Stop temporary PM2 process
    info "Stopping temporary panel..."
    pm2 delete airlink-panel-temp &>/dev/null
    pm2 save --force &>/dev/null
    ok "Temporary panel stopped"
    
    # Create systemd service
    info "Creating systemd service..."
    cat > /etc/systemd/system/airlink-panel.service << EOF
[Unit]
Description=Airlink Panel
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/panel
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
EOF
    ok "Systemd service created"
    
    info "Starting Panel service..."
    systemctl daemon-reload
    systemctl enable --now airlink-panel &>/dev/null
    ok "Panel service started"

    # Process addon selections (installs the addons that were selected at the start)
    process_addon_selections
    
    ok "Panel installation completed on port ${PANEL_PORT}"
}

# Daemon installation
install_daemon() {
    local skip_config=${1:-false}
    
    info "Starting Daemon installation..."
    
    # Get configuration if not already collected
    if [ "$skip_config" = false ]; then
        PANEL_ADDRESS=$(dialog --inputbox "Panel ip/hostname" 8 40 "127.0.0.1" 3>&1 1>&2 2>&3) || PANEL_ADDRESS="127.0.0.1"
        DAEMON_PORT=$(dialog --inputbox "Daemon Port" 8 40 "3002" 3>&1 1>&2 2>&3) || DAEMON_PORT=3002
        DAEMON_KEY=$(dialog --inputbox "Daemon Auth Key" 8 40 3>&1 1>&2 2>&3) || DAEMON_KEY="get from panel's node setup page"
         
    fi
    
    info "Preparing directories..."
    cd /etc || err "Cannot access /etc"
    
    info "Deleting old daemon folder if it exists (last warning)..."
    for i in {5..1}; do
        echo -ne "\rWaiting: $i seconds remaining..."
        sleep 1
    done
    echo -e "\rProceeding...                    "
    
    rm -rf daemon
    run_with_loading "Cloning Daemon repository" git clone ${DAEMON_REPO}
    
    cd daemon
    
    # Create .env
    info "Creating .env file..."
    cat > .env << EOF
remote="${PANEL_ADDRESS}"
key="${DAEMON_KEY}"
port=${DAEMON_PORT}
DEBUG=false
version=1.0.0
environment=development
STATS_INTERVAL=10000
EOF
    ok ".env file created"
    
    run_with_loading "Installing npm dependencies" npm install --omit=dev
    run_with_loading "Installing express" npm install express
    
    info "Building Daemon (this will show build output)..."
    npm run build || err "Build failed"
    ok "Daemon build completed"
    
    info "Building libs..."
    cd libs
    run_with_loading "Installing libs dependencies" npm install
    run_with_loading "Rebuilding native modules" npm rebuild
    cd ..
    
    info "Setting permissions..."
    chown -R www-data:www-data /etc/daemon
    ok "Permissions set"
    
    # Create systemd service
    info "Creating systemd service..."
    cat > /etc/systemd/system/airlink-daemon.service << EOF
[Unit]
Description=Airlink Daemon
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/daemon
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
EOF
    ok "Systemd service created"
    
    info "Starting Daemon service..."
    systemctl daemon-reload
    systemctl enable --now airlink-daemon &>/dev/null
    ok "Daemon service started"
    
    ok "Daemon installation completed on port ${DAEMON_PORT}"
}

# Install both
install_all() {
    info "Starting full installation (Node.js, Docker, Panel, Daemon)..."
    
    # Collect all configuration upfront
    collect_all_config
    
    # Setup dependencies
    setup_node
    setup_docker
    
    # Install components with skip_config flag
    install_panel true
    install_daemon true
    
    dialog --msgbox "Installation Complete!\n\nPanel: http://$(hostname -I | awk '{print $1}'):${PANEL_PORT}\nDaemon: Running on port ${DAEMON_PORT}\n\nCheck logs: journalctl -u airlink-panel -f" 14 60
     
    ok "Full installation completed successfully"
}

# Uninstall functions
remove_panel() {
    info "Removing Panel..."
    info "Stopping Panel service..."
    systemctl stop airlink-panel &>/dev/null || true
    info "Disabling Panel service..."
    systemctl disable airlink-panel &>/dev/null || true
    info "Removing service file..."
    rm -f /etc/systemd/system/airlink-panel.service
    info "Removing Panel directory..."
    rm -rf /var/www/panel
    info "Reloading systemd..."
    systemctl daemon-reload
    ok "Panel removed successfully"
}

remove_daemon() {
    info "Removing Daemon..."
    info "Stopping Daemon service..."
    systemctl stop airlink-daemon &>/dev/null || true
    info "Disabling Daemon service..."
    systemctl disable airlink-daemon &>/dev/null || true
    info "Removing service file..."
    rm -f /etc/systemd/system/airlink-daemon.service
    info "Removing Daemon directory..."
    rm -rf /etc/daemon
    info "Reloading systemd..."
    systemctl daemon-reload
    ok "Daemon removed successfully"
}

remove_deps() {
    info "Removing dependencies..."
    case "$FAM" in
        debian) 
            info "Removing Node.js, npm, and Docker..."
            apt-get remove -y nodejs npm docker.io &>/dev/null
            ;;
        redhat) 
            info "Removing Node.js, npm, and Docker..."
            $PKG remove -y nodejs npm docker &>/dev/null
            ;;
        arch) 
            info "Removing Node.js, npm, and Docker..."
            pacman -R --noconfirm nodejs npm docker &>/dev/null
            ;;
        alpine) 
            info "Removing Node.js, npm, and Docker..."
            apk del nodejs npm docker &>/dev/null
            ;;
    esac
    ok "Dependencies removed successfully"
}

# Process previously selected addons
process_addon_selections() {
    if [ -z "$ADDON_CHOICES" ]; then
        info "No addons selected, skipping..."
        return
    fi
    
    info "Processing addon selection..."
    
    local install_all_idx=$((${#ADDONS[@]} + 1))
    local skip_idx=$((${#ADDONS[@]} + 2))
    
    # Check if "Install All" was selected
    if [ "$ADDON_CHOICES" = "$install_all_idx" ]; then
        for addon in "${ADDONS[@]}"; do
            install_single_addon "$addon"
        done
        return
    fi
    
    # Check if "Skip" was selected
    if [ "$ADDON_CHOICES" = "$skip_idx" ]; then
        info "Skipping addon installation"
        return
    fi
    
    # Install the selected addon
    if [ "$ADDON_CHOICES" -le "${#ADDONS[@]}" ]; then
        install_single_addon "${ADDONS[$((ADDON_CHOICES-1))]}"
    fi
}

# Generic addon installer
install_single_addon() {
    local addon_config=$1
    local display_name=$(get_addon_field "$addon_config" 1)
    local repo_url=$(get_addon_field "$addon_config" 2)
    local branch=$(get_addon_field "$addon_config" 3)
    local dir_name=$(get_addon_field "$addon_config" 4)
    
    info "Installing $display_name addon..."
    cd /var/www/panel/storage/addons/
    
    run_with_loading "Cloning $display_name repository" git clone --branch "$branch" "$repo_url" "$dir_name"
    
    cd "/var/www/panel/storage/addons/$dir_name/"
    run_with_loading "Installing dependencies" npm install
    
    info "Building $display_name addon (this will show build output)..."
    npm run build
    ok "$display_name addon installed successfully"
}

# Install addons
install_addons() {
    local from_install=${1:-false}
    
    # Build dynamic menu items
    local menu_items=()
    local idx=1
    
    # Add individual addon options
    for addon in "${ADDONS[@]}"; do
        local display_name=$(get_addon_field "$addon" 1)
        local repo_url=$(get_addon_field "$addon" 2)
        menu_items+=("$idx" "Install $display_name ($repo_url)")
        ((idx++))
    done
    
    # Add "Install All" option
    menu_items+=("$idx" "Install All Addons")
    local install_all_idx=$idx
    ((idx++))
    
    if [ "$from_install" = true ]; then
        # Add skip option for installation context
        menu_items+=("$idx" "Skip")
        local skip_idx=$idx
        
        choice=$(dialog --title "Install Panel Addons?" --menu "Choose action:" $((12 + ${#ADDONS[@]})) 70 $((${#ADDONS[@]} + 2)) \
            "${menu_items[@]}" 3>&1 1>&2 2>&3) || return
        
        if [ "$choice" -eq "$skip_idx" ]; then
            return
        elif [ "$choice" -eq "$install_all_idx" ]; then
            for addon in "${ADDONS[@]}"; do
                install_single_addon "$addon"
            done
        else
            install_single_addon "${ADDONS[$((choice-1))]}"
        fi
    else
        # Full menu when called from main menu
        menu_items+=("0" "Exit")
        
        while true; do
            choice=$(dialog --title "Install Panel Addons?" --menu "Choose action:" $((15 + ${#ADDONS[@]})) 70 $((${#ADDONS[@]} + 2)) \
                "${menu_items[@]}" 3>&1 1>&2 2>&3) || break
            
            if [ "$choice" -eq 0 ]; then
                 
                break
            elif [ "$choice" -eq "$install_all_idx" ]; then
                for addon in "${ADDONS[@]}"; do
                    install_single_addon "$addon"
                done
            else
                install_single_addon "${ADDONS[$((choice-1))]}"
            fi
        done
    fi
     
}

# Main menu
main_menu() {
    while true; do
        choice=$(dialog --title "Airlink Installer v${VERSION}" --menu "Choose action:" 20 60 11 \
            1 "Install Both" \
            2 "Install Panel" \
            3 "Install Daemon" \
            4 "Install Addons" \
            5 "Setup Dependencies Only" \
            6 "Remove Panel" \
            7 "Remove Daemon" \
            8 "Remove Dependencies" \
            9 "Remove Everything" \
            10 "View Logs" \
            0 "Exit" 3>&1 1>&2 2>&3) || break
        
        case $choice in
            1) install_all;;
            2) setup_node; setup_docker; install_panel false;;
            3) setup_node; setup_docker; install_daemon false;;
            4) install_addons false;;
            5) setup_node; setup_docker;;
            6) dialog --yesno "Remove Panel?" 6 30 && remove_panel;;
            7) dialog --yesno "Remove Daemon?" 6 30 && remove_daemon;;
            8) dialog --yesno "Remove Dependencies?" 6 30 && remove_deps;;
            9) dialog --yesno "Remove EVERYTHING?" 7 40 && {
                    remove_panel
                    remove_daemon
                    remove_deps
                };;
            10) [[ -f "$LOG" ]] && dialog --textbox "$LOG" 20 80 || dialog --msgbox "No logs found" 6 30;;
            0)  ; echo -e "${G}Thanks for using Airlink Installer!${N}"; exit 0;;
        esac
    done
     
}

# Cleanup on exit
trap 'rm -rf "$TEMP" /var/www/panel/enable-reg.js /var/www/panel/disable-reg.js /tmp/cookies.txt' EXIT

# Start
info "Starting Airlink Installer v${VERSION}..."
touch "$LOG"
log "=== Airlink Installer v${VERSION} started ==="
main_menu

# Heya there! what are you doing here?
