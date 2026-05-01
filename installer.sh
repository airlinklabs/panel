#!/bin/bash
############################################################################
# Copyright (C) 2026 thavanish
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; version 2 of the License only.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to:
#   Free Software Foundation, Inc.
#   51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
#
# GNU General Public License v2 — All Rights Reserved
############################################################################

# NOTE: Do NOT use set -e here — arithmetic like (( x++ )) returns 1 when
# result is zero and would kill the script. We do explicit error checks.
set -uo pipefail

# =============================================================================
# Constants
# =============================================================================
readonly VERSION="3.1.0-Stable"
readonly LOG="/tmp/airlink.log"
readonly PRISMA_VER="6.19.1"
readonly PANEL_REPO="https://github.com/airlinklabs/panel.git"
readonly DAEMON_REPO="https://github.com/airlinklabs/daemon.git"

# resolved at runtime by select_npm_registry — pnpm uses this
PNPM_REGISTRY="https://registry.npmjs.org"
# path to pnpm once installed
PNPM="pnpm"

declare -a ADDONS=(
    "Modrinth|https://github.com/airlinklabs/addons.git|modrinth|modrinth"
    "Parachute|https://github.com/airlinklabs/addons.git|parachute|parachute"
)

# =============================================================================
# ANSI codes — only what we actually use
# =============================================================================
ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
REV="${ESC}[7m"

C_GREEN="${ESC}[92m"
C_RED="${ESC}[91m"
C_GRAY="${ESC}[90m"
C_CYAN="${ESC}[96m"
C_YELLOW="${ESC}[93m"

HIDE_CURSOR="${ESC}[?25l"
SHOW_CURSOR="${ESC}[?25h"
CLEAR_SCREEN="${ESC}[2J${ESC}[H"

move_to() { printf "${ESC}[%d;%dH" "$1" "$2"; }
clr_line() { printf "${ESC}[2K"; }

# =============================================================================
# Logging
# =============================================================================
log()  { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }
info() { log "INFO: $*"; }
ok()   { log "OK: $*"; }
warn() { log "WARN: $*"; }

die() {
    # make sure cursor is visible and terminal is sane before dying
    printf "%b" "${SHOW_CURSOR}" 2>/dev/null || true
    tput rmcup 2>/dev/null || printf "%b" "${CLEAR_SCREEN}" 2>/dev/null || true
    stty echo 2>/dev/null || true
    printf "\n${BOLD}  error:${RESET} %s\n\n" "$*" >&2
    log "ERROR: $*"
    exit 1
}

# =============================================================================
# Argument parsing
# =============================================================================
ARG_MODE=""
ARG_NAME=""
ARG_PORT=""
ARG_ADMIN_EMAIL=""
ARG_ADMIN_USER=""
ARG_ADMIN_PASS=""
ARG_PANEL_ADDR=""
ARG_DAEMON_PORT=""
ARG_DAEMON_KEY=""
ARG_ADDONS=""

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --panel-only)  ARG_MODE="panel";        shift ;;
            --daemon-only) ARG_MODE="daemon";       shift ;;
            --name)        ARG_NAME="${2:-}";        shift 2 ;;
            --port)        ARG_PORT="${2:-}";        shift 2 ;;
            --admin-email) ARG_ADMIN_EMAIL="${2:-}"; shift 2 ;;
            --admin-user)  ARG_ADMIN_USER="${2:-}";  shift 2 ;;
            --admin-pass)  ARG_ADMIN_PASS="${2:-}";  shift 2 ;;
            --panel-addr)  ARG_PANEL_ADDR="${2:-}";  shift 2 ;;
            --daemon-port) ARG_DAEMON_PORT="${2:-}"; shift 2 ;;
            --daemon-key)  ARG_DAEMON_KEY="${2:-}";  shift 2 ;;
            --addons)      ARG_ADDONS="${2:-}";      shift 2 ;;
            *) log "Unknown argument ignored: $1"; shift ;;
        esac
    done
}

noninteractive() {
    [[ -n "${ARG_MODE}${ARG_NAME}${ARG_PORT}${ARG_ADMIN_EMAIL}${ARG_ADMIN_USER}${ARG_ADMIN_PASS}${ARG_PANEL_ADDR}${ARG_DAEMON_PORT}${ARG_DAEMON_KEY}${ARG_ADDONS}" ]]
}

# =============================================================================
# Non-interactive spinner — pure ASCII, no braille
# =============================================================================
NI_STEP=0
NI_TOTAL=0
_NI_SPIN_CHARS=('-' '\' '|' '/')

ni_header() {
    printf "\n"
    printf "    _    ___ ____  _     ___ _   _ _  __\n"
    printf "   / \  |_ _|  _ \| |   |_ _| \ | | |/ /\n"
    printf "  / _ \  | || |_) | |    | ||  \| | ' / \n"
    printf " / ___ \ | ||  _ <| |___ | || |\  | . \ \n"
    printf "/_/   \_\___|_| \_\_____|___|_| \_|_|\_\\\n"
    printf "\n"
    printf "  ${BOLD}Airlink Installer${RESET} ${C_GRAY}v${VERSION}${RESET}  ${C_GRAY}%s${RESET}\n\n" "$(date '+%Y-%m-%d %H:%M:%S')"
}

ni_start() {
    NI_TOTAL="$1"
    NI_STEP=0
}

ni_run() {
    local label="$1"; shift
    NI_STEP=$(( NI_STEP + 1 ))
    local fi=0
    local outfile; outfile=$(mktemp /tmp/al-step-XXXXXX)
    local out_lines=6

    "$@" >"$outfile" 2>&1 &
    local pid=$!

    while kill -0 "$pid" 2>/dev/null; do
        local spin="${_NI_SPIN_CHARS[$fi]}"
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %-42s ${spin}" "$NI_STEP" "$NI_TOTAL" "$label"
        fi=$(( (fi + 1) % 4 ))

        # status line — what's actually happening right now
        local last_line raw_status
        last_line=$(grep -v '^[[:space:]]*$' "$outfile" 2>/dev/null | tail -1)
        raw_status=$(parse_status_line "$last_line")
        if [[ -n "$raw_status" ]]; then
            printf "\n    ${C_YELLOW}status:${RESET} ${C_GRAY}%-68.68s${RESET}" "$raw_status"
        else
            printf "\n%76s" ""
        fi

        # stream last few lines below status
        local li=0
        while IFS= read -r line; do
            printf "\n    ${C_GRAY}%-72.72s${RESET}" "$line"
            li=$(( li + 1 ))
        done < <(tail -n${out_lines} "$outfile" 2>/dev/null)
        while [[ $li -lt $out_lines ]]; do
            printf "\n%76s" ""
            li=$(( li + 1 ))
        done
        # move back up: status line + out_lines
        printf "\033[%dA\r" $(( out_lines + 1 ))
        sleep 0.1
    done

    wait "$pid"
    local status=$?

    # clear status + streaming area
    local li
    printf "\n%76s" ""
    for (( li = 0; li < out_lines; li++ )); do
        printf "\n%76s" ""
    done
    printf "\033[%dA\r" $(( out_lines + 1 ))

    if [[ $status -eq 0 ]]; then
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %-42s ${C_GREEN}done${RESET}\n" "$NI_STEP" "$NI_TOTAL" "$label"
        log "OK: $label"
    else
        printf "\r  ${C_GRAY}[%02d/%02d]${RESET} %-42s ${C_RED}FAIL${RESET}\n" "$NI_STEP" "$NI_TOTAL" "$label"
        local err_tail; err_tail=$(tail -n20 "$outfile" 2>/dev/null || true)
        rm -f "$outfile"
        log "ERROR: $label failed"
        printf "\n${BOLD}  failed:${RESET} %s\n\n%s\n\n" "$label" "$err_tail"
        exit 1
    fi

    rm -f "$outfile"
}

# =============================================================================
# TUI engine — pure bash, no dialog, no external deps
# =============================================================================
TERM_ROWS=24
TERM_COLS=80
_TUI_ACTIVE=0

tui_measure() {
    TERM_ROWS=$(tput lines  2>/dev/null || echo 24)
    TERM_COLS=$(tput cols   2>/dev/null || echo 80)
    # clamp to sane minimums
    [[ $TERM_ROWS -lt 18 ]] && TERM_ROWS=18
    [[ $TERM_COLS -lt 60 ]] && TERM_COLS=60
}

tui_cleanup() {
    if [[ $_TUI_ACTIVE -eq 1 ]]; then
        _TUI_ACTIVE=0
        printf "%b" "${SHOW_CURSOR}"
        tput rmcup 2>/dev/null || printf "%b" "${CLEAR_SCREEN}"
        stty echo 2>/dev/null || true
    fi
}

tui_init() {
    tui_measure
    tput smcup 2>/dev/null || printf "%b" "${CLEAR_SCREEN}"
    printf "%b" "${HIDE_CURSOR}"
    stty -echo 2>/dev/null || true
    _TUI_ACTIVE=1
    # trap must not trigger die() — just clean up and exit
    trap 'tui_cleanup; exit 0' EXIT INT TERM
}

# Draw a box with optional title
# tui_box row col width height [title]
tui_box() {
    local row=$1 col=$2 w=$3 h=$4 title="${5:-}"
    local inner=$(( w - 2 ))

    move_to "$row" "$col"
    if [[ -n "$title" ]]; then
        local tlen=${#title}
        # clamp title so it fits: need 2 chars for corners, 2 for spaces around title
        if [[ $(( tlen + 4 )) -gt $inner ]]; then
            tlen=$(( inner - 4 ))
            title="${title:0:$tlen}"
        fi
        local dashes=$(( inner - tlen - 2 ))
        local left_pad=$(( dashes / 2 ))
        local right_pad=$(( dashes - left_pad ))
        printf "+"
        [[ $left_pad -gt 0 ]] && printf '%*s' "$left_pad" '' | tr ' ' '-'
        printf " ${BOLD}%s${RESET} " "$title"
        [[ $right_pad -gt 0 ]] && printf '%*s' "$right_pad" '' | tr ' ' '-'
        printf "+"
    else
        printf "+"
        printf '%*s' "$inner" '' | tr ' ' '-'
        printf "+"
    fi

    local r
    for (( r = 1; r < h - 1; r++ )); do
        move_to $(( row + r )) "$col"
        printf "|%*s|" "$inner" ''
    done

    move_to $(( row + h - 1 )) "$col"
    printf "+"
    printf '%*s' "$inner" '' | tr ' ' '-'
    printf "+"
}

tui_hline() {
    local row=$1 col=$2 w=$3
    move_to "$row" "$col"
    printf "+"
    printf '%*s' $(( w - 2 )) '' | tr ' ' '-'
    printf "+"
}

# =============================================================================
# Read a single keypress — handles escape sequences safely
# Sets _KEY to the logical key name
# =============================================================================
_KEY=""
read_key() {
    local k1 k2 k3
    IFS= read -rsn1 k1
    if [[ "$k1" == $'\x1b' ]]; then
        # read up to 2 more bytes with short timeout
        IFS= read -rsn1 -t 0.05 k2 2>/dev/null || k2=""
        if [[ "$k2" == "[" ]]; then
            IFS= read -rsn1 -t 0.05 k3 2>/dev/null || k3=""
            case "$k3" in
                'A') _KEY="UP"    ;;
                'B') _KEY="DOWN"  ;;
                'C') _KEY="RIGHT" ;;
                'D') _KEY="LEFT"  ;;
                *)   _KEY="ESC"   ;;
            esac
        else
            _KEY="ESC"
        fi
    elif [[ "$k1" == "" || "$k1" == $'\n' || "$k1" == $'\r' ]]; then
        _KEY="ENTER"
    elif [[ "$k1" == $'\x7f' || "$k1" == $'\b' ]]; then
        _KEY="BACKSPACE"
    elif [[ "$k1" == " " ]]; then
        _KEY="SPACE"
    else
        _KEY="$k1"
    fi
}

