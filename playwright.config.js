// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/* Le site est statique : Playwright lance lui-même un serveur de fichiers, ce
   qui évite de dépendre d'un serveur déjà en route et rend `npm test`
   reproductible sur une machine vierge. */
const PORT = Number(process.env.PORT || 8123);

/* Échappatoire pour les environnements où les navigateurs Playwright sont déjà
   installés ailleurs (conteneurs CI préchargés). Sans cette variable, le
   comportement par défaut s'applique. */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

module.exports = defineConfig({
  testDir: './tests/e2e',
  // Aucun test ne doit dépendre d'un autre : ils partagent la même page mais
  // repartent d'un stockage vide.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,               // un test instable est un bug, pas un aléa à masquer
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {}
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 1200 } } },
    { name: 'mobile',  use: { ...devices['Pixel 5'] } }
  ],

  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
