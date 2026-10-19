import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In sviluppo /api va al server Hono sulla porta 8787.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre da solo pesa circa 1 MB: è in un pezzo a parte, caricato solo dalla pagina Flotta
  build: { chunkSizeWarningLimit: 1100 },
  // ottimizzate subito: altrimenti Vite le scopre alla prima visita e ricarica la pagina
  worker: { format: "es" },
  optimizeDeps: {
    include: ["maplibre-gl", "uplot", "qrcode", "@better-auth/passkey/client", "better-auth/react"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