# =============================================================================
# Install state — set to 1 during active installs, blocks ESC-back navigation
# =============================================================================
_INSTALLING=0

# =============================================================================
# ASCII art banner lines — stored as array for centering
# =============================================================================
_BANNER=(
    "    _    ___ ____  _     ___ _   _ _  __"
    "   / \\  |_ _|  _ \\| |   |_ _| \\ | | |/ /"
    "  / _ \\  | || |_) | |    | ||  \\| | ' / "
    " / ___ \\ | ||  _ <| |___ | || |\\  | . \\ "
    "/_/   \\_\\___|_| \\_\\_____|___|_| \\_|_|\\_\\\\"
    ""
    "  GNU General Public License v2 -- All Rights Reserved"
)

# Draw banner centered at given row
draw_banner() {
    local start_row=$1
    local bi
    # use longest line for centering (line 0 is the art, not the license line)
    local banner_w=${#_BANNER[0]}
    local bx=$(( (TERM_COLS - banner_w) / 2 ))
    [[ $bx -lt 1 ]] && bx=1
    for (( bi = 0; bi < ${#_BANNER[@]}; bi++ )); do
        move_to $(( start_row + bi )) "$bx"
        if [[ $bi -ge 6 ]]; then
            printf "${DIM}${C_GRAY}%s${RESET}" "${_BANNER[$bi]}"
        else
            printf "${DIM}%s${RESET}" "${_BANNER[$bi]}"
        fi
    done
}

# =============================================================================
# Main menu — adaptive width, number hotkeys, arrow/j/k nav
# TUI_RESULT = selected index (0-based), or -1 on quit
# =============================================================================
TUI_RESULT=0

tui_menu() {
    local title="$1"; shift
    local -a items=("$@")
    local count=${#items[@]}
    local selected=0

    tui_measure

    # compute adaptive box width: max of item lengths + number prefix + padding
    local max_item_len=0
    local i
    for (( i = 0; i < count; i++ )); do
        local item_label="${items[$i]}"
        local iw=${#item_label}
        [[ $iw -gt $max_item_len ]] && max_item_len=$iw
    done
    # [N] prefix = 4 chars, left/right padding = 4 chars total
    local min_box_w=$(( max_item_len + 8 + 2 ))
    local max_box_w=$(( TERM_COLS - 4 ))
    local box_w=$min_box_w
    [[ $box_w -lt 46 ]] && box_w=46
    [[ $box_w -gt $max_box_w ]] && box_w=$max_box_w

    # banner is 7 lines now, gap 1, then box
    local banner_h=7
    local gap=1
    local box_h=$(( count + 6 ))   # title row + hline + items + hint + bottom border + top border
    local total_h=$(( banner_h + gap + box_h ))

    local box_r=$(( (TERM_ROWS - total_h) / 2 + banner_h + gap ))
    [[ $box_r -lt $(( banner_h + gap + 1 )) ]] && box_r=$(( banner_h + gap + 1 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_c -lt 1 ]] && box_c=1

    local inner=$(( box_w - 2 ))

    while true; do
        printf "%b" "${CLEAR_SCREEN}"

        # banner
        draw_banner $(( box_r - banner_h - gap ))

        # box — use full-width border characters properly
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "$title"

        # sub-header hint line
        move_to $(( box_r + 1 )) $(( box_c + 2 ))
        printf "${DIM}%-${inner}s${RESET}" "arrows/jk move  enter select  0-9 hotkey  esc/q quit"

        # separator
        tui_hline $(( box_r + 2 )) "$box_c" "$box_w"

        # items — numbered 0 through count-1
        for (( i = 0; i < count; i++ )); do
            move_to $(( box_r + 3 + i )) $(( box_c + 1 ))
            local label="[${i}] ${items[$i]}"
            if [[ $i -eq $selected ]]; then
                printf "${REV} %-${inner}s ${RESET}" "$label"
            else
                printf " %-${inner}s " "$label"
            fi
        done

        # bottom hint
        move_to $(( box_r + box_h - 2 )) $(( box_c + 2 ))
        printf "${DIM}v${VERSION}${RESET}"

        # read input
        read_key
        case "$_KEY" in
            UP|k)
                if [[ $selected -gt 0 ]]; then
                    selected=$(( selected - 1 ))
                fi
                ;;
            DOWN|j)
                if [[ $selected -lt $(( count - 1 )) ]]; then
                    selected=$(( selected + 1 ))
                fi
                ;;
            ENTER)
                TUI_RESULT=$selected
                return 0
                ;;
            ESC|q|Q)
                # ESC goes back to previous menu (or exits top-level)
                # blocked during active installs
                if [[ $_INSTALLING -eq 0 ]]; then
                    TUI_RESULT=-1
                    return 1
                fi
                ;;
            [0-9])
                local num_pressed="${_KEY}"
                if [[ $num_pressed -lt $count ]]; then
                    TUI_RESULT=$num_pressed
                    return 0
                fi
                ;;
        esac
    done
}

# =============================================================================
# Multi-select checklist — space toggle, number hotkey toggles item
# TUI_MULTI = space-separated selected indices
# =============================================================================
TUI_MULTI=""

tui_checklist() {
    local title="$1"; shift
    local -a items=("$@")
    local count=${#items[@]}
    local cursor=0
    declare -a checked
    for (( i = 0; i < count; i++ )); do checked[$i]=0; done

    tui_measure

    local max_item_len=0
    for (( i = 0; i < count; i++ )); do
        local iw=${#items[$i]}
        [[ $iw -gt $max_item_len ]] && max_item_len=$iw
    done
    local box_w=$(( max_item_len + 14 ))
    [[ $box_w -lt 50 ]] && box_w=50
    local max_box_w=$(( TERM_COLS - 4 ))
    [[ $box_w -gt $max_box_w ]] && box_w=$max_box_w

    local box_h=$(( count + 6 ))
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_r -lt 1 ]] && box_r=1
    [[ $box_c -lt 1 ]] && box_c=1
    local inner=$(( box_w - 2 ))

    while true; do
        printf "%b" "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "$title"

        move_to $(( box_r + 1 )) $(( box_c + 2 ))
        printf "${DIM}%-${inner}s${RESET}" "space/num toggle  enter confirm  q skip"

        tui_hline $(( box_r + 2 )) "$box_c" "$box_w"

        for (( i = 0; i < count; i++ )); do
            move_to $(( box_r + 3 + i )) $(( box_c + 1 ))
            local num=$(( i + 1 ))
            local mark="[ ]"
            [[ ${checked[$i]} -eq 1 ]] && mark="[x]"
            local label="[${num}] ${mark} ${items[$i]}"
            if [[ $i -eq $cursor ]]; then
                printf "${REV} %-${inner}s ${RESET}" "$label"
            else
                printf " %-${inner}s " "$label"
            fi
        done

        read_key
        case "$_KEY" in
            UP|k)
                if [[ $cursor -gt 0 ]]; then cursor=$(( cursor - 1 )); fi
                ;;
            DOWN|j)
                if [[ $cursor -lt $(( count - 1 )) ]]; then cursor=$(( cursor + 1 )); fi
                ;;
            SPACE)
                if [[ ${checked[$cursor]} -eq 1 ]]; then
                    checked[$cursor]=0
                else
                    checked[$cursor]=1
                fi
                ;;
            [0-9])
                local np="${_KEY}"
                if [[ $np -lt $count ]]; then
                    local idx=$np
                    if [[ ${checked[$idx]} -eq 1 ]]; then
                        checked[$idx]=0
                    else
                        checked[$idx]=1
                    fi
                    cursor=$idx
                fi
                ;;
            ENTER)
                TUI_MULTI=""
                for (( i = 0; i < count; i++ )); do
                    [[ ${checked[$i]} -eq 1 ]] && TUI_MULTI="${TUI_MULTI} $i"
                done
                TUI_MULTI="${TUI_MULTI# }"
                return 0
                ;;
            ESC|q|Q)
                if [[ $_INSTALLING -eq 0 ]]; then
                    TUI_MULTI=""
                    return 1
                fi
                ;;
        esac
    done
}

