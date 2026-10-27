// Client-side search over search-index.json. Everything is relative to the site root the page
// declares (data-root), so it works under any base path. No dependencies.
(() => {
  const root = document.body.dataset.root || "./"
  const input = document.querySelector(".search")
  const results = document.querySelector(".results")
  if (!input || !results) return
  let index

  const load = async () => {
    if (!index) index = await fetch(root + "search-index.json").then(response => response.json()).catch(() => [])
    return index
  }

  const score = (page, words) => {
    let total = 0
    for (const word of words) {
      const inTitle = page.title.toLowerCase().includes(word)
      const inHeadings = page.headings.some(heading => heading.toLowerCase().includes(word))
      const inText = page.text.toLowerCase().includes(word)
      if (!inTitle && !inHeadings && !inText) return 0
      total += (inTitle ? 10 : 0) + (inHeadings ? 4 : 0) + (inText ? 1 : 0)
    }
    return total
  }

  const excerpt = (text, word) => {
    const at = text.toLowerCase().indexOf(word)
    if (at < 0) return text.slice(0, 120)
    return (at > 40 ? "…" : "") + text.slice(Math.max(0, at - 40), at + 80) + "…"
  }

  const show = async () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean)
    results.replaceChildren()
    results.hidden = words.length === 0
    if (words.length === 0) return
    const hits = (await load()).map(page => ({ page, score: score(page, words) })).filter(hit => hit.score > 0)
    hits.sort((a, b) => b.score - a.score)
    for (const { page } of hits.slice(0, 12)) {
      const link = document.createElement("a")
      link.href = root + page.url
      link.textContent = page.title
      const detail = document.createElement("small")
      detail.textContent = excerpt(page.text, words[0])
      link.append(detail)
      const item = document.createElement("li")
      item.append(link)
      results.append(item)
    }
    if (hits.length === 0) {
      const empty = document.createElement("li")
      empty.textContent = "Nothing found."
      results.append(empty)
    }
  }

  input.addEventListener("input", show)
  input.addEventListener("focus", load)
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      input.value = ""
      results.hidden = true
    }
  })
  document.addEventListener("click", event => {
    if (!event.target.closest(".top")) results.hidden = true
  })
})()
