import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug, resolveRelative } from "../util/path"

// the portfolio's six metro line colours; a tag keeps its number and colour on every page
const COLORS = ["var(--line-1)", "#00a84d", "#ef7c1c", "#00a5de", "#996cac", "#cd7c2f"]
const FIXED: Record<string, number> = { Develop: 1, Web: 2, DevOps: 3, Infoteam: 4 }

export function lineOf(name: string) {
  // shortcut: unknown tags hash onto the six colours and may share one; add them to FIXED when that matters
  const n = FIXED[name] ?? ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6) + 1
  return { n, color: COLORS[n - 1] }
}

// "Develop/Web" shows as two badges, Develop and Web, each linking to its own tag page
export function segments(tags: string[] = []) {
  const seen = new Map<string, string>()
  for (const tag of tags) {
    const parts = tag.split("/")
    parts.forEach((name, i) => seen.has(name) || seen.set(name, parts.slice(0, i + 1).join("/")))
  }
  return [...seen].map(([name, tag]) => ({ name, tag, ...lineOf(name) }))
}

export const created = (f: QuartzPluginData) => f.dates?.created?.getTime() ?? 0

// published posts, newest first
export const sortedPosts = (allFiles: QuartzPluginData[]) =>
  allFiles
    // folder and tag description pages are list pages, not posts
    .filter((f) => f.frontmatter && !/(^|\/)index$/.test(f.slug!) && !f.slug!.startsWith("tags/"))
    .sort((a, b) => created(b) - created(a))

export function Badge({ n, color }: { n: number; color: string }) {
  return (
    <span class="line-badge" style={`--line:${color}`} data-n={n}>
      {n}
    </span>
  )
}

export function LineTags({ slug, tags }: { slug: FullSlug; tags?: string[] }) {
  const items = segments(tags)
  if (items.length === 0) return null
  return (
    <ul class="line-tags">
      {items.map((s) => (
        <li>
          <a class="tag-link" href={resolveRelative(slug, `tags/${s.tag}` as FullSlug)}>
            <Badge n={s.n} color={s.color} />
            {s.name}
          </a>
        </li>
      ))}
    </ul>
  )
}
