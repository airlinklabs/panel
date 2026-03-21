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

readonly VERSION="3.0.6-Stable"
readonly LOG="/tmp/airlink.log"
readonly NODE_VER="20"
readonly TEMP="/tmp/airlink-tmp"
readonly PRISMA_VER="6.19.1"
readonly PANEL_REPO="https://github.com/airlinklabs/panel.git"
readonly DAEMON_REPO="https://github.com/airlinklabs/daemon.git"

# ============================================================================
# ADDON CONFIGURATION
# Format: "display_name|repo_url|branch|directory_name"
# ============================================================================
declare -a ADDONS=(
    "Modrinth|https://github.com/airlinklabs/addons.git|modrinth|modrinth"
    "Parachute|https://github.com/airlinklabs/addons.git|parachute|parachute"
)
# ============================================================================

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' N='\033[0m'

# Logging
log()  { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }
info() { echo -e "${C}[INFO]${N} $*"; log "INFO: $*"; }
ok()   { echo -e "${G}[OK]${N} $*";   log "OK: $*"; }
warn() { echo -e "${Y}[WARN]${N} $*"; log "WARN: $*"; }
err()  { echo -e "${R}[ERROR]${N} $*"; log "ERROR: $*"; exit 1; }

# -- Arg parsing --------------------------------------------------------------
# These are set by CLI args and fall back to dialog prompts when empty.
ARG_MODE=""          # "both" | "panel" | "daemon"
ARG_NAME=""
ARG_PORT=""
ARG_ADMIN_EMAIL=""
ARG_ADMIN_USER=""
ARG_ADMIN_PASS=""
ARG_PANEL_ADDR=""
ARG_DAEMON_PORT=""
ARG_DAEMON_KEY=""
ARG_ADDONS=""        # comma-separated: "modrinth,parachute"

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --panel-only)  ARG_MODE="panel";  shift ;;
            --daemon-only) ARG_MODE="daemon"; shift ;;
            --name)        ARG_NAME="$2";       shift 2 ;;
            --port)        ARG_PORT="$2";       shift 2 ;;
            --admin-email) ARG_ADMIN_EMAIL="$2"; shift 2 ;;
            --admin-user)  ARG_ADMIN_USER="$2"; shift 2 ;;
            --admin-pass)  ARG_ADMIN_PASS="$2"; shift 2 ;;
            --panel-addr)  ARG_PANEL_ADDR="$2"; shift 2 ;;
            --daemon-port) ARG_DAEMON_PORT="$2"; shift 2 ;;
            --daemon-key)  ARG_DAEMON_KEY="$2"; shift 2 ;;
            --addons)      ARG_ADDONS="$2";     shift 2 ;;
            *) warn "Unknown argument: $1"; shift ;;
        esac
    done
}

# Returns true if any CLI arg was passed (non-interactive mode)
is_noninteractive() {
    [[ -n "$ARG_MODE" || -n "$ARG_NAME" || -n "$ARG_PORT" || -n "$ARG_ADMIN_EMAIL" \
    || -n "$ARG_ADMIN_USER" || -n "$ARG_ADMIN_PASS" || -n "$ARG_PANEL_ADDR" \
    || -n "$ARG_DAEMON_PORT" || -n "$ARG_DAEMON_KEY" || -n "$ARG_ADDONS" ]]
}

# Wrapper: returns $2 if non-empty, otherwise prompts via dialog
# Usage: prompt_or_default <arg_value> <default> <dialog_args...>
dialog_input() {
    local prefilled="$1"; shift
    local default="$1"; shift
    if [[ -n "$prefilled" ]]; then
        echo "$prefilled"
    else
        dialog "$@" 3>&1 1>&2 2>&3 || echo "$default"
    fi
}

# -- Spinner ------------------------------------------------------------------
show_loading() {
    local pid=$1
    local spin='-\|/'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i+1) % 4 ))
        printf "\r${spin:$i:1}"
        sleep .1
    done
    printf "\r"
}

run_with_loading() {
    local message=$1; shift
    info "$message"
    "$@" &>/dev/null &
    local pid=$!
    show_loading "$pid"
    wait "$pid"
    local status=$?
    if [[ $status -eq 0 ]]; then
        ok "$message completed"
    else
        err "$message failed"
    fi
}

