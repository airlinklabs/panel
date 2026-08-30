/**
 * Server-side image validation for user uploads (avatars).
 *
 * The browser-supplied `file.mimetype` and `file.originalname` are untrusted:
 * the stored extension and content type are derived from the file's magic
 * bytes instead. Files that are "polyglots" — a valid image header that also
 * embeds HTML/JS payloads (e.g. a GIF with a trailing HTML document) — are
 * rejected. The stored extension is always one of a tiny whitelist, so user
 * content can never be served as HTML/JS even if a payload slips through.
 */

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

export interface ImageInspection {
  ok: boolean;
  kind?: ImageKind;
  mime?: string;
  ext?: string;
  reason?: string;
}

const IMAGE_SIGNATURES: {
  kind: ImageKind;
  mime: string;
  ext: string;
  signature: number[];
  verify?: (buf: Buffer) => boolean;
}[] = [
  {
    kind: 'png',
    mime: 'image/png',
    ext: '.png',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    kind: 'jpeg',
    mime: 'image/jpeg',
    ext: '.jpg',
    signature: [0xff, 0xd8, 0xff],
  },
  {
    kind: 'gif',
    mime: 'image/gif',
    ext: '.gif',
    signature: [0x47, 0x49, 0x46, 0x38], // "GIF8"
  },
  {
    kind: 'webp',
    mime: 'image/webp',
    ext: '.webp',
    signature: [0x52, 0x49, 0x46, 0x46], // "RIFF" — shared with WAV/AVI
    verify: (buf) =>
      buf.length >= 12 && buf.toString('latin1', 8, 12) === 'WEBP',
  },
];

/**
 * Markers that strongly suggest an embedded HTML/JS/template payload. These
 * are ASCII and long enough that an exact hit inside real image data is
 * vanishingly unlikely.
 */
const POLYGLOT_MARKERS = [
  '<script',
  '</script',
  '<?php',
  '<?xml',
  '<svg',
  '<!--',
  '<%',
  'javascript:',
];

export function inspectImage(buffer: Buffer): ImageInspection {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: 'Empty file' };
  }

  let match: ImageInspection | undefined;
  for (const sig of IMAGE_SIGNATURES) {
    const bytes = sig.signature;
    if (
      buffer.length >= bytes.length &&
      bytes.every((b, i) => buffer[i] === b)
    ) {
      if (sig.verify && !sig.verify(buffer)) {
        continue;
      }
      match = { ok: true, kind: sig.kind, mime: sig.mime, ext: sig.ext };
      break;
    }
  }

  if (!match) {
    return { ok: false, reason: 'Unsupported or invalid image type' };
  }

  const haystack = buffer.toString('latin1').toLowerCase();
  for (const marker of POLYGLOT_MARKERS) {
    if (haystack.includes(marker)) {
      return {
        ok: false,
        reason: 'File contains embedded markup or script content',
      };
    }
  }

  return match;
}

/** Safe single-path segment for per-user upload directories. */
export function isSafeUserDirName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
    return false;
  }
  if (name === '.' || name === '..') {
    return false;
  }
  return /^[a-zA-Z0-9._-]+$/.test(name);
}

/**
 * Normalizes free-text user input for storage: trims, caps length, strips
 * control characters (including NUL) so stored values cannot smuggle
 * formatting/escape sequences into rendered output.
 */
export function normalizeUserText(value: unknown, maxLength: number): string {
  const raw = typeof value === 'string' ? value : '';
  let stripped = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      continue; // C0 controls + DEL
    }
    stripped += ch;
  }
  return stripped.trim().slice(0, maxLength);
}
