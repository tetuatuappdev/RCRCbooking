import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
    {
      name: 'build-meta',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-meta.json',
          source: JSON.stringify({ buildId }),
        })
      },
    },
  ],
})
