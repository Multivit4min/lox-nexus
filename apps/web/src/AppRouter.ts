import { createRouter, createWebHistory, type Router } from "vue-router"
import type { SessionStore } from "./stores/SessionStore.ts"

/** Routes and the guard that sends visitors to setup or login first. */
export class AppRouter {
  static create(session: SessionStore): Router {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: "/setup", name: "setup", component: () => import("./views/SetupView.vue"), meta: { public: true } },
        { path: "/login", name: "login", component: () => import("./views/LoginView.vue"), meta: { public: true } },
        { path: "/", redirect: "/miniservers" },
        { path: "/miniservers", name: "miniservers", component: () => import("./views/MiniserversView.vue") },
        { path: "/miniservers/:id", name: "miniserver", component: () => import("./views/MiniserverView.vue"), props: true },
        { path: "/inspector", name: "inspector", component: () => import("./views/InspectorView.vue") },
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
