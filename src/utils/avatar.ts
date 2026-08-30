// Local deterministic avatar generation.
//
// Replaces the remote `https://api.dicebear.com/...` thumbnail URLs that were
// used as the user-avatar fallback across most layouts. Rendering is done
// server-side with the locally installed `@dicebear/core` + `@dicebear/thumbs`
// styles so avatars never depend on an external service.
//
// @dicebear/core is ESM-only, so it is loaded lazily via dynamic import to stay
// compatible with the CJS output of this project's tsc build.

export const AVATAR_CACHE_MAX = 512;

// @dicebear/core is ESM-only, so it is loaded lazily via dynamic import to stay
// compatible with the CJS output of this project's tsc build.
import type { createAvatar as CreateAvatarFn, Style } from '@dicebear/core';

// @dicebear styles accept arbitrary option/seed objects; `Record<string, unknown>`
// satisfies the `O extends {}` constraint without resorting to `any`.
type DiceStyle = Style<Record<string, unknown>>;
interface DiceModule {
  createAvatar: typeof CreateAvatarFn;
}

let avatarLibsPromise: Promise<{
  createAvatar: typeof CreateAvatarFn;
  style: DiceStyle;
}> | null = null;

async function getAvatarLibs() {
  if (!avatarLibsPromise) {
    avatarLibsPromise = (async () => {
      const core = (await import('@dicebear/core')) as unknown as DiceModule;
      // CJS interop (tsc output) wraps the namespace under `default`; native
      // ESM (vitest/bun) exposes `create`/`meta`/`schema` directly.
      const styleMod = (await import('@dicebear/thumbs')) as unknown as {
        default?: DiceStyle;
        create?: unknown;
      };
      const style = (styleMod.default ?? styleMod) as DiceStyle;
      const createAvatar =
        core.createAvatar ??
        (core as unknown as { default?: DiceModule }).default?.createAvatar;
      if (!createAvatar || !style) {
        throw new Error('@dicebear/core or @dicebear/thumbs is unavailable');
      }
      return {
        createAvatar,
        style,
      };
    })();
  }
  return avatarLibsPromise;
}

// A tiny synchronous check so callers can bail early on junk seeds without
// invoking the generator. Usernames are limited to a few hundred chars.
export function isValidAvatarSeed(seed: unknown): seed is string {
  if (typeof seed !== 'string' || seed.length === 0 || seed.length > 128) {
    return false;
  }
  for (let i = 0; i < seed.length; i += 1) {
    // Reject control characters (would otherwise be embedded in the SVG).
    const code = seed.charCodeAt(i);
    if (code < 0x20) {
      return false;
    }
  }
  return true;
}

export async function avatarSvg(seed: string): Promise<string> {
  const { createAvatar, style } = await getAvatarLibs();
  const avatar = createAvatar(style, {
    seed,
    // thumbs supports radius/backgroundColor options; keep defaults for
    // parity with what the remote endpoint rendered before.
  });
  return avatar.toString();
}
