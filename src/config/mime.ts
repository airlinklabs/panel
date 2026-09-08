/**
 * MIME type allowlists for uploads.
 */

export const SETTINGS_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

export const AVATAR_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Theme file extension */
export const THEME_FILE_EXT = ".zip";

/** Supported languages */
export const SUPPORTED_LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
  "zh",
  "ja",
  "ta",
] as const;

/** Allowed image types for imageSecurity.ts validation */
export const IMAGE_VALIDATION_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
