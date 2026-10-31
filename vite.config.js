import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { thirdPartyLicenses } from './build/licensesPlugin.js';
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), thirdPartyLicenses()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html'
    }
  }
});
