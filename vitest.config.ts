import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The bot tests think within a time budget and the engine fuzz is CPU-heavy:
    // running files in parallel makes the bot weaker and the suite flaky.
    fileParallelism: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**', 'apps/mobile/android/**'],
  },
});
