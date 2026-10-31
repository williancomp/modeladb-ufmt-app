import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    globals: true,
    coverage: {include: ['src/**/*.js'], exclude: [], reporter: ['text', 'json-summary', 'html']}
  }
});
