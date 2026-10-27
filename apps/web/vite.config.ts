import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // relative asset paths, so the built UI works under a proxy prefix (see AppRouter)
  base: "./",
  resolve: {
    conditions: ["@lox-nexus/source"],
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
    // "localhost" may bind only ::1, which IPv4 tunnels and port forwarders can't reach
    host: "127.0.0.1",
    // the dev UI talks to `npm run dev` on 8080; same origin for cookies and the WebSocket
    proxy: { "/api": { target: "http://127.0.0.1:8080", ws: true }, "/docs": { target: "http://127.0.0.1:8080" } }
  }
})
