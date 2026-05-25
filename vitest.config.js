import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Allow top-level await in test files (needed for dynamic imports after vi.mock)
    globals: false,
  },
});
