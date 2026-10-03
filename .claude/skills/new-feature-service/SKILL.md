---
name: new-feature-service
description: Use when adding a new service module to an OwnGains feature, or a whole new feature's services/ folder. Scaffolds the on/off pair, the dispatchProxy wiring in index.tsx, and the shared types so the exports cannot diverge between app modes.
---

# Adding a feature service

Every OwnGains feature's `services/` folder is an `on/` (server) and `off/` (device-only)
version of the same exports, joined by `createDispatchProxy`. `dispatchProxy`
is typed from the `on` module and routes by export name, so an export present online and
missing offline resolves to `undefined` and throws **in one app mode only**, and testing in the
other mode never shows it.

Four files, fixed layout. Get the layout right and the contract test enforces it.

## Steps

1. **Types first, in `src/features/<feature>/types.ts`.** Both versions import from
   there, never from each other, and never redeclare a type locally. The two modules
   agreeing on a type is what makes them substitutable.

2. **`services/on/<name>.tsx`**: a plain object of thin `apiCall` wrappers. `apiCall`
   prefixes the configured server URL, attaches the bearer token, and throws `ApiError` on
   `!res.ok` or a `{ success: false }` body, so these stay one-liners:

   ```tsx
   import { apiCall } from "@shared/services/apiClient"
   import type { ThingSummary, CreateThingParams } from "../../types"

   export const thingsApi = {
     list: (): Promise<{ success: boolean; things: ThingSummary[] }> =>
       apiCall(`/api/things`),

     create: (
       params: CreateThingParams,
     ): Promise<{ success: boolean; thing: ThingSummary }> =>
       apiCall(`/api/things`, { method: "POST", body: JSON.stringify(params) }),
   }
   ```

   If a route does not exist server-side yet, use the `api-request` skill: spec it in
   `api-requests.md` and call it as if it exists. Never stub it client-side.

3. **`services/off/<name>.tsx`**: same export name, same method names, same parameter
   lists, **same return types** including the `{ success: true, ... }` envelope. Build on
   `@shared/services/offlineHelpers` (`createRecordStore`, `readJSON`/`writeJSON`,
   `nextId`, `nowIso`, `withLock`) rather than touching storage directly. All persistence
   goes through `sqliteStorage` underneath, never
   `@react-native-async-storage/async-storage`.

   `withLock` matters for anything read-modify-write: two concurrent calls otherwise
   interleave and one write is lost.

4. **`services/index.tsx`**: the only file the rest of the app imports from:

   ```tsx
   import { createDispatchProxy } from "@shared/services/dispatchProxy"
   import { thingsApi as thingsApiOn } from "./on/things"
   import { thingsApi as thingsApiOff } from "./off/things"

   export const thingsApi = createDispatchProxy(thingsApiOn, thingsApiOff, "things")

   export type { ThingSummary, CreateThingParams } from "../types"
   ```

   The third argument is the feature name the server's `LOCAL_ONLY_FEATURES` list uses. Pass
   it whenever the feature could plausibly be forced local by a server that opts out of
   storing its data. That is what lets `GET /healthz` route it to `off/` while the app remains
   in online mode. Omit it only for a feature that has no meaning without the server.

5. **Verify the contract holds.** The four-file layout exists for this check:

   ```bash
   npx jest serviceModeContract --coverage=false --ci --forceExit
   npx tsc --noEmit
   ```

   Note what the test does not catch: it only compares modules present in **both**
   folders, and only their export names. A missing `off/` file, a changed parameter list,
   and a different return type are not caught. Read both modules side by side before
   declaring done.

## Rules

- Never import from `services/on/` or `services/off/` outside `services/index.tsx`.
  Importing one version directly bypasses the mode dispatch and hard-codes one mode.
- Additional exports in `off/` are fine, because the contract is one-way. Additional exports in
  `on/` are a bug.
- Offline rows get `local_`-prefixed IDs where they can reach the sync queue. Anything that
  sends an ID to the server needs the `startsWith("local_")` guard (see `useSyncManager`).
- A mutation made offline has to be queued in `useSyncManager`,
  not just written locally, or it never reaches the server on reconnect.
- **Genuinely server-only feature?** Use `createOnlineOnlyProxy(onImpl)` instead of writing
  a fake `off/` that looks like it works. It throws `OFFLINE_UNAVAILABLE_MESSAGE` in offline
  mode. `friends` is the existing example: friend requests and search cannot be local.
- Write a test for the `off/` version if it has real logic (streaks, aggregation,
  date bucketing). It goes in `services/off/__tests__/<name>.test.ts`.
