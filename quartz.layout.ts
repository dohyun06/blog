import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

const notHome = (page: { fileData: { slug?: string } }) => page.fileData.slug !== "index"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.SiteHeader(), Component.Search(), Component.Darkmode()],
  afterBody: [Component.ConditionalRender({ component: Component.PrevNext(), condition: notHome })],
  footer: Component.Footer({
    links: {
      RSS: "/blog/index.xml",
      GitHub: "https://github.com/dohyun06",
      포트폴리오: "/",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({ component: Component.PostTags(), condition: notHome }),
    Component.ArticleTitle(),
    Component.ConditionalRender({ component: Component.PostMeta(), condition: notHome }),
    Component.ConditionalRender({ component: Component.PostList(), condition: (p) => !notHome(p) }),
  ],
  left: [Component.TableOfContents()],
  right: [],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.ArticleTitle()],
  left: [],
  right: [],
}
