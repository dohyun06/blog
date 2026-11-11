const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const slug = entry.target.id
    const tocEntryElements = document.querySelectorAll(`a[data-for="${slug}"]`)
    const windowHeight = entry.rootBounds?.height
    if (windowHeight && tocEntryElements.length > 0) {
      if (entry.boundingClientRect.y < windowHeight) {
        tocEntryElements.forEach((tocEntryElement) => tocEntryElement.classList.add("in-view"))
      } else {
        tocEntryElements.forEach((tocEntryElement) => tocEntryElement.classList.remove("in-view"))
      }
    }
  }
})

function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc() {
  for (const toc of document.getElementsByClassName("toc")) {
    const button = toc.querySelector(".toc-header")
    const content = toc.querySelector(".toc-content")
    if (!button || !content) return
    button.addEventListener("click", toggleToc)
    window.addCleanup(() => button.removeEventListener("click", toggleToc))
  }
}

// The rail fills continuously: it reaches an entry's station exactly when that heading comes into view.
function setupRail() {
  for (const list of document.querySelectorAll<HTMLElement>(".toc-content")) {
    // Quartz appends a link-less <li> as an overflow sentinel; only entries with a heading count
    const items = [...list.querySelectorAll<HTMLElement>(":scope > li:has(> a[data-for])")]
    const headings = items.map((li) => document.getElementById(li.querySelector("a")!.dataset.for!))
    if (items.length < 2 || headings.some((h) => !h)) continue

    const update = () => {
      // station centres: 12px into a section ring, 10px into a sub-entry's line
      const ys = items.map((li) => li.offsetTop + (li.classList.contains("depth-0") ? 12 : 10))
      const max = document.documentElement.scrollHeight - innerHeight
      const xs = headings.map((h) =>
        Math.min(h!.getBoundingClientRect().top + scrollY - innerHeight, max),
      )
      const n = xs.findIndex((x) => scrollY < x)
      let y: number
      if (n === 0) y = ys[0]
      else if (n === -1) y = ys[ys.length - 1]
      else {
        const span = xs[n] - xs[n - 1]
        y = ys[n - 1] + (span > 0 ? (scrollY - xs[n - 1]) / span : 1) * (ys[n] - ys[n - 1])
      }
      list.style.setProperty("--track", `${ys[ys.length - 1] - ys[0]}px`)
      list.style.setProperty("--fill", `${y - ys[0]}px`)
    }
    update()
    addEventListener("scroll", update, { passive: true })
    addEventListener("resize", update)
    window.addCleanup(() => {
      removeEventListener("scroll", update)
      removeEventListener("resize", update)
    })
  }
}

document.addEventListener("nav", () => {
  setupToc()
  setupRail()

  // update toc entry highlighting
  observer.disconnect()
  const headers = document.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")
  headers.forEach((header) => observer.observe(header))
})
