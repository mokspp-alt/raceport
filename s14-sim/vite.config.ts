import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
