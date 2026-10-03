---
name: comment-cleanup
description: Use when writing or editing code that adds, changes or deletes a comment, when a diff or file is about to be committed with comments in it, or when asked to clean up, trim, audit or review comments in OwnGains (TS/TSX, JSX, JSDoc, eslint-disable directives).
---

# Comment cleanup

The rules (what a comment may say, the never-list, the one-to-two sentence cap) are in
CLAUDE.md under "Code Comments". This skill is how to apply them: a per-comment verdict,
the forms each kind of comment takes here, and the procedure for a cleanup pass.

## The verdict

For every comment you touch, pick exactly one:

| Verdict | When |
|---|---|
| **Keep** | It states a why, a domain rule, a workaround or a constraint the code can't show, and it is still true. |
| **Rewrite** | It holds a real why, wrapped in history, narration or filler. Keep the why, drop the rest. |
| **Encode** | Say it in code: a better name, a named constant, a helper, a type. Change the code, then delete the comment. |
| **Delete** | Restates the code, narrates history, points elsewhere, is a TODO, a banner or commented-out code, or is no longer true. |

Check a comment against the code before keeping it. A comment that has drifted from the
code is a Delete or a Rewrite, never a Keep.

## Rewrite: history → present-tense constraint

State the constraint the code obeys today. Anything about the old version goes to the
commit message.

```ts
// ❌ Each answer used to POST the whole program; a 30-name import made 30
//    uploads race each other. Pushed once when the review is put away.
// ✅ Pushed once when the review is put away: a POST per answer races
//    itself on a bulk import.
matchSyncDirtyRef.current = true
```

Tell-tale words: *used to, previously, now, no longer, changed, added, removed, instead
of the old, fixed*. "No longer part of the plan" describes the data, so it isn't history.
Read the sentence before you cut it.

## Forms in this repo

- **Placement:** the comment goes on its own line above the code, never at the end of a line.
- **JSX:** `{/* … */}` on its own line above the element, held to the same bar. A comment
  that only labels a section ("Header", "Buttons") is a Delete.
- **JSDoc on props and exported types (`/** … */`):** keep it when it gives a contract
  the type can't: units, who owns it, when it's read, what `undefined` means. Delete it
  when it just repeats the prop name ("`onClose`: called on close").
- **Lint directives:** `// eslint-disable-next-line <rule> -- <reason>` always names one
  rule and gives a reason after `--`. Never delete a directive during cleanup, because that
  changes lint results. Only reword its reason, and never turn it into a file-wide
  `eslint-disable`.
- **Tests:** a comment that pins the date or fixture a test depends on (such as
  `// Wednesday, week = Mon Aug 10 - now`) is a Keep. It explains a magic value.

## Cleanup pass

1. **Scope.** Unless the user names files, cover only the lines you changed:
   `git diff -U0 main...HEAD` on a feature branch, `git diff -U0` otherwise. Don't sweep
   untouched files as a side effect of another task.
2. **Verdict each comment** using the table above. Leave any comment you didn't examine as it is.
3. **Only comments change.** In a comment-only pass the diff must contain nothing but
   comment lines, apart from Encode renames. Run `npm run typecheck` and `npm run lint`
   afterwards anyway: a stray `*/` or a removed directive breaks one of them.
4. **Changelog:** one `### Internal` line under `[Unreleased]`, and only when the pass
   was its own change (such as "Trimmed stale comments in the plan screen").

## Red flags

- Adding a comment that explains the edit you just made. That text belongs in the commit message.
- Keeping a comment "just in case". If it fails the bar, delete it.
- Writing a third sentence. Tighten the comment, or move the detail to docs or the commit message.
- Wording that is phrased to the reviewer ("note that…", "important:").
