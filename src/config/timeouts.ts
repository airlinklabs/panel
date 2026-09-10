/**
 * Time durations (milliseconds).
 * Import from here — never inline `60 * 1000` etc.
 */

export const SECURITY_CACHE_REFRESH_MS = 30_000;
export const PRISMA_DISCONNECT_TIMEOUT_MS = 5_000;
export const WS_TOKEN_TTL_MS = 60_000;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REMEMBER_ME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const NORMAL_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ACCOUNT_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export const FORGOT_PASSWORD_WINDOW_MS = 60 * 60 * 1000;
export const RESET_PASSWORD_WINDOW_MS = 10 * 60 * 1000;
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
export const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_LOCKOUT_MINUTES = 15;
export const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
export const OVERVIEW_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const JOB_TTL_MS = 30 * 60 * 1000;
export const PLAYER_STATS_INTERVAL_MS = 5 * 60 * 1000;
export const EGG_CATALOGUE_REFRESH_MS = 2 * 24 * 60 * 60 * 1000;
export const UPDATER_TIMEOUT_MS = 120_000;
export const SETTINGS_CACHE_TTL_S = 300;
export const SESSION_DEFAULT_TTL_S = 7 * 24 * 60 * 60;
export const INSTALL_CHECK_CACHE_TTL_MS = 8_000;
export const SERVER_STATUS_TIMEOUT_MS = 3_000;
export const STOP_STATE_TTL_MS = 120_000;
export const RESTART_DELAY_MS = 2_000;
export const VT_POLL_INTERVAL_MS = 20_000;
export const DEFAULT_DAEMON_TIMEOUT_MS = 30_000;
export const INLINE_DELAY_MS = 2_000;
