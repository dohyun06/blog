import test from "node:test"
import assert from "node:assert"
import { QuartzPluginData } from "../plugins/vfile"
import { lineNumbers, segments } from "./posts"

const post = (slug: string, tags: string[]) =>
  ({ slug, frontmatter: { title: slug, tags } }) as unknown as QuartzPluginData

test("every tag gets its own line number", () => {
  const lines = lineNumbers([
    post("a", ["Develop/Web", "Infoteam"]),
    post("b", ["Life", "Guitar"]),
    post("c", ["Develop/DevOps"]),
  ])
  assert.deepStrictEqual(Object.fromEntries(lines), {
    Develop: 1,
    Web: 2,
    DevOps: 3,
    Infoteam: 4,
    Guitar: 5,
    Life: 6,
  })
  const ns = [...lines.values()]
  assert.strictEqual(new Set(ns).size, ns.length)
})

test("colours repeat past line 9 while numbers stay unique", () => {
  const tags = Array.from({ length: 7 }, (_, i) => `T${i}`)
  const lines = lineNumbers([post("a", tags)])
  const [ten] = segments(["T5"], lines)
  const [one] = segments(["Develop"], lines)
  assert.strictEqual(ten.n, 10)
  assert.strictEqual(ten.color, one.color)
})