# =============================================================================
# Text input field — stty echo so user sees typing
# TUI_INPUT = result
# =============================================================================
TUI_INPUT=""

tui_input() {
    local prompt="$1"
    local default="${2:-}"
    local value="$default"
    local error_msg="${3:-}"

    tui_measure

    local box_w=$(( TERM_COLS / 2 + 10 ))
    [[ $box_w -lt 50 ]] && box_w=50
    local max_box_w=$(( TERM_COLS - 4 ))
    [[ $box_w -gt $max_box_w ]] && box_w=$max_box_w

    local box_h=9
    [[ -n "$error_msg" ]] && box_h=10
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_r -lt 1 ]] && box_r=1
    [[ $box_c -lt 1 ]] && box_c=1
    local inner=$(( box_w - 2 ))
    local field_w=$(( box_w - 8 ))

    stty echo 2>/dev/null || true

    while true; do
        printf "%b" "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Input"

        move_to $(( box_r + 1 )) $(( box_c + 3 ))
        printf "%-${inner}s" "$prompt"

        if [[ -n "$error_msg" ]]; then
            move_to $(( box_r + 2 )) $(( box_c + 3 ))
            printf "${C_RED}%-${inner}s${RESET}" "$error_msg"
        fi

        local field_row=$(( box_r + 4 ))
        move_to "$field_row" $(( box_c + 3 ))
        printf "+%s+" "$(printf '%*s' "$field_w" '' | tr ' ' '-')"

        move_to $(( field_row + 1 )) $(( box_c + 3 ))
        # truncate display if value is wider than field
        local display="${value}"
        if [[ ${#display} -gt $(( field_w - 2 )) ]]; then
            display="${display: -$(( field_w - 2 ))}"
        fi
        printf "| %-$(( field_w - 2 ))s |" "$display"

        move_to $(( field_row + 2 )) $(( box_c + 3 ))
        printf "+%s+" "$(printf '%*s' "$field_w" '' | tr ' ' '-')"

        move_to $(( box_r + box_h - 2 )) $(( box_c + 3 ))
        printf "${DIM}%-${inner}s${RESET}" "esc = restore default   enter = confirm"

        # position cursor in field
        local cursor_x=$(( box_c + 5 + ${#value} ))
        if [[ $cursor_x -gt $(( box_c + 3 + field_w - 1 )) ]]; then
            cursor_x=$(( box_c + 3 + field_w - 1 ))
        fi
        move_to $(( field_row + 1 )) "$cursor_x"
        printf "%b" "${SHOW_CURSOR}"

        read_key
        printf "%b" "${HIDE_CURSOR}"
        case "$_KEY" in
            ENTER)
                TUI_INPUT="$value"
                stty -echo 2>/dev/null || true
                return 0
                ;;
            BACKSPACE)
                [[ ${#value} -gt 0 ]] && value="${value%?}"
                ;;
            ESC)
                value="$default"
                ;;
            UP|DOWN|LEFT|RIGHT)
                : # ignore arrow keys in text field
                ;;
            *)
                # only printable chars
                if [[ ${#_KEY} -eq 1 && "$_KEY" =~ [[:print:]] ]]; then
                    value="${value}${_KEY}"
                fi
                ;;
        esac
    done
}

# =============================================================================
# Password input — masked
# =============================================================================
tui_password() {
    local prompt="$1"
    local error_msg="${2:-}"
    local value=""

    tui_measure

    local box_w=$(( TERM_COLS / 2 + 10 ))
    [[ $box_w -lt 50 ]] && box_w=50
    local max_box_w=$(( TERM_COLS - 4 ))
    [[ $box_w -gt $max_box_w ]] && box_w=$max_box_w

    local box_h=9
    [[ -n "$error_msg" ]] && box_h=10
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_r -lt 1 ]] && box_r=1
    [[ $box_c -lt 1 ]] && box_c=1
    local inner=$(( box_w - 2 ))
    local field_w=$(( box_w - 8 ))

    while true; do
        printf "%b" "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Password"

        move_to $(( box_r + 1 )) $(( box_c + 3 ))
        printf "%-${inner}s" "$prompt"

        if [[ -n "$error_msg" ]]; then
            move_to $(( box_r + 2 )) $(( box_c + 3 ))
            printf "${C_RED}%-${inner}s${RESET}" "$error_msg"
        fi

        local masked
        masked=$(printf '%*s' "${#value}" '' | tr ' ' '*')

        local field_row=$(( box_r + 4 ))
        move_to "$field_row" $(( box_c + 3 ))
        printf "+%s+" "$(printf '%*s' "$field_w" '' | tr ' ' '-')"

        move_to $(( field_row + 1 )) $(( box_c + 3 ))
        printf "| %-$(( field_w - 2 ))s |" "$masked"

        move_to $(( field_row + 2 )) $(( box_c + 3 ))
        printf "+%s+" "$(printf '%*s' "$field_w" '' | tr ' ' '-')"

        move_to $(( box_r + box_h - 2 )) $(( box_c + 3 ))
        printf "${DIM}%-${inner}s${RESET}" "esc = clear   enter = confirm"

        read_key
        case "$_KEY" in
            ENTER)
                TUI_INPUT="$value"
                return 0
                ;;
            BACKSPACE)
                [[ ${#value} -gt 0 ]] && value="${value%?}"
                ;;
            ESC)
                value=""
                ;;
            UP|DOWN|LEFT|RIGHT) : ;;
            *)
                if [[ ${#_KEY} -eq 1 && "$_KEY" =~ [[:print:]] ]]; then
                    value="${value}${_KEY}"
                fi
                ;;
        esac
    done
}

# =============================================================================
# Confirm dialog
# =============================================================================
tui_confirm() {
    local prompt="$1"
    local selected=0  # 0=yes 1=no

    tui_measure

    local box_w=52
    [[ $box_w -gt $(( TERM_COLS - 4 )) ]] && box_w=$(( TERM_COLS - 4 ))
    local box_h=7
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_r -lt 1 ]] && box_r=1
    [[ $box_c -lt 1 ]] && box_c=1
    local inner=$(( box_w - 2 ))

    while true; do
        printf "%b" "${CLEAR_SCREEN}"
        tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Confirm"

        move_to $(( box_r + 2 )) $(( box_c + 3 ))
        printf "%-${inner}s" "$prompt"

        move_to $(( box_r + 4 )) $(( box_c + 10 ))
        if [[ $selected -eq 0 ]]; then
            printf "${REV}  yes  ${RESET}       no  "
        else
            printf "  yes        ${REV}  no  ${RESET}"
        fi

        move_to $(( box_r + 6 )) $(( box_c + 3 ))
        printf "${DIM}%-${inner}s${RESET}" "left/right or h/l  y/n  enter confirm"

        read_key
        case "$_KEY" in
            LEFT|h|H)    selected=0 ;;
            RIGHT|l|L)   selected=1 ;;
            y|Y)         return 0 ;;
            n|N)         return 1 ;;
            ENTER)       return $selected ;;
            q|Q|ESC)     return 1 ;;
        esac
    done
}

