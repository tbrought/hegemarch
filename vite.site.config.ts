import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The website's script (src/site), built as one plain file to sit beside the landing page:
// dist/site/site.js. `npm run package` copies it to release/site/.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __GAME_VERSION__: JSON.stringify(version) },
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist/site',
    emptyOutDir: true,
    lib: { entry: 'src/site/main.ts', formats: ['iife'], name: 'HegemarchSite', fileName: () => 'site.js' },
  },
});
