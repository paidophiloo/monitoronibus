import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: [
    {
      command: "pnpm preview --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "python -m uvicorn app.main:app --app-dir ../../services/api --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      env: { SPTRANS_TOKEN: "", PATIO_AREA_FILE: "", PATIO_REPLAY_FILE: "" },
    },
  ],
});
