import { HOST_FEATURES, type HostFeature } from "../wire/HostFeatures.ts"
import { PanelSchema, type ActionAnswer, type Panel } from "../wire/PanelShapes.ts"
import { PanelCompat } from "./PanelCompat.ts"

/**
 * What the host understands, from `init`, and what the runtime sends an older host instead: v1
 * panels, an action's message without its panel, and no `panel.changed` or `action.progress`.
 */
export class HostSupport {
  private readonly features: ReadonlySet<string>
  private readonly compat: PanelCompat

  constructor(features: readonly string[] = [], timeZone?: string) {
    this.features = new Set(features)
    this.compat = new PanelCompat(timeZone)
  }

  has(feature: HostFeature) {
    return this.features.has(feature)
  }

  panel(panel: Panel | undefined) {
    if (!panel || this.has(HOST_FEATURES.panelV2)) return panel
    // a malformed panel goes as it is: the host's refusal names what is wrong, a conversion would only throw a TypeError
    return PanelSchema.safeParse(panel).success ? this.compat.panel(panel) : panel
  }

  /** an action's answer as the host takes it: an object only where it knows them */
  answer(answer: ActionAnswer | undefined): ActionAnswer | undefined {
    if (answer === undefined || typeof answer === "string") return answer
    if (!this.has(HOST_FEATURES.actionResult)) return answer.message
    if (!answer.panel || this.has(HOST_FEATURES.panelV2)) return answer
    return { ...answer, panel: this.compat.part(answer.panel) }
  }
}
