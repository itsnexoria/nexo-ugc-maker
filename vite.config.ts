import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Stamps the service worker with a per-build id so each deploy gets a fresh cache and old caches are pruned. */
function stampServiceWorker() {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'nexo-stamp-sw',
    apply: 'build' as const,
    configResolved(c: { build: { outDir: string }; root: string }) {
      outDir = c.build.outDir;
      root = c.root;
    },
    closeBundle() {
      const file = resolve(root, outDir, 'sw.js');
      if (!existsSync(file)) return;
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', String(Date.now())));
    },
  };
}

export default defineConfig({
  // relative base so the build works from a domain root or a sub-folder (GitHub Pages)
  base: './',
  plugins: [react(), stampServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