# =============================================================================
# Spinner for quick tasks within TUI (used for remove/logs etc)
# =============================================================================
tui_run() {
    local label="$1"; shift

    tui_measure
    local box_w=62
    [[ $box_w -gt $(( TERM_COLS - 4 )) ]] && box_w=$(( TERM_COLS - 4 ))
    local row=$(( TERM_ROWS - 4 ))
    local col=$(( (TERM_COLS - box_w) / 2 ))
    [[ $col -lt 1 ]] && col=1

    move_to "$row" "$col";        printf "+%s+" "$(printf '%*s' $(( box_w - 2 )) '' | tr ' ' '-')"
    move_to $(( row + 1 )) "$col"; printf "| %-$(( box_w - 4 ))s  |" "$label"
    move_to $(( row + 2 )) "$col"; printf "+%s+" "$(printf '%*s' $(( box_w - 2 )) '' | tr ' ' '-')"

    "$@" &>/dev/null &
    local pid=$!
    local fi=0
    local spin_col=$(( col + box_w - 3 ))
    while kill -0 "$pid" 2>/dev/null; do
        move_to $(( row + 1 )) "$spin_col"
        printf "${_NI_SPIN_CHARS[$fi]}"
        fi=$(( (fi + 1) % 4 ))
        sleep 0.1
    done
    wait "$pid"
    local status=$?

    move_to $(( row + 1 )) "$spin_col"
    if [[ $status -eq 0 ]]; then
        printf "${C_GREEN}*${RESET}"
        log "OK: $label"
    else
        printf "${C_RED}!${RESET}"
        log "ERROR: $label failed"
        sleep 0.8
        tui_cleanup
        die "$label failed"
    fi
    sleep 0.4
    # erase spinner box
    move_to "$row"             "$col"; printf "%${box_w}s" ""
    move_to $(( row + 1 ))    "$col"; printf "%${box_w}s" ""
    move_to $(( row + 2 ))    "$col"; printf "%${box_w}s" ""
}

# =============================================================================
# Full-screen progress view for installs
# =============================================================================
PROGRESS_TASKS=()
PROGRESS_CURRENT=0

tui_progress_init() {
    PROGRESS_TASKS=("$@")
    PROGRESS_CURRENT=0
}

tui_progress_draw() {
    local total=${#PROGRESS_TASKS[@]}

    printf "%b" "${CLEAR_SCREEN}"
    tui_measure

    # adaptive sizing
    local box_w=$(( TERM_COLS - 8 ))
    [[ $box_w -lt 54 ]] && box_w=54
    [[ $box_w -gt 80 ]] && box_w=80

    local box_h=$(( total + 9 ))
    local box_r=$(( (TERM_ROWS - box_h) / 2 ))
    [[ $box_r -lt 1 ]] && box_r=1
    local box_c=$(( (TERM_COLS - box_w) / 2 ))
    [[ $box_c -lt 1 ]] && box_c=1
    local inner=$(( box_w - 2 ))
    local bar_w=$(( box_w - 10 ))

    tui_box "$box_r" "$box_c" "$box_w" "$box_h" "Installing"

    move_to $(( box_r + 1 )) $(( box_c + 3 ))
    printf "${DIM}Airlink v${VERSION}${RESET}"

    tui_hline $(( box_r + 2 )) "$box_c" "$box_w"

    local i
    for (( i = 0; i < total; i++ )); do
        move_to $(( box_r + 3 + i )) $(( box_c + 3 ))
        if [[ $i -lt $PROGRESS_CURRENT ]]; then
            printf "${C_GREEN}[+]${RESET} ${DIM}%-$(( inner - 6 ))s${RESET}" "${PROGRESS_TASKS[$i]}"
        elif [[ $i -eq $PROGRESS_CURRENT ]]; then
            printf "${C_CYAN}[>]${RESET} ${BOLD}%-$(( inner - 6 ))s${RESET}" "${PROGRESS_TASKS[$i]}"
        else
            printf "${DIM}[ ] %-$(( inner - 6 ))s${RESET}" "${PROGRESS_TASKS[$i]}"
        fi
    done

    tui_hline $(( box_r + box_h - 4 )) "$box_c" "$box_w"

    local pct=0
    [[ $total -gt 0 ]] && pct=$(( PROGRESS_CURRENT * 100 / total ))
    local filled=$(( pct * bar_w / 100 ))
    local empty=$(( bar_w - filled ))

    move_to $(( box_r + box_h - 3 )) $(( box_c + 3 ))
    printf "[%s%s] %3d%%" \
        "$(printf '%*s' "$filled" '' | tr ' ' '#')" \
        "$(printf '%*s' "$empty"  '' | tr ' ' ' ')" \
        "$pct"

    # expose these for caller to use for spinner placement
    _PBOX_R=$box_r
    _PBOX_C=$box_c
    _PBOX_W=$box_w
    _PBOX_H=$box_h
}

_PBOX_R=0; _PBOX_C=0; _PBOX_W=0; _PBOX_H=0

tui_progress_step() {
    tui_progress_draw

    local spinner_row=$(( _PBOX_R + 3 + PROGRESS_CURRENT ))
    local spinner_col=$(( _PBOX_C + _PBOX_W - 4 ))
    local out_row=$(( _PBOX_R + _PBOX_H + 1 ))
    local out_lines=6
    local out_w=$(( _PBOX_W - 4 ))
    [[ $out_w -lt 20 ]] && out_w=20

    local outfile; outfile=$(mktemp /tmp/al-step-XXXXXX)

    "$@" >"$outfile" 2>&1 &
    local pid=$!
    local fi=0

    while kill -0 "$pid" 2>/dev/null; do
        move_to "$spinner_row" "$spinner_col"
        printf "${C_CYAN}%s${RESET}" "${_NI_SPIN_CHARS[$fi]}"
        fi=$(( (fi + 1) % 4 ))

        # status line — parse last meaningful line from output into human-readable string
        local last_line raw_status
        last_line=$(grep -v '^[[:space:]]*$' "$outfile" 2>/dev/null | tail -1)
        raw_status=$(parse_status_line "$last_line")
        if [[ $(( out_row - 1 )) -lt $TERM_ROWS && -n "$raw_status" ]]; then
            move_to $(( out_row - 1 )) $(( _PBOX_C + 2 ))
            printf "${C_YELLOW}status:${RESET} ${DIM}%-$(( out_w - 8 )).$(( out_w - 8 ))s${RESET}" "$raw_status"
        fi

        local li=0
        while IFS= read -r line; do
            if [[ $(( out_row + li )) -lt $TERM_ROWS ]]; then
                move_to $(( out_row + li )) $(( _PBOX_C + 2 ))
                printf "${DIM}%-${out_w}.${out_w}s${RESET}" "$line"
            fi
            li=$(( li + 1 ))
        done < <(tail -n${out_lines} "$outfile" 2>/dev/null)
        while [[ $li -lt $out_lines ]]; do
            if [[ $(( out_row + li )) -lt $TERM_ROWS ]]; then
                move_to $(( out_row + li )) $(( _PBOX_C + 2 ))
                printf "%-${out_w}s" ""
            fi
            li=$(( li + 1 ))
        done

        sleep 0.1
    done

    wait "$pid"
    local status=$?

    # clear status line then streaming area
    if [[ $(( out_row - 1 )) -lt $TERM_ROWS ]]; then
        move_to $(( out_row - 1 )) $(( _PBOX_C + 2 ))
        printf "%-${out_w}s" ""
    fi
    local li
    for (( li = 0; li < out_lines; li++ )); do
        if [[ $(( out_row + li )) -lt $TERM_ROWS ]]; then
            move_to $(( out_row + li )) $(( _PBOX_C + 2 ))
            printf "%-${out_w}s" ""
        fi
    done

    move_to "$spinner_row" "$spinner_col"
    if [[ $status -eq 0 ]]; then
        printf "   "
        log "OK: ${PROGRESS_TASKS[$PROGRESS_CURRENT]}"
        PROGRESS_CURRENT=$(( PROGRESS_CURRENT + 1 ))
    else
        local err_out; err_out=$(tail -n20 "$outfile" 2>/dev/null || true)
        rm -f "$outfile"
        log "ERROR: ${PROGRESS_TASKS[$PROGRESS_CURRENT]}"
        tui_cleanup
        printf "\n${BOLD}  Step failed:${RESET} %s\n\n%s\n\n" "${PROGRESS_TASKS[$PROGRESS_CURRENT]}" "$err_out"
        exit 1
    fi

    rm -f "$outfile"
    sleep 0.05
}

tui_progress_finish() {
    PROGRESS_CURRENT=${#PROGRESS_TASKS[@]}
    tui_progress_draw
    sleep 1
}

# =============================================================================
# OS detection
# =============================================================================
OS="" VER="" FAM="" PKG=""

detect_os() {
    [[ -f /etc/os-release ]] || die "Cannot detect OS — /etc/os-release missing"
    # source it safely
    OS=$(grep '^ID='          /etc/os-release | cut -d= -f2 | tr -d '"')
    VER=$(grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"')

    case "$OS" in
        ubuntu|debian|linuxmint|pop|raspbian)
            FAM="debian"; PKG="apt" ;;
        fedora|centos|rhel|rocky|almalinux|ol)
            FAM="redhat"
            if command -v dnf &>/dev/null; then PKG="dnf"; else PKG="yum"; fi
            ;;
        arch|manjaro|endeavouros)
            FAM="arch"; PKG="pacman" ;;
        alpine)
            FAM="alpine"; PKG="apk" ;;
        *)
            die "Unsupported OS: $OS. Supported: Ubuntu/Debian/Fedora/RHEL/Arch/Alpine" ;;
    esac
    log "Detected OS: $OS $VER ($FAM)"
}

