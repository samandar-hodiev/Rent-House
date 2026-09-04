import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom rather than node: the tests that matter here render components and
    // read what a person would see, which needs a DOM.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Only what is written as a test. Without this vitest would also pick up
    // fixtures and helpers that happen to sit beside them.
    include: ['src/**/*.test.{js,jsx}'],
  },
})
