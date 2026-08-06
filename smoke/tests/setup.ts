import { test as setup, expect } from '@playwright/test';
import fs from 'fs';

setup('authenticate admin user', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
  await page.fill('input[name="identifier"]', process.env.SMOKE_USER ?? 'smokeadmin');
  await page.fill('input[name="password"]', process.env.SMOKE_PASS ?? 'SmokePass123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/');
  await expect(page.locator('body')).toContainText('AirLink');
  fs.mkdirSync('./report', { recursive: true });
  await page.context().storageState({ path: './report/auth.json' });
  console.log('SETUP_OK');
});