pkg_install() {
    case "$PKG" in
        apt)
            DEBIAN_FRONTEND=noninteractive apt-get update -qq
            DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
            ;;
        dnf|yum)
            $PKG install -y -q "$@"
            ;;
        pacman)
            pacman -Sy --noconfirm --needed "$@"
            ;;
        apk)
            apk add --no-cache -q "$@"
            ;;
    esac
}

# =============================================================================
# Dependency checks
# =============================================================================
ensure_deps() {
    local deps=(curl wget git openssl)
    local missing=()
    for d in "${deps[@]}"; do
        command -v "$d" &>/dev/null || missing+=("$d")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log "Installing missing deps: ${missing[*]}"
        pkg_install "${missing[@]}"
    fi
    # verify all installed
    for d in "${deps[@]}"; do
        command -v "$d" &>/dev/null || die "Failed to install: $d"
    done
}

# =============================================================================
# Node.js — query nodejs.org for actual latest LTS, install via NodeSource
# =============================================================================
get_latest_node_lts() {
    # Query nodejs.org release index for latest LTS major version
    local idx
    idx=$(curl -fsSL --max-time 15 "https://nodejs.org/dist/index.json" 2>/dev/null) || {
        log "WARN: Could not fetch node index, falling back to LTS 22"
        echo "22"
        return
    }
    # Find first entry with lts != false, extract major version
    # The index is JSON array sorted newest-first
    local lts_ver
    lts_ver=$(echo "$idx" | grep -o '"version":"v[0-9]*\.[0-9]*\.[0-9]*","[^}]*"lts":"[A-Za-z]*"' \
              | head -1 | grep -o 'v[0-9]*' | head -1 | tr -d 'v') 2>/dev/null || true
    if [[ -z "$lts_ver" ]]; then
        # fallback: just grab version field of first lts entry
        lts_ver=$(echo "$idx" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for r in data:
    if r.get('lts') and r['lts'] is not False:
        print(r['version'].lstrip('v').split('.')[0])
        break
" 2>/dev/null) || true
    fi
    if [[ -z "$lts_ver" || ! "$lts_ver" =~ ^[0-9]+$ ]]; then
        log "WARN: Could not parse LTS version, defaulting to 22"
        echo "22"
    else
        echo "$lts_ver"
    fi
}

# =============================================================================
# Registry selection — geolocate via ip-api.com, pick nearest mirror
# Sets PNPM_REGISTRY to the fastest known registry for this region
# =============================================================================
select_npm_registry() {
    local geo
    geo=$(curl -fsSL --max-time 8 "http://ip-api.com/json/?fields=continentCode,countryCode" 2>/dev/null || echo "")

    local continent country
    continent=$(echo "$geo" | grep -o '"continentCode":"[^"]*"' | cut -d'"' -f4)
    country=$(echo "$geo"   | grep -o '"countryCode":"[^"]*"'   | cut -d'"' -f4)

    case "$continent" in
        AS)
            # Asia — Taobao mirror covers CN/IN/SG/JP well
            # npmmirror.com is the current canonical Taobao-backed mirror
            PNPM_REGISTRY="https://registry.npmmirror.com"
            log "Registry: npmmirror.com (Asia)"
            ;;
        EU)
            # Europe — Cloudflare npm proxy is geographically close for EU
            PNPM_REGISTRY="https://registry.npmjs.org"
            log "Registry: npmjs.org (EU — no dedicated EU mirror, CF edge is fast)"
            ;;
        OC)
            PNPM_REGISTRY="https://registry.npmjs.org"
            log "Registry: npmjs.org (Oceania)"
            ;;
        *)
            # Americas and everything else — default npm CDN
            PNPM_REGISTRY="https://registry.npmjs.org"
            log "Registry: npmjs.org (default)"
            ;;
    esac

    # sanity check — can we actually reach it?
    if ! curl -fsSL --max-time 6 "${PNPM_REGISTRY}/npm" -o /dev/null 2>/dev/null; then
        log "WARN: $PNPM_REGISTRY unreachable, falling back to registry.npmjs.org"
        PNPM_REGISTRY="https://registry.npmjs.org"
    fi
}

# =============================================================================
# Status line parser — reads a raw output line, returns human-readable status
# Used by tui_progress_step and ni_run to show what's happening underneath
# =============================================================================
parse_status_line() {
    local line="$1"

    # pnpm / npm package resolution and download
    if [[ "$line" =~ "Packages:".*"installed" ]]; then
        echo "pnpm: $(echo "$line" | grep -o '[0-9]* installed' | head -1) packages"
        return
    fi
    if [[ "$line" =~ "Progress: resolved" ]]; then
        # pnpm progress: resolved X, reused Y, downloaded Z
        local resolved; resolved=$(echo "$line" | grep -o 'resolved [0-9]*' | grep -o '[0-9]*')
        local downloaded; downloaded=$(echo "$line" | grep -o 'downloaded [0-9]*' | grep -o '[0-9]*')
        echo "resolving packages — ${resolved:-?} resolved, ${downloaded:-0} downloaded"
        return
    fi
    if [[ "$line" =~ " +[0-9]+ packages" && "$line" =~ "node_modules" ]]; then
        echo "linking: $line" | sed 's/^ *//'
        return
    fi

    # npm classic output
    if [[ "$line" =~ ^"added "[0-9]+" packages" ]]; then
        echo "${line}"
        return
    fi
    if [[ "$line" =~ ^"npm warn" || "$line" =~ ^"npm WARN" ]]; then
        echo "npm: $(echo "$line" | sed 's/^npm warn //I')"
        return
    fi

    # git clone / fetch
    if [[ "$line" =~ "Cloning into" ]]; then
        local repo; repo=$(echo "$line" | grep -o "'.*/.*'" | tr -d "'")
        echo "git: cloning ${repo:-repository}"
        return
    fi
    if [[ "$line" =~ "Receiving objects:" ]]; then
        local pct; pct=$(echo "$line" | grep -o '[0-9]*%' | head -1)
        echo "git: receiving objects ${pct:-...}"
        return
    fi
    if [[ "$line" =~ "Resolving deltas:" ]]; then
        local pct; pct=$(echo "$line" | grep -o '[0-9]*%' | head -1)
        echo "git: resolving deltas ${pct:-...}"
        return
    fi

    # apt / pkg
    if [[ "$line" =~ ^"Get:" ]]; then
        local pkg; pkg=$(echo "$line" | awk '{print $4}')
        echo "apt: fetching ${pkg:-package}"
        return
    fi
    if [[ "$line" =~ ^"Unpacking" ]]; then
        local pkg; pkg=$(echo "$line" | awk '{print $2}')
        echo "apt: unpacking ${pkg:-package}"
        return
    fi
    if [[ "$line" =~ ^"Setting up" ]]; then
        local pkg; pkg=$(echo "$line" | awk '{print $3}')
        echo "apt: setting up ${pkg:-package}"
        return
    fi

    # typescript / tsc build
    if [[ "$line" =~ "error TS" ]]; then
        echo "tsc error: $(echo "$line" | grep -o 'error TS[^:]*:.*' | head -1 | cut -c1-60)"
        return
    fi
    if [[ "$line" =~ ".ts(" ]]; then
        local f; f=$(echo "$line" | grep -o '[^ ]*\.ts([0-9,]*)' | head -1)
        echo "tsc: compiling ${f:-...}"
        return
    fi

    # prisma
    if [[ "$line" =~ "Applying migration" ]]; then
        local mig; mig=$(echo "$line" | grep -o '`[^`]*`' | head -1 | tr -d '`')
        echo "prisma: applying migration ${mig:-...}"
        return
    fi
    if [[ "$line" =~ "Generated Prisma Client" ]]; then
        echo "prisma: client generated"
        return
    fi

    # systemctl
    if [[ "$line" =~ "Created symlink" ]]; then
        echo "systemd: service enabled"
        return
    fi

    # docker
    if [[ "$line" =~ "Pulling from" ]]; then
        local img; img=$(echo "$line" | awk '{print $NF}')
        echo "docker: pulling ${img:-image}"
        return
    fi

    # nodesource setup script
    if [[ "$line" =~ "Installing Node.js" ]]; then
        echo "${line}" | sed 's/^ *//'
        return
    fi

    # generic: strip leading whitespace, return if non-empty and printable
    local stripped; stripped=$(echo "$line" | sed 's/^[[:space:]]*//' | tr -cd '[:print:]')
    if [[ -n "$stripped" ]]; then
        echo "${stripped}"
    else
        echo ""
    fi
}

