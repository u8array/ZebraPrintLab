import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// Ship the generated attribution into dist/ so the MIT/Apache/OFL notices
// actually accompany the redistributed code and fonts in the deployed app.
function thirdPartyLicenses(): Plugin {
  const src = fileURLToPath(new URL('./THIRD-PARTY-LICENSES.md', import.meta.url))
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-LICENSES.md', source: readFileSync(src, 'utf8') })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()], include: /\.tsx$/ }),
    thirdPartyLicenses(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
