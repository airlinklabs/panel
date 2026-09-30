/**
 * Server-side asset URL resolver.
 *
 * Reads ASSET_URL env var — CDN origin for production, empty for dev.
 * Mirrors the EJS assetUrl() helper in templateConfig.ts.
 *
 * Usage:
 *   import { assetUrl } from '../utils/assetUrl';
 *   assetUrl('assets/logo.png')           → '/assets/logo.png' (dev)
 *   assetUrl('assets/logo.png')           → 'https://cdn.example.com/assets/logo.png' (prod)
 *   assetUrl('javascript/shared/api.js')  → '/javascript/shared/api.js'
 *   assetUrl('styles/tw.css')             → '/styles/tw.css'
 */

const ASSET_URL = (process.env.ASSET_URL || '').replace(/\/+$/, '');

export function assetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return ASSET_URL ? `${ASSET_URL  }/${  clean}` : `/${  clean}`;
}
