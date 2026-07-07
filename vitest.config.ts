import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Use forks (separate processes) so native modules (better-sqlite3) and
    // process.env mutations don't bleed across test files.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
