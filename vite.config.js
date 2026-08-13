import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

// Baked into the build so the Admin panel can show which commit a given
// .exe was actually built from — the only way to tell two builds apart
// without diffing files, since package.json's version doesn't get bumped
// per change and a stale build otherwise looks identical to a fresh one.
function gitBuildInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim()
    const date = execSync('git log -1 --format=%cI').toString().trim()
    return { commit, date }
  } catch {
    return { commit: 'unknown', date: '' }
  }
}

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  define: {
    __BUILD_INFO__: JSON.stringify(gitBuildInfo()),
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
  },
})
