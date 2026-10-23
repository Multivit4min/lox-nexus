import { createApp } from "vue"
import App from "./App.vue"
import { AppContext } from "./AppContext.ts"
import { AppRouter } from "./AppRouter.ts"
import "./style.css"

// the composition root of the UI: the context is provided, never imported as a global
const context = new AppContext()
const router = AppRouter.create(context.session)
const toLogin = () => {
  context.session.forget()
  if (!router.currentRoute.value.meta.public) void router.push({ name: "login", query: { next: router.currentRoute.value.fullPath } })
}
context.http.onUnauthorized = toLogin
context.onSessionEnded = toLogin
document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches)

createApp(App).provide(AppContext.KEY, context).use(router).mount("#app")
