import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isBlog, collect } from "./collect.mjs"

test("isBlog reads frontmatter and inline tags, ignoring code", () => {
  assert.ok(isBlog("---\ntags:\n  - blog\n---\nhi"))
  assert.ok(isBlog("---\ntags: [x, blog/dev]\n---\nhi"))
  assert.ok(isBlog("---\ntags: BLOG\n---\nhi"))
  assert.ok(isBlog("text #blog more"))
  assert.ok(isBlog("text #blog, more"))
  assert.ok(isBlog("#Blog/dev"))
  assert.ok(!isBlog("`#blog` and ``a #blog b`` and\n```\n#blog\n```"))
  assert.ok(!isBlog("~~~~\n#blog\n~~~~"))
  assert.ok(!isBlog("```\nunclosed fence\n#blog"))
  assert.ok(!isBlog("#blogger #notblog"))
  assert.ok(!isBlog("---\ndescription: |\n  #blog\n---\nhi"))
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
      "---\ntags: [blog]\naliases:\n  - blog\n---",
      "#blog see [[Other]] and [[Deep/Other#H|o]] and [[Private#H|secret]] and [[Private]]",
      "![[Private]]![[pic.png|300]]![](../Assets/md%20x.png)![](Private.md)[deck](100%.pdf)",
      "~~~dataviewjs\nx\n~~~",
      "```` dataview\ny\n````",
      "`[[Private]]`",
    ].join("\r\n"),
    "B/Deep/Other.md": "#blog other",
    "B/Private.md": "private",
    "A/100%.pdf": "pdf",
    "Assets/pic.png": "p",
    "Assets/md x.png": "m",
    "Assets/unused.png": "u",
    "Templates/T.md": "#blog template",
  })
  const out = path.join(root, "out")
  collect(root, out)

  const post = fs.readFileSync(path.join(out, "A/Post.md"), "utf8")
  assert.match(post, /tags: \[\]\naliases:\n  - blog\n/)
  assert.match(post, /see \[\[B\/Deep\/Other\|Other\]\] and \[\[B\/Deep\/Other#H\|o\]\] and secret and Private\n/)
  assert.match(post, /^!\[\[Assets\/pic\.png\|300\]\]!\[\]\(\.\.\/Assets\/md%20x\.png\)!\[\]\(Private\.md\)/m)
  assert.ok(!/dataview|#blog|\r/.test(post))
  assert.match(post, /`\[\[Private\]\]`/)

  assert.ok(fs.existsSync(path.join(out, "B/Deep/Other.md")))
  assert.ok(!fs.existsSync(path.join(out, "B/Private.md")))
  assert.ok(!fs.existsSync(path.join(out, "Templates")))
  for (const f of ["Assets/pic.png", "Assets/md x.png", "A/100%.pdf"]) assert.ok(fs.existsSync(path.join(out, f)), f)
  assert.ok(!fs.existsSync(path.join(out, "Assets/unused.png")))
  assert.match(fs.readFileSync(path.join(out, "index.md"), "utf8"), /\[\[A\/Post\|Post\]\]/)
})

test("exact paths win over the attachments folder", () => {
  const root = vault({
    "Post.md": "#blog ![[Public/figure.png]]",
    "Public/figure.png": "public",
    "Assets/Public/figure.png": "private",
  })
  const out = path.join(root, "out")
  collect(root, out)
  assert.ok(fs.existsSync(path.join(out, "Public/figure.png")))
  assert.ok(!fs.existsSync(path.join(out, "Assets")))
})

test("collect refuses an empty result", () => {
  assert.throws(() => collect(vault({ "x.md": "nothing" }), "/nonexistent"), /no #blog notes/)
})
