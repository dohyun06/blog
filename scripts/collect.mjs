import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const EXCLUDED_DIRS = new Set(["Templates", "Excalidraw"])
const ATTACHMENT_DIR = "Assets"
// fenced blocks (closed or running to EOF) and inline code spans of any backtick run length.
// shortcut: indented code blocks are not detected, since this vault indents list items with tabs.
const CODE = /^[ \t]*(`{3,}|~{3,}).*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*$|$(?![\s\S]))|(`+)[^\n]*?[^`\n]\2(?!`)/gm
const DATAVIEW = /^[ \t]*(`{3,}|~{3,})[ \t]*dataview(js)?\b/i
const WIKILINK = /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const MD_LINK = /!?\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g
const TAG_CHAR = "[\\p{L}\\p{N}_\\-/]"
const INLINE_BLOG_TAG = new RegExp(`(^|\\s)#blog(?:/${TAG_CHAR}*)?(?!${TAG_CHAR})`, "giu")
const HAS_INLINE_BLOG_TAG = new RegExp(INLINE_BLOG_TAG.source, "iu")

const isBlogTag = (t) => /^#?blog(\/|$)/i.test(String(t).trim().replace(/^["']|["']$/g, ""))
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n")
const noteKey = (f) => (f.endsWith(".md") ? f.slice(0, -3) : f)

function mapCode(text, onText, onCode) {
  let out = ""
  let last = 0
  for (const m of text.matchAll(CODE)) {
    out += onText(text.slice(last, m.index)) + onCode(m[0])
    last = m.index + m[0].length
  }
  return out + onText(text.slice(last))
}

function splitFrontmatter(text) {
  const fm = text.match(/^---\n[\s\S]*?\n---(?:\n|$)/)?.[0] ?? ""
  return [fm, text.slice(fm.length)]
}

export function isBlog(text) {
  const [fm, body] = splitFrontmatter(text)
  try {
    if ([matter(fm).data.tags ?? []].flat().some(isBlogTag)) return true
  } catch {}
  let found = false
  mapCode(body, (t) => ((found ||= HAS_INLINE_BLOG_TAG.test(t)), t), (c) => c)
  return found
}

// removes blog entries from the tags property only, leaving other YAML untouched
function stripFrontmatterTags(fm) {
  return fm
    .replace(/^(tags?:[ \t]*\n)((?:[ \t]*-.*\n)*)/m, (_, head, items) =>
      head + items.split("\n").filter((l) => !isBlogTag(l.replace(/^[ \t]*-/, ""))).join("\n"),
    )
    .replace(/^(tags?:[ \t]*\[)(.*)\]/m, (_, head, items) =>
      head + items.split(",").filter((t) => !isBlogTag(t)).join(",").trim() + "]",
    )
    .replace(/^(tags?:)[ \t]+\S.*$/m, (line, head) => (isBlogTag(line.slice(head.length)) ? head : line))
}

export function listFiles(root, dir = "") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name)
    if (e.name.startsWith(".")) return []
    if (e.isDirectory()) return dir === "" && EXCLUDED_DIRS.has(e.name) ? [] : listFiles(root, rel)
    return [rel]
  })
}

// Obsidian-style lookup: relative or exact path first, then path suffix or basename (attachments folder wins ties).
export function makeResolver(files) {
  return (target, noteDir = "") => {
    let t = target.trim().replace(/\.md$/, "")
    if (t.startsWith("./") || t.startsWith("../")) t = path.posix.join(noteDir, t)
    const exact = files.find((f) => noteKey(f) === t)
    if (exact) return exact
    const hits = files.filter((f) => noteKey(f).endsWith("/" + t))
    return hits.find((f) => f.startsWith(ATTACHMENT_DIR + "/")) ?? hits.sort((a, b) => a.length - b.length)[0]
  }
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function transform(text, { resolve, published, exists, noteDir }) {
  const assets = new Set()
  const [fm, body] = splitFrontmatter(text)

  const rewrite = (part) =>
    part
      .replace(WIKILINK, (all, bang, target, heading = "", alias) => {
        if (!target) return all
        const file = resolve(target, noteDir)
        const isAsset = file && !file.endsWith(".md")
        if (isAsset) assets.add(file)
        if (!isAsset && !(file && published.has(file))) return bang ? "" : (alias ?? path.posix.basename(target.trim()))
        // full vault path, because Quartz cannot resolve Obsidian's partial paths
        const label = alias ?? (bang ? undefined : path.posix.basename(target.trim()))
        return `${bang}[[${noteKey(file)}${heading}${label === undefined ? "" : "|" + label}]]`
      })
      .replace(MD_LINK, (all, src) => {
        if (/^[a-z]+:/i.test(src)) return all
        const decoded = safeDecode(src)
        const file = [path.posix.join(noteDir, decoded), decoded].find((f) => exists.has(f))
        if (file && !file.endsWith(".md")) assets.add(file)
        return all
      })
      .replace(INLINE_BLOG_TAG, "$1")

  const out = mapCode(body, rewrite, (c) => (DATAVIEW.test(c) ? "" : c))
  return { text: stripFrontmatterTags(fm) + out, assets }
}

// file creation time is lost in a git clone, so fall back to the first and last commit touching the note
function gitDates(vault, rel) {
  try {
    const log = execFileSync("git", ["-C", vault, "log", "--follow", "--format=%aI", "--", rel], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const dates = log.trim().split("\n").filter(Boolean)
    return { created: dates.at(-1), modified: dates[0] }
  } catch {
    return {}
  }
}

export function addDates(text, { created, modified }) {
  const [fm, body] = splitFrontmatter(text)
  const has = (keys) => new RegExp(`^(${keys}):`, "m").test(fm)
  const lines = [
    created && !has("created|date") && `created: ${created}`,
    modified && !has("modified|lastmod|updated|last-modified") && `modified: ${modified}`,
  ].filter(Boolean)
  if (lines.length === 0) return text
  return fm ? fm.replace(/^---\n/, `---\n${lines.join("\n")}\n`) + body : `---\n${lines.join("\n")}\n---\n${body}`
}

function indexPage(notes, dates) {
  const byNewest = [...notes]
    .sort((a, b) => (dates.get(b).created ?? "").localeCompare(dates.get(a).created ?? ""))
    .map((n) => `- [[${noteKey(n)}|${path.posix.basename(n, ".md")}]]`)
  return `---\ntitle: Blog\n---\n\n${byNewest.join("\n")}\n`
}

export function collect(vault, out, { dryRun = false } = {}) {
  const files = listFiles(vault)
  const resolve = makeResolver(files)
  const notes = files.filter((f) => f.endsWith(".md") && isBlog(read(path.join(vault, f))))
  if (notes.length === 0) throw new Error(`no #blog notes found in ${vault}`)

  const published = new Set(notes)
  const exists = new Set(files)
  const assets = new Set()
  const dates = new Map(notes.map((n) => [n, gitDates(vault, n)]))
  const outputs = notes.map((note) => {
    const r = transform(read(path.join(vault, note)), { resolve, published, exists, noteDir: path.posix.dirname(note) })
    r.assets.forEach((a) => assets.add(a))
    return [note, addDates(r.text, dates.get(note))]
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
  if (!published.has("index.md")) fs.writeFileSync(path.join(out, "index.md"), indexPage(notes, dates))
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
