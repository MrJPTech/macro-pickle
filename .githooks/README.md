# Git hooks (`.githooks/`)

Versioned hooks for this repo. They live here (not `.git/hooks/`) so they're
reviewable and travel with the repository.

## Enable (one-time per clone)

```bash
git config core.hooksPath .githooks
```

`core.hooksPath` is a local config value, so each fresh clone must run this once.

## Hooks

| Hook | Purpose |
|------|---------|
| `commit-msg` | Strips any `Co-Authored-By:` trailer attributing Claude / Anthropic, so the attribution can never be auto-re-added to a commit message. Body text that merely mentions the phrase is left untouched (it doesn't begin with the trailer key). |
