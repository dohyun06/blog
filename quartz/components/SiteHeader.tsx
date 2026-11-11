import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { pathToRoot } from "../util/path"

// brand and nav; the Search component sits next to it in the same <header>
const SiteHeader: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const root = pathToRoot(fileData.slug!)
  const onTags = fileData.slug?.startsWith("tags/")
  return (
    <div class="site-header">
      <a class="brand" href={root}>
        <span class="ring" aria-hidden="true" />
        <strong>김도현</strong>
        <span class="sub">블로그</span>
      </a>
      <nav>
        <a href={root} aria-current={onTags ? undefined : "page"}>
          글
        </a>
        <a href={`${root}/tags`} aria-current={onTags ? "page" : undefined}>
          태그
        </a>
        <a href="/">포트폴리오</a>
      </nav>
    </div>
  )
}

export default (() => SiteHeader) satisfies QuartzComponentConstructor
