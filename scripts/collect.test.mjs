import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isBlog, collect } from "./collect.mjs"

test("isBlog reads frontmatter and inline tags, ignoring code", () => {
  assert.ok(isBlog("---\ntags:\n  - blog\n---\nhi"))
  assert.ok(isBlog("---\ntags: [x, blog/dev]\n---\nhi"))
  assert.ok(isBlog("text #blog more"))
  assert.ok(!isBlog("`#blog` and\n```\n#blog\n```"))
  assert.ok(!isBlog("#blogger #notblog"))
})

function vault(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return root
}

test("collect copies only blog notes and their assets, unlinking private notes", () => {
  const root = vault({
    "A/Post.md": [
      "---\ntags: [blog]\n---",
      "#blog see [[Other]] and [[Private#H|secret]] and [[Private]]",
      "![[Private]]![[pic.png]]![](../Assets/md.png)",
      "```dataviewjs\nx\n```",
      "`[[Private]]`",
    ].join("\n"),
    "B/Other.md": "#blog other",
    "B/Private.md": "private",
    "Assets/pic.png": "p",
    "Assets/md.png": "m",
    "Assets/unused.png": "u",
    "Templates/T.md": "#blog template",
  })
  const out = path.join(root, "out")
  collect(root, out)

  const post = fs.readFileSync(path.join(out, "A/Post.md"), "utf8")
  assert.match(post, /tags: \[\]/)
  assert.match(post, /see \[\[Other\]\] and secret and Private\n/)
  assert.match(post, /^!\[\[pic\.png\]\]!\[\]\(\.\.\/Assets\/md\.png\)$/m)
  assert.ok(!post.includes("dataviewjs") && !post.includes("#blog"))
  assert.match(post, /`\[\[Private\]\]`/)

  assert.ok(fs.existsSync(path.join(out, "B/Other.md")))
  assert.ok(!fs.existsSync(path.join(out, "B/Private.md")))
  assert.ok(!fs.existsSync(path.join(out, "Templates")))
  assert.ok(fs.existsSync(path.join(out, "Assets/pic.png")) && fs.existsSync(path.join(out, "Assets/md.png")))
  assert.ok(!fs.existsSync(path.join(out, "Assets/unused.png")))
  assert.match(fs.readFileSync(path.join(out, "index.md"), "utf8"), /\[\[A\/Post\|Post\]\]/)
})

test("collect refuses an empty result", () => {
  assert.throws(() => collect(vault({ "x.md": "nothing" }), "/nonexistent"), /no #blog notes/)
})
