import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { LineTags, lineNumbers } from "./posts"

const fmt = (d: Date, withYear: boolean) =>
  `${withYear ? `${d.getFullYear()}년 ` : ""}${d.getMonth() + 1}월 ${d.getDate()}일`

const PostTags: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => (
  <LineTags slug={fileData.slug!} tags={fileData.frontmatter?.tags} lines={lineNumbers(allFiles)} />
)

// "2026년 10월 1일 작성"
const PostMeta: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const created = fileData.dates?.created
  if (!created) return null
  return (
    <p class="post-meta">
      <time datetime={created.toISOString()}>{fmt(created, true)} 작성</time>
    </p>
  )
}

export const PostTagsC = (() => PostTags) satisfies QuartzComponentConstructor
export const PostMetaC = (() => PostMeta) satisfies QuartzComponentConstructor
