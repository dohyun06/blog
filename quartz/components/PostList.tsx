import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, getAllSegmentPrefixes, pathToRoot, resolveRelative } from "../util/path"
import { Badge, LineTags, segments, sortedPosts } from "./posts"

// home and single-tag pages: tag tabs, then posts grouped by year on a route line
const PostList: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const slug = fileData.slug!
  const active = slug.startsWith("tags/") ? slug.slice("tags/".length) : undefined
  const posts = sortedPosts(allFiles)
  const shown = active
    ? posts.filter((p) =>
        (p.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes).includes(active),
      )
    : posts

  const tabs = new Map<string, ReturnType<typeof segments>[number] & { count: number }>()
  for (const p of posts)
    for (const s of segments(p.frontmatter?.tags))
      tabs.set(s.tag, { ...s, count: (tabs.get(s.tag)?.count ?? 0) + 1 })

  const years = new Map<number, typeof posts>()
  for (const p of shown) {
    const y = p.dates?.created?.getFullYear() ?? 0
    years.set(y, [...(years.get(y) ?? []), p])
  }

  return (
    <div class="post-list">
      <nav class="tag-tabs" aria-label="태그">
        <a class={active ? undefined : "active"} href={`${pathToRoot(slug)}/`}>
          전체<span class="count">{posts.length}</span>
        </a>
        {[...tabs.values()]
          .sort((a, b) => a.n - b.n || a.name.localeCompare(b.name))
          .map((t) => (
            <a
              class={t.tag === active ? "tag-link active" : "tag-link"}
              href={resolveRelative(slug, `tags/${t.tag}` as FullSlug)}
            >
              <Badge n={t.n} color={t.color} />
              {t.name}
              <span class="count">{t.count}</span>
            </a>
          ))}
      </nav>
      {[...years].map(([year, list]) => (
        <section class="year">
          <h2>{year}</h2>
          <ol>
            {list.map((p) => {
              const d = p.dates?.created
              return (
                <li>
                  {d && (
                    <time datetime={d.toISOString()}>
                      {d.getMonth() + 1}월 {d.getDate()}일
                    </time>
                  )}
                  <h3>
                    <a class="internal" href={resolveRelative(slug, p.slug!)}>
                      {p.frontmatter?.title}
                    </a>
                  </h3>
                  {p.description && <p>{p.description}</p>}
                  <LineTags slug={slug} tags={p.frontmatter?.tags} />
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

export default (() => PostList) satisfies QuartzComponentConstructor
