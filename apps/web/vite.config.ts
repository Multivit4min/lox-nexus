import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    conditions: ["@lox-nexus/source"],
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
    // the dev UI talks to `npm run dev` on 8080; same origin for cookies and the WebSocket
    proxy: { "/api": { target: "http://127.0.0.1:8080", ws: true } }
  }
})
