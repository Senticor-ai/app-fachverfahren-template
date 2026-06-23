import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const devHost = process.env["VITE_DEV_HOST"] ?? "127.0.0.1";
const devPort = Number(process.env["VITE_DEV_PORT"] ?? 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: devHost,
    port: devPort,
  },
});
