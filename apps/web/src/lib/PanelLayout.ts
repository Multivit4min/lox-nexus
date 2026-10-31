import type { Panel, PanelPart } from "@lox-nexus/plugin-sdk/wire"

type Tile = Extract<PanelPart, { type: "tiles" }>["tiles"][number]

/** a panel as the page lays it out: headline tiles on the page itself, the rest in the Status card */
export interface PanelLayoutParts {
  headline?: Tile[]
  rest?: Panel
}

/**
 * Lifts a panel's first tiles to the top of the page, above the Status card: the headline values
 * are what the page is opened for, and tiles inside a card are boxes in a box. A tiles section
 * with buttons in its heading stays in the card with them.
 */
export class PanelLayout {
  static split(panel: Panel): PanelLayoutParts {
    if (panel.type === "tiles") return { headline: panel.tiles }
    if (panel.type !== "sections") return { rest: panel }
    const index = panel.sections.findIndex(section => section.panel.type === "tiles" && !section.actions?.length)
    const lifted = panel.sections[index]?.panel
    if (lifted?.type !== "tiles") return { rest: panel }
    const sections = panel.sections.filter((_, i) => i !== index)
    return { headline: lifted.tiles, ...(sections.length > 0 ? { rest: { ...panel, sections } } : {}) }
  }
}
