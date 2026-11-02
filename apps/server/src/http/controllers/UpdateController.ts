import { AppUpdateSettingsSchema } from "@lox-nexus/api"
import type { FastifyInstance } from "fastify"
import type { AppUpdateCheck } from "../../updates/AppUpdateCheck.ts"
import type { Controller } from "../Controller.ts"

/**
 * The System page's update check, behind the login:
 * - GET /api/system/update: the running version, the newest release if newer, what changed
 * - POST /api/system/update/check: asks GitHub now; 409 while NEXUS_UPDATE_CHECK=false
 * - PUT /api/system/update/settings `{ enabled }`: the daily check on or off
 * None of them changes the configuration, so a running import doesn't hold them up.
 */
export class UpdateController implements Controller {
  constructor(private readonly updates: Pick<AppUpdateCheck, "dto" | "check" | "setEnabled">) {}

  register(app: FastifyInstance) {
    const lockFree = { config: { lockFree: true } }
    app.get("/api/system/update", () => this.updates.dto())
    app.post("/api/system/update/check", lockFree, () => this.updates.check())
    app.put("/api/system/update/settings", lockFree, request => this.updates.setEnabled(AppUpdateSettingsSchema.parse(request.body).enabled))
  }
}
