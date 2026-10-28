import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ScriptCompiler } from "./ScriptCompiler.ts"

function syntaxError(code: string) {
  try {
    new ScriptCompiler().compile(code)
  } catch (error) {
    return (error as Error).message
  }
  assert.fail("compiled")
}

describe("ScriptCompiler", () => {
  test("a syntax error names the user's line and column", () => {
    assert.equal(syntaxError("let a = 1\nlet b = 2\nfoo(a, ))"), "syntax error at line 3, column 9: Unexpected token ')'")
    assert.equal(syntaxError("const x = 1\nconst x = 2"), "syntax error at line 2, column 7: Identifier 'x' has already been declared")
  })

  test("columns of the first line are not shifted by the wrapper", () => {
    assert.equal(syntaxError("foo())"), "syntax error at line 1, column 6: Unexpected token ')'")
  })

  test("CRLF line ends count once", () => {
    assert.match(syntaxError("let a = 1\r\nlet b = 2\r\nfoo())"), /^syntax error at line 3, column 6:/)
  })

  test("something left open is reported at the end of the script, not on the wrapper", () => {
    assert.match(syntaxError("if (true) {\n  foo()"), /^syntax error at line 2, column 8: unexpected end of the script .*not closed$/)
  })

  test("top-level await and return compile", () => {
    const { errors } = new ScriptCompiler().compile("await null\nreturn 1")
    assert.equal(errors.describe(new Error("x")), "x")
  })
})
