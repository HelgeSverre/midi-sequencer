// vite.config.js
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // Uncomment this line to allow app to work by opening via file:// protocol (without a server)
  // base: "./",
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    copyPublicDir: true,
    assetsDir: "assets",
  },
  publicDir: "../public",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