setup_node() {
    local desired_major
    desired_major=$(get_latest_node_lts)
    log "Latest Node.js LTS major: $desired_major"

    # check if already correct version
    if command -v node &>/dev/null; then
        local current_major
        current_major=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
        if [[ "$current_major" == "$desired_major" ]]; then
            log "Node.js $desired_major already installed ($(node -v))"
        else
            log "Node.js version mismatch: have $current_major, want $desired_major — upgrading"
            _install_node "$desired_major"
        fi
    else
        _install_node "$desired_major"
    fi

    command -v node &>/dev/null || die "Node.js install failed"
    log "Installed Node.js $(node -v)"

    # pick nearest registry before installing anything else
    select_npm_registry

    # install pnpm via npm once — faster for all subsequent package installs
    if ! command -v pnpm &>/dev/null; then
        echo "Installing pnpm..."
        npm install -g pnpm --registry "${PNPM_REGISTRY}" &>/dev/null \
            || npm install -g pnpm &>/dev/null \
            || die "pnpm install failed"
    fi
    PNPM=$(command -v pnpm)

    # point pnpm at the selected registry globally
    "$PNPM" config set registry "${PNPM_REGISTRY}" &>/dev/null || true
    # also tell npm to use the same registry
    npm config set registry "${PNPM_REGISTRY}" &>/dev/null || true

    npm install -g typescript &>/dev/null || true
    log "pnpm $("$PNPM" -v 2>/dev/null) ready, registry: ${PNPM_REGISTRY}"
}

_install_node() {
    local desired_major="$1"
    case "$FAM" in
        debian)
            curl -fsSL "https://deb.nodesource.com/setup_${desired_major}.x" | bash -
            DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
            ;;
        redhat)
            curl -fsSL "https://rpm.nodesource.com/setup_${desired_major}.x" | bash -
            $PKG install -y -q nodejs
            ;;
        arch)
            pacman -Sy --noconfirm --needed nodejs npm
            ;;
        alpine)
            apk add --no-cache nodejs npm
            ;;
    esac
}

# =============================================================================
# Docker — query GitHub API for latest stable release tag
# =============================================================================
get_latest_docker_version() {
    local tag
    tag=$(curl -fsSL --max-time 15 \
        "https://api.github.com/repos/docker/docker-ce/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | head -1 | cut -d'"' -f4) || true
    if [[ -z "$tag" ]]; then
        log "WARN: Could not fetch Docker latest release"
        echo ""
    else
        echo "$tag"
    fi
}

setup_docker() {
    if command -v docker &>/dev/null; then
        log "Docker already installed: $(docker --version 2>/dev/null | head -1)"
        systemctl is-active --quiet docker || systemctl enable --now docker &>/dev/null || true
        return 0
    fi

    log "Installing Docker..."
    case "$FAM" in
        debian|redhat)
            # Official Docker install script — always gets latest stable
            curl -fsSL https://get.docker.com | sh
            ;;
        arch)
            pacman -Sy --noconfirm --needed docker docker-compose
            ;;
        alpine)
            apk add --no-cache docker docker-compose
            rc-update add docker boot &>/dev/null || true
            ;;
    esac

    # Enable and start
    if command -v systemctl &>/dev/null; then
        systemctl enable --now docker &>/dev/null || true
    fi

    command -v docker &>/dev/null || die "Docker install failed"
    log "Installed Docker: $(docker --version 2>/dev/null | head -1)"
}