# -- Addon helpers ------------------------------------------------------------
get_addon_field() {
    echo "$1" | cut -d'|' -f"$2"
}

# -- OS detection -------------------------------------------------------------
detect_os() {
    info "Detecting operating system..."
    if [[ -f /etc/os-release ]]; then
        OS=$(grep '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
        VER=$(grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
    else
        err "Cannot detect OS"
    fi

    case "$OS" in
        ubuntu|debian|linuxmint|pop)          FAM="debian"; PKG="apt" ;;
        fedora|centos|rhel|rocky|almalinux)   FAM="redhat"; PKG=$(command -v dnf &>/dev/null && echo "dnf" || echo "yum") ;;
        arch|manjaro)                          FAM="arch";   PKG="pacman" ;;
        alpine)
            FAM="alpine"; PKG="apk"
            warn "Alpine Linux detected — systemd services are required but Alpine uses OpenRC"
            warn "Installation may fail. Consider using a systemd-based distribution."
            if ! is_noninteractive; then
                dialog --yesno "Alpine Linux is not fully supported (requires systemd). Continue anyway?" 8 60 || exit 1
            fi
            ;;
        *) err "Unsupported OS: $OS" ;;
    esac
    ok "Detected: $OS ($FAM)"
}

check_systemd() {
    command -v systemctl &>/dev/null || err "systemd is required but not found."
}

pkg_install() {
    info "Installing packages: $*"
    case "$PKG" in
        apt)        apt-get update -qq && apt-get install -y -qq "$@" ;;
        dnf|yum)    $PKG install -y -q "$@" ;;
        pacman)     pacman -Sy --noconfirm --quiet "$@" ;;
        apk)        apk add --no-cache -q "$@" ;;
    esac
    ok "Packages installed: $*"
}

# -- Dependency bootstrap -----------------------------------------------------
[[ $EUID -eq 0 ]] || { echo "Run as root/sudo"; exit 1; }

detect_os
check_systemd

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

# -- Node.js ------------------------------------------------------------------
setup_node() {
    info "Setting up Node.js..."
    if command -v node &>/dev/null; then
        local installed
        installed=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$installed" == "$NODE_VER" ]]; then
            ok "Node.js $NODE_VER already installed, skipping"
            return
        fi
        warn "Node.js version mismatch (found $(node -v)), reinstalling $NODE_VER"
    fi

    case "$FAM" in
        debian) run_with_loading "Adding NodeSource repository" bash -c "curl -fsSL 'https://deb.nodesource.com/setup_${NODE_VER}.x' | bash -"; pkg_install nodejs ;;
        redhat) run_with_loading "Adding NodeSource repository" bash -c "curl -fsSL 'https://rpm.nodesource.com/setup_${NODE_VER}.x' | bash -"; pkg_install nodejs ;;
        arch)   pkg_install nodejs npm ;;
        alpine) pkg_install nodejs npm ;;
    esac

    command -v node &>/dev/null || err "Node.js install failed"
    ok "Node.js $(node -v) installed"

    if npm list -g typescript &>/dev/null; then
        ok "TypeScript already installed"
    else
        run_with_loading "Installing TypeScript globally" npm install -g typescript
    fi
}

# -- Docker -------------------------------------------------------------------
setup_docker() {
    info "Checking for Docker..."
    if command -v docker &>/dev/null; then
        ok "Docker already installed"
        return
    fi

    info "Installing Docker..."
    case "$FAM" in
        debian|redhat) run_with_loading "Downloading and installing Docker" bash -c "curl -fsSL https://get.docker.com | sh" ;;
        arch)          pkg_install docker ;;
        alpine)        pkg_install docker; rc-update add docker boot &>/dev/null ;;
    esac

    systemctl enable --now docker &>/dev/null
    command -v docker &>/dev/null || err "Docker install failed"
    ok "Docker installed successfully"
}

# -- Validate credentials -----------------------------------------------------
validate_username() {
    local u="$1"
    [[ "$u" =~ ^[A-Za-z0-9]{3,20}$ ]] || { warn "Invalid username '$u', falling back to 'admin'"; echo "admin"; return; }
    echo "$u"
}

