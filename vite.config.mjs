import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite config for Airlink Panel.
 *
 * Source: views/styles/main.css (Tailwind v4 + custom CSS fragments)
 * Output: public/assets/css/panel-[hash].css + public/.vite/manifest.json
 *
 * All panel assets live in public/. assetUrl() resolves paths and
 * prepends ASSET_URL (CDN origin) when configured.
 */
export default defineConfig({
  root: __dirname,
  publicDir: false,
  // Tailwind v4 compiles inside Vite so utilities are generated from the
  // same source scan that reads views/**/*.ejs. Without this plugin Vite
  // passes @import "tailwindcss" / @plugin / @custom-variant through raw
  // and the built CSS ships with zero utility classes.
  plugins: [tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, 'public'),
    emptyOutDir: false,
    manifest: true,
    rollupOptions: {
      input: {
        panel: path.resolve(__dirname, 'views/styles/main.css'),
      },
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/css/[name]-[hash].[ext]';
          }
          return 'assets/media/[name]-[hash].[ext]';
        },
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    sourcemap: false,
  },
  css: {
    devSourcemap: true,
  },
  // Ensure scripts/ is never copied to build output
  server: {
    fs: {
      deny: ['**/scripts/**'],
    },
  },
});
