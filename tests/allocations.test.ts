import { describe, it, expect } from 'vitest';
import { parseLegacyPool } from '../src/handlers/utils/server/allocations';

describe('parseLegacyPool', () => {
  it('parses valid JSON array of numbers', () => {
    expect(parseLegacyPool('[25565,25566,25567]')).toEqual([25565, 25566, 25567]);
  });

  it('returns empty array for null', () => {
    expect(parseLegacyPool(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseLegacyPool(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseLegacyPool('')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseLegacyPool('not json')).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseLegacyPool('{}')).toEqual([]);
  });

  it('filters out non-number values', () => {
    expect(parseLegacyPool('[25565,"bad",null,25566]')).toEqual([25565, 25566]);
  });

  it('handles empty array', () => {
    expect(parseLegacyPool('[]')).toEqual([]);
  });
});
