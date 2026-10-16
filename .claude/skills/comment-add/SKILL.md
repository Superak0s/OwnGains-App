---
name: comment-add
description: Use when asked to add, write, improve or document comments, TSDoc or doc comments on OwnGains code (TS/TSX), or when a new exported function, hook, type or non-obvious block lacks the why a future developer needs.
---

# Comment add

Adds comments to existing code under the rules in CLAUDE.md "Code Comments" (what a comment may say, the never-list, the length cap, the TSDoc format). This skill is the procedure. Run `comment-cleanup` afterwards on anything borderline.

## Default is no comment

Most code needs none. Add a comment only for one of these, and only when the code can't say it:

- A non-obvious **why** or domain rule (sync ordering, `local_` ID remapping, dirty flags, widget type migrations).
- A workaround for a framework, library or platform limit.
- A contract the types can't show: units, ownership, when it is read, what `undefined` or `null` means, what it throws.
- A compatibility requirement that isn't visible (server version floor, GlitchTip limits, Play policy).

If a better name, a named constant or a type would say it, make that change instead of commenting.

## Procedure

1. **Scope.** Only the files or symbols the user names. With none named, the lines in `git diff -U0`. Never sweep the repo.
2. **Read first.** Read the function, its callers and its `on/` or `off/` twin before writing. A guess about intent becomes a wrong comment, which is worse than none.
3. **Pick the form:**
   - Exported function, hook, context or type whose behavior isn't obvious from name and types: a TSDoc block (`/** … */`) with a summary sentence, then only tags that add something: `@param name - text`, `@returns`, `@throws`, `@deprecated`, `@remarks`. No types in tags, no `@example`, no tag that repeats the name.
   - Anything else: a `//` line on its own line above the code. JSX uses `{/* … */}` above the element.
   - Props and exported types: JSDoc only for a contract (units, owner, `undefined` meaning).
4. **Write it:** present tense, one or two short sentences, the constraint the code obeys today. No history, no "note that", no reviewer-directed wording, no TODOs.
5. **Verify.** Comment-only diff. Run `npm run typecheck` and `npm run lint`. Re-read each comment against the code once more.
6. **Changelog:** one `### Internal` line under `[Unreleased]` when the pass is its own change (such as "Documented the sync queue helpers"). A comment added alongside a feature needs no extra line.

## Red flags

- Documenting every export "for completeness". Skip declarations whose name and types say it all.
- A comment that restates the next line, labels a JSX section or narrates the edit just made.
- Describing behavior you didn't trace. Read the code, or leave it out.
- Adding a third sentence. Tighten it, or move the detail to docs or the commit message.
