import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022'
  },
  server: {
    port: 3000
  },
  test: {
    environment: 'node',
    globals: true
  }
});

