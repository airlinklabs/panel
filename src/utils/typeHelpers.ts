/**
 * Type helper utilities for handling Express params
 */

/**
 * Converts Express param (which can be string or string[]) to a single string
 */
export function getParamAsString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || '';
  }
  return param || '';
}

/**
 * Safely converts Express param to number
 */
export function getParamAsNumber(param: string | string[] | undefined): number {
  return parseInt(getParamAsString(param), 10);
}
