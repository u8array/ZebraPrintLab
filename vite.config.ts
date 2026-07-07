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

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Tauri drives Vite via `tauri dev`: pin the port its devUrl points at and
  // skip watching the Rust crate, whose builds would trigger phantom reloads.
  // Plain web dev keeps Vite's port fallback (TAURI_ENV_* only set by tauri).
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: !!process.env.TAURI_ENV_PLATFORM,
    watch: { ignored: ['**/src-tauri/**'] },
  },
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
