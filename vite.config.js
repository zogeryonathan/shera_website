import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
        classes: resolve(import.meta.dirname, "classes.html"),
        pricing: resolve(import.meta.dirname, "pricing.html"),
        booking: resolve(import.meta.dirname, "booking.html"),
        admin: resolve(import.meta.dirname, "admin.html"),
      },
    },
  },
});
