---
name: api-request
description: Use when a task needs a server-side endpoint that does not exist yet: a new route, a changed request/response shape, or a new field on an existing OwnGains-Server response. Writes the endpoint spec to api-requests.md, writes the client call against that spec, and audits it against the sibling server.
---

# Requesting a new server endpoint

OwnGains-Server is in a sibling repo (`../OwnGains-Server`) and is not part of this
checkout, so server code cannot be written here. Never stub, fake, or invent an endpoint
client-side to work around that. Instead, spec it, call it as if it exists, and let the
user build it from the spec.

## Steps

1. **Check it really is missing.** Grep the sibling repo before writing a spec. The route
   may already exist under a different path:

   ```bash
   grep -rnE "router\.(get|post|put|patch|delete)\(" ../OwnGains-Server/ | grep -i <keyword>
   ```

2. **Append the spec to `api-requests.md`** in the repo root (create it if missing). One
   `##` section per endpoint, using the template below. Append, and never rewrite entries the
   user has not yet built.

3. **Write the client call** against that exact spec, in the feature's
   `services/on/` module, using `apiCall` from `@shared/services/apiClient`:

   ```ts
   import { apiCall } from "@shared/services/apiClient";
   const result = await apiCall<ThingResponse>(`${serverUrl}/api/things/${id}`);
   ```

   `apiCall` throws `ApiError` on `!res.ok` or on a `{ success: false }` body, so the spec's
   response shape must use the `{ success, data }` / `{ success: false, error }` envelope
   that `parseApiResponse` expects.

4. **Mirror it into `services/off/`.** Every `on/` export needs an offline twin with the
   same call signature, or the feature breaks silently in offline mode
   (`serviceModeContract.test.ts` enforces this). The offline version reads/writes
   local state through `sqliteStorage` and does not call the network.

5. **Audit.** Run the checker and report what it says:

   ```bash
   python scripts/api_audit.py
   ```

   Exit code 1 means findings. The new endpoint appearing under "app calls with no matching
   server route" is expected until the user adds it. Say so explicitly rather than
   presenting it as a failure. Any *other* finding it reports (dead routes, dead client
   methods, contract drift) is a real one.

6. **Tell the user** the spec is in `api-requests.md` and needs to be built server-side
   before the feature works in online mode.

## Spec template

```markdown
## POST /api/things/:id/share

Shares a thing with a friend.

**Auth:** required (Bearer JWT)

**Path params**
- `id` (number): thing id, must belong to the caller

**Request body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `friendId` | number | yes | must be an accepted friend of the caller |
| `note` | string | no | max 280 chars |

**Response 200**
```json
{ "success": true, "share": { "id": 12, "sharedAt": "2026-08-26T10:00:00Z" } }
```

**Errors**
- `400`: `{ "success": false, "error": "friendId is required" }`
- `403`: caller does not own the thing, or is not friends with `friendId`
- `404`: thing does not exist

**Client caller:** `src/features/things/services/on/things.tsx` → `shareThing()`
```

## Rules

- Nothing goes in `api-requests.md` that the client does not call. The file is a
  work order, not a wishlist.
- Do not add a route to the sibling repo yourself, even though it is on disk. This repo's
  tasks stop at the spec.
- If an endpoint exists but its shape needs to change, spec the change as a diff against
  current behaviour and say which existing callers are affected.
