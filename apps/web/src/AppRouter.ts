import { createRouter, createWebHashHistory, type Router } from "vue-router"
import type { SessionStore } from "./stores/SessionStore.ts"

/**
 * Routes and the guard that sends visitors to setup or login first. Hash history (…/#/miniservers)
 * keeps the document at the app's root URL, so relative asset and API paths work under any
 * proxy prefix; the server can't know that prefix, since proxies like code-server strip it.
 */
export class AppRouter {
  static create(session: SessionStore): Router {
    const router = createRouter({
      history: createWebHashHistory(),
      routes: [
        { path: "/setup", name: "setup", component: () => import("./views/SetupView.vue"), meta: { public: true } },
        { path: "/login", name: "login", component: () => import("./views/LoginView.vue"), meta: { public: true } },
        { path: "/", redirect: "/miniservers" },
        { path: "/miniservers", name: "miniservers", component: () => import("./views/MiniserversView.vue") },
        { path: "/miniservers/:id", name: "miniserver", component: () => import("./views/MiniserverView.vue"), props: true },
        { path: "/plugins", name: "plugins", component: () => import("./views/PluginsView.vue") },
        // before /plugins/:id, which would take "installed" for an instance id
        { path: "/plugins/installed", name: "plugin-packages", component: () => import("./views/PluginPackagesView.vue") },
        { path: "/plugins/:id", name: "plugin", component: () => import("./views/PluginInstanceView.vue"), props: true },
        { path: "/wires", name: "wires", component: () => import("./views/WiresView.vue") },
        { path: "/inspector", name: "inspector", component: () => import("./views/InspectorView.vue") },
        { path: "/history", name: "history", component: () => import("./views/HistoryView.vue") },
        { path: "/:rest(.*)*", redirect: "/" }
      ]
    })
    router.beforeEach(async to => {
      if (!session.state.loaded) await session.load()
      if (session.state.setupRequired) return to.name === "setup" ? true : { name: "setup" }
      if (to.name === "setup") return { name: "login" }
      if (!session.loggedIn && !to.meta.public) return { name: "login", query: { next: to.fullPath } }
      if (session.loggedIn && to.name === "login") return { path: "/" }
      return true
    })
    return router
  }
}
