import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both files share the emulators' single project, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
