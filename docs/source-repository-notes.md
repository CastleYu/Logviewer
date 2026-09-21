# Source repository resolution

`SourceService.repositories()` resolves the first usable source target in the supplied order. Empty names and names beginning with `-` are ignored. Existing basename lookup remains unchanged; when a target path suffix matches an indexed candidate, that suffix narrows candidates before repository resolution. Otherwise basename matches are retained.

Each candidate is rechecked with `realpath` and `stat`, must remain inside a configured index root, and must not resolve through a symlink. The nearest `.git` directory or `.git` file identifies the repository root, including worktrees. Multiple files in one repository collapse into one result; files in distinct repositories remain distinct. If no Git marker exists, the most specific configured index root is used as a fallback. A target is accepted only when it produces at least one valid candidate, after which later targets are not consulted.

`SourceService.repository(directory)` validates an existing absolute directory and returns its nearest Git root, or the selected directory when no Git marker exists. It never initializes Git metadata.

Validation command: `npm run verify:source-repository`.
