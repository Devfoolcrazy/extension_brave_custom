import { defineConfig } from '@playwright/test';

// La page est servie par un simple serveur HTTP : hors extension, la configuration
// passe par localStorage et chrome.* est absent (ou simulé par les tests).
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765/newtab.html',
    reuseExistingServer: true,
  },
});
