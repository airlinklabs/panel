import { describe, it, expect } from 'vitest';
import {
  isCsrfExempt,
  isWsUpgrade,
  isBearerOnlyApi,
} from '../src/handlers/utils/security/csrfRouting';

const req = (path: string) => ({ path });

describe('csrf routing: websocket upgrades', () => {
  it('exempts the realtime ws endpoints', () => {
    expect(isCsrfExempt(req('/ws'))).toBe(true);
    expect(isCsrfExempt(req('/ws/realtime'))).toBe(true);
  });

  it('exempts nothing else under /ws-prefixed paths than ws', () => {
    expect(isWsUpgrade('/wsx')).toBe(false);
    expect(isWsUpgrade('/websocket')).toBe(false);
  });
});

describe('csrf routing: bearer-only api mounts', () => {
  it('exempts pterodactyl-compatible and public mounts', () => {
    expect(isCsrfExempt(req('/api/v1'))).toBe(true);
    expect(isCsrfExempt(req('/api/v1/servers'))).toBe(true);
    expect(isCsrfExempt(req('/api/client/servers'))).toBe(true);
    expect(isCsrfExempt(req('/api/application/users'))).toBe(true);
    expect(isCsrfExempt(req('/api/health'))).toBe(true);
  });

  it('does not exempt look-alike prefixes', () => {
    expect(isCsrfExempt(req('/api/v1x'))).toBe(false);
    expect(isCsrfExempt(req('/api/client-side'))).toBe(false);
    expect(isCsrfExempt(req('/api/application2'))).toBe(false);
  });
});

describe('csrf routing: session-authenticated api routes are protected', () => {
  it('protects the folder system API', () => {
    expect(isCsrfExempt(req('/api/folders'))).toBe(false);
    expect(isCsrfExempt(req('/api/folders/1'))).toBe(false);
  });

  it('protects admin endpoints', () => {
    expect(isCsrfExempt(req('/api/admin/playerstats'))).toBe(false);
    expect(isCsrfExempt(req('/api/admin/analytics/summary'))).toBe(false);
  });

  it('protects system and search endpoints', () => {
    expect(isCsrfExempt(req('/api/system/status'))).toBe(false);
    expect(isCsrfExempt(req('/api/search'))).toBe(false);
  });

  it('protects every page route', () => {
    expect(isCsrfExempt(req('/login'))).toBe(false);
    expect(isCsrfExempt(req('/user/dashboard'))).toBe(false);
    expect(isCsrfExempt(req('/admin/overview'))).toBe(false);
    expect(isCsrfExempt(req('/server/abc-123/settings'))).toBe(false);
    expect(isCsrfExempt(req('/'))).toBe(false);
  });
});

describe('csrf routing: helper predicates', () => {
  it('classifies bearer mounts correctly', () => {
    expect(isBearerOnlyApi('/api/v1/users')).toBe(true);
    expect(isBearerOnlyApi('/api/folders')).toBe(false);
  });
});
