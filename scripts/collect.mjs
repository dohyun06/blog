import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const EXCLUDED_DIRS = new Set(["Templates", "Excalidraw"])
const ATTACHMENT_DIR = "Assets"
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/
const WIKILINK = /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const MD_IMAGE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const INLINE_BLOG_TAG = /(^|\s)#blog(?:\/[^\s#]*)?(?=\s|$)/g
const HAS_INLINE_BLOG_TAG = new RegExp(INLINE_BLOG_TAG.source)
const FM_BLOG_ITEM = /^\s*-\s*["']?blog(?:\/[^\s"']*)?["']?\s*$\n?/gm

const isBlogTag = (t) => t === "blog" || String(t).startsWith("blog/")

export function isBlog(text) {
  let tags = []
  try {
    tags = [matter(text).data.tags ?? []].flat()
  } catch {}
  if (tags.some(isBlogTag)) return true
  const body = text.replace(/^---\n[\s\S]*?\n---/, "")
  return body.split(CODE).some((part, i) => i % 2 === 0 && HAS_INLINE_BLOG_TAG.test(part))
}

export function listFiles(root, dir = "") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name)
    if (e.name.startsWith(".")) return []
    if (e.isDirectory()) return dir === "" && EXCLUDED_DIRS.has(e.name) ? [] : listFiles(root, rel)
    return [rel]
  })
}

// Obsidian-style lookup: exact path, path suffix, then basename; attachments folder wins ties.
export function makeResolver(files) {
  const key = (f) => (f.endsWith(".md") ? f.slice(0, -3) : f)
  return (target) => {
    const t = target.trim().replace(/\.md$/, "")
    const hits = files.filter((f) => key(f) === t || key(f).endsWith("/" + t))
    return hits.find((f) => f.startsWith(ATTACHMENT_DIR + "/")) ?? hits.sort((a, b) => a.length - b.length)[0]
  }
}

export function transform(text, { resolve, published, exists, noteDir }) {
  const assets = new Set()
  const fm = text.match(/^---\n[\s\S]*?\n---\n?/)?.[0] ?? ""
  const frontmatter = fm
    .replace(FM_BLOG_ITEM, "")
    .replace(/^(tags:\s*\[)(.*)\]/m, (_, head, items) =>
      head + items.split(",").filter((t) => !isBlogTag(t.trim().replace(/^["']|["']$/g, ""))).join(",").trim() + "]",
    )

  const rewrite = (part) =>
    part
      .replace(WIKILINK, (all, bang, target, heading, alias) => {
        if (!target) return all
        const file = resolve(target)
        if (file && !file.endsWith(".md")) return assets.add(file), all
        if (file && published.has(file)) return all
        return bang ? "" : (alias ?? path.posix.basename(target))
      })
      .replace(MD_IMAGE, (all, src) => {
        if (/^[a-z]+:/i.test(src)) return all
        const decoded = decodeURIComponent(src)
        const file = [path.posix.join(noteDir, decoded), decoded].find((f) => exists.has(f))
        if (file) assets.add(file)
        return all
      })
      .replace(INLINE_BLOG_TAG, "$1")

  const body = text
    .slice(fm.length)
    .split(CODE)
    .map((part, i) => (i % 2 === 0 ? rewrite(part) : /^```dataview(js)?\b/.test(part) ? "" : part))
    .join("")
  return { text: frontmatter + body, assets }
}

function indexPage(vault, notes) {
  const byNewest = notes
    .map((n) => [n, fs.statSync(path.join(vault, n)).mtimeMs])
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => `- [[${n.slice(0, -3)}|${path.posix.basename(n, ".md")}]]`)
  return `---\ntitle: Blog\n---\n\n${byNewest.join("\n")}\n`
}

export function collect(vault, out, { dryRun = false } = {}) {
  const files = listFiles(vault)
  const resolve = makeResolver(files)
  const notes = files.filter((f) => f.endsWith(".md") && isBlog(fs.readFileSync(path.join(vault, f), "utf8")))
  if (notes.length === 0) throw new Error(`no #blog notes found in ${vault}`)

  const published = new Set(notes)
  const exists = new Set(files)
  const assets = new Set()
  const outputs = notes.map((note) => {
    const src = fs.readFileSync(path.join(vault, note), "utf8")
    const r = transform(src, { resolve, published, exists, noteDir: path.posix.dirname(note) })
    r.assets.forEach((a) => assets.add(a))
    return [note, r.text]
  })

  if (dryRun) {
    console.log(`notes (${notes.length}):\n  ${notes.join("\n  ")}`)
    console.log(`assets (${assets.size}):\n  ${[...assets].join("\n  ")}`)
    return
  }

  fs.rmSync(out, { recursive: true, force: true })
  const write = (rel, data) => {
    const dest = path.join(out, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    data === undefined ? fs.copyFileSync(path.join(vault, rel), dest) : fs.writeFileSync(dest, data)
    const st = fs.statSync(path.join(vault, rel))
    fs.utimesSync(dest, st.atime, st.mtime)
  }
  outputs.forEach(([rel, text]) => write(rel, text))
  assets.forEach((rel) => write(rel))
  if (!published.has("index.md")) fs.writeFileSync(path.join(out, "index.md"), indexPage(vault, notes))
  console.log(`collected ${notes.length} notes, ${assets.size} assets → ${out}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const vault = args.find((a) => !a.startsWith("--"))
  if (!vault) {
    console.error("usage: node scripts/collect.mjs <vault> [--dry-run]")
    process.exit(2)
  }
  collect(vault, path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content"), {
    dryRun: args.includes("--dry-run"),
  })
}
