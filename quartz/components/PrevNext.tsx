import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { sortedPosts } from "./posts"

// previous = the next older post, next = the next newer one
const PrevNext: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const posts = sortedPosts(allFiles)
  const i = posts.findIndex((p) => p.slug === fileData.slug)
  if (i < 0) return null
  const cell = (label: string, p: (typeof posts)[number] | undefined, empty: string) =>
    p ? (
      <a class="internal" href={resolveRelative(fileData.slug!, p.slug!)}>
        <span>{label}</span>
        <strong>{p.frontmatter?.title}</strong>
      </a>
    ) : (
      <div>
        <span>{label}</span>
        <em>{empty}</em>
      </div>
    )
  return (
    <nav class="prev-next" aria-label="이전 글과 다음 글">
      {cell("← 이전 글", posts[i + 1], "첫 글입니다")}
      {cell("다음 글 →", posts[i - 1], "최신 글입니다")}
    </nav>
  )
}

export default (() => PrevNext) satisfies QuartzComponentConstructor
