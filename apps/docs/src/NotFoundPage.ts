/**
 * The 404 page. Static hosts (GitHub/GitLab Pages) serve it unchanged for any missing path, at any
 * depth, so it can't use relative links like the other pages: its styles are inlined, and a small
 * script finds the site root by probing for the search index one level up at a time. Nexus also
 * adds a `<base>`, which the probe then finds at once.
 */
export class NotFoundPage {
  static readonly MAX_DEPTH = 8

  constructor(private readonly title: string, private readonly css: string) {}

  render() {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · ${this.title}</title>
<style>${this.css}</style>
</head>
<body>
<header class="top"><a class="brand" id="home" href="index.html">${this.title}</a></header>
<main><article>
<h1>Page not found</h1>
<p>This page doesn't exist (anymore). <a id="start" href="index.html">Go to the start page</a> or <a href="javascript:history.back()">back</a>.</p>
</article></main>
<script>
(async () => {
  for (let depth = 0; depth <= ${NotFoundPage.MAX_DEPTH}; depth++) {
    const root = depth === 0 ? "./" : "../".repeat(depth)
    const found = await fetch(root + "search-index.json", { method: "HEAD" }).then(response => response.ok, () => false)
    if (!found) continue
    for (const id of ["home", "start"]) document.getElementById(id).href = root + "index.html"
    return
  }
})()
</script>
</body>
</html>
`
  }
}
