import { describe, it, expect } from 'vitest';
import {
  rawErrorMessage,
  sanitizeError,
  safeClientMessage,
  daemonMessage,
  errorBody,
  isProductionPosture,
} from '../src/utils/errors';

describe('errors sanitization contract', () => {
  describe('rawErrorMessage', () => {
    it('extracts Error.message', () => {
      expect(rawErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('passes strings through', () => {
      expect(rawErrorMessage('nope')).toBe('nope');
    });

    it('reads message/error/detail off object throws', () => {
      expect(rawErrorMessage({ message: 'm' })).toBe('m');
      expect(rawErrorMessage({ error: 'e' })).toBe('e');
      expect(rawErrorMessage({ detail: 'd' })).toBe('d');
    });

    it('stringifies anything else', () => {
      expect(rawErrorMessage(42)).toBe('42');
      expect(rawErrorMessage(null)).toBe('');
    });
  });

  describe('sanitizeError / safeClientMessage', () => {
    it('never exposes internal details in the safe message', () => {
      const raw = new Error('ECONNREFUSED 127.0.0.1:3306 user=root host=/var/lib/mysql');
      const info = sanitizeError(raw);
      expect(info.safeMessage).not.toMatch(/127\.0\.0\.1|3306|root|\/var\/lib\/mysql/);
      expect(info.category).toBe('database');
      expect(info.debug).toMatch(/127\.0\.0\.1/); // raw detail stays for logs only
    });

    it('classifies daemon markers', () => {
      expect(sanitizeError(new Error('docker: no such container abc /var/lib/docker')).category).toBe('daemon');
    });

    it('classifies filesystem markers', () => {
      expect(sanitizeError(new Error('EACCES: permission denied, open /etc/passwd')).category).toBe('filesystem');
    });

    it('classifies network markers', () => {
      expect(sanitizeError(new Error('fetch failed: ETIMEDOUT')).category).toBe('network');
    });

    it('falls back to unknown for unrecognized messages', () => {
      expect(sanitizeError(new Error('something innocuous')).category).toBe('unknown');
    });

    it('prefers the caller fallback over the category message', () => {
      expect(safeClientMessage(new Error('ECONNREFUSED'), 'Failed to connect.')).toBe('Failed to connect.');
    });
  });

  describe('daemonMessage', () => {
    it('relays a trusted daemon structured error field verbatim', () => {
      expect(daemonMessage({ error: 'Invalid name' }, 'Fallback')).toBe('Invalid name');
    });

    it('relays the message field too', () => {
      expect(daemonMessage({ message: 'No space left' }, 'Fallback')).toBe('No space left');
    });

    it('falls back for non-string or empty values', () => {
      expect(daemonMessage({ error: 42 }, 'Fallback')).toBe('Fallback');
      expect(daemonMessage({ error: '   ' }, 'Fallback')).toBe('Fallback');
      expect(daemonMessage(null, 'Fallback')).toBe('Fallback');
      expect(daemonMessage(undefined, 'Fallback')).toBe('Fallback');
      expect(daemonMessage('plain', 'Fallback')).toBe('Fallback');
    });

    it('trims the relayed value', () => {
      expect(daemonMessage({ error: '  Invalid name  ' })).toBe('Invalid name');
    });
  });

  describe('errorBody', () => {
    it('extracts the body off a thrown HTTP error', () => {
      expect(errorBody(Object.assign(new Error('x'), { status: 422, body: { error: 'Invalid name' } }))).toEqual({
        error: 'Invalid name',
      });
    });

    it('returns undefined when absent', () => {
      expect(errorBody(new Error('plain'))).toBeUndefined();
      expect(errorBody('string')).toBeUndefined();
    });
  });

  describe('isProductionPosture', () => {
    const original = process.env.NODE_ENV;
    const originalDebug = process.env.DEBUG;

    afterEach(() => {
      process.env.NODE_ENV = original;
      process.env.DEBUG = originalDebug;
    });

    it('treats unset NODE_ENV as production-safe', () => {
      delete process.env.NODE_ENV;
      delete process.env.DEBUG;
      expect(isProductionPosture()).toBe(true);
    });

    it('is false in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DEBUG;
      expect(isProductionPosture()).toBe(false);
    });

    it('DEBUG=true overrides production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEBUG = 'true';
      expect(isProductionPosture()).toBe(false);
    });
  });
});