validate_password() {
    local p="$1"
    [[ ${#p} -ge 8 && "$p" =~ [A-Za-z] && "$p" =~ [0-9] ]]
}

# -- Config collection --------------------------------------------------------
collect_panel_config() {
    PANEL_NAME=$(dialog_input "$ARG_NAME" "Airlink" --inputbox "Panel name" 8 40 "Airlink")
    PANEL_PORT=$(dialog_input "$ARG_PORT" "3000"    --inputbox "Panel Port" 8 40 "3000")
}

collect_admin_config() {
    ADMIN_EMAIL=$(dialog_input "$ARG_ADMIN_EMAIL" "admin@example.com" --inputbox "Admin Email:" 8 50 "admin@example.com")
    ADMIN_USERNAME=$(validate_username "$(dialog_input "$ARG_ADMIN_USER" "admin" --inputbox "Admin Username (3-20 chars, letters/numbers only):" 8 60 "admin")")

    if [[ -n "$ARG_ADMIN_PASS" ]]; then
        validate_password "$ARG_ADMIN_PASS" || err "Password must be 8+ chars with at least one letter and one number."
        ADMIN_PASSWORD="$ARG_ADMIN_PASS"
    else
        while true; do
            ADMIN_PASSWORD=$(dialog --inputbox "Admin Password (min 8 chars, must have letter & number):" 8 70 3>&1 1>&2 2>&3)
            validate_password "$ADMIN_PASSWORD" && break
            dialog --msgbox "Password must be at least 8 characters with at least one letter and one number." 8 60
        done
    fi
}

collect_daemon_config() {
    PANEL_ADDRESS=$(dialog_input "$ARG_PANEL_ADDR"  "127.0.0.1"              --inputbox "Panel ip/hostname" 8 40 "127.0.0.1")
    DAEMON_PORT=$(dialog_input   "$ARG_DAEMON_PORT" "3002"                   --inputbox "Daemon Port"       8 40 "3002")
    DAEMON_KEY=$(dialog_input    "$ARG_DAEMON_KEY"  "get from panel → Nodes" --inputbox "Daemon Auth Key"   8 40)
}

collect_addon_selection() {
    if [[ -n "$ARG_ADDONS" ]]; then
        ADDON_CHOICES="$ARG_ADDONS"
        return
    fi

    local menu_items=()
    local idx=1
    for addon in "${ADDONS[@]}"; do
        local name; name=$(get_addon_field "$addon" 1)
        menu_items+=("$idx" "Install $name")
        ((idx++))
    done
    menu_items+=("$idx" "Install All Addons"); local all_idx=$idx; ((idx++))
    menu_items+=("$idx" "Skip Addons");        local skip_idx=$idx

    local choice
    choice=$(dialog --title "Select Addon to Install" \
        --menu "Choose which addon to install:" \
        $((15 + ${#ADDONS[@]})) 70 $((${#ADDONS[@]} + 2)) \
        "${menu_items[@]}" 3>&1 1>&2 2>&3) || choice="$skip_idx"

    if [[ "$choice" == "$all_idx" ]]; then
        ADDON_CHOICES="all"
    elif [[ "$choice" == "$skip_idx" ]]; then
        ADDON_CHOICES=""
    else
        ADDON_CHOICES=$(get_addon_field "${ADDONS[$((choice-1))]}" 4)
    fi
}

collect_all_config() {
    collect_panel_config
    collect_daemon_config
    collect_admin_config
    collect_addon_selection
}

# -- Admin user creation via API ----------------------------------------------
create_admin_user() {
    info "Waiting for panel to start..."
    local waited=0
    while [[ $waited -lt 30 ]]; do
        curl -s "http://localhost:${PANEL_PORT}" > /dev/null 2>&1 && break
        sleep 2
        waited=$((waited + 2))
    done
    [[ $waited -ge 30 ]] && warn "Panel took longer than expected to start, continuing anyway..."

    info "Getting CSRF token..."
    local csrf
    csrf=$(curl -s -c /tmp/cookies.txt "http://localhost:${PANEL_PORT}/register" \
        | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -n1)
    [[ -z "$csrf" ]] && warn "Could not get CSRF token, trying without it..."

    info "Registering admin user..."
    local response http_code body
    response=$(curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt \
        -X POST "http://localhost:${PANEL_PORT}/register" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "username=${ADMIN_USERNAME}" \
        --data-urlencode "email=${ADMIN_EMAIL}" \
        --data-urlencode "password=${ADMIN_PASSWORD}" \
        --data-urlencode "_csrf=${csrf}" \
        -w "\n%{http_code}" -L)

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    rm -f /tmp/cookies.txt

    if [[ "$http_code" == "302" || "$http_code" == "200" ]]; then
        if echo "$body" | grep -q "err="; then
            local err_type
            err_type=$(echo "$body" | sed -n 's/.*err=\([^&"]*\).*/\1/p' | head -n1)
            case "$err_type" in
                user_already_exists) warn "User already exists with this email/username" ;;
                invalid_username)    err "Invalid username format" ;;
                weak_password)       err "Password does not meet requirements" ;;
                *)                   info "Registration completed (status: $err_type)" ;;
            esac
        else
            ok "Admin user created"
            echo -e "  ${C}Username:${N} ${ADMIN_USERNAME}"
            echo -e "  ${C}Email:${N} ${ADMIN_EMAIL}"
            sleep 3
        fi
    else
        ok "Moving forward..."
    fi
}

# -- Toggle panel registration ------------------------------------------------
set_registration() {
    local enabled="$1"
    node - <<EOFJS
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function run() {
    try {
        let s = await prisma.settings.findFirst();
        if (!s) {
            await prisma.settings.create({ data: {
                allowRegistration: ${enabled},
                title: process.env.PANEL_NAME || "Airlink",
                description: "AirLink is a free and open source project by AirlinkLabs",
                logo: "../assets/logo.png",
                favicon: "../assets/favicon.ico",
                theme: "default",
                language: "en"
            }});
        } else {
            await prisma.settings.update({ where: { id: s.id }, data: { allowRegistration: ${enabled} } });
        }
        await prisma.\$disconnect();
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        await prisma.\$disconnect();
        process.exit(1);
    }
}
run();
EOFJS
}

# -- Panel installation -------------------------------------------------------
install_panel() {
    info "Starting Panel installation..."
    collect_panel_config
    collect_admin_config
    collect_addon_selection

    info "Preparing directories..."
    mkdir -p /var/www
    cd /var/www || err "Cannot access /var/www"

    info "Removing old panel directory..."
    for i in {5..1}; do
        echo -ne "\rWaiting: $i seconds remaining..."
        sleep 1
    done
    echo -e "\rProceeding...                    "
    rm -rf panel

    run_with_loading "Cloning Panel repository" git clone "${PANEL_REPO}"
    cd panel

    chown -R www-data:www-data /var/www/panel
    chmod -R 755 /var/www/panel
    ok "Permissions set"

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

    run_with_loading "Installing npm dependencies" npm install --omit=dev
    npm install bcrypt &>/dev/null || warn "Bcrypt install warning"

    if command -v prisma &>/dev/null; then
        local installed_prisma
        installed_prisma=$(prisma -v | grep "prisma" | head -n1 | awk '{print $2}')
        if [[ "$installed_prisma" != "$PRISMA_VER" ]]; then
            warn "Prisma version mismatch (found $installed_prisma), reinstalling $PRISMA_VER"
            npm uninstall -g prisma &>/dev/null
            npm uninstall prisma @prisma/client &>/dev/null
            npm cache clean --force &>/dev/null
            run_with_loading "Installing Prisma $PRISMA_VER" npm install "prisma@$PRISMA_VER" "@prisma/client@$PRISMA_VER"
        else
            ok "Prisma $PRISMA_VER already installed"
        fi
    else
        run_with_loading "Installing Prisma $PRISMA_VER" npm install "prisma@$PRISMA_VER" "@prisma/client@$PRISMA_VER"
    fi

    run_with_loading "Running database migrations" bash -c "CI=true npm run migrate:dev"

    info "Building Panel..."
    npm run build || err "Build failed"
    ok "Panel build completed"

    info "Enabling registration for first admin..."
    PANEL_NAME="${PANEL_NAME}" set_registration true
    ok "Registration enabled"

    npm install -g pm2 &>/dev/null || err "PM2 install failed"
    pm2 start npm --name "airlink-panel-temp" -- run start &>/dev/null
    ok "Panel started temporarily"

    create_admin_user

    info "Disabling public registration..."
    set_registration false
    ok "Registration disabled"

    pm2 delete airlink-panel-temp &>/dev/null
    pm2 save --force &>/dev/null
    ok "Temporary panel stopped"

    info "Creating systemd service..."
    cat > /etc/systemd/system/airlink-panel.service << EOF
[Unit]
Description=Airlink Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/panel
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now airlink-panel &>/dev/null
    ok "Panel service started on port ${PANEL_PORT}"

    process_addon_selections
    ok "Panel installation completed"
}

# -- Daemon installation ------------------------------------------------------
install_daemon() {
    info "Starting Daemon installation..."
    collect_daemon_config

    cd /etc || err "Cannot access /etc"

    info "Removing old daemon directory..."
    for i in {5..1}; do
        echo -ne "\rWaiting: $i seconds remaining..."
        sleep 1
    done
    echo -e "\rProceeding...                    "
    rm -rf daemon

    run_with_loading "Cloning Daemon repository" git clone "${DAEMON_REPO}"
    cd daemon

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

    info "Building Daemon..."
    npm run build || err "Build failed"
    ok "Daemon build completed"

    info "Building libs..."
    cd libs
    run_with_loading "Installing libs dependencies" npm install
    run_with_loading "Rebuilding native modules" npm rebuild
    cd ..

    chown -R www-data:www-data /etc/daemon
    ok "Permissions set"

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

    systemctl daemon-reload
    systemctl enable --now airlink-daemon &>/dev/null
    ok "Daemon service started on port ${DAEMON_PORT}"
    ok "Daemon installation completed"
}

# -- Install both -------------------------------------------------------------
install_all() {
    info "Starting full installation (Node.js, Docker, Panel, Daemon)..."
    collect_all_config
    setup_node
    setup_docker
    install_panel
    install_daemon

    if ! is_noninteractive; then
        dialog --msgbox "Installation Complete!\n\nPanel: http://$(hostname -I | awk '{print $1}'):${PANEL_PORT}\nDaemon: Running on port ${DAEMON_PORT}\n\nCheck logs: journalctl -u airlink-panel -f" 14 60
    fi
    ok "Full installation completed"
}

# -- Uninstall ----------------------------------------------------------------
remove_panel() {
    info "Removing Panel..."
    systemctl stop    airlink-panel &>/dev/null || true
    systemctl disable airlink-panel &>/dev/null || true
    rm -f /etc/systemd/system/airlink-panel.service
    rm -rf /var/www/panel
    systemctl daemon-reload
    ok "Panel removed"
}

remove_daemon() {
    info "Removing Daemon..."
    systemctl stop    airlink-daemon &>/dev/null || true
    systemctl disable airlink-daemon &>/dev/null || true
    rm -f /etc/systemd/system/airlink-daemon.service
    rm -rf /etc/daemon
    systemctl daemon-reload
    ok "Daemon removed"
}

remove_deps() {
    info "Removing dependencies..."
    case "$FAM" in
        debian) apt-get remove -y nodejs npm docker.io &>/dev/null ;;
        redhat) $PKG remove -y nodejs npm docker &>/dev/null ;;
        arch)   pacman -R --noconfirm nodejs npm docker &>/dev/null ;;
        alpine) apk del nodejs npm docker &>/dev/null ;;
    esac
    ok "Dependencies removed"
}