# =============================================================================
# Credential validation
# =============================================================================
valid_username() { [[ "$1" =~ ^[A-Za-z0-9]{3,20}$ ]]; }
valid_password() {
    [[ ${#1} -ge 8 ]] && [[ "$1" =~ [A-Za-z] ]] && [[ "$1" =~ [0-9] ]]
}
valid_email() { [[ "$1" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; }
valid_port()  { [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -ge 1 ]] && [[ "$1" -le 65535 ]]; }

get_addon_field() { echo "$1" | cut -d'|' -f"$2"; }

# =============================================================================
# Panel install phases
# =============================================================================
phase_panel_clone() {
    mkdir -p /var/www

    if [[ -d /var/www/panel ]]; then
        echo "Existing panel found — updating in-place"
        cd /var/www/panel || die "Cannot access /var/www/panel"

        rm -rf src public views routes controllers middleware services \
               *.ts *.js tsconfig.json tailwind.config.* 2>/dev/null || true
        # if prisma dir exists, remove only schema
        rm -f prisma/schema.prisma 2>/dev/null || true

        local tmpdir; tmpdir=$(mktemp -d /tmp/al-panel-XXXXXX)
        git clone --depth 1 "${PANEL_REPO}" "$tmpdir" || die "Failed to clone panel"

        if command -v rsync &>/dev/null; then
            rsync -a --exclude='.env' --exclude='dev.db' --exclude='node_modules' \
                  --exclude='storage' "$tmpdir/" /var/www/panel/
        else
            cp -r "$tmpdir"/. /var/www/panel/
        fi
        cp -r "$tmpdir/prisma" /var/www/panel/
        rm -rf "$tmpdir"
    else
        cd /var/www || die "Cannot access /var/www"
        git clone --depth 1 "${PANEL_REPO}" panel || die "Failed to clone panel"
    fi

    # fix ownership
    if id www-data &>/dev/null; then
        chown -R www-data:www-data /var/www/panel
    fi
    chmod -R 755 /var/www/panel

    # write .env only on fresh install
    if [[ ! -f /var/www/panel/.env ]]; then
        local secret; secret=$(openssl rand -hex 32)
        cat > /var/www/panel/.env <<ENVEOF
NAME=${PANEL_NAME}
NODE_ENV=production
URL=http://localhost:${PANEL_PORT}
PORT=${PANEL_PORT}
DATABASE_URL=file:./dev.db
SESSION_SECRET=${secret}
ENVEOF
    fi
}

phase_panel_deps() {
    cd /var/www/panel || die "Panel directory missing"
    npm install --no-audit --no-fund || die "Panel dependency install failed"
    npm install --no-audit --no-fund bcrypt || true
}

phase_panel_prisma() {
    cd /var/www/panel || die "Panel directory missing"
    npm uninstall --no-audit prisma @prisma/client &>/dev/null || true
    npm cache clean --force &>/dev/null || true
    npm install --no-audit --no-fund "prisma@${PRISMA_VER}" "@prisma/client@${PRISMA_VER}"
}

phase_panel_migrate() {
    cd /var/www/panel || die "Panel directory missing"
    if [[ -f dev.db ]]; then
        npx prisma migrate deploy || die "DB migration failed"
    else
        CI=true npm run migrate:dev || die "DB migration failed"
    fi
}

phase_panel_build() {
    cd /var/www/panel || die "Panel directory missing"
    npm run build || die "Panel build failed"
}

phase_panel_admin() {
    cd /var/www/panel || die "Panel directory missing"
    npm install -g pm2 || die "PM2 install failed"
    _set_registration true
    pm2 start npm --name "airlink-panel-temp" -- run start
    _wait_for_panel
    _create_admin_user
    _set_registration false
    pm2 delete airlink-panel-temp &>/dev/null || true
    pm2 save --force &>/dev/null || true
}

phase_panel_service() {
    # find node binary for ExecStart
    local node_bin; node_bin=$(command -v node)
    local npm_bin; npm_bin=$(command -v npm)

    cat > /etc/systemd/system/airlink-panel.service <<SVCEOF
[Unit]
Description=Airlink Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/panel
ExecStart=${npm_bin} run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    systemctl enable --now airlink-panel
    _process_addons
}

# =============================================================================
# Daemon install phases
# =============================================================================
phase_daemon_clone() {
    if [[ -d /etc/daemon ]]; then
        echo "Existing daemon found — updating in-place"
        cd /etc/daemon || die "Cannot access /etc/daemon"
        rm -rf src dist libs *.ts *.js tsconfig.json 2>/dev/null || true

        local tmpdir; tmpdir=$(mktemp -d /tmp/al-daemon-XXXXXX)
        git clone --depth 1 "${DAEMON_REPO}" "$tmpdir" || die "Failed to clone daemon"
        if command -v rsync &>/dev/null; then
            rsync -a --exclude='.env' --exclude='node_modules' "$tmpdir/" /etc/daemon/
        else
            cp -r "$tmpdir"/. /etc/daemon/
        fi
        rm -rf "$tmpdir"
    else
        cd /etc || die "Cannot access /etc"
        git clone --depth 1 "${DAEMON_REPO}" daemon || die "Failed to clone daemon"
    fi

    if [[ ! -f /etc/daemon/.env ]]; then
        cat > /etc/daemon/.env <<ENVEOF
remote=${PANEL_ADDRESS}
key=${DAEMON_KEY}
port=${DAEMON_PORT}
DEBUG=false
version=1.0.0
environment=production
STATS_INTERVAL=10000
ENVEOF
    fi
}

phase_daemon_deps() {
    cd /etc/daemon || die "Daemon directory missing"
    npm install --no-audit --no-fund || die "Daemon dependency install failed"
    npm install --no-audit --no-fund express || die "express install failed"

    # install native libs if present — must happen before build
    if [[ -d /etc/daemon/libs ]]; then
        cd /etc/daemon/libs || die "Cannot access /etc/daemon/libs"
        npm install --no-audit --no-fund
        npm rebuild
        cd /etc/daemon || die "Cannot return to /etc/daemon"
    fi
}

phase_daemon_build() {
    cd /etc/daemon || die "Daemon directory missing"
    npm run build || die "Daemon build failed"
    if id www-data &>/dev/null; then
        chown -R www-data:www-data /etc/daemon
    fi
}

phase_daemon_service() {
    local npm_bin; npm_bin=$(command -v npm)

    cat > /etc/systemd/system/airlink-daemon.service <<SVCEOF
[Unit]
Description=Airlink Daemon
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/daemon
ExecStart=${npm_bin} run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    systemctl enable --now airlink-daemon
}

# =============================================================================
# Admin user helpers
# =============================================================================
_set_registration() {
    local enabled="$1"
    cd /var/www/panel || return 1
    PANEL_NAME="${PANEL_NAME}" node - <<JSEOF
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
    try {
        const s = await prisma.settings.findFirst();
        const data = {
            allowRegistration: ${enabled},
            title: process.env.PANEL_NAME || "Airlink",
            description: "AirLink is a free and open source project by AirlinkLabs",
            logo: "../assets/logo.png",
            favicon: "../assets/favicon.ico",
            theme: "default",
            language: "en"
        };
        if (!s) {
            await prisma.settings.create({ data });
        } else {
            await prisma.settings.update({ where: { id: s.id }, data: { allowRegistration: ${enabled} } });
        }
    } catch(e) {
        console.error(e);
        process.exit(1);
    } finally {
        await prisma.\$disconnect();
    }
})();
JSEOF
}

_wait_for_panel() {
    local waited=0
    local timeout=60
    while [[ $waited -lt $timeout ]]; do
        curl -sf "http://localhost:${PANEL_PORT}" -o /dev/null && return 0
        sleep 2
        waited=$(( waited + 2 ))
    done
    log "WARN: Panel did not respond within ${timeout}s — continuing anyway"
}

_create_admin_user() {
    local csrf
    csrf=$(curl -sf -c /tmp/al-cookies.txt "http://localhost:${PANEL_PORT}/register" \
           | grep -o 'name="_csrf" value="[^"]*"' | head -1 | grep -o 'value="[^"]*"' | cut -d'"' -f2 || echo "")

    curl -sf -b /tmp/al-cookies.txt -c /tmp/al-cookies.txt \
         -X POST "http://localhost:${PANEL_PORT}/register" \
         -H "Content-Type: application/x-www-form-urlencoded" \
         --data-urlencode "username=${ADMIN_USERNAME}" \
         --data-urlencode "email=${ADMIN_EMAIL}" \
         --data-urlencode "password=${ADMIN_PASSWORD}" \
         --data-urlencode "_csrf=${csrf}" \
         -o /dev/null -L || true

    rm -f /tmp/al-cookies.txt
    log "Admin user creation attempted: ${ADMIN_USERNAME}"
}

_process_addons() {
    [[ -z "${ADDON_CHOICES:-}" || "${ADDON_CHOICES}" == "none" ]] && return 0

    local to_install=()
    if [[ "$ADDON_CHOICES" == "all" ]]; then
        to_install=("${ADDONS[@]}")
    else
        IFS=',' read -ra selected <<< "$ADDON_CHOICES"
        for sel in "${selected[@]}"; do
            for addon in "${ADDONS[@]}"; do
                if [[ "$(get_addon_field "$addon" 4)" == "$sel" ]]; then
                    to_install+=("$addon")
                    break
                fi
            done
        done
    fi

    local addons_dir="/var/www/panel/storage/addons"
    mkdir -p "$addons_dir"

    for addon_config in "${to_install[@]}"; do
        local display_name repo_url branch dir_name
        display_name=$(get_addon_field "$addon_config" 1)
        repo_url=$(get_addon_field "$addon_config" 2)
        branch=$(get_addon_field "$addon_config" 3)
        dir_name=$(get_addon_field "$addon_config" 4)

        local target="${addons_dir}/${dir_name}"
        if [[ -d "$target" ]]; then
            cd "$target"
            git pull origin "$branch" &>/dev/null || true
        else
            git clone --depth 1 --branch "$branch" "$repo_url" "$target" || die "Failed to clone $display_name"
            cd "$target"
        fi

        npm install --no-audit --no-fund || die "$display_name install failed"
        npm run build || die "$display_name build failed"
        log "OK: $display_name addon installed"
    done

    # rebuild tailwind css after addon install
    cd /var/www/panel
    npx tailwindcss -i ./public/tw.css -o ./public/styles.css &>/dev/null || true
}

# =============================================================================
# Remove helpers
# =============================================================================
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
        debian) apt-get remove -y nodejs npm docker.io docker-ce docker-ce-cli &>/dev/null || true ;;
        redhat) $PKG remove -y nodejs npm docker-ce docker-ce-cli &>/dev/null || true ;;
        arch)   pacman -R --noconfirm nodejs npm docker &>/dev/null || true ;;
        alpine) apk del nodejs npm docker &>/dev/null || true ;;
    esac
}

# =============================================================================
# ping counter
# =============================================================================
ping_install_counter() {
    curl -sf "https://api.counterapi.dev/v2/airlinklabs/installed-air/up" \
         -o /dev/null 2>/dev/null || true
}

# =============================================================================
# TUI config collection
# =============================================================================
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

    local err=""
    while true; do
        tui_input "Panel port (1-65535)" "3000" "$err"
        if valid_port "$TUI_INPUT"; then
            PANEL_PORT="$TUI_INPUT"
            break
        fi
        err="Invalid port — must be 1-65535"
    done
}

tui_collect_admin_config() {
    local err=""
    while true; do
        tui_input "Admin email" "admin@example.com" "$err"
        if valid_email "$TUI_INPUT"; then
            ADMIN_EMAIL="$TUI_INPUT"
            break
        fi
        err="Invalid email format"
    done

    err=""
    while true; do
        tui_input "Admin username (3-20 alphanumeric)" "admin" "$err"
        if valid_username "$TUI_INPUT"; then
            ADMIN_USERNAME="$TUI_INPUT"
            break
        fi
        err="Must be 3-20 alphanumeric characters"
    done

    err=""
    while true; do
        tui_password "Admin password (8+ chars, 1 letter, 1 number)" "$err"
        if valid_password "$TUI_INPUT"; then
            ADMIN_PASSWORD="$TUI_INPUT"
            break
        fi
        err="Must be 8+ chars with at least 1 letter and 1 number"
    done
}

