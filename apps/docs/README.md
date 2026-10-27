# Documentation site

The documentation for people who run Lox Nexus and people who write plugins. It is a small static
site generator (`src/`) that renders Markdown from `content/` into `dist/`.

## Build

```sh
npm run docs:build     # TypeDoc, then the site into apps/docs/dist
npm run docs:dev       # the same, and again on every page or README change (restart it after JSDoc changes: TypeDoc runs once)
```

The build runs in two steps:

1. **TypeDoc** (`typedoc.json`) generates the SDK reference into `content/reference/sdk/` from the
   JSDoc of `packages/plugin-sdk`. The directory is git-ignored: never edit it, improve the JSDoc.
2. **The generator** renders every page listed in `content/nav.json` and checks all links and
   anchors. A broken link fails the build.

## Add a page

1. Create `content/<section>/<name>.md`. Its title is its first `# heading`.
2. List it in `content/nav.json` under a section's `pages`. Only listed pages are built.
3. Link with **relative** paths to `.md` files (`../plugins/authoring.md`, `#anchor`). Absolute
   links (`/docs/...`) are rejected, because the site must work under any base path.
4. Include text that lives elsewhere instead of copying it, on a line of its own:
   `<!--@include: ../../../../plugins/fronius/README.md-->` (path relative to the page, inside the
   repository). The first-party plugin pages work this way.

Check every command, setting and example against the code. Mark features of later milestones as
"not available yet".

## Serve it

Nexus serves the built site at `/docs/` without a login when `NEXUS_DOCS_DIR` points to
`apps/docs/dist` (`npm run dev` sets it).

## Host it separately

The output is plain static files with relative links, so upload `apps/docs/dist` to any static host
at any path. No base-path setting is needed. Sketches for CI (not part of this repository):

GitHub Pages (`.github/workflows/docs.yml`):

```yaml
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  docs:
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/upload-pages-artifact@v3
        with: { path: apps/docs/dist }
      - uses: actions/deploy-pages@v4
```

GitLab Pages (`.gitlab-ci.yml`):

```yaml
pages:
  image: node:24
  script:
    - npm ci
    - npm run docs:build
    - mv apps/docs/dist public
  artifacts:
    paths: [public]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```
