// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
  },
  webServer: {
    command: 'bun --eval "Bun.serve({ port: 8765, fetch(req) { const url = new URL(req.url); let path = url.pathname === \'/\' ? \'/index.html\' : url.pathname; const file = Bun.file(\'.\' + path); return new Response(file); } })"',
    port: 8765,
    reuseExistingServer: true,
  },
});
