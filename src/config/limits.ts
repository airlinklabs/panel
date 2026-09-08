/**
 * File size limits, body-parser limits, upload thresholds.
 * All values in bytes unless noted.
 */

export const HSTS_MAX_AGE_S = 31_536_000;
export const JSON_BODY_LIMIT = '512kb';
export const URLENCODED_LIMIT = 1000;
export const RAW_BODY_LIMIT = '1mb';
export const SETTINGS_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const AVATAR_UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
export const V2_AVATAR_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
export const FILE_SMALL_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const FILE_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
export const DAEMON_MAX_SPOOL_BYTES = 100 * 1024 * 1024;
export const VT_FILE_LIMIT_BYTES = 32 * 1024 * 1024;

/** Rate limits */
export const GLOBAL_RATE_LIMIT_MAX = 500;
export const DEFAULT_RATE_LIMIT_MAX = 100;

/** Pagination */
export const DEFAULT_PAGE_SIZE = 25;
export const ACTIVITY_PAGE_SIZE = 50;
export const DASHBOARD_PER_PAGE = 8;
export const CLIENT_API_MAX_PAGE = 10_000;

/** Content types */
export const CONTENT_TYPE_JSON = 'application/json';
export const CONTENT_TYPE_TEXT = 'text/plain';
export const CONTENT_TYPE_SVG = 'image/svg+xml';
