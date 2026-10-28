import { z } from "@lox-nexus/plugin-sdk"

export type HookMethod = "any" | "GET" | "POST" | "PUT"

/** The HTTP method a signal reacts to; "any" takes every method. */
export class HookMethods {
  static readonly values = ["any", "GET", "POST", "PUT"] as const

  static schema(fallback: HookMethod) {
    return z.enum(HookMethods.values).default(fallback).describe("HTTP method the signal reacts to")
  }

  static accepts(method: HookMethod, requestMethod: string) {
    return method === "any" || method === requestMethod.toUpperCase()
  }
}
