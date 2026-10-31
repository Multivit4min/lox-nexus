/**
 * What a host understands beyond wire version 1, sent in `init` (`hostFeatures`). Plugins don't
 * check these: the runtime does, and falls back to what older hosts understand. A host that sends
 * none is one from before them.
 */
export const HOST_FEATURES = {
  /** tiles, notices, cells with tones and times, controls on key-value items and switch or instant buttons */
  panelV2: "panel.v2",
  /** the `panel.changed` message (Plugin.panelChanged) */
  panelPush: "panel.push",
  /** action answers with a panel part */
  actionResult: "action.result",
  /** the `action.progress` message (Action.progress) */
  actionProgress: "action.progress"
} as const

export type HostFeature = typeof HOST_FEATURES[keyof typeof HOST_FEATURES]