# -- Addon processing ---------------------------------------------------------
process_addon_selections() {
    [[ -z "${ADDON_CHOICES:-}" ]] && { info "No addons selected, skipping..."; return; }

    if [[ "$ADDON_CHOICES" == "all" ]]; then
        for addon in "${ADDONS[@]}"; do
            install_single_addon "$addon"
        done
        return
    fi

    # Comma-separated list of dir_names (from CLI) or a single dir_name
    IFS=',' read -ra selected <<< "$ADDON_CHOICES"
    for sel in "${selected[@]}"; do
        local matched=false
        for addon in "${ADDONS[@]}"; do
            local dir_name; dir_name=$(get_addon_field "$addon" 4)
            if [[ "$dir_name" == "$sel" ]]; then
                install_single_addon "$addon"
                matched=true
                break
            fi
        done
        [[ "$matched" == false ]] && warn "Unknown addon: $sel"
    done
}

install_single_addon() {
    local addon_config="$1"
    local display_name; display_name=$(get_addon_field "$addon_config" 1)
    local repo_url;     repo_url=$(get_addon_field "$addon_config" 2)
    local branch;       branch=$(get_addon_field "$addon_config" 3)
    local dir_name;     dir_name=$(get_addon_field "$addon_config" 4)

    info "Installing $display_name addon..."
    cd /var/www/panel/storage/addons/
    run_with_loading "Cloning $display_name repository" git clone --branch "$branch" "$repo_url" "$dir_name"

    cd "/var/www/panel/storage/addons/$dir_name/"
    run_with_loading "Installing dependencies" npm install

    info "Building $display_name addon..."
    npm run build

    cd /var/www/panel/
    npx tailwindcss -i ./public/tw.css -o ./public/styles.css
    ok "$display_name installed"
}

