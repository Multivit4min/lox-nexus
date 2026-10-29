import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import { defineConfig, loadEnv } from "vite"
import { LucideImports } from "./build/LucideImports.ts"

export default defineConfig(({ mode }) => {
  // the same NEXUS_HTTP_PORT as `npm run dev`, from the environment or the repository's .env
  const env = loadEnv(mode, fileURLToPath(new URL("../..", import.meta.url)), "NEXUS_")
  const server = `http://127.0.0.1:${env.NEXUS_HTTP_PORT || "8080"}`
  return {
    plugins: [LucideImports.fromPackage().plugin(), vue(), tailwindcss()],
    // relative asset paths, so the built UI works under a proxy prefix (see AppRouter)
    base: "./",
    resolve: {
      conditions: ["@lox-nexus/source"],
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
    },
    server: {
      // "localhost" may bind only ::1, which IPv4 tunnels and port forwarders can't reach
      host: "127.0.0.1",
      // the dev UI talks to `npm run dev`; same origin for cookies and the WebSocket
      proxy: { "/api": { target: server, ws: true }, "/docs": { target: server } }
    }
  }
})
