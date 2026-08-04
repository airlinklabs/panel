/**
 * Type helper utilities for handling Express params
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type NonEmptyString = Brand<string, 'NonEmptyString'>;
export type PositiveInteger = Brand<number, 'PositiveInteger'>;

/**
 * Converts Express param (which can be string or string[]) to a single string.
 * Returns the first element if array, or the string itself.
 * Returns empty string for undefined.
 */
export function getParamAsString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || '';
  }
  return param || '';
}

/**
 * Safely converts Express param to a positive integer.
 * Returns NaN if the param cannot be parsed.
 */
export function getParamAsNumber(param: string | string[] | undefined): number {
  return parseInt(getParamAsString(param), 10);
}

/**
 * Converts Express param to a NonEmptyString brand.
 * Throws if the result would be empty.
 */
export function getRequiredParam(param: string | string[] | undefined, paramName: string): NonEmptyString {
  const value = getParamAsString(param);
  if (!value) {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
  return value as NonEmptyString;
}
