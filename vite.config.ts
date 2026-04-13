import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/zpl_label_designer/',
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()], include: /\.tsx$/ }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
