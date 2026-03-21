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
readonly PRISMA_VER="6.19.1"
readonly PANEL_REPO="https://github.com/airlinklabs/panel.git"
readonly DAEMON_REPO="https://github.com/airlinklabs/daemon.git"

# Format: "display_name|repo_url|branch|directory_name"
declare -a ADDONS=(
    "Modrinth|https://github.com/airlinklabs/addons.git|modrinth|modrinth"
    "Parachute|https://github.com/airlinklabs/addons.git|parachute|parachute"
)

# =============================================================================
# ANSI codes
# =============================================================================
ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
REV="${ESC}[7m"

# Used only in non-interactive scrolling output — not in TUI draws
C_GREEN="${ESC}[92m"
C_RED="${ESC}[91m"
C_GRAY="${ESC}[90m"

HIDE_CURSOR="${ESC}[?25l"
SHOW_CURSOR="${ESC}[?25h"
CLEAR_SCREEN="${ESC}[2J${ESC}[H"

move_to() { printf "${ESC}[%d;%dH" "$1" "$2"; }

# =============================================================================
# Logging (file only — TUI owns stdout)
# =============================================================================
log()  { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }
info() { log "INFO: $*"; }
ok()   { log "OK: $*"; }
warn() { log "WARN: $*"; }

die() {
    printf "\n${BOLD}  error:${RESET} %s\n\n" "$*" >&2
    log "ERROR: $*"
    exit 1
}

# =============================================================================
# Argument parsing
# =============================================================================
ARG_MODE=""           # "both" | "panel" | "daemon"
ARG_NAME=""
ARG_PORT=""
ARG_ADMIN_EMAIL=""
ARG_ADMIN_USER=""
ARG_ADMIN_PASS=""
ARG_PANEL_ADDR=""
ARG_DAEMON_PORT=""
ARG_DAEMON_KEY=""
ARG_ADDONS=""         # "none" | "all" | "modrinth,parachute"

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --panel-only)  ARG_MODE="panel";        shift ;;
            --daemon-only) ARG_MODE="daemon";       shift ;;
            --name)        ARG_NAME="$2";           shift 2 ;;
            --port)        ARG_PORT="$2";           shift 2 ;;
            --admin-email) ARG_ADMIN_EMAIL="$2";    shift 2 ;;
            --admin-user)  ARG_ADMIN_USER="$2";     shift 2 ;;
            --admin-pass)  ARG_ADMIN_PASS="$2";     shift 2 ;;
            --panel-addr)  ARG_PANEL_ADDR="$2";     shift 2 ;;
            --daemon-port) ARG_DAEMON_PORT="$2";    shift 2 ;;
            --daemon-key)  ARG_DAEMON_KEY="$2";     shift 2 ;;
            --addons)      ARG_ADDONS="$2";         shift 2 ;;
            *) log "Unknown argument ignored: $1";  shift ;;
        esac
    done
}

noninteractive() {
    [[ -n "$ARG_MODE$ARG_NAME$ARG_PORT$ARG_ADMIN_EMAIL$ARG_ADMIN_USER$ARG_ADMIN_PASS$ARG_PANEL_ADDR$ARG_DAEMON_PORT$ARG_DAEMON_KEY$ARG_ADDONS" ]]
}

# =============================================================================
# Non-interactive progress output
# =============================================================================
NI_STEP=0
NI_TOTAL=0

ni_header() {
    printf "\n${BOLD}  Airlink Installer${RESET} ${C_GRAY}v${VERSION}${RESET}\n"
    printf "  ${C_GRAY}%s${RESET}\n\n" "$(date '+%Y-%m-%d %H:%M:%S')"
}

ni_start() {
    NI_TOTAL="$1"
    NI_STEP=0
}

ni_step() {
    NI_STEP=$((NI_STEP + 1))
    local label="$1"
    printf "  ${C_GRAY}[%02d/%02d]${RESET} %s " "$NI_STEP" "$NI_TOTAL" "$label"
}

ni_done() {
    printf "${C_GREEN}done${RESET}\n"
    log "OK: $*"
}

ni_warn() {
    printf "warn\n"
    log "WARN: $*"
}

ni_ok() {
    printf "\n  ${C_GREEN}${BOLD}done.${RESET}\n\n"
}

