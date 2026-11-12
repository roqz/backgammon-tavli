import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and any static host.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      // Push notification handlers (public/push-sw.js) inside the generated service worker.
      workbox: { importScripts: ["push-sw.js"] },
      manifest: {
        name: "Backgammon & Tavli",
        short_name: "Tavli",
        description: "Backgammon, Portes, Plakoto and Fevga – offline in your browser",
        theme_color: "#3b2a1a",
        background_color: "#1c1917",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
});
