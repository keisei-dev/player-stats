import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// SSR so pages can fetch fresh data from the API per request.
// On Vercel the API is served by this same deployment under /api.
export default defineConfig({
  output: "server",
  adapter: vercel(),
  server: { port: 4321 },
  // Load PUBLIC_* vars from the repository root .env
  vite: {
    envDir: "..",
    server: {
      fs: {
        allow: [".."],
      },
    },
    ssr: {
      external: ["pg", "express", "cors"],
    },
  },
});
