import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { isBlog, collect, addDates } from "./collect.mjs"

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
  assert.ok(!isBlog("a `x\n#blog` b"))
  assert.ok(!isBlog("> ```\n> #blog\n> ```"))
  assert.ok(!isBlog("para\n\n    #blog in indented code"))
  assert.ok(isBlog("- item\n\t- nested #blog"))
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

test("zero tagged notes unpublishes everything, but an empty vault is refused", () => {
  const root = vault({ "x.md": "nothing" })
  const out = path.join(root, "out")
  fs.mkdirSync(path.join(out, "old"), { recursive: true })
  fs.writeFileSync(path.join(out, "old/Post.md"), "stale")
  collect(root, out)
  assert.deepEqual(fs.readdirSync(out), ["index.md"])
  assert.throws(() => collect(vault({ "a.png": "" }), "/nonexistent"), /no notes found/)
})

test("index is ordered by the effective creation date", () => {
  const root = vault({
    "Old.md": "---\ncreated: 2020-01-01\n---\n#blog",
    "New.md": "---\ncreated: 2026-10-01T13:51\n---\n#blog",
  })
  const out = path.join(root, "out")
  collect(root, out)
  assert.match(fs.readFileSync(path.join(out, "index.md"), "utf8"), /New[\s\S]*Old/)
})

test("addDates fills only missing date keys", () => {
  const d = { created: "2026-01-01", modified: "2026-02-02" }
  assert.equal(addDates("body", d), "---\ncreated: 2026-01-01\nmodified: 2026-02-02\n---\nbody")
  assert.equal(addDates("---\ncreated: 2025-05-05\nupdated: x\n---\nb", d), "---\ncreated: 2025-05-05\nupdated: x\n---\nb")
  assert.equal(addDates("---\ntags: [a]\n---\nb", {}), "---\ntags: [a]\n---\nb")
  assert.ok(!addDates('---\n"created": 2020-01-01\n---\nb', d).includes("created: 2026"))
})

test("collect takes dates from the first and last commit", () => {
  const root = vault({ "Post.md": "#blog v1" })
  const git = (args, date) =>
    execFileSync("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    })
  git(["init", "-q"])
  git(["add", "."])
  git(["commit", "-qm", "a"], "2026-01-01T00:00:00+09:00")
  fs.writeFileSync(path.join(root, "Post.md"), "#blog v2")
  git(["commit", "-qam", "b"], "2026-03-03T00:00:00+09:00")
  const out = path.join(root, "out")
  collect(root, out)
  const post = fs.readFileSync(path.join(out, "Post.md"), "utf8")
  assert.match(post, /^---\ncreated: 2026-01-01T00:00:00\+09:00\nmodified: 2026-03-03T00:00:00\+09:00\n---\n/)
})