install_addons_interactive() {
    local menu_items=()
    local idx=1
    for addon in "${ADDONS[@]}"; do
        local name; name=$(get_addon_field "$addon" 1)
        local url;  url=$(get_addon_field "$addon" 2)
        menu_items+=("$idx" "Install $name ($url)")
        ((idx++))
    done
    menu_items+=("$idx" "Install All Addons"); local all_idx=$idx; ((idx++))
    menu_items+=("0" "Exit")

    while true; do
        local choice
        choice=$(dialog --title "Install Panel Addons?" \
            --menu "Choose action:" $((15 + ${#ADDONS[@]})) 70 $((${#ADDONS[@]} + 2)) \
            "${menu_items[@]}" 3>&1 1>&2 2>&3) || break

        if [[ "$choice" == "0" ]]; then
            break
        elif [[ "$choice" == "$all_idx" ]]; then
            for addon in "${ADDONS[@]}"; do install_single_addon "$addon"; done
        else
            install_single_addon "${ADDONS[$((choice-1))]}"
        fi
    done
}

# -- Main menu ----------------------------------------------------------------
main_menu() {
    while true; do
        local choice
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
            1)  install_all ;;
            2)  setup_node; setup_docker; install_panel ;;
            3)  setup_node; setup_docker; install_daemon ;;
            4)  install_addons_interactive ;;
            5)  setup_node; setup_docker ;;
            6)  dialog --yesno "Remove Panel?"        6 30 && remove_panel ;;
            7)  dialog --yesno "Remove Daemon?"       6 30 && remove_daemon ;;
            8)  dialog --yesno "Remove Dependencies?" 6 30 && remove_deps ;;
            9)  dialog --yesno "Remove EVERYTHING?"   7 40 && { remove_panel; remove_daemon; remove_deps; } ;;
            10) [[ -f "$LOG" ]] && dialog --textbox "$LOG" 20 80 || dialog --msgbox "No logs found" 6 30 ;;
            0)  echo -e "${G}Thanks for using Airlink Installer!${N}"; exit 0 ;;
        esac
    done
}

# -- Non-interactive entry point ----------------------------------------------
run_noninteractive() {
    setup_node
    setup_docker

    local mode="${ARG_MODE:-both}"
    case "$mode" in
        both)
            collect_all_config
            install_panel
            install_daemon
            ;;
        panel)
            collect_panel_config
            collect_admin_config
            collect_addon_selection
            install_panel
            ;;
        daemon)
            collect_daemon_config
            install_daemon
            ;;
        *) err "Unknown mode: $mode" ;;
    esac

    ok "Done."
}

# -- Cleanup ------------------------------------------------------------------
trap 'rm -rf "$TEMP" /tmp/cookies.txt' EXIT

# -- Entry --------------------------------------------------------------------
info "Starting Airlink Installer v${VERSION}..."
touch "$LOG"
log "=== Airlink Installer v${VERSION} started ==="

parse_args "$@"

if is_noninteractive; then
    run_noninteractive
else
    main_menu
fi
