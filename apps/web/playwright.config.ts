import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const API_PORT = 3001;

/**
 * Pruebas de interfaz sobre la compilación de producción (`npm run test:e2e` compila antes).
 * Se corren en tamaños de celular reales, una tablet y un escritorio.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "es-AR",
  },
  webServer: [
    {
      command: "npm --prefix ../api run start",
      url: `http://localhost:${API_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        CLOCKS_ENABLED: "false",
      },
    },
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    // Android chico (el ancho más exigente del diseño).
    { name: "movil-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } },
    // iPhone (con zona segura), corrido en Chromium.
    {
      name: "movil-375",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", viewport: { width: 375, height: 812 } },
    },
    { name: "movil-414", use: { ...devices["Pixel 7"], viewport: { width: 414, height: 896 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
