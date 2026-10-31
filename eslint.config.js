import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['dist/**', 'dist-research/**', 'coverage/**', 'test-results/**', 'playwright-report/**', 'evaluation/results/**'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: {...globals.browser} } },
  { files: ['src/**/__tests__/**/*.js'], languageOptions: { globals: {...globals.node, ...globals.vitest} } },
  { files: ['e2e/**/*.{js,mjs}', 'evaluation/**/*.{js,mjs}', '*.js'], languageOptions: { globals: {...globals.node, ...globals.browser} } }
];
