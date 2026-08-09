import { describe, it, expect } from 'vitest';
import { isPrivateIp, isPrivateHostname } from '../src/utils/ssrf';

describe('ssrf: private IP detection', () => {
  it('flags private, loopback, link-local and special ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('192.0.2.10')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
  });

  it('allows public ranges', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('172.15.0.1')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
    expect(isPrivateIp('192.169.0.1')).toBe(false);
    expect(isPrivateIp('11.0.0.1')).toBe(false);
    expect(isPrivateIp('2606:4700::1111')).toBe(false);
  });

  it('flags ipv4-mapped private ipv6', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('treats malformed input as not-private', () => {
    expect(isPrivateIp('not-an-ip')).toBe(false);
    expect(isPrivateIp('')).toBe(false);
  });
});

describe('ssrf: private hostname detection', () => {
  it('flags loopback and mDNS-style hostnames', () => {
    expect(isPrivateHostname('localhost')).toBe(true);
    expect(isPrivateHostname('foo.localhost')).toBe(true);
    expect(isPrivateHostname('router.local')).toBe(true);
    expect(isPrivateHostname('anything.internal')).toBe(true);
    expect(isPrivateHostname('metadata.google.internal')).toBe(true);
  });

  it('allows normal public hostnames', () => {
    expect(isPrivateHostname('example.com')).toBe(false);
    expect(isPrivateHostname('github.com')).toBe(false);
  });
});
