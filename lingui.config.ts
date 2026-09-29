import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-json';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'ta', 'zh'],
  catalogs: [
    {
      path: 'locales/{locale}/messages',
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
    },
  ],
  format: formatter({ style: 'minimal' }),
});
