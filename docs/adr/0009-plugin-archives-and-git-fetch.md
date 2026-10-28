# 0009: Reading plugin ZIPs with yauzl, and git installs without a working tree

## Context
M5e installs plugins from an uploaded ZIP or a git URL (ADR 0002: a prebuilt bundle, no npm).
Both inputs may be hostile even when the admin is trusted (a link someone suggested, a
compromised release). The verify list requires rejecting zip-slip, symlink and zip-bomb archives.

- **fflate** is already in the workspace (`packages/loxone`). Its unzip API exposes name, sizes and
  method only, not the external attributes, so it can't recognise a symlink entry. It also
  allocates from the declared size.
- **Our own central directory reader** with `node:zlib` (`inflateRawSync` with
  `maxOutputLength`, `zlib.crc32`) would add no dependency. But it would be ~150 lines of format
  parsing to own (data descriptors, ZIP64, local versus central header mismatches).
- **yauzl** is pure JavaScript, streams entries, exposes `externalFileAttributes` and the
  encryption flag, rejects absolute, `..` and backslash names, and by default fails an entry whose
  real size differs from the declared one.
- A normal `git clone` checks out a working tree. That creates symlinks, runs `.gitattributes`
  filters (LFS smudge) and checkout hooks from the user's global config, and downloads every blob.

## Decision
- **yauzl** for archives, behind one class (`ZipArchive`). Every entry is validated before anything
  is extracted. fflate stays in `packages/loxone` and is used by the server only to build test
  fixtures.
- **Only `package.json`, the entry bundle and its source map are installed.** Sources write those
  files to fixed names in staging; no path from an archive or a repository becomes a write path.
- **Git:**
  - `git clone --depth 1 --single-branch --no-tags --no-recurse-submodules --filter=blob:none
    --no-checkout`. The two files are read with `ls-tree` (mode check) and `cat-file blob`. There
    is no `cat-file -s`, because asking for a size on a partial clone already fetches the blob.
  - https only. No credentials. A minimal environment with global and system config off.
    Protocols restricted to https in git itself.
  - Git runs in its own process group, because `cat-file` on a partial clone leaves the download to
    helper processes. One deadline covers the whole fetch, and the clone's size is watched while
    git runs; either limit kills the whole group.

## Consequences
- The server gains one small pure-JS dependency (plus its two helpers); there are still no native
  modules (ADR 0008).
- Zip-slip and symlink attacks can't write anything even if a check were missed; the checks make
  the refusal explicit.
- A plugin must be a single bundle. Files next to it (assets, wasm) are not installed, as ADR 0002
  already requires.
- Git installs need a `git` binary at run time, and partial clone works best on servers that
  support it (GitHub, GitLab, Gitea). Elsewhere the timeout and the object-store cap bound the
  download.
- Bundles stored with Git LFS are refused with a clear message.
