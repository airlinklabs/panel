import { describe, it, expect } from 'vitest';
import { isValidAvatarSeed, avatarSvg } from '../src/utils/avatar';

describe('avatar generation (local, no external calls)', () => {
  it('validates seeds', () => {
    expect(isValidAvatarSeed('alice')).toBe(true);
    expect(isValidAvatarSeed('')).toBe(false);
    expect(isValidAvatarSeed(null)).toBe(false);
    expect(isValidAvatarSeed('a'.repeat(200))).toBe(false);
    expect(isValidAvatarSeed('bad\nchar')).toBe(false);
  });

  it('renders a deterministic SVG for a seed', async () => {
    const a = await avatarSvg('alice');
    const b = await avatarSvg('alice');
    const c = await avatarSvg('bob');
    expect(a).toContain('<svg');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('escapes special characters in the seed', async () => {
    const out = await avatarSvg('a<b>&');
    expect(out).toContain('<svg');
  });
});