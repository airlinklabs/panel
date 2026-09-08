/**
 * Re-exports from config/defaults.ts for backwards compatibility.
 * New code should import from '@/config/defaults' directly.
 */
export {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_MEMORY_MB,
  DEFAULT_MAX_CPU_PERCENT,
  DEFAULT_MAX_STORAGE_MB,
} from "./defaults";

// Legacy aliases — used by Alternative/api.ts
import {
  DEFAULT_MAX_MEMORY_MB,
  DEFAULT_MAX_CPU_PERCENT,
  DEFAULT_MAX_STORAGE_MB,
} from "./defaults";
export const DEFAULT_MEMORY_MB = DEFAULT_MAX_MEMORY_MB;
export const DEFAULT_CPU_PERCENT = DEFAULT_MAX_CPU_PERCENT;
export const DEFAULT_STORAGE_MB = DEFAULT_MAX_STORAGE_MB;
