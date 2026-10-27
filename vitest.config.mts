import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 300000,
    hookTimeout: 300000,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