# Spinner for non-interactive long-running commands
ni_run() {
    local label="$1"; shift
    ni_step "$label"
    "$@" &>/dev/null &
    local pid=$!
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %s %s " "$NI_STEP" "$NI_TOTAL" "$label" "${frames[$i]}"
        i=$(( (i+1) % ${#frames[@]} ))
        sleep 0.08
    done
    wait "$pid"
    local status=$?
    if [[ $status -eq 0 ]]; then
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %s ${C_GREEN}✓${RESET}\n" "$NI_STEP" "$NI_TOTAL" "$label"
        log "OK: $label"
    else
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %s ${C_RED}✗${RESET}\n" "$NI_STEP" "$NI_TOTAL" "$label"
        log "ERROR: $label failed"
        die "$label failed"
    fi
}

# =============================================================================
# TUI engine — pure bash, no dialog
# =============================================================================
TERM_ROWS=24
TERM_COLS=80

tui_measure() {
    TERM_ROWS=$(tput lines 2>/dev/null || echo 24)
    TERM_COLS=$(tput cols  2>/dev/null || echo 80)
}

tui_cleanup() {
    printf "${SHOW_CURSOR}"
    tput rmcup 2>/dev/null || printf "${CLEAR_SCREEN}"
    stty echo 2>/dev/null || true
}

tui_init() {
    tui_measure
    tput smcup 2>/dev/null || printf "${CLEAR_SCREEN}"
    printf "${HIDE_CURSOR}"
    stty -echo 2>/dev/null || true
    trap tui_cleanup EXIT INT TERM
}

# Draw a centered box
# tui_box row col width height title
tui_box() {
    local row=$1 col=$2 w=$3 h=$4 title="${5:-}"
    local inner=$((w - 2))

    move_to "$row" "$col"
    printf "┌"
    if [[ -n "$title" ]]; then
        local tlen=${#title}
        local left_pad=$(( (inner - tlen - 2) / 2 ))
        local right_pad=$(( inner - tlen - 2 - left_pad ))
        printf '%*s' "$left_pad" '' | tr ' ' '─'
        printf " ${BOLD}%s${RESET} " "$title"
        printf '%*s' "$right_pad" '' | tr ' ' '─'
    else
        printf '%*s' "$inner" '' | tr ' ' '─'
    fi
    printf "┐"

    local r
    for (( r=1; r<h-1; r++ )); do
        move_to $((row + r)) "$col"
        printf "│%*s│" "$inner" ''
    done

    move_to $((row + h - 1)) "$col"
    printf "└%s┘" "$(printf '%*s' "$inner" '' | tr ' ' '─')"
}

# tui_menu title items[] selected_index
# Returns selected index in TUI_RESULT
TUI_RESULT=0
tui_menu() {
    local title="$1"; shift
    local -a items=("$@")
    local count=${#items[@]}
    local selected=0

    tui_measure
    local box_w=54
    local box_h=$(( count + 6 ))
    local banner_h=10
    local total_h=$(( banner_h + box_h ))
    local box_r=$(( (TERM_ROWS - total_h) / 2 + banner_h ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    local -a banner=(
        '                                              '
        '  /$$$$$$  /$$            /$$  /$$            /$$      '
        ' /$$__  $$|__/           | $$ |__/           | $$      '
        '| $$  \ $$ /$$  /$$$$$$  | $$  /$$  /$$$$$$$ | $$   /$$'
        '| $$$$$$$$| $$ /$$__  $$ | $$ | $$ | $$__  $$| $$  /$$/'
        '| $$__  $$| $$| $$  \__/ | $$ | $$ | $$  \ $$| $$$$$$/ '
        '| $$  | $$| $$| $$       | $$ | $$ | $$  | $$| $$_  $$ '
        '| $$  | $$| $$| $$       | $$ | $$ | $$  | $$| $$ \  $$'
        '|__/  |__/|__/|__/       |__/ |__/ |__/  |__/|__/  \__/'
        '                                              '
    )

    while true; do
        printf "${CLEAR_SCREEN}"

        local bi
        for (( bi=0; bi<${#banner[@]}; bi++ )); do
            move_to $(( box_r - banner_h + bi )) "$box_c"
            printf "${DIM}%s${RESET}" "${banner[$bi]}"
        done

        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "$title"

        move_to $((box_r + 1)) $((box_c + 2))
        printf "${DIM}v${VERSION}  ·  arrows / j k  ·  enter${RESET}"

        move_to $((box_r + 2)) "$box_c"
        printf "├%s┤" "$(printf '%*s' $((box_w - 2)) '' | tr ' ' '─')"

        local i
        for (( i=0; i<count; i++ )); do
            move_to $(( box_r + 3 + i )) $((box_c + 1))
            if [[ $i -eq $selected ]]; then
                printf "${REV}  %-$((box_w - 4))s  ${RESET}" "${items[$i]}"
            else
                printf "  %-$((box_w - 4))s  " "${items[$i]}"
            fi
        done

        move_to $((box_r + box_h - 1)) $((box_c + 1))
        printf "${DIM}  q  exit${RESET}"

        local key
        IFS= read -rsn1 key
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key || true
            case "$key" in
                '[A') (( selected > 0 ))         && (( selected-- )) ;;
                '[B') (( selected < count - 1 )) && (( selected++ )) ;;
            esac
        elif [[ "$key" == '' || "$key" == $'\n' ]]; then
            TUI_RESULT=$selected
            return 0
        elif [[ "$key" == 'q' || "$key" == 'Q' ]]; then
            TUI_RESULT=-1
            return 1
        elif [[ "$key" == 'j' ]]; then
            (( selected < count - 1 )) && (( selected++ ))
        elif [[ "$key" == 'k' ]]; then
            (( selected > 0 )) && (( selected-- ))
        fi
    done
}

# Multi-select checkbox menu — returns space-separated indices in TUI_MULTI
TUI_MULTI=""
tui_checklist() {
    local title="$1"; shift
    local -a items=("$@")
    local count=${#items[@]}
    local cursor=0
    declare -a checked
    for (( i=0; i<count; i++ )); do checked[$i]=0; done

    tui_measure
    local box_w=54
    local box_h=$(( count + 6 ))
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    while true; do
        printf "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "$title"

        move_to $((box_r + 1)) $((box_c + 2))
        printf "${DIM}space toggle  ·  enter confirm  ·  q skip${RESET}"

        move_to $((box_r + 2)) "$box_c"
        printf "├%s┤" "$(printf '%*s' $((box_w - 2)) '' | tr ' ' '─')"

        local i
        for (( i=0; i<count; i++ )); do
            move_to $(( box_r + 3 + i )) $((box_c + 1))
            local mark="[ ]"
            [[ ${checked[$i]} -eq 1 ]] && mark="[x]"
            if [[ $i -eq $cursor ]]; then
                printf "${REV}  %s  %-$((box_w - 10))s  ${RESET}" "$mark" "${items[$i]}"
            else
                printf "  %s  %-$((box_w - 10))s  " "$mark" "${items[$i]}"
            fi
        done

        local key
        IFS= read -rsn1 key
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key || true
            case "$key" in
                '[A') (( cursor > 0 ))         && (( cursor-- )) ;;
                '[B') (( cursor < count - 1 )) && (( cursor++ )) ;;
            esac
        elif [[ "$key" == ' ' ]]; then
            checked[$cursor]=$(( 1 - checked[$cursor] ))
        elif [[ "$key" == '' || "$key" == $'\n' ]]; then
            TUI_MULTI=""
            for (( i=0; i<count; i++ )); do
                [[ ${checked[$i]} -eq 1 ]] && TUI_MULTI="$TUI_MULTI $i"
            done
            TUI_MULTI="${TUI_MULTI# }"
            return 0
        elif [[ "$key" == 'q' || "$key" == 'Q' ]]; then
            TUI_MULTI=""
            return 0
        elif [[ "$key" == 'j' ]]; then
            (( cursor < count - 1 )) && (( cursor++ ))
        elif [[ "$key" == 'k' ]]; then
            (( cursor > 0 )) && (( cursor-- ))
        fi
    done
}

# Text input field
# tui_input prompt default — result in TUI_INPUT
TUI_INPUT=""
tui_input() {
    local prompt="$1"
    local default="${2:-}"
    local value="$default"

    tui_measure
    local box_w=54
    local box_h=7
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    stty echo 2>/dev/null || true

    while true; do
        printf "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Input"

        move_to $((box_r + 1)) $((box_c + 3))
        printf "%s" "$prompt"

        move_to $((box_r + 3)) $((box_c + 3))
        printf "┌%s┐" "$(printf '%*s' $((box_w - 8)) '' | tr ' ' '─')"

        move_to $((box_r + 4)) $((box_c + 3))
        printf "│ %-$((box_w - 9))s │" "$value"

        move_to $((box_r + 5)) $((box_c + 3))
        printf "└%s┘" "$(printf '%*s' $((box_w - 8)) '' | tr ' ' '─')"

        move_to $((box_r + 6)) $((box_c + 3))
        printf "${DIM}esc restore default  ·  enter confirm${RESET}"

        move_to $((box_r + 4)) $((box_c + 5 + ${#value}))

        local key
        IFS= read -rsn1 key
        case "$key" in
            '')
                TUI_INPUT="$value"
                stty -echo 2>/dev/null || true
                return 0
                ;;
            $'\x7f'|$'\b')
                [[ ${#value} -gt 0 ]] && value="${value%?}"
                ;;
            $'\x1b')
                value="$default"
                ;;
            *)
                value="${value}${key}"
                ;;
        esac
    done
}

# Password input (masked)
tui_password() {
    local prompt="$1"
    local value=""

    tui_measure
    local box_w=54
    local box_h=7
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    while true; do
        printf "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Password"

        move_to $((box_r + 1)) $((box_c + 3))
        printf "%s" "$prompt"

        local masked
        masked=$(printf '%*s' "${#value}" '' | tr ' ' '*')

        move_to $((box_r + 3)) $((box_c + 3))
        printf "┌%s┐" "$(printf '%*s' $((box_w - 8)) '' | tr ' ' '─')"

        move_to $((box_r + 4)) $((box_c + 3))
        printf "│ %-$((box_w - 9))s │" "$masked"

        move_to $((box_r + 5)) $((box_c + 3))
        printf "└%s┘" "$(printf '%*s' $((box_w - 8)) '' | tr ' ' '─')"

        move_to $((box_r + 6)) $((box_c + 3))
        printf "${DIM}esc clear  ·  enter confirm${RESET}"

        move_to $((box_r + 4)) $((box_c + 5 + ${#value}))

        local key
        IFS= read -rsn1 key
        case "$key" in
            '') TUI_INPUT="$value"; return 0 ;;
            $'\x7f'|$'\b') [[ ${#value} -gt 0 ]] && value="${value%?}" ;;
            $'\x1b') value="" ;;
            *) value="${value}${key}" ;;
        esac
    done
}

# Confirm dialog — returns 0 for yes, 1 for no
tui_confirm() {
    local prompt="$1"
    local selected=0   # 0=yes 1=no

    tui_measure
    local box_w=48
    local box_h=7
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    while true; do
        printf "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Confirm"

        move_to $((box_r + 2)) $((box_c + 3))
        printf "%s" "$prompt"

        move_to $((box_r + 4)) $((box_c + 10))
        if [[ $selected -eq 0 ]]; then
            printf "${REV}  yes  ${RESET}     no  "
        else
            printf "  yes      ${REV}  no  ${RESET}"
        fi

        move_to $((box_r + 6)) $((box_c + 3))
        printf "${DIM}left / right  ·  y / n  ·  enter confirm${RESET}"

        local key
        IFS= read -rsn1 key
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key || true
            case "$key" in
                '[D') selected=0 ;;
                '[C') selected=1 ;;
            esac
        elif [[ "$key" == '' || "$key" == $'\n' ]]; then
            return $selected
        elif [[ "$key" == 'y' || "$key" == 'Y' ]]; then
            return 0
        elif [[ "$key" == 'n' || "$key" == 'N' ]]; then
            return 1
        elif [[ "$key" == $'\t' || "$key" == 'h' || "$key" == 'l' ]]; then
            selected=$(( 1 - selected ))
        fi
    done
}

# TUI spinner for long tasks — draws inside current terminal state
# Usage: tui_run label command [args...]
tui_run() {
    local label="$1"; shift

    tui_measure
    local row=$(( TERM_ROWS - 4 ))
    local col=$(( (TERM_COLS - 60) / 2 ))

    move_to "$row" "$col"
    printf "┌%s┐" "$(printf '%*s' 58 '' | tr ' ' '─')"
    move_to $((row+1)) "$col"
    printf "│  %-54s  │" "$label"
    move_to $((row+2)) "$col"
    printf "└%s┘" "$(printf '%*s' 58 '' | tr ' ' '─')"

    "$@" &>/dev/null &
    local pid=$!
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        move_to $((row+1)) $((col + 57))
        printf "%s" "${frames[$i]}"
        i=$(( (i+1) % ${#frames[@]} ))
        sleep 0.08
    done
    wait "$pid"
    local status=$?
    move_to $((row+1)) $((col + 57))
    if [[ $status -eq 0 ]]; then
        printf "✓"
        log "OK: $label"
    else
        printf "✗"
        log "ERROR: $label failed"
        sleep 0.8
        tui_cleanup
        die "$label failed"
    fi
    sleep 0.3
    move_to "$row"     "$col"; printf "%60s"
    move_to $((row+1)) "$col"; printf "%60s"
    move_to $((row+2)) "$col"; printf "%60s"
}

# Full-screen progress view for installs (replaces the menu during install)
PROGRESS_TASKS=()
PROGRESS_CURRENT=0

tui_progress_init() {
    PROGRESS_TASKS=("$@")
    PROGRESS_CURRENT=0
}

tui_progress_draw() {
    local total=${#PROGRESS_TASKS[@]}

    printf "${CLEAR_SCREEN}"
    tui_measure

    local box_w=60
    local box_h=$(( total + 8 ))
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))

    tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Installing"

    move_to $((box_r + 1)) $((box_c + 3))
    printf "${DIM}Airlink v${VERSION}${RESET}"

    move_to $((box_r + 2)) "$box_c"
    printf "├%s┤" "$(printf '%*s' $((box_w - 2)) '' | tr ' ' '─')"

    local i
    for (( i=0; i<total; i++ )); do
        move_to $(( box_r + 3 + i )) $((box_c + 3))
        if [[ $i -lt $PROGRESS_CURRENT ]]; then
            printf "✓  ${DIM}%s${RESET}" "${PROGRESS_TASKS[$i]}"
        elif [[ $i -eq $PROGRESS_CURRENT ]]; then
            printf "${BOLD}>  %s${RESET}" "${PROGRESS_TASKS[$i]}"
        else
            printf "${DIM}-  %s${RESET}" "${PROGRESS_TASKS[$i]}"
        fi
    done

    local pct=$(( PROGRESS_CURRENT * 100 / total ))
    local bar_w=$(( box_w - 8 ))
    local filled=$(( pct * bar_w / 100 ))
    move_to $(( box_r + box_h - 3 )) "$box_c"
    printf "├%s┤" "$(printf '%*s' $((box_w - 2)) '' | tr ' ' '─')"
    move_to $(( box_r + box_h - 2 )) $((box_c + 3))
    printf "[%s%s] %3d%%" \
        "$(printf '%*s' "$filled" '' | tr ' ' '#')" \
        "$(printf '%*s' $((bar_w - filled)) '' | tr ' ' ' ')" \
        "$pct"
}

tui_progress_step() {
    local label="${PROGRESS_TASKS[$PROGRESS_CURRENT]}"
    tui_progress_draw

    local total=${#PROGRESS_TASKS[@]}
    local box_w=60
    local box_h=$(( total + 8 ))
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    local spinner_row=$(( box_r + 3 + PROGRESS_CURRENT ))
    local spinner_col=$(( box_c + box_w - 4 ))

    "$@" &>/dev/null &
    local pid=$!
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        move_to "$spinner_row" "$spinner_col"
        printf "%s" "${frames[$i]}"
        i=$(( (i+1) % ${#frames[@]} ))
        sleep 0.08
    done
    wait "$pid"
    local status=$?

    move_to "$spinner_row" "$spinner_col"
    if [[ $status -eq 0 ]]; then
        printf " "
        log "OK: $label"
        PROGRESS_CURRENT=$(( PROGRESS_CURRENT + 1 ))
    else
        printf "!"
        log "ERROR: $label"
        sleep 1
        tui_cleanup
        die "$label failed"
    fi
    sleep 0.1
}

tui_progress_finish() {
    PROGRESS_CURRENT=${#PROGRESS_TASKS[@]}
    tui_progress_draw "done"
    sleep 1
}

# =============================================================================
# OS detection + system setup (shared between both modes)
# =============================================================================
OS="" VER="" FAM="" PKG=""

detect_os() {
    [[ -f /etc/os-release ]] || die "Cannot detect OS — /etc/os-release not found"
    OS=$(grep '^ID='         /etc/os-release | cut -d= -f2 | tr -d '"')
    VER=$(grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"')

    case "$OS" in
        ubuntu|debian|linuxmint|pop)        FAM="debian"; PKG="apt" ;;
        fedora|centos|rhel|rocky|almalinux) FAM="redhat"; PKG=$(command -v dnf &>/dev/null && echo "dnf" || echo "yum") ;;
        arch|manjaro)                        FAM="arch";   PKG="pacman" ;;
        alpine)                              FAM="alpine"; PKG="apk" ;;
        *) die "Unsupported OS: $OS" ;;
    esac
}

pkg_install() {
    case "$PKG" in
        apt)     apt-get update -qq && apt-get install -y -qq "$@" ;;
        dnf|yum) $PKG install -y -q "$@" ;;
        pacman)  pacman -Sy --noconfirm --quiet "$@" ;;
        apk)     apk add --no-cache -q "$@" ;;
    esac
}

ensure_deps() {
    local deps=(curl wget git jq openssl)
    local missing=()
    for d in "${deps[@]}"; do command -v "$d" &>/dev/null || missing+=("$d"); done
    [[ ${#missing[@]} -gt 0 ]] && pkg_install "${missing[@]}"
}

setup_node() {
    if command -v node &>/dev/null; then
        local v; v=$(node -v | sed 's/v//' | cut -d. -f1)
        [[ "$v" == "$NODE_VER" ]] && return
    fi
    case "$FAM" in
        debian) curl -fsSL "https://deb.nodesource.com/setup_${NODE_VER}.x" | bash - &>/dev/null; pkg_install nodejs ;;
        redhat) curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VER}.x" | bash - &>/dev/null; pkg_install nodejs ;;
        arch)   pkg_install nodejs npm ;;
        alpine) pkg_install nodejs npm ;;
    esac
    command -v node &>/dev/null || die "Node.js install failed"

    npm list -g typescript &>/dev/null || npm install -g typescript &>/dev/null
}

setup_docker() {
    command -v docker &>/dev/null && return
    case "$FAM" in
        debian|redhat) curl -fsSL https://get.docker.com | sh &>/dev/null ;;
        arch)   pkg_install docker ;;
        alpine) pkg_install docker; rc-update add docker boot &>/dev/null ;;
    esac
    systemctl enable --now docker &>/dev/null
    command -v docker &>/dev/null || die "Docker install failed"
}

# =============================================================================
# Credentials helpers
# =============================================================================
valid_username() { [[ "$1" =~ ^[A-Za-z0-9]{3,20}$ ]]; }
valid_password() { [[ ${#1} -ge 8 && "$1" =~ [A-Za-z] && "$1" =~ [0-9] ]]; }

get_addon_field() { echo "$1" | cut -d'|' -f"$2"; }

# =============================================================================
# Core install logic (shared, no prompts)
# =============================================================================
# All of these read from: PANEL_NAME PANEL_PORT ADMIN_EMAIL ADMIN_USERNAME
# ADMIN_PASSWORD PANEL_ADDRESS DAEMON_PORT DAEMON_KEY ADDON_CHOICES

do_install_panel() {
    mkdir -p /var/www
    cd /var/www || die "Cannot access /var/www"

    rm -rf panel
    git clone "${PANEL_REPO}" &>/dev/null || die "Failed to clone panel"
    cd panel

    chown -R www-data:www-data /var/www/panel
    chmod -R 755 /var/www/panel

    cat > .env << ENVEOF
NAME=${PANEL_NAME}
NODE_ENV="development"
URL="http://localhost:${PANEL_PORT}"
PORT=${PANEL_PORT}
DATABASE_URL="file:./dev.db"
SESSION_SECRET=$(openssl rand -hex 32)
ENVEOF

    npm install --omit=dev &>/dev/null || die "npm install failed"
    npm install bcrypt &>/dev/null || true

    if command -v prisma &>/dev/null; then
        local pv; pv=$(prisma -v 2>/dev/null | grep "prisma" | head -n1 | awk '{print $2}' || echo "")
        if [[ "$pv" != "$PRISMA_VER" ]]; then
            npm uninstall -g prisma &>/dev/null || true
            npm uninstall prisma @prisma/client &>/dev/null || true
            npm cache clean --force &>/dev/null || true
            npm install "prisma@${PRISMA_VER}" "@prisma/client@${PRISMA_VER}" &>/dev/null || die "Prisma install failed"
        fi
    else
        npm install "prisma@${PRISMA_VER}" "@prisma/client@${PRISMA_VER}" &>/dev/null || die "Prisma install failed"
    fi

    CI=true npm run migrate:dev &>/dev/null || die "DB migration failed"
    npm run build &>/dev/null || die "Panel build failed"

    _set_registration true
    npm install -g pm2 &>/dev/null || die "PM2 install failed"
    pm2 start npm --name "airlink-panel-temp" -- run start &>/dev/null

    _create_admin_user

    _set_registration false
    pm2 delete airlink-panel-temp &>/dev/null || true
    pm2 save --force &>/dev/null || true

    cat > /etc/systemd/system/airlink-panel.service << SVCEOF
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
SVCEOF

    systemctl daemon-reload
    systemctl enable --now airlink-panel &>/dev/null

    _process_addons
}

do_install_daemon() {
    cd /etc || die "Cannot access /etc"
    rm -rf daemon
    git clone "${DAEMON_REPO}" &>/dev/null || die "Failed to clone daemon"
    cd daemon

    cat > .env << ENVEOF
remote="${PANEL_ADDRESS}"
key="${DAEMON_KEY}"
port=${DAEMON_PORT}
DEBUG=false
version=1.0.0
environment=development
STATS_INTERVAL=10000
ENVEOF

    npm install --omit=dev &>/dev/null || die "npm install failed"
    npm install express &>/dev/null || die "express install failed"
    npm run build &>/dev/null || die "Daemon build failed"

    cd libs
    npm install &>/dev/null || die "libs npm install failed"
    npm rebuild &>/dev/null || die "libs rebuild failed"
    cd ..

    chown -R www-data:www-data /etc/daemon

    cat > /etc/systemd/system/airlink-daemon.service << SVCEOF
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
SVCEOF

    systemctl daemon-reload
    systemctl enable --now airlink-daemon &>/dev/null
}

_set_registration() {
    local enabled="$1"
    PANEL_NAME="${PANEL_NAME}" node - <<JSEOF
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function run() {
    try {
        const s = await prisma.settings.findFirst();
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
    } catch(e) {
        await prisma.\$disconnect();
        process.exit(1);
    }
}
run();
JSEOF
}

_create_admin_user() {
    local waited=0
    while [[ $waited -lt 30 ]]; do
        curl -s "http://localhost:${PANEL_PORT}" > /dev/null 2>&1 && break
        sleep 2
        waited=$((waited + 2))
    done

    local csrf
    csrf=$(curl -s -c /tmp/al-cookies.txt "http://localhost:${PANEL_PORT}/register" \
        | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -n1 || echo "")

    local response http_code
    response=$(curl -s -b /tmp/al-cookies.txt -c /tmp/al-cookies.txt \
        -X POST "http://localhost:${PANEL_PORT}/register" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "username=${ADMIN_USERNAME}" \
        --data-urlencode "email=${ADMIN_EMAIL}" \
        --data-urlencode "password=${ADMIN_PASSWORD}" \
        --data-urlencode "_csrf=${csrf}" \
        -w "\n%{http_code}" -L)

    http_code=$(echo "$response" | tail -n1)
    rm -f /tmp/al-cookies.txt
    log "Admin registration HTTP $http_code"
}

_process_addons() {
    [[ -z "${ADDON_CHOICES:-}" || "${ADDON_CHOICES}" == "none" ]] && return

    local to_install=()
    if [[ "$ADDON_CHOICES" == "all" ]]; then
        to_install=("${ADDONS[@]}")
    else
        IFS=',' read -ra selected <<< "$ADDON_CHOICES"
        for sel in "${selected[@]}"; do
            for addon in "${ADDONS[@]}"; do
                [[ "$(get_addon_field "$addon" 4)" == "$sel" ]] && to_install+=("$addon") && break
            done
        done
    fi

    for addon_config in "${to_install[@]}"; do
        local display_name repo_url branch dir_name
        display_name=$(get_addon_field "$addon_config" 1)
        repo_url=$(get_addon_field "$addon_config" 2)
        branch=$(get_addon_field "$addon_config" 3)
        dir_name=$(get_addon_field "$addon_config" 4)

        cd /var/www/panel/storage/addons/
        git clone --branch "$branch" "$repo_url" "$dir_name" &>/dev/null || die "Failed to clone $display_name"
        cd "$dir_name"
        npm install &>/dev/null || die "$display_name npm install failed"
        npm run build &>/dev/null || die "$display_name build failed"
        cd /var/www/panel/
        npx tailwindcss -i ./public/tw.css -o ./public/styles.css &>/dev/null || true
        log "OK: $display_name addon installed"
    done
}

# =============================================================================
# Non-interactive entry point
# =============================================================================
run_noninteractive() {
    ni_header

    local mode="${ARG_MODE:-both}"

    # Apply defaults for anything not passed
    PANEL_NAME="${ARG_NAME:-Airlink}"
    PANEL_PORT="${ARG_PORT:-3000}"
    ADMIN_EMAIL="${ARG_ADMIN_EMAIL:-admin@example.com}"
    ADMIN_USERNAME="${ARG_ADMIN_USER:-admin}"
    ADMIN_PASSWORD="${ARG_ADMIN_PASS:-}"
    PANEL_ADDRESS="${ARG_PANEL_ADDR:-127.0.0.1}"
    DAEMON_PORT="${ARG_DAEMON_PORT:-3002}"
    DAEMON_KEY="${ARG_DAEMON_KEY:-}"
    ADDON_CHOICES="${ARG_ADDONS:-none}"

    [[ -z "$ADMIN_PASSWORD" ]] && die "--admin-pass is required in non-interactive mode"
    valid_password "$ADMIN_PASSWORD"   || die "Password must be 8+ chars with at least one letter and one number"
    valid_username "$ADMIN_USERNAME"   || die "Username must be 3-20 alphanumeric characters"
    command -v systemctl &>/dev/null   || die "systemd is required but not found"
    [[ $EUID -eq 0 ]]                  || die "Run as root"

    detect_os

    case "$mode" in
        both)
            ni_start 12
            ni_run "Checking dependencies"  ensure_deps
            ni_run "Setting up Node.js"     setup_node
            ni_run "Setting up Docker"      setup_docker
            ni_run "Cloning panel"          bash -c "mkdir -p /var/www && cd /var/www && rm -rf panel && git clone ${PANEL_REPO}"
            ni_run "Installing panel deps"  bash -c "cd /var/www/panel && npm install --omit=dev"
            ni_run "Installing Prisma"      bash -c "cd /var/www/panel && npm install prisma@${PRISMA_VER} @prisma/client@${PRISMA_VER}"
            ni_run "Running DB migrations"  bash -c "cd /var/www/panel && CI=true npm run migrate:dev"
            ni_run "Building panel"         bash -c "cd /var/www/panel && npm run build"
            ni_run "Starting panel"         bash -c "cd /var/www/panel && npm install -g pm2 && pm2 start npm --name airlink-panel-temp -- run start"
            ni_run "Cloning daemon"         bash -c "cd /etc && rm -rf daemon && git clone ${DAEMON_REPO}"
            ni_run "Installing daemon deps" bash -c "cd /etc/daemon && npm install --omit=dev && npm install express"
            ni_run "Building daemon"        bash -c "cd /etc/daemon && npm run build && cd libs && npm install && npm rebuild"
            # Now run the full do_ functions to wire up everything properly
            do_install_panel
            do_install_daemon
            ;;
        panel)
            ni_start 8
            ni_run "Checking dependencies"  ensure_deps
            ni_run "Setting up Node.js"     setup_node
            ni_run "Setting up Docker"      setup_docker
            ni_run "Cloning panel"          bash -c "mkdir -p /var/www && cd /var/www && rm -rf panel && git clone ${PANEL_REPO}"
            ni_run "Installing panel deps"  bash -c "cd /var/www/panel && npm install --omit=dev"
            ni_run "Installing Prisma"      bash -c "cd /var/www/panel && npm install prisma@${PRISMA_VER} @prisma/client@${PRISMA_VER}"
            ni_run "Running DB migrations"  bash -c "cd /var/www/panel && CI=true npm run migrate:dev"
            ni_run "Building and starting"  bash -c "cd /var/www/panel && npm run build"
            do_install_panel
            ;;
        daemon)
            ni_start 5
            ni_run "Checking dependencies"  ensure_deps
            ni_run "Setting up Node.js"     setup_node
            ni_run "Setting up Docker"      setup_docker
            ni_run "Cloning daemon"         bash -c "cd /etc && rm -rf daemon && git clone ${DAEMON_REPO}"
            ni_run "Building daemon"        bash -c "cd /etc/daemon && npm install --omit=dev && npm install express && npm run build && cd libs && npm install && npm rebuild"
            do_install_daemon
            ;;
        *) die "Unknown mode: $mode" ;;
    esac

    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    printf "\n  ${C_GREEN}${BOLD}Installation complete.${RESET}\n\n"
    [[ "$mode" != "daemon" ]] && printf "  ${C_GRAY}Panel:${RESET}  http://%s:%s\n" "$server_ip" "$PANEL_PORT"
    [[ "$mode" != "panel"  ]] && printf "  ${C_GRAY}Daemon:${RESET} port %s\n" "$DAEMON_PORT"
    printf "  ${C_GRAY}Logs:${RESET}   journalctl -u airlink-panel -f\n\n"
}

# =============================================================================
# Interactive TUI flows
# =============================================================================

# Collected config lives in these globals (set by TUI prompts)
PANEL_NAME="Airlink"
PANEL_PORT="3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD=""
PANEL_ADDRESS="127.0.0.1"
DAEMON_PORT="3002"
DAEMON_KEY=""
ADDON_CHOICES="none"

tui_collect_panel_config() {
    tui_input "Panel name" "Airlink"
    PANEL_NAME="$TUI_INPUT"

    tui_input "Panel port" "3000"
    PANEL_PORT="$TUI_INPUT"
}

tui_collect_admin_config() {
    tui_input "Admin email" "admin@example.com"
    ADMIN_EMAIL="$TUI_INPUT"

    while true; do
        tui_input "Admin username  (3-20 alphanumeric chars)" "admin"
        valid_username "$TUI_INPUT" && break
        # show error and retry
    done
    ADMIN_USERNAME="$TUI_INPUT"

    while true; do
        tui_password "Admin password  (8+ chars, one letter, one number)"
        valid_password "$TUI_INPUT" && break
    done
    ADMIN_PASSWORD="$TUI_INPUT"
}

tui_collect_daemon_config() {
    tui_input "Panel address" "127.0.0.1"
    PANEL_ADDRESS="$TUI_INPUT"

    tui_input "Daemon port" "3002"
    DAEMON_PORT="$TUI_INPUT"

    tui_input "Daemon auth key  (from panel → Nodes)" ""
    DAEMON_KEY="$TUI_INPUT"
}

tui_collect_addons() {
    local names=()
    for addon in "${ADDONS[@]}"; do
        names+=("$(get_addon_field "$addon" 1)")
    done
    tui_checklist "Addons  (optional)" "${names[@]}"
    if [[ -z "$TUI_MULTI" ]]; then
        ADDON_CHOICES="none"
        return
    fi
    local chosen=()
    for idx in $TUI_MULTI; do
        chosen+=("$(get_addon_field "${ADDONS[$idx]}" 4)")
    done
    ADDON_CHOICES=$(IFS=','; echo "${chosen[*]}")
}

tui_do_install() {
    local mode="$1"   # "both" | "panel" | "daemon"
    local tasks=()

    case "$mode" in
        both)   tasks=("Dependencies" "Node.js" "Docker" "Clone panel" "Panel deps" "Prisma" "DB migrations" "Build panel" "Admin user" "Clone daemon" "Daemon deps" "Build daemon" "Services") ;;
        panel)  tasks=("Dependencies" "Node.js" "Docker" "Clone panel" "Panel deps" "Prisma" "DB migrations" "Build panel" "Admin user" "Service") ;;
        daemon) tasks=("Dependencies" "Node.js" "Docker" "Clone daemon" "Daemon deps" "Build daemon" "Service") ;;
    esac

    tui_progress_init "${tasks[@]}"
    stty echo 2>/dev/null || true

    case "$mode" in
        both|panel)
            tui_progress_step ensure_deps
            tui_progress_step setup_node
            tui_progress_step setup_docker
            tui_progress_step bash -c "mkdir -p /var/www && cd /var/www && rm -rf panel && git clone ${PANEL_REPO}"
            tui_progress_step bash -c "cd /var/www/panel && npm install --omit=dev && npm install bcrypt"
            tui_progress_step bash -c "cd /var/www/panel && npm install prisma@${PRISMA_VER} @prisma/client@${PRISMA_VER}"
            tui_progress_step bash -c "cd /var/www/panel && CI=true npm run migrate:dev"
            tui_progress_step bash -c "cd /var/www/panel && npm run build"
            tui_progress_step bash -c "cd /var/www/panel && npm install -g pm2 && chown -R www-data:www-data /var/www/panel && chmod -R 755 /var/www/panel"
            if [[ "$mode" == "both" ]]; then
                tui_progress_step bash -c "cd /etc && rm -rf daemon && git clone ${DAEMON_REPO}"
                tui_progress_step bash -c "cd /etc/daemon && npm install --omit=dev && npm install express"
                tui_progress_step bash -c "cd /etc/daemon && npm run build && cd libs && npm install && npm rebuild"
                tui_progress_step bash -c "echo services"
                do_install_panel
                do_install_daemon
            else
                tui_progress_step bash -c "echo service"
                do_install_panel
            fi
            ;;
        daemon)
            tui_progress_step ensure_deps
            tui_progress_step setup_node
            tui_progress_step setup_docker
            tui_progress_step bash -c "cd /etc && rm -rf daemon && git clone ${DAEMON_REPO}"
            tui_progress_step bash -c "cd /etc/daemon && npm install --omit=dev && npm install express"
            tui_progress_step bash -c "cd /etc/daemon && npm run build && cd libs && npm install && npm rebuild"
            tui_progress_step bash -c "echo service"
            do_install_daemon
            ;;
    esac

    tui_progress_finish
}

