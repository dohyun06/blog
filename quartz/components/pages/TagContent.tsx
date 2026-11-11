import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { FullSlug, getAllSegmentPrefixes, resolveRelative, simplifySlug } from "../../util/path"
import PostListConstructor from "../PostList"
import { Badge, lineNumbers, segments, sortedPosts } from "../posts"

const PostList = PostListConstructor()

export default (() => {
  const TagContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { fileData, allFiles } = props
    const slug = fileData.slug!

    if (!(slug.startsWith("tags/") || slug === "tags")) {
      throw new Error(`Component "TagContent" tried to render a non-tag page: ${slug}`)
    }

    const tag = simplifySlug(slug.slice("tags/".length) as FullSlug)
    if (tag === "/") {
      // index of lines: each tag with its post count and latest post
      const posts = sortedPosts(allFiles)
      const numbers = lineNumbers(allFiles)
      const lines = new Map<string, ReturnType<typeof segments>[number]>()
      for (const p of posts)
        for (const s of segments(p.frontmatter?.tags, numbers)) lines.set(s.tag, s)
      const withTag = (t: string) =>
        posts.filter((p) => (p.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes).includes(t))
      return (
        <div class="tag-index">
          <p class="summary">
            태그 {lines.size}개 · 글 {posts.length}편
          </p>
          <ul>
            {[...lines.values()]
              .sort((a, b) => a.n - b.n || a.tag.localeCompare(b.tag))
              .map((l) => {
                const list = withTag(l.tag)
                const parent = l.tag.slice(0, -l.name.length)
                return (
                  <li>
                    <a href={resolveRelative(slug, `tags/${l.tag}` as FullSlug)}>
                      <Badge {...l} />
                      <strong>
                        {parent && <span class="parent">{parent.replaceAll("/", " / ")}</span>}
                        {l.name}
                      </strong>
                      <span class="count">{list.length}편</span>
                    </a>
                    {list[0] && (
                      <p>
                        <em>최신</em>
                        <a class="internal" href={resolveRelative(slug, list[0].slug!)}>
                          {list[0].frontmatter?.title}
                        </a>
                      </p>
                    )}
                  </li>
                )
              })}
          </ul>
        </div>
      )
    }

    // a single tag looks like the home page with its tab selected
    return <PostList {...props} />
  }

  return TagContent
}) satisfies QuartzComponentConstructor
