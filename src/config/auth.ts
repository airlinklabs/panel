/**
 * Auth, validation, and security constants.
 */

export const BCRYPT_SALT_ROUNDS = 12;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const DESCRIPTION_MAX_LENGTH = 255;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const MIN_PORT = 1024;
export const MIN_NODE_PORT = 1025;
export const MAX_PORT = 65535;
export const NODE_NAME_MIN_LENGTH = 3;
export const NODE_NAME_MAX_LENGTH = 50;
export const RPM_MAX = 10_000;
export const LOGIN_ATTEMPTS_MAX = 100;
export const LOCKOUT_MINUTES_MAX = 1440;
export const MAX_API_KEYS_PER_USER = 25;
export const RP_NAME = "Airlink";
