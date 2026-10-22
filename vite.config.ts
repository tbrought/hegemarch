import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { roomsPlugin } from './scripts/lib/roomhost';

// The version players see on the title screen is package.json's (one place to bump it).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  // (Rooms of games played together, on the dev server as on hegemarch.com: scripts/lib/roomhost.ts.)
  plugins: [roomsPlugin()],
  define: { __GAME_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 240_000,
  },
});