tui_collect_daemon_config() {
    tui_input "Panel address (IP or hostname)" "127.0.0.1"
    PANEL_ADDRESS="$TUI_INPUT"

    local err=""
    while true; do
        tui_input "Daemon port (1-65535)" "3002" "$err"
        if valid_port "$TUI_INPUT"; then
            DAEMON_PORT="$TUI_INPUT"
            break
        fi
        err="Invalid port — must be 1-65535"
    done

    tui_input "Daemon auth key (from panel > Nodes)" ""
    DAEMON_KEY="$TUI_INPUT"
}

tui_collect_addons() {
    local names=()
    for addon in "${ADDONS[@]}"; do
        names+=("$(get_addon_field "$addon" 1)")
    done
    tui_checklist "Optional Addons" "${names[@]}"
    if [[ -z "$TUI_MULTI" ]]; then
        ADDON_CHOICES="none"
        return
    fi
    local chosen=()
    for idx in $TUI_MULTI; do
        chosen+=("$(get_addon_field "${ADDONS[$idx]}" 4)")
    done
    IFS=',' ADDON_CHOICES="${chosen[*]}"
}

# =============================================================================
# TUI install runner
# =============================================================================
tui_do_install() {
    local mode="$1"
    local tasks=()

    case "$mode" in
        both)
            tasks=(
                "Check dependencies" "Install Node.js" "Install Docker"
                "Clone panel" "Panel dependencies" "Install Prisma"
                "Database migrations" "Build panel" "Create admin user" "Start panel service"
                "Clone daemon" "Daemon dependencies" "Build daemon" "Start daemon service"
            )
            ;;
        panel)
            tasks=(
                "Check dependencies" "Install Node.js" "Install Docker"
                "Clone panel" "Panel dependencies" "Install Prisma"
                "Database migrations" "Build panel" "Create admin user" "Start panel service"
            )
            ;;
        daemon)
            tasks=(
                "Check dependencies" "Install Node.js" "Install Docker"
                "Clone daemon" "Daemon dependencies" "Build daemon" "Start daemon service"
            )
            ;;
    esac

    tui_progress_init "${tasks[@]}"
    stty echo 2>/dev/null || true
    _INSTALLING=1

    tui_progress_step ensure_deps
    tui_progress_step setup_node
    tui_progress_step setup_docker

    if [[ "$mode" == "both" || "$mode" == "panel" ]]; then
        tui_progress_step phase_panel_clone
        tui_progress_step phase_panel_deps
        tui_progress_step phase_panel_prisma
        tui_progress_step phase_panel_migrate
        tui_progress_step phase_panel_build
        tui_progress_step phase_panel_admin
        tui_progress_step phase_panel_service
    fi

    if [[ "$mode" == "both" || "$mode" == "daemon" ]]; then
        tui_progress_step phase_daemon_clone
        tui_progress_step phase_daemon_deps
        tui_progress_step phase_daemon_build
        tui_progress_step phase_daemon_service
    fi

    tui_progress_finish
    _INSTALLING=0
    ping_install_counter
}

tui_view_logs() {
    tui_cleanup
    if [[ -f "$LOG" ]]; then
        less "$LOG" || cat "$LOG"
    else
        echo "No log at $LOG"
        sleep 2
    fi
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
        "Install Addons only"
        "Setup dependencies only"
        "Remove Panel"
        "Remove Daemon"
        "Remove everything"
        "View logs"
        "Exit"
    )

    while true; do
        if ! tui_menu "Main Menu" "${menu_items[@]}"; then
            break
        fi

        case $TUI_RESULT in
            0)  # Both
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
                tui_confirm "Remove panel? This deletes /var/www/panel" && \
                    tui_run "Removing panel" tui_remove_panel
                ;;
            6)  # Remove daemon
                tui_confirm "Remove daemon? This deletes /etc/daemon" && \
                    tui_run "Removing daemon" tui_remove_daemon
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
    printf "\n  Airlink Installer v${VERSION} — done\n\n"
}

# =============================================================================
# Non-interactive entry point
# =============================================================================
run_noninteractive() {
    ni_header

    local mode="${ARG_MODE:-both}"

    PANEL_NAME="${ARG_NAME:-Airlink}"
    PANEL_PORT="${ARG_PORT:-3000}"
    ADMIN_EMAIL="${ARG_ADMIN_EMAIL:-admin@example.com}"
    ADMIN_USERNAME="${ARG_ADMIN_USER:-admin}"
    ADMIN_PASSWORD="${ARG_ADMIN_PASS:-}"
    PANEL_ADDRESS="${ARG_PANEL_ADDR:-127.0.0.1}"
    DAEMON_PORT="${ARG_DAEMON_PORT:-3002}"
    DAEMON_KEY="${ARG_DAEMON_KEY:-}"
    ADDON_CHOICES="${ARG_ADDONS:-none}"

    [[ -n "$ADMIN_PASSWORD" ]] || die "--admin-pass is required in non-interactive mode"
    valid_password "$ADMIN_PASSWORD" || die "Password must be 8+ chars with at least 1 letter and 1 number"
    valid_username "$ADMIN_USERNAME" || die "Username must be 3-20 alphanumeric characters"
    valid_port "$PANEL_PORT"  || die "Invalid panel port: $PANEL_PORT"
    valid_port "$DAEMON_PORT" || die "Invalid daemon port: $DAEMON_PORT"
    command -v systemctl &>/dev/null || die "systemd required"

    case "$mode" in
        both)
            ni_start 14
            ni_run "Checking dependencies"   ensure_deps
            ni_run "Setting up Node.js"      setup_node
            ni_run "Setting up Docker"       setup_docker
            ni_run "Cloning panel"           phase_panel_clone
            ni_run "Installing panel deps"   phase_panel_deps
            ni_run "Installing Prisma"       phase_panel_prisma
            ni_run "Running DB migrations"   phase_panel_migrate
            ni_run "Building panel"          phase_panel_build
            ni_run "Creating admin user"     phase_panel_admin
            ni_run "Starting panel service"  phase_panel_service
            ni_run "Cloning daemon"          phase_daemon_clone
            ni_run "Installing daemon deps"  phase_daemon_deps
            ni_run "Building daemon"         phase_daemon_build
            ni_run "Starting daemon service" phase_daemon_service
            ;;
        panel)
            ni_start 10
            ni_run "Checking dependencies"   ensure_deps
            ni_run "Setting up Node.js"      setup_node
            ni_run "Setting up Docker"       setup_docker
            ni_run "Cloning panel"           phase_panel_clone
            ni_run "Installing panel deps"   phase_panel_deps
            ni_run "Installing Prisma"       phase_panel_prisma
            ni_run "Running DB migrations"   phase_panel_migrate
            ni_run "Building panel"          phase_panel_build
            ni_run "Creating admin user"     phase_panel_admin
            ni_run "Starting panel service"  phase_panel_service
            ;;
        daemon)
            ni_start 7
            ni_run "Checking dependencies"   ensure_deps
            ni_run "Setting up Node.js"      setup_node
            ni_run "Setting up Docker"       setup_docker
            ni_run "Cloning daemon"          phase_daemon_clone
            ni_run "Installing daemon deps"  phase_daemon_deps
            ni_run "Building daemon"         phase_daemon_build
            ni_run "Starting daemon service" phase_daemon_service
            ;;
        *)
            die "Unknown mode: $mode (valid: both, panel, daemon)"
            ;;
    esac

    ping_install_counter

    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}') || server_ip="<server-ip>"

    printf "\n  ${C_GREEN}${BOLD}Installation complete.${RESET}\n\n"
    [[ "$mode" != "daemon" ]] && printf "  ${C_GRAY}Panel :${RESET}  http://%s:%s\n" "$server_ip" "$PANEL_PORT"
    [[ "$mode" != "panel"  ]] && printf "  ${C_GRAY}Daemon:${RESET}  port %s\n" "$DAEMON_PORT"
    printf "  ${C_GRAY}Logs  :${RESET}  %s\n" "$LOG"
    printf "  ${C_GRAY}System:${RESET}  journalctl -u airlink-panel -f\n\n"
}

# =============================================================================
# Entry point
# =============================================================================
[[ $EUID -eq 0 ]] || { echo "Run as root or with sudo."; exit 1; }

touch "$LOG" || true
log "=== Airlink Installer v${VERSION} started (pid $$) ==="

parse_args "$@"
detect_os

if noninteractive; then
    run_noninteractive
else
    run_interactive
fi
