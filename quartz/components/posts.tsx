import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug, resolveRelative } from "../util/path"

// Seoul metro lines 1-9 and the numeral colour that stays readable on each (DESIGN.md)
const COLORS = [
  "var(--line-1)",
  "#00a84d",
  "#ef7c1c",
  "#00a5de",
  "#996cac",
  "#cd7c2f",
  "#747f00",
  "#e6186c",
  "#bdb092",
]
const INKS = [
  "var(--line-1-ink)",
  "#111827",
  "#111827",
  "#111827",
  "#000",
  "#111827",
  "#000",
  "#000",
  "#111827",
]
const FIXED: Record<string, number> = { Develop: 1, Web: 2, DevOps: 3, Infoteam: 4 }

export type Lines = Map<string, number>

// FIXED keeps its numbers and every other tag follows alphabetically, so no two tags share a number
export function lineNumbers(allFiles: QuartzPluginData[]): Lines {
  const names = sortedPosts(allFiles).flatMap((p) =>
    (p.frontmatter?.tags ?? []).flatMap((t) => t.split("/")),
  )
  const lines: Lines = new Map(Object.entries(FIXED))
  let next = Math.max(...lines.values()) + 1
  for (const name of [...new Set(names)].sort()) if (!lines.has(name)) lines.set(name, next++)
  return lines
}

function lineOf(name: string, lines: Lines) {
  const n = lines.get(name) ?? 0
  // past line 9 the colours repeat, but the number stays unique
  const i = (n + COLORS.length - 1) % COLORS.length
  return { n, color: COLORS[i], ink: INKS[i] }
}

// "Develop/Web" shows as two badges, Develop and Web, each linking to its own tag page
export function segments(tags: string[] = [], lines: Lines) {
  const seen = new Map<string, string>()
  for (const tag of tags) {
    const parts = tag.split("/")
    parts.forEach((name, i) => seen.has(name) || seen.set(name, parts.slice(0, i + 1).join("/")))
  }
  return [...seen].map(([name, tag]) => ({ name, tag, ...lineOf(name, lines) }))
}

export const created = (f: QuartzPluginData) => f.dates?.created?.getTime() ?? 0

// published posts, newest first
export const sortedPosts = (allFiles: QuartzPluginData[]) =>
  allFiles
    // folder and tag description pages are list pages, not posts
    .filter((f) => f.frontmatter && !/(^|\/)index$/.test(f.slug!) && !f.slug!.startsWith("tags/"))
    .sort((a, b) => created(b) - created(a))

export function Badge({ n, color, ink }: { n: number; color: string; ink: string }) {
  return (
    <span class="line-badge" style={`--line:${color};color:${ink}`}>
      {n}
    </span>
  )
}

export function LineTags({ slug, tags, lines }: { slug: FullSlug; tags?: string[]; lines: Lines }) {
  const items = segments(tags, lines)
  if (items.length === 0) return null
  return (
    <ul class="line-tags">
      {items.map((s) => (
        <li>
          <a class="tag-link" href={resolveRelative(slug, `tags/${s.tag}` as FullSlug)}>
            <Badge {...s} />
            {s.name}
          </a>
        </li>
      ))}
    </ul>
  )
}