tui_remove_panel() {
    systemctl stop    airlink-panel &>/dev/null || true
    systemctl disable airlink-panel &>/dev/null || true
    rm -f /etc/systemd/system/airlink-panel.service
    rm -rf /var/www/panel
    systemctl daemon-reload
}

tui_remove_daemon() {
    systemctl stop    airlink-daemon &>/dev/null || true
    systemctl disable airlink-daemon &>/dev/null || true
    rm -f /etc/systemd/system/airlink-daemon.service
    rm -rf /etc/daemon
    systemctl daemon-reload
}

tui_remove_deps() {
    case "$FAM" in
        debian) apt-get remove -y nodejs npm docker.io &>/dev/null ;;
        redhat) $PKG remove -y nodejs npm docker &>/dev/null ;;
        arch)   pacman -R --noconfirm nodejs npm docker &>/dev/null ;;
        alpine) apk del nodejs npm docker &>/dev/null ;;
    esac
}

tui_view_logs() {
    tui_cleanup
    [[ -f "$LOG" ]] && less "$LOG" || echo "No logs at $LOG"
    tui_init
}

# =============================================================================
# Interactive main menu
# =============================================================================
run_interactive() {
    tui_init

    local menu_items=(
        "Install Panel + Daemon"
        "Install Panel only"
        "Install Daemon only"
        "Install Addons"
        "Setup dependencies only"
        "Remove Panel"
        "Remove Daemon"
        "Remove everything"
        "View logs"
        "Exit"
    )

    while true; do
        tui_menu "Main Menu" "${menu_items[@]}" || break

        case $TUI_RESULT in
            0)  # Install Both
                tui_collect_panel_config
                tui_collect_admin_config
                tui_collect_daemon_config
                tui_collect_addons
                tui_do_install "both"
                ;;
            1)  # Panel only
                tui_collect_panel_config
                tui_collect_admin_config
                tui_collect_addons
                tui_do_install "panel"
                ;;
            2)  # Daemon only
                tui_collect_daemon_config
                tui_do_install "daemon"
                ;;
            3)  # Addons only
                tui_collect_addons
                stty echo 2>/dev/null || true
                _process_addons
                stty -echo 2>/dev/null || true
                ;;
            4)  # Deps only
                stty echo 2>/dev/null || true
                ensure_deps
                setup_node
                setup_docker
                stty -echo 2>/dev/null || true
                ;;
            5)  # Remove panel
                tui_confirm "Remove Panel?" && tui_run "Removing panel" tui_remove_panel
                ;;
            6)  # Remove daemon
                tui_confirm "Remove Daemon?" && tui_run "Removing daemon" tui_remove_daemon
                ;;
            7)  # Remove everything
                if tui_confirm "Remove panel, daemon, and dependencies?"; then
                    tui_run "Removing panel"        tui_remove_panel
                    tui_run "Removing daemon"       tui_remove_daemon
                    tui_run "Removing dependencies" tui_remove_deps
                fi
                ;;
            8)  # Logs
                tui_view_logs
                ;;
            9|-1)  # Exit
                break
                ;;
        esac
    done

    tui_cleanup
    printf "\n  Airlink Installer — done\n\n"
}

# =============================================================================
# Entry
# =============================================================================
[[ $EUID -eq 0 ]] || { echo "Run as root or with sudo."; exit 1; }

touch "$LOG"
log "=== Airlink Installer v${VERSION} started ==="

parse_args "$@"
detect_os

if noninteractive; then
    run_noninteractive
else
    run_interactive
fi
