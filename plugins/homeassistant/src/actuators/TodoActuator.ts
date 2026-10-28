import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** TodoListEntityFeature.CREATE_TODO_ITEM */
const CREATE_TODO_ITEM = 1

/**
 * Adds the text as an item to a to-do list (todo.add_item), e.g. "Milk" to the shopping list.
 * Empty text does nothing, so a Loxone text output that is cleared after sending adds nothing.
 */
export class TodoActuator extends EntityActuator<ValueOf<"string">> {
  static readonly id = "todoItem"
  static readonly label = "Add to-do item"
  static readonly description = "Adds the text as an item to a to-do list"
  static readonly accepts = "string"
  static readonly domains = ["todo"]
  static readonly params = EntityId.paramsFor("todo.shopping_list")

  static supports(entity: EntityState) {
    return EntityActuator.hasFeatures(entity, CREATE_TODO_ITEM)
  }

  async run({ value }: ValueOf<"string">) {
    const item = value.trim()
    if (item !== "") await this.call("add_item", { item })
  }
}
