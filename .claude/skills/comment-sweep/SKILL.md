---
name: comment-sweep
description: Use when asked to add comments or TSDoc across the whole OwnGains repo, a whole feature, or many files at once, rather than a named file or diff. Runs a batched, resumable pass that applies the comment-add rules folder by folder.
---

# Comment sweep

A repo-wide pass of `comment-add`. Read that skill and CLAUDE.md "Code Comments" first. Every rule there still holds, and the answer for most files is still "no comment". A sweep that comments everything is a failure.

## Scope and order

Source only: `src/**/*.ts(x)`. Skip `src/data/exercises.*` (generated), `__tests__/`, `__mocks__/`, `android/`, `ios/`, `node_modules/` and `.d.ts`. Work in this order, since later layers lean on earlier ones:

1. `src/shared/services/`, `src/shared/context/hooks/`, `src/shared/context/`
2. `src/utils/`, `src/shared/` (the rest)
3. `src/features/<name>/services/{on,off}/`, then `hooks/`, `utils/`, then screens and components, one feature at a time

A batch is one folder (or one feature layer), at most about 15 files.

## Procedure

1. **Start clean.** If `git status` has unrelated changes, stop and ask. This is not a feature, so work on the current branch with no feature branch.
2. **Ledger.** Write the ordered batch list to `comment-sweep.md` in the repo root (gitignored, so it stays out of commits). Mark each batch `todo`, `done` or `skipped` as you go. If the file exists, resume from the first `todo`.
3. **Per batch:**
   1. Read each file in full, plus the `on/` or `off/` twin and the main callers for services and hooks.
   2. Apply `comment-add` to each file. Most files should end with zero or a handful of comments.
   3. Keep every existing comment that still holds. Don't rewrite or delete here, that is `comment-cleanup`.
   4. The diff must be comment lines only. Run `npm run typecheck` and `npm run lint`, and fix anything a stray `*/` broke.
   5. Commit the batch: `docs(<area>): comment <folder>` with the repo's trailer. Never push.
4. **Parallelism.** Do batches one at a time. Only spawn agents for batches if the user asks, and then give each agent one non-overlapping folder.
5. **Finish.** Run `npm test` once. Add a single `### Internal` changelog line ("Documented the sync, auth and storage services") covering the whole sweep, not one per batch. Summarize per batch how many comments were added, and list the files you deliberately left bare when that is surprising (a large service with none).

## Stop conditions

- Intent of a block is unclear after reading callers: skip it and list it in your report. Never guess.
- A batch needs a code change to be clear (rename, constant): do not do it here. List it for the user.
- Typecheck or lint fails on a comment-only diff: revert that file and report it.

## Red flags

- Counting comments as progress. Fewer, accurate comments beat coverage.
- Documenting every export, trailing comments, section banners, history or TODOs.
- Describing behavior you didn't trace through the callers.
- Changing code, tests or formatting in a comment pass.
