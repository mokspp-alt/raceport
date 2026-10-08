import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути: сборка работает из любой папки хостинга, по IP и по домену
  base: './',
  server: { host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
