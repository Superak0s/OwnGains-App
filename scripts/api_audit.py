#!/usr/bin/env python3
"""Cross-check the app's API calls against the server's Express routes.

Reports:
  1. App calls with no matching server route (not implemented yet)
  2. Server routes the app never calls (dead endpoints)
  3. Client api methods nothing in the app calls (dead client code)
  4. Contract drift: body/query keys the app sends that the server never reads.
     Unjudgeable (suppressed) when the server reads the channel without a
     visible key: req.body[key] with a dynamic index, or a bare req.body
     handed to a callee whole, since any key may be consumed there.
  5. Reverse drift: body/query keys the server reads that no app call site to
     that route ever sends: a required field the app omits, or an optional
     knob it never turns on. Judged per route (sibling call sites legitimately
     send different subsets) and suppressed for a channel any call site leaves
     unreadable (a spread, `JSON.stringify(params)`, an interpolated query).
  6. Response drift: keys a route responds with (`res.json({...})`, one level
     of nesting included) that the app never reads. Judged per route when every
     call site's use of the response is visible: bound to a local, then only
     ever read through `.key` or destructured. When any call site hands the
     response on whole, it falls back to asking whether the key's name appears
     in the app source at all: crude, but a name absent from every file is read
     by no code path, dynamic access included.
  7. Extracted-but-unused: keys the server DOES read (destructured or pulled
     off req.body/req.query into a local) but then never actually uses --
     either the handler drops it on the floor, or it hands the value to an
     imported function (e.g. programs.model.ts) whose matching parameter is
     itself never referenced. "The server reads it" and "the server uses it"
     are different claims; this closes the gap between them.
  8. Route params declared in the path (:id) but never read off req.params --
     data the URL carries in that the route drops.

Regex-based, stdlib only: no TS compiler, no deps.
Run:  python scripts/api_audit.py [--json] [--self-test]
Exit code 1 when anything is found, so it can gate CI.

Escape hatches (both work the same way `api-audit: external` does for #2):
  `// api-audit: used` right above (or trailing) a destructured/assigned
  extraction silences the unused-after-extraction check for it. The same
  comment anywhere in a callee's body silences the check for all of that
  callee's parameters. An `api-audit: used` anywhere in a route handler also
  silences that route's unread-:param check. Use it when a value is genuinely
  consumed somewhere this regex scan can't see: a closure invoked later, a
  framework hook.
"""

import argparse
import json
import re
import sys
from pathlib import Path

API_PATH_LITERAL = re.compile(r"[\"'`][^\"'`\n]*?(/api/[^\"'`\n]*)")
USED_MARKER = "api-audit: used"


def read_source(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as e:
        print(f"warning: {path}: not valid UTF-8 at byte {e.start}, decoding with replacement", file=sys.stderr)
        return raw.decode("utf-8", errors="replace")

APP_ROOT = Path(__file__).resolve().parents[1]
SERVER_ROOT = APP_ROOT.parent / "OwnGains-Server" / "src"

METHODS = ("get", "post", "put", "patch", "delete")


def is_test(f: Path) -> bool:
    return "__tests__" in f.parts or ".test." in f.name or ".spec." in f.name


def app_sources(root: Path):
    files = list(root.glob("**/*.ts")) + list(root.glob("**/*.tsx"))
    return sorted(f for f in files if not is_test(f))


PARAM = ":param"
REQ_BODY = "req.body"
REQ_QUERY = "req.query"


# ---------------------------------------------------------------- helpers


def truncated(raw: str) -> bool:
    """True when the call-site string was cut short mid-`${...}`. A nested
    template literal (`/api/x${q ? `?${q}` : ""}`) ends the outer string early
    at the inner backtick, so everything past the `${` is unknown."""
    return "${" in raw and "}" not in raw.rsplit("${", 1)[1]


def normalize(path: str) -> str:
    """/api/x/${id}?limit=1 -> /api/x/:param ; /api/x/:id -> /api/x/:param"""
    path = path.split("?")[0]
    path = re.sub(r"\$\{[^{}]*\}", PARAM, path)
    path = path.split("${")[0] if truncated(path) else path
    path = re.sub(r":[A-Za-z_]\w*", PARAM, path)
    path = re.sub(r"/+", "/", path)
    return path.rstrip("/") or "/"


def paths_match(call: str, route: str) -> bool:
    """Express-ish match: a literal call segment may land on a route :param."""
    if call == route:
        return True
    c, r = call.split("/"), route.split("/")
    if len(c) != len(r):
        return False
    return all(rs == PARAM or rs == cs for cs, rs in zip(c, r))


def is_call_argument(text: str, quote: int) -> bool:
    """True when the string at `quote` is an argument, not e.g. `return `...``."""
    j = quote - 1
    while j >= 0 and text[j] in " \t\r\n":
        j -= 1
    return j >= 0 and text[j] in "(,"


def skip_string(text: str, i: int, n: int, quote: str) -> int:
    """Index of the closing `quote`, or `n` when the string is unterminated."""
    while i < n and text[i] != quote:
        i += 2 if text[i] == "\\" else 1
    return i


def skip_noise(text: str, i: int, n: int) -> int:
    """Last index of the string or comment starting at `i`, or `i` itself when
    `text[i]` is neither. Without this, an apostrophe in a comment (`// don't`)
    looks like a string literal and desyncs every bracket scanner below."""
    ch = text[i]
    if ch in "\"'`":
        return skip_string(text, i + 1, n, ch)
    if ch == "/" and i + 1 < n:
        if text[i + 1] == "/":
            j = text.find("\n", i)
            return n - 1 if j < 0 else j - 1
        if text[i + 1] == "*":
            j = text.find("*/", i + 2)
            return n - 1 if j < 0 else j + 1
    return i


def call_span(text: str, start: int) -> str:
    """Text from `start` to the closing paren of the enclosing call."""
    depth, i, n = 1, start, min(len(text), start + 2000)
    while i < n and depth:
        ch = text[i]
        i2 = skip_noise(text, i, n)
        if i2 != i:
            i = i2 + 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        i += 1
    return text[start:i]


def template_end(text: str, quote: int) -> int:
    """Index of the closing backtick of the template literal opening at
    `quote`, skipping `${...}` expressions (and any strings or templates
    inside them); -1 when unterminated."""
    i, n = quote + 1, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "`":
            return i
        if ch == "$" and text[i + 1 : i + 2] == "{":
            i = template_expr_end(text, i + 2, n)
            if i < 0:
                return -1
            continue
        i += 1
    return -1


def template_expr_end(text: str, i: int, n: int) -> int:
    """Index just past the `}` closing a `${` expression whose body starts at
    `i`; -1 when a template nested inside it is unterminated."""
    depth = 1
    while i < n and depth:
        c = text[i]
        if c in "\"'":
            i = skip_string(text, i + 1, n, c)
        elif c == "`":
            i = template_end(text, i)
            if i < 0:
                return -1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return i


def object_body(text: str, open_brace: int) -> str:
    """Source between `open_brace` and its matching close brace."""
    depth, i, n, start = 0, open_brace, len(text), open_brace + 1
    while i < n:
        ch = text[i]
        i2 = skip_noise(text, i, n)
        if i2 != i:
            i = i2 + 1
            continue
        if ch in "{[(":
            depth += 1
            if depth == 1 and ch == "{":
                start = i + 1
        elif ch in "}])":
            depth -= 1
            if depth == 0:
                return text[start:i]
        i += 1
    return ""


def object_keys(text: str, open_brace: int) -> set:
    """Top-level keys of the object literal starting at `open_brace`."""
    body = object_body(text, open_brace)
    if not body:
        return set()
    # drop nested groups so nested keys don't leak into the top level
    prev = None
    while prev != body:
        prev = body
        body = re.sub(r"\{[^{}]*\}|\([^()]*\)|\[[^\[\]]*\]", "", body)
    keys = set()
    for part in body.split(","):
        m = re.match(r"\s*([A-Za-z_]\w*)\s*(?:[:=]|$)", part)
        if m:
            keys.add(m.group(1))
    return keys


def object_bindings(text: str, open_brace: int) -> tuple:
    """Top-level `key -> local binding name` for the destructuring pattern
    starting at `open_brace`, plus any `...rest` names.

    Distinct from object_keys (which only needs the key, e.g. for a literal
    being constructed) because here the right-hand side of `key: name` is the
    variable we need to track usage of, not just an existence check.
    """
    body = object_body(text, open_brace)
    if not body:
        return {}, []
    prev = None
    while prev != body:
        prev = body
        body = re.sub(r"\{[^{}]*\}|\([^()]*\)|\[[^\[\]]*\]", "", body)
    bindings, rest = {}, []
    for part in body.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"\.\.\.(\w+)", part)
        if m:
            rest.append(m.group(1))
            continue
        m = re.match(r"([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)", part)
        if m:
            bindings[m.group(1)] = m.group(2)
            continue
        m = re.match(r"([A-Za-z_]\w*)", part)
        if m:
            bindings[m.group(1)] = m.group(1)
    return bindings, rest


def balanced_span(text: str, open_at: int) -> str:
    """Source between the bracket at `open_at` (one of `([{`) and its match,
    tracking all three bracket kinds together so e.g. a `{}` type or `[]`
    array inside a `()` parameter list doesn't throw the count off.
    """
    opens, closes = "([{", ")]}"
    depth, i, n = 0, open_at, len(text)
    while i < n:
        ch = text[i]
        i2 = skip_noise(text, i, n)
        if i2 != i:
            i = i2 + 1
            continue
        if ch in opens:
            depth += 1
        elif ch in closes:
            depth -= 1
            if depth == 0:
                return text[open_at + 1 : i]
        i += 1
    return ""


def spread_used(text: str, open_brace: int) -> bool:
    return "..." in text[open_brace : open_brace + 400]


def upload_fields(text: str, at: int) -> set:
    """Multipart field names the route's upload middleware consumes.
    `photoUpload.single("photo")` reads `photo` off the body every bit as much
    as `req.body.photo` would, but it sits in the middleware list rather than
    the handler, so the handler scan never sees it."""
    return set(re.findall(r'\.(?:single|array)\(\s*"(\w+)"', text[at : at + 300]))


def usage_suppressed(text: str, at: int) -> bool:
    """`api-audit: used` on or just above `at` opts a value out of the
    unused-after-extraction checks: mirrors `external_marked` below, same
    reason: a regex scan can't see every real consumer of a value.
    """
    return USED_MARKER in text[max(0, at - 300) : at + 100]


# ---------------------------------------------------------------- server


def external_marked(text: str, route_at: int) -> bool:
    """True when an `api-audit: external` comment sits just above the route.

    Marks endpoints reached by something other than an app call site: a
    server-generated URL, an ops probe, so they aren't flagged as dead.
    """
    return "api-audit: external" in text[max(0, route_at - 300) : route_at]


def handler_span(text: str, m) -> str:
    """Source of a route's remaining arguments (middleware + handler), bounded
    by the call's own closing paren: not the next route, so file-level
    helpers after the last route can't leak into it and hand it phantom
    `req.*` reads."""
    open_paren = m.start() + m.group(0).index("(")
    span = balanced_span(text, open_paren)
    offset = m.start(2) - (open_paren + 1)
    return span[offset + len(m.group(2)) :]


def route_endpoint(method, raw, file, text, m, handler, route_imports):
    return {
        "method": method.upper(),
        "path": normalize(raw),
        "raw": raw,
        "file": file,
        "line": text[: m.start()].count("\n") + 1,
        "body": server_keys(handler, REQ_BODY) | upload_fields(text, m.start()),
        "query": server_keys(handler, REQ_QUERY),
        "body_open": open_reads(handler, REQ_BODY),
        "query_open": open_reads(handler, REQ_QUERY),
        "external": external_marked(text, m.start()),
        "dead_after_read": unused_extractions(handler),
        "dead_in_callee": (
            trace_deep_usage(handler, REQ_BODY, route_imports)
            + trace_deep_usage(handler, REQ_QUERY, route_imports)
        ),
        "dead_params": unused_route_params(raw, handler),
        "response": response_keys(handler),
    }


def collect_routes(prefix, f, seen, endpoints):
    if not f.exists() or f in seen:
        return
    seen = seen | {f}
    text = read_source(f)
    router_imports = named_imports(text, f.parent)
    # first arg is one path or an array of aliases: (["/split/:s", "/person/:p"], ...)
    for m in re.finditer(
        r'router\.(%s)\(\s*(\[[^\]]*\]|"[^"]*")' % "|".join(METHODS), text
    ):
        handler = handler_span(text, m)
        for path in re.findall(r'"([^"]*)"', m.group(2)):
            endpoints.append(
                route_endpoint(m.group(1), prefix + path, server_rel(f),
                               text, m, handler, router_imports)
            )
    sub_imports = dict(re.findall(r'import\s+(\w+)\s+from\s+"(\.[^"]+)"', text))
    for sub_prefix, ident in re.findall(
        r'router\.use\(\s*(?:"([^"]*)"\s*,\s*)?(\w+)\s*\)', text
    ):
        rel = sub_imports.get(ident)
        if rel:
            collect_routes(prefix + sub_prefix,
                           (f.parent / rel.replace(".js", ".ts")).resolve(), seen, endpoints)


def parse_server():
    routes_ts = (SERVER_ROOT / "routes.ts").read_text(encoding="utf-8")
    imports = dict(re.findall(r'import\s+(\w+)\s+from\s+"\./([^"]+)"', routes_ts))
    mounts = re.findall(r'app\.use\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)', routes_ts)
    # routers mounted in a loop over a `["/path", router]` table
    mounts += re.findall(r'\[\s*"(/[^"]+)"\s*,\s*(\w+Routes)\s*\]', routes_ts)
    top_level_imports = named_imports(routes_ts, SERVER_ROOT)

    endpoints = []
    # routes declared straight on the app, not on a mounted router
    for m in re.finditer(
        r'app\.(%s)\(\s*"([^"]+)"' % "|".join(METHODS), routes_ts
    ):
        endpoints.append(
            route_endpoint(m.group(1), m.group(2), "routes.ts", routes_ts, m,
                           handler_span(routes_ts, m), top_level_imports)
        )

    for prefix, ident in mounts:
        rel = imports.get(ident)
        if rel:
            collect_routes(prefix, (SERVER_ROOT / rel.replace(".js", ".ts")).resolve(),
                           frozenset(), endpoints)
    return endpoints


def server_extractions(handler: str, source: str) -> list:
    """Every place `handler` pulls a value out of `source` (req.body /
    req.query), tagged with how:
      - "direct"       a bare `req.body.x` read: the read and its use are
                        the same expression, so it's inherently "used".
      - "assigned"     `const x = req.body.x`: a named local worth tracking.
      - "destructured" `const { x } = req.body`: ditto, alias-aware.
      - "spread"       `const { ...rest } = req.body`: could hide any key,
                        so it's reported but never flagged as unused.
    This is the shared basis for both server_keys (existence) and the
    unused-after-extraction checks (actual use).
    """
    out = []
    for m in re.finditer(re.escape(source) + r"\??\.(\w+)", handler):
        out.append(
            {"key": m.group(1), "binding": None, "kind": "direct", "at": m.end()}
        )

    if source == REQ_QUERY:
        # queryLimit(req, { def, max, key }) reads req.query[key ?? "limit"]
        for m in re.finditer(r"queryLimit\(\s*req\s*,\s*\{([^}]*)\}", handler):
            k = re.search(r'key:\s*"(\w+)"', m.group(1))
            out.append(
                {
                    "key": k.group(1) if k else "limit",
                    "binding": None,
                    "kind": "direct",
                    "at": m.end(),
                }
            )

    for m in re.finditer(
        r"const\s+(\w+)\s*=\s*%s\??\.(\w+)" % re.escape(source), handler
    ):
        out.append(
            {
                "key": m.group(2),
                "binding": m.group(1),
                "kind": "assigned",
                "at": m.end(),
            }
        )

    return out + destructured_extractions(handler, source)


def destructured_extractions(handler: str, source: str) -> list:
    out = []
    for m in re.finditer(r"const\s*\{", handler):
        tail = handler[m.end() : m.end() + 600]
        close = tail.find("}")
        if close < 0:
            continue
        after = tail[close : close + 40].lstrip("} =\n\r\t")
        if not after.startswith(source):
            continue
        bindings, rest = object_bindings(handler, m.end() - 1)
        src_pos = handler.find(source, m.end() + close)
        end_at = src_pos + len(source) if src_pos >= 0 else m.end() + close + 40
        out += [
            {"key": key, "binding": binding, "kind": "destructured", "at": end_at}
            for key, binding in bindings.items()
        ]
        out += [{"key": None, "binding": r, "kind": "spread", "at": end_at} for r in rest]
    return out


def server_keys(handler: str, source: str) -> set:
    return {e["key"] for e in server_extractions(handler, source) if e["key"]}


def open_reads(handler: str, source: str) -> bool:
    """True when the handler reads `source` without a visible key: `req.body[key]`
    with a dynamic index (the settings whitelist loop), a bare `req.body` in a
    value position (handed to a callee whole), or a plain `const x = req.body`.
    A destructure source (`const { a } = req.body`) is NOT open: its keys
    are named. Any open read may consume any key, so drift for that route's
    channel can't be judged key by key."""
    src = re.escape(source)
    return bool(
        re.search(src + r"\s*\[", handler)
        or re.search(src + r"(?![.\?\[])[,)\}]", handler)
        or re.search(r"\b(?:const|let|var)\s+\w+\s*=\s*" + src + r"(?![.\?\[])", handler)
    )


def nested_keys(text: str, open_brace: int) -> set:
    """`parent.child` for every top-level key of the literal at `open_brace`
    whose value is itself an object literal. One level down is as deep as a
    response literal ever nests here, and deeper keys come from database rows
    this scan can't see into anyway."""
    body = object_body(text, open_brace)
    out, depth, i, n = set(), 0, 0, len(body)
    while i < n:
        j = skip_noise(body, i, n)
        if j != i:
            i = j + 1
            continue
        ch = body[i]
        if ch in "{[(":
            m = re.search(r"(\w+)\s*:\s*$", body[:i]) if depth == 0 and ch == "{" else None
            if m:
                out |= {"%s.%s" % (m.group(1), k) for k in object_keys(body, i)}
            depth += 1
        elif ch in "}])":
            depth -= 1
        i += 1
    return out


def response_keys(handler: str) -> set:
    """Keys of every object literal this handler responds with --
    `res.json({...})`, `res.status(400).json({...})`. A `res.json(someVar)`
    contributes nothing rather than suppressing the rest: keys we can't see
    don't invalidate the ones we can. Nested literals contribute their keys as
    `parent.child`, one level deep.
    """
    keys = set()
    for m in re.finditer(r"\.json\(", handler):
        i = m.end()
        while i < len(handler) and handler[i] in " \t\r\n":
            i += 1
        if i < len(handler) and handler[i] == "{":
            keys |= object_keys(handler, i) | nested_keys(handler, i)
    return keys


def unused_route_params(raw_path: str, handler: str) -> list:
    """`:name` path segments the route declares but whose `req.params.name` is
    never read in the handler: data the URL carries in and the route drops.
    A dynamic `req.params[...]` (or the escape hatch) makes the set unknowable,
    so it suppresses the check, like spread does for body keys."""
    if USED_MARKER in handler or re.search(r"req\.params\s*\[", handler):
        return []
    used = set(re.findall(r"req\.params\.\??(\w+)", handler))
    return [
        p for p in dict.fromkeys(re.findall(r":([A-Za-z_]\w*)", raw_path)) if p not in used
    ]


def binding_used_again(text: str, binding: str, after: int) -> bool:
    """Whether `binding` (a local pulled out of req.body/req.query, or a
    callee's own parameter name) is referenced anywhere past `after`: a
    validation check, a call argument, a response field, anything. If its
    name never resurfaces, the value was read (or handed off) and then
    dropped on the floor.
    """
    return re.search(word_re(binding), text[after:]) is not None


def unused_extractions(handler: str) -> list:
    """Destructured/assigned req.body & req.query bindings this handler pulls
    out but never references again: read, then dead weight, independent of
    whether anything downstream is even involved.
    """
    dead = []
    for source in (REQ_BODY, REQ_QUERY):
        for e in server_extractions(handler, source):
            if e["kind"] not in ("destructured", "assigned"):
                continue
            if usage_suppressed(handler, e["at"]):
                continue
            if not binding_used_again(handler, e["binding"], e["at"]):
                dead.append(
                    {"source": source, "key": e["key"], "binding": e["binding"]}
                )
    return dead


# ---------------------------------------------------------------- call-chain tracing


def named_imports(text: str, base_dir: Path) -> dict:
    """`local name -> (resolved source file, exported name)` for every
    relative named import in `text`. Only relative imports are followed --
    imports from packages (`express`, `mysql2`, ...) have no local source to
    check for dropped parameters. Handles `import { a, b as bb } from "./x"`,
    including multi-line import lists.
    """
    out = {}
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"(\.[^"]*)"', text, re.S):
        rel = m.group(2)
        f = (base_dir / rel).resolve()
        if f.suffix == ".js":
            f = f.with_suffix(".ts")
        for raw_name in m.group(1).split(","):
            raw_name = raw_name.strip()
            if not raw_name:
                continue
            if " as " in raw_name:
                original, local = (p.strip() for p in raw_name.split(" as "))
            else:
                original = local = raw_name
            out[local] = (f, original)
    return out


def param_names(sig_text: str) -> list:
    """Top-level positional parameter names from a TS function's parameter-
    list source, types stripped: we only need names, to line up a call's
    arguments with what the callee actually calls them.
    """
    prev = None
    while prev != sig_text:
        prev = sig_text
        sig_text = re.sub(r"\{[^{}]*\}|\([^()]*\)|\[[^\[\]]*\]|<[^<>]*>", "", sig_text)
    names = []
    for part in sig_text.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"\.\.\.(\w+)", part)
        if m:
            names.append(m.group(1))
            continue
        m = (
            re.match(r"(\w+)\??\s*:", part)
            or re.match(r"(\w+)\s*=", part)
            or re.match(r"(\w+)$", part)
        )
        names.append(m.group(1) if m else None)
    return names


def skip_to_body_brace(text: str, after_params: int, limit: int = 400) -> int:
    """Index of a function's opening body `{`, skipping past a `: ReturnType`
    annotation that may itself contain braces (e.g. `Promise<{ x: number }>`).
    Only `<>`, `()`, `[]` change depth: a bare `{` counts as the body as
    soon as those are balanced, so a brace embedded in a generic return type
    never gets mistaken for it. Bounded like call_span, since an arrow
    function with a concise (brace-less) body has no `{` to find at all.
    """
    depth, i, n = 0, after_params, min(len(text), after_params + limit)
    while i < n:
        ch = text[i]
        i2 = skip_noise(text, i, n)
        if i2 != i:
            i = i2 + 1
            continue
        if ch in "<([":
            depth += 1
        elif ch in ">)]":
            depth = max(0, depth - 1)
        elif ch == "{" and depth == 0:
            return i
        i += 1
    return -1


def find_function(text: str, name: str):
    """Locate an exported function's parameter names and body source.
    Follows `export (async) function NAME(...)` and `export const NAME =
    (async) (...) => { ... }` with a block body: the two styles the model/
    service layer here actually uses. Arrow functions with a concise
    (brace-less) body, class methods, and re-exports aren't followed.
    """
    m = re.search(
        r"export\s+(?:async\s+)?function\s+%s\s*\(" % re.escape(name), text
    ) or re.search(r"export\s+const\s+%s\s*=\s*(?:async\s*)?\(" % re.escape(name), text)
    if not m:
        return None
    open_paren = m.end() - 1
    params_text = balanced_span(text, open_paren)
    after_params = open_paren + 1 + len(params_text) + 1
    brace = skip_to_body_brace(text, after_params)
    if brace < 0:
        return None
    return {"params": param_names(params_text), "body": balanced_span(text, brace)}


_file_text_cache = {}
_function_cache = {}


def _read_cached(path: Path) -> str:
    key = str(path)
    if key not in _file_text_cache:
        try:
            _file_text_cache[key] = read_source(path)
        except OSError:
            _file_text_cache[key] = ""
    return _file_text_cache[key]


def find_function_cached(fn_file: Path, fn_name: str):
    key = (str(fn_file), fn_name)
    if key not in _function_cache:
        _function_cache[key] = (
            find_function(_read_cached(fn_file), fn_name) if fn_file.exists() else None
        )
    return _function_cache[key]


def call_args(handler: str, fn_name: str) -> list:
    """Every call to `fn_name` inside `handler`, each as a list of its
    top-level argument source strings in positional order: comma-splitting
    that respects nested (), {}, [], and quoted strings, and tolerates
    multi-line calls and inline comments between arguments.
    """
    return [
        split_args(balanced_span(handler, m.end() - 1))
        for m in re.finditer(r"\b%s\s*\(" % re.escape(fn_name), handler)
    ]


def split_args(raw: str) -> list:
    args, depth, cur, i, n = [], 0, "", 0, len(raw)
    while i < n:
        ch = raw[i]
        j = skip_noise(raw, i, n)
        if j != i:
            cur += raw[i : j + 1]
            i = j + 1
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            args.append(cur.strip())
            cur = ""
        else:
            cur += ch
        i += 1
    if cur.strip():
        args.append(cur.strip())
    return args


def trace_deep_usage(handler: str, source: str, imports: dict) -> list:
    """For bindings the handler pulls out of req.body/req.query and DOES
    reference again, follow that reference one hop further: if it's a
    positional argument to a call of a locally-defined, imported function,
    confirm the callee's matching parameter is itself used. Otherwise the
    value survives the handler only to be dropped by the function it's
    handed to: read, passed along, still dead weight.
    """
    extractions = [
        e
        for e in server_extractions(handler, source)
        if e["kind"] in ("destructured", "assigned")
        and not usage_suppressed(handler, e["at"])
    ]
    if not extractions:
        return []

    dead = []
    for local_name, (fn_file, original_name) in imports.items():
        arg_lists = call_args(handler, local_name)
        if not arg_lists:
            continue
        callee = find_function_cached(fn_file, original_name)
        if not callee or USED_MARKER in callee["body"]:
            continue
        dead += [
            {
                "source": source,
                "key": match["key"],
                "binding": match["binding"],
                "passed_to": local_name,
                "callee_file": server_rel(fn_file),
                "callee_param": param,
            }
            for match, param in unused_params_passed(arg_lists, callee, extractions)
        ]
    return dead


def unused_params_passed(arg_lists, callee, extractions):
    """(extraction, param) for each extracted binding passed positionally to a
    callee parameter the callee never uses."""
    for args in arg_lists:
        for arg, param in zip(args, callee["params"]):
            match = next((e for e in extractions if e["binding"] == arg), None)
            if match and param and not binding_used_again(callee["body"], param, 0):
                yield match, param


def word_re(name: str) -> str:
    return r"\b%s\b" % re.escape(name)


def server_rel(f: Path) -> str:
    try:
        rel = str(f.relative_to(SERVER_ROOT))
    except ValueError:
        rel = str(f)
    return rel.replace("\\", "/")


# ---------------------------------------------------------------- app types

# tsconfig.json "paths", kept in sync by hand. A miss just makes a type
# unresolvable, which suppresses a check rather than mis-reporting it
ALIASES = {
    "@features": "src/features",
    "@shared": "src/shared",
    "@utils": "src/utils",
    "test-utils": "src/test-utils",
}

# wrappers that preserve the underlying type's key set
PASSTHROUGH_GENERICS = ("Partial", "Required", "Readonly", "NonNullable", "Promise")


def resolve_module(spec: str, base_dir: Path):
    """App import specifier -> file on disk, or None. App imports carry no
    extension and may go through a tsconfig path alias, unlike the server's
    explicit `./x.js` imports that `named_imports` handles."""
    if spec.startswith("."):
        base = base_dir / spec
    else:
        alias, _, tail = spec.partition("/")
        if alias not in ALIASES or not tail:
            return None
        base = APP_ROOT / ALIASES[alias] / tail
    for cand in (
        base.parent / (base.name + ".ts"),
        base.parent / (base.name + ".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ):
        if cand.is_file():
            return cand.resolve()
    return None


def type_imports(text: str) -> dict:
    """`exported name -> module specifier` for every named import in an app
    file, `import type { X }` included."""
    out = {}
    for m in re.finditer(
        r'import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["\']([^"\']+)["\']', text, re.S
    ):
        for raw in m.group(1).split(","):
            raw = raw.replace("type ", "").strip()
            if not raw:
                continue
            original = raw.split(" as ")[0].strip()
            out[original] = m.group(2)
    return out


def strip_groups(s: str) -> str:
    """Collapse every nested (), [], {} and <> group away, leaving only the
    top level, so a nested object type's keys can't leak up a level."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\{[^{}]*\}|\([^()]*\)|\[[^\[\]]*\]|<[^<>]*>", "", s)
    return s


def member_names(body: str) -> set:
    """Top-level property names of a TS object type's body."""
    return set(re.findall(r"(?:^|[;,])\s*(?:readonly\s+)?(\w+)\s*\??\s*:", strip_groups(body), re.M))


def bare_type(name: str) -> str:
    """`Partial<Foo>[]` -> `Foo`, a type this scan can't see through -> ""."""
    name = name.strip().rstrip("[]").strip()
    m = re.match(r"(\w+)\s*<(.+)>$", name)
    if m:
        if m.group(1) not in PASSTHROUGH_GENERICS:
            return ""
        return bare_type(m.group(2))
    return name if re.fullmatch(r"\w+", name) else ""


def intersection_keys(rhs: str, f: Path, seen):
    keys = set()
    for part in re.split(r"&(?![^<]*>)", rhs):
        part = part.strip()
        if part.startswith("{"):
            keys |= member_names(balanced_span(part, 0))
            continue
        resolved = type_keys(part, f, seen)
        if resolved is None:
            return None
        keys |= resolved
    return keys


def type_keys(name: str, f: Path, seen=()):
    """Top-level property names of TS type `name` as declared in (or imported
    into) file `f`, or None when it can't be resolved: a mapped type, a
    union, a generic parameter, a type from a package. None means "unknown",
    which every caller must treat as "don't judge", never as "no keys".
    """
    name = name.strip()
    if name.startswith("{"):  # inline object type: `params: { a: string }`
        return member_names(balanced_span(name, 0))
    name = bare_type(name)
    if not name or (str(f), name) in seen:
        return None
    seen = seen + ((str(f), name),)
    text = _read_cached(f)

    m = re.search(r"\binterface\s+%s\b([^{]*)\{" % re.escape(name), text)
    if m:
        keys = member_names(balanced_span(text, m.end() - 1))
        for parent in re.findall(r"\w+", m.group(1).replace("extends", "", 1)):
            inherited = type_keys(parent, f, seen)
            if inherited is None:
                return None
            keys |= inherited
        return keys

    m = re.search(r"\btype\s+%s\b[^=]*=\s*" % re.escape(name), text)
    if m:
        return intersection_keys(text[m.end() : m.end() + 4000].split(";")[0], f, seen)

    spec = type_imports(text).get(name)
    target = resolve_module(spec, f.parent) if spec else None
    return type_keys(name, target, seen) if target else None


def enclosing_params(text: str, at: int) -> str:
    """Parameter-list source of the function whose body contains `at`. Walks
    outward from the call site to the nearest parameter list that closes
    before it and is followed by `=>` or a return-type annotation."""
    best = ""
    for m in re.finditer(r"\(", text[:at]):
        span = balanced_span(text, m.start())
        end = m.start() + 1 + len(span) + 1
        if end > at:
            continue
        tail = text[end : end + 200].lstrip()
        if tail.startswith("=>") or (tail.startswith(":") and "=>" in tail[:200]):
            best = span
    return best


def param_types(sig_text: str) -> dict:
    """`parameter name -> declared type source` for a TS parameter list."""
    out = {}
    depth, cur, parts = 0, "", []
    for i, ch in enumerate(sig_text):
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    for part in parts:
        m = re.match(r"\s*(\w+)\s*\??\s*:\s*(.+)", part, re.S)
        if m:
            out[m.group(1)] = m.group(2).split("=")[0].strip()
    return out


# ---------------------------------------------------------------- app


def app_call(f, text: str, m) -> dict:
    # +1 skips the string's closing quote
    span_start = m.end() + 1
    if truncated(m.group(1)) and text[m.start()] == "`":
        end = template_end(text, m.start())
        if end >= 0:
            span_start = end + 1
    span = call_span(text, span_start) if is_call_argument(text, m.start()) else ""
    method = re.search(r'method:\s*"(\w+)"', span) or re.search(
        r'^,\s*"(%s)"' % "|".join(m.upper() for m in METHODS), span
    )
    raw = m.group(1)
    # a nested template literal ends the path string early, so `span` starts
    # mid-expression and its braces are not this call's arguments
    body, body_open = (
        (set(), True) if truncated(raw) else app_body(span, text, m.end() + 1, f)
    )
    return {
        "method": (method.group(1) if method else "GET").upper(),
        "path": normalize(raw),
        "raw": raw,
        "file": str(f.relative_to(APP_ROOT)).replace("\\", "/"),
        "line": text[: m.start()].count("\n") + 1,
        "body": body,
        "query": set(re.findall(r"[?&](\w+)=", raw)),
        "body_open": body_open,
        "dynamic_query": "${params" in raw or "toString()" in raw or truncated(raw),
        "reads": response_reads(text, m.start()),
    }


OPTION_KEYS = {"method", "headers", "body", "signal", "credentials"}


def top_level_brace(span: str):
    """Index of the first `{` at argument depth in `span` that opens a plain
    object literal rather than the fetch options bag: i.e. the body argument
    of a `sendJson(path, "POST", { ... })`-style wrapper."""
    depth, i, n = 0, 0, len(span)
    while i < n:
        ch = span[i]
        j = skip_noise(span, i, n)
        if j != i:
            i = j + 1
            continue
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == "{":
            if depth == 0 and not (object_keys(span, i) & OPTION_KEYS):
                return i
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return -1


def spread_keys(body: str, resolve) -> tuple:
    """`(keys, hidden)` for the `...` spreads inside an object literal body.
    A spread of an object literal (`...(isDemo && { isDemo: true })`) or of a
    typed parameter (`...updates`) contributes its own keys; anything else
    (`...rest` off a destructuring, a ternary picking between two literals)
    hides keys this scan can't enumerate."""
    keys, hidden = set(), False
    for m in re.finditer(r"\.\.\.", body):
        rest = body[m.end() :].lstrip()
        grp = balanced_span(rest, 0) if rest.startswith("(") else rest.split(",")[0]
        if "{" in grp and "?" not in grp:
            keys |= object_keys(grp, grp.index("{"))
            continue
        named = resolve(grp.strip()) if re.fullmatch(r"\w+", grp.strip()) else None
        if named:
            keys |= named
        else:
            hidden = True
    return keys, hidden


def app_body(span: str, text: str = "", call_at: int = 0, f: Path = None) -> tuple:
    """`(keys, open)` for the request body a call site sends. `open` means the
    call sends a body whose keys this scan can't see, so the key set is a floor
    rather than the truth and drift can't be judged either way for that call.

    A body handed over as a variable (`JSON.stringify(params)`) is resolved
    through the enclosing function's parameter type when that type can be
    followed to a declaration: the TS type IS the contract there.
    """
    form_keys = set(re.findall(r'\.append\(\s*"(\w+)"', span))
    if form_keys:
        return form_keys, False

    declared = param_types(enclosing_params(text, call_at))

    def resolve(ident):
        t = declared.get(ident)
        return type_keys(t, f) if t and f else None

    at = span.find("JSON.stringify({")
    at = span.index("{", at) if at >= 0 else top_level_brace(span)
    if at >= 0:
        extra, hidden = spread_keys(object_body(span, at), resolve)
        if hidden:
            return set(), True  # a spread we can't see through, so don't guess
        return object_keys(span, at) | extra, False

    # `body:` is checked second: it would otherwise match `body: JSON` out of
    # `body: JSON.stringify(params)` and name the wrong variable
    m = re.search(r"JSON\.stringify\(\s*(\w+)\s*\)", span) or re.search(
        r"\bbody\s*:\s*(\w+)\s*[,}\n]", span
    )
    if not m:
        return set(), False
    # a FormData built above the call site: its keys live in the file, not the span
    built = set(re.findall(r'%s\.append\(\s*"(\w+)"' % re.escape(m.group(1)), text))
    keys = built or resolve(m.group(1))
    return (keys, False) if keys else (set(), True)


# parseApiResponse reads these off every payload before handing it on, so no
# route can be accused of sending them unread
ENVELOPE_KEYS = {"success", "error", "message", "details", "code"}


def enclosing_body(text: str, at: int) -> str:
    """Source of the innermost brace-delimited body containing `at`."""
    depth, i = 0, at
    while i > 0:
        i -= 1
        if text[i] == "}":
            depth += 1
        elif text[i] == "{":
            if depth == 0:
                return balanced_span(text, i)
            depth -= 1
    return ""


def pattern_keys(pat: str):
    """Names bound by a destructuring pattern, or None if it hides some."""
    if "..." in pat:
        return None
    return {
        p.split(":")[0].split("=")[0].strip()
        for p in pat.strip("{} \r\n").split(",")
        if p.strip()
    }


def destructure_keys(before: str):
    pat = re.search(r"(\{[^{}]*\})\s*=$", before)
    return pattern_keys(pat.group(1)) if pat else None


def local_reads(body: str, name: str):
    """Top-level keys read off local `name` in `body`, or None when `name`
    escapes somewhere this scan can't follow: returned whole, handed to a
    callee, spread. None means "unknown", never "reads nothing"."""
    keys = set()
    for m in re.finditer(word_re(name), body):
        before, after = body[: m.start()].rstrip(), body[m.end() :].lstrip()
        if before.endswith(("const", "let", "var")):
            continue  # the declaration itself
        access = re.match(r"\??\.(\w+)(?:\??\.(\w+))?", after)
        if access:
            keys.add(access.group(1))
            if access.group(2):  # `data.user.name`: one level of nesting
                keys.add("%s.%s" % (access.group(1), access.group(2)))
            continue
        if before.endswith("="):  # `const { a, b } = data`
            sub = destructure_keys(before)
            if sub is None:
                return None
            keys |= sub
            continue
        return None
    return keys


def response_reads(text: str, at: int):
    """Top-level response keys the call site whose first argument starts at
    `at` visibly reads, or None when the response escapes this function.

    A raw-fetch call site is followed one hop through `parseApiResponse(res)`,
    which is where the payload (rather than the Response) gets its name.
    """
    body = enclosing_body(text, at)
    name = bound_local(text, at)
    for _ in range(3):
        if name is None:
            return None
        if name.startswith("{"):
            return pattern_keys(name)
        hop = re.search(
            r"(?:const|let|var)\s+(\{[^{}]*\}|\w+)\s*=\s*(?:await\s+)?"
            r"parseApiResponse\s*(?:<.*?>)?\s*\(\s*%s\s*[,)]" % re.escape(name),
            body,
            re.S,
        )
        if not hop:
            return local_reads(body, name)
        name = hop.group(1)
    return None


def bound_local(text: str, at: int):
    """Name (or destructuring pattern) the call whose first argument starts at
    `at` is assigned to, or None when its result isn't bound to a local here --
    `return apiCall(...)`, a concise arrow body, a fire-and-forget await."""
    m = re.search(
        r"(?:const|let|var)\s+(\{[^{}]*\}|\w+)\s*=\s*(?:await\s+)?"
        r"[A-Za-z_$][\w.$]*\s*(?:<.*?>)?\s*\(\s*$",
        text[:at],
        re.S,
    )
    return m.group(1) if m else None


NON_CALL_IDENTS = ("startsWith", "endsWith", "includes", "indexOf", "lastIndexOf")


def call_ident(text: str, quote: int):
    """Identifier of the call whose argument slot `quote` sits in, or None
    when the string isn't immediately inside a call. Rejects `/api/...`
    strings that are never HTTP calls: JSDoc mentions and guards like
    `routeOf(url).startsWith("/api/auth/")`."""
    j = quote - 1
    while j >= 0 and text[j] in " \t\r\n":
        j -= 1
    if j < 0 or text[j] != "(":
        return None
    k = j - 1
    while k >= 0 and (text[k].isalnum() or text[k] in "_$"):
        k -= 1
    return text[k + 1 : j]


def parse_app():
    calls = []
    for f in app_sources(APP_ROOT / "src"):
        text = read_source(f)
        # the string may be prefixed, e.g. `${API_BASE_URL}/api/x`
        for m in API_PATH_LITERAL.finditer(text):
            if not is_call_argument(text, m.start()):
                continue
            if call_ident(text, m.start()) in NON_CALL_IDENTS:
                continue
            calls.append(app_call(f, text, m))
    return calls


_all_app_text = None


def all_app_text() -> str:
    """Every app source file concatenated: the basis for the "does this
    identifier appear anywhere in the app at all" checks."""
    global _all_app_text
    if _all_app_text is None:
        src = APP_ROOT / "src"
        _all_app_text = "\n".join(
            read_source(p)
            for p in list(src.glob("**/*.ts")) + list(src.glob("**/*.tsx"))
        )
    return _all_app_text


def unused_client_methods():
    src = APP_ROOT / "src"
    all_text = all_app_text()
    out = []
    for f in sorted(src.glob("**/services/on/*.ts")) + sorted(
        src.glob("**/services/on/*.tsx")
    ):
        text = read_source(f)
        for m in re.finditer(r"^\s{2}(\w+):\s*(?:async\s*)?\(", text, re.M):
            name = m.group(1)
            # a bare `api.foo,` reference counts too: methods get passed as values
            if not re.search(r"[.\[\"']%s\b" % re.escape(name), all_text):
                out.append(
                    {
                        "name": name,
                        "file": str(f.relative_to(APP_ROOT)).replace("\\", "/"),
                        "line": text[: m.start()].count("\n") + 1,
                    }
                )
    return out


# ---------------------------------------------------------------- audit


def never_sent(route, calls) -> list:
    """Keys the server route reads that no app call site to it ever sends --
    drift in the other direction from `contract_drift`: a required field the
    app omits (a guaranteed 400) or an optional knob it never turns on.
    Judged per route, not per call site, since sibling call sites legitimately
    send different subsets. Skipped for a channel any call site leaves
    unreadable (a spread, `JSON.stringify(params)`, an interpolated query),
    because then the sent set is a floor rather than the truth.
    """
    out = []
    for field, unknown in (("body", "body_open"), ("query", "dynamic_query")):
        if any(c[unknown] for c in calls):
            continue
        sent = set().union(*[c[field] for c in calls])
        gap = route[field] - sent
        if gap:
            out.append((field, sorted(gap)))
    return out


def never_read(route, calls, app_text: str) -> list:
    """Response keys the route sends that the app never reads.

    Judged per route whenever every call site's use of the response is
    visible: the union of what those sites read is then the whole truth.
    If any site hands the response somewhere this scan can't follow, it falls
    back to the whole-app test: a key whose name appears in no app file at all
    is read by no code path, dynamic access included. That fallback trades
    recall for a claim that can't be wrong.
    """
    keys = route["response"] - ENVELOPE_KEYS
    if all(c["reads"] is not None for c in calls):
        read = set().union(*[c["reads"] for c in calls])
        # a `parent.child` key is only judgeable when the app looks inside
        # `parent` at all. A parent taken whole hides what happens to it
        return sorted(
            k
            for k in keys
            if k not in read
            and ("." not in k or any(r.startswith(k.split(".")[0] + ".") for r in read))
        )
    return sorted(
        k
        for k in keys
        if not re.search(word_re(k.split(".")[-1]), app_text)
    )


def route_drift(c, s):
    # a keyless server read (req.body[key], whole-object pass) can consume
    # any of the sent keys, so per-key drift is unjudgeable for that route
    unread_body = set() if s["body_open"] else c["body"] - s["body"]
    unread_query = (
        set() if c["dynamic_query"] or s["query_open"] else c["query"] - s["query"]
    )
    if not (unread_body or unread_query):
        return None
    return {
        "method": c["method"],
        "path": c["path"],
        "app": "%s:%d" % (c["file"], c["line"]),
        "server": "%s:%d" % (s["file"], s["line"]),
        "body_sent_never_read": sorted(unread_body),
        "query_sent_never_read": sorted(unread_query),
    }


def response_gaps(server, app):
    unsent, unread_response = [], []
    app_text = all_app_text()
    for s in server:
        calls = [
            c for c in app
            if c["method"] == s["method"] and paths_match(c["path"], s["path"])
        ]
        if not calls:
            continue  # a route nothing calls is already reported as dead
        where = "%s:%d" % (s["file"], s["line"])
        unsent += [
            {
                "method": s["method"],
                "path": s["path"],
                "server": where,
                "channel": field,
                "keys": keys,
            }
            for field, keys in never_sent(s, calls)
        ]
        keys = never_read(s, calls, app_text)
        if keys:
            unread_response.append(
                {"method": s["method"], "path": s["path"], "server": where, "keys": keys}
            )
    return unsent, unread_response


def extracted_unused(server, app):
    def was_sent(s, e) -> bool:
        field = "body" if e["source"] == REQ_BODY else "query"
        return any(
            c["method"] == s["method"] and paths_match(c["path"], s["path"])
            and e["key"] in c[field]
            for c in app
        )

    def entry(s, e, stage):
        return {
            "method": s["method"],
            "path": s["path"],
            "server": "%s:%d" % (s["file"], s["line"]),
            "key": e["key"],
            "stage": stage,
            "sent_by_app": was_sent(s, e),
        }

    out = []
    for s in server:
        out += [
            entry(s, e, "extracted in the route handler, never referenced again")
            for e in s["dead_after_read"]
        ]
        out += [
            entry(s, e, "passed to %s() as `%s`, never referenced there [%s]"
                  % (e["passed_to"], e["callee_param"], e["callee_file"]))
            for e in s["dead_in_callee"]
        ]
    return out


def audit():
    server, app = parse_server(), parse_app()
    missing, drift = [], []
    hit = set()

    for c in app:
        same_path = [s for s in server if paths_match(c["path"], s["path"])]
        exact = [s for s in same_path if s["method"] == c["method"]]
        if not same_path:
            missing.append({**c, "reason": "no server route"})
            continue
        if not exact:
            missing.append(
                {
                    **c,
                    "reason": "path exists, method missing (server has %s)"
                    % ",".join(sorted({s["method"] for s in same_path})),
                }
            )
            continue
        s = exact[0]
        hit.add((s["method"], s["path"], s["file"], s["line"]))
        d = route_drift(c, s)
        if d:
            drift.append(d)

    unsent, unread_response = response_gaps(server, app)

    dead = [
        s
        for s in server
        if (s["method"], s["path"], s["file"], s["line"]) not in hit
        and not s["external"]
    ]

    extracted_but_unused = extracted_unused(server, app)

    unused_params = [
        {
            "method": s["method"],
            "path": s["path"],
            "server": "%s:%d" % (s["file"], s["line"]),
            "param": p,
            "called_by_app": (s["method"], s["path"], s["file"], s["line"]) in hit,
        }
        for s in server
        for p in s["dead_params"]
    ]

    return {
        "missing_on_server": missing,
        "dead_server_endpoints": dead,
        "unused_client_methods": unused_client_methods(),
        "contract_drift": drift,
        "read_but_never_sent": unsent,
        "sent_but_never_read_by_app": unread_response,
        "extracted_but_unused": extracted_but_unused,
        "unused_route_params": unused_params,
        "totals": {"server_routes": len(server), "app_calls": len(app)},
    }


def report(r):
    print(
        "Server routes: %d | App call sites: %d\n"
        % (r["totals"]["server_routes"], r["totals"]["app_calls"])
    )

    print(
        "== App calls with no server implementation (%d)" % len(r["missing_on_server"])
    )
    for c in r["missing_on_server"]:
        print(
            "  %-6s %-55s %s  [%s:%d]"
            % (c["method"], c["path"], c["reason"], c["file"], c["line"])
        )

    print(
        "\n== Dead server endpoints, never called by the app (%d)"
        % len(r["dead_server_endpoints"])
    )
    for s in r["dead_server_endpoints"]:
        print("  %-6s %-55s %s:%d" % (s["method"], s["path"], s["file"], s["line"]))

    print(
        "\n== Client api methods nothing calls (%d)" % len(r["unused_client_methods"])
    )
    for m in r["unused_client_methods"]:
        print("  %-30s %s:%d" % (m["name"], m["file"], m["line"]))

    print("\n== Contract drift (%d)" % len(r["contract_drift"]))
    for d in r["contract_drift"]:
        bits = [
            "%s %s" % (channel, d["%s_sent_never_read" % channel])
            for channel in ("body", "query")
            if d["%s_sent_never_read" % channel]
        ]
        print(
            "  %-6s %-45s sends but server ignores: %s"
            % (d["method"], d["path"], "; ".join(bits))
        )
        print("         app %s -> server %s" % (d["app"], d["server"]))

    print(
        "\n== Server reads it, app never sends it (%d)" % len(r["read_but_never_sent"])
    )
    for u in r["read_but_never_sent"]:
        print(
            "  %-6s %-45s %s %s  [%s]"
            % (u["method"], u["path"], u["channel"], u["keys"], u["server"])
        )

    print(
        "\n== Server sends it, app never reads it (%d)"
        % len(r["sent_but_never_read_by_app"])
    )
    for u in r["sent_but_never_read_by_app"]:
        print("  %-6s %-45s %s  [%s]" % (u["method"], u["path"], u["keys"], u["server"]))

    print(
        "\n== Extracted but unused: read, then dead weight (%d)"
        % len(r["extracted_but_unused"])
    )
    for e in r["extracted_but_unused"]:
        flag = (
            "sent by the app"
            if e["sent_by_app"]
            else "not currently sent by the app either"
        )
        print("  %-6s %-45s %s" % (e["method"], e["path"], e["key"]))
        print("         %s: %s [%s]" % (e["stage"], flag, e["server"]))

    print(
        "\n== Route params declared but never read (%d)"
        % len(r["unused_route_params"])
    )
    for p in r["unused_route_params"]:
        flag = "called by the app" if p["called_by_app"] else "never called"
        print("  %-6s %-45s :%s  [%s] %s" % (p["method"], p["path"], p["param"], p["server"], flag))


def self_test():
    param_route = "/api/x/" + PARAM
    settings_route = "/api/x/settings"
    assert is_test(Path("src/a/__tests__/b.ts"))
    assert is_test(Path("src/a/b.test.tsx"))
    assert not is_test(Path("src/a/b.ts"))
    assert normalize("/api/x/${id}?limit=1") == param_route
    assert normalize("/api/x/:id/") == param_route
    assert is_call_argument("f(`/api/x`)", 2)
    assert not is_call_argument("return `/api/x`", 7)
    assert paths_match(settings_route, settings_route)
    assert paths_match(settings_route, param_route)
    assert not paths_match("/api/x/a/b", param_route)
    src = (
        'f(`/api/x`, { method: "POST", body: JSON.stringify({ a, b: 1, c: {d: 2} }) })'
    )
    assert object_keys(src, src.index("{", src.index("JSON.stringify"))) == {
        "a",
        "b",
        "c",
    }
    sendjson_src = 'sendJson(`/api/x/${id}`, "PATCH", { a: 1 })'
    m = API_PATH_LITERAL.search(sendjson_src)
    assert app_call(APP_ROOT / "f.ts", sendjson_src, m)["method"] == "PATCH"
    assert server_keys("const { a, b } = req.body\nreq.body.c", REQ_BODY) == {
        "a",
        "b",
        "c",
    }
    assert server_keys("const { a } =\n  req.body", REQ_BODY) == {"a"}
    assert server_keys("queryLimit(req, { def: 1, max: 2 })", REQ_QUERY) == {"limit"}
    assert server_keys(
        'queryLimit(req, { def: 1, max: 2, key: "days" })', REQ_QUERY
    ) == {"days"}
    assert external_marked("// api-audit: external\nrouter.get(", 22)
    assert not external_marked("router.get(", 0)

    # extraction bindings & aliasing
    assert object_bindings("{ a, b: renamed }", 0) == ({"a": "a", "b": "renamed"}, [])
    assert object_bindings("{ a, ...rest }", 0) == ({"a": "a"}, ["rest"])

    # unused-after-extraction, at the handler level
    clean = "const { dayNumber, split } = req.body\ndoThing(dayNumber, split)"
    assert unused_extractions(clean) == []
    dirty = "const { dayNumber, unused } = req.body\nconst split = req.body.split\ndoThing(dayNumber, split)"
    dead = unused_extractions(dirty)
    assert {"source": REQ_BODY, "key": "unused", "binding": "unused"} in dead
    assert not any(d["key"] in ("dayNumber", "split") for d in dead)
    # a bare req.body.x read is used at the point of read, never flagged
    assert unused_extractions("doThing(req.body.foo)") == []
    # the escape hatch silences a real dead binding
    suppressed = (
        "// api-audit: used\nconst { dayNumber, unused } = req.body\ndoThing(dayNumber)"
    )
    assert unused_extractions(suppressed) == []

    # following a call one hop into an imported function
    assert call_args('doThing(a, b, c(1,2), "x,y")', "doThing") == [
        ["a", "b", "c(1,2)", '"x,y"']
    ]
    model_src = (
        "export async function doThing(\n"
        "  userId: number,\n"
        "  usedParam: number,\n"
        "  deadParam: number,\n"
        "): Promise<{ ok: boolean }> {\n"  # brace-in-return-type regression case
        "  return { ok: usedParam > userId }\n"
        "}\n"
    )
    fn = find_function(model_src, "doThing")
    assert fn["params"] == ["userId", "usedParam", "deadParam"]
    assert binding_used_again(fn["body"], "usedParam", 0)
    assert not binding_used_again(fn["body"], "deadParam", 0)

    imp = named_imports('import { a, b as bb } from "./model.js"', Path("/x"))
    # resolve() both sides: on Windows it pins the root to the current drive
    assert imp["a"] == (Path("/x/model.ts").resolve(), "a")
    assert imp["bb"] == (Path("/x/model.ts").resolve(), "b")

    # comments must not desync the bracket scanners
    tricky_src = (
        "export async function doThing(a: number, b: string) {\n"
        "  // don't drop b just because the comment has an apostrophe }\n"
        "  return a + b.length\n"
        "}\n"
    )
    fn = find_function(tricky_src, "doThing")
    assert fn and fn["params"] == ["a", "b"]
    assert binding_used_again(fn["body"], "b", 0)
    assert not binding_used_again(fn["body"], "neverRead", 0)

    # optional chaining reads count as reads
    assert server_keys("const p = req.body?.refreshToken", REQ_BODY) == {
        "refreshToken"
    }

    # keyless server reads make per-key drift unjudgeable
    assert open_reads("for (const k of KEYS) { v = req.body[k] }", REQ_BODY)
    assert open_reads("await updateSetTiming(1, 2, 3, req.body)", REQ_BODY)
    assert open_reads("const x = req.body", REQ_BODY)
    assert not open_reads("const { a } = req.body", REQ_BODY)
    assert not open_reads("const { a } = req.body ?? {}", REQ_BODY)
    assert open_reads("f(req.query)", REQ_QUERY)
    assert not open_reads("const q = req.query.limit", REQ_QUERY)

    # declared-but-unread path params
    assert unused_route_params("/x/:muscle/follow-ups", "s(req.params.muscle)") == []
    assert unused_route_params("/x/:muscle/:id", "s(req.params.muscle)") == ["id"]
    assert unused_route_params("/x/:id", "s(req.params[id])") == []
    assert unused_route_params("/x/:id", "// api-audit: used\ns(1)") == []

    # phantom app call sites
    doc = 'export type T = 1 /* `/api/program/upload replaces the` */\n'
    m = API_PATH_LITERAL.search(doc)
    assert not is_call_argument(doc, m.start())
    guard = 'if (routeOf(url).startsWith("/api/auth/")) reject()\n'
    m = API_PATH_LITERAL.search(guard)
    assert is_call_argument(guard, m.start())
    assert call_ident(guard, m.start()) == "startsWith"
    real = 'apiCall(`/api/sessions/${id}`, { method: "PATCH" })\n'
    m = API_PATH_LITERAL.search(real)
    assert call_ident(real, m.start()) == "apiCall"

    tpl = '`/a?x=${ids.join(",")}`, rest'
    assert tpl[template_end(tpl, 0)] == "`" and template_end(tpl, 0) == tpl.index("`,")

    # nested template literals truncate the path string
    nested = '`/api/x/stats${query ? `?${query}` : ""}`'
    m = API_PATH_LITERAL.search(nested)
    assert truncated(m.group(1))
    c = app_call(APP_ROOT / "f.ts", nested, m)
    assert c["path"] == "/api/x/stats"
    assert c["body_open"] and c["dynamic_query"]

    # body keys from a wrapper's object argument, not just JSON.stringify
    assert app_body(', "POST", { dayNumber, split: s })') == ({"dayNumber", "split"}, False)
    assert app_body(', { method: "POST", body: JSON.stringify({ a: 1 }) })') == (
        {"a"},
        False,
    )
    # a body we can't read the keys of is open, not empty
    assert app_body(', { method: "POST", body: JSON.stringify(params) })') == (
        set(),
        True,
    )
    assert app_body(', { method: "POST", body: formData })') == (set(), True)
    assert app_body(', { method: "DELETE" })') == (set(), False)
    # a conditional spread of a literal keeps its keys, an opaque one suppresses
    assert app_body(', "POST", { a, ...(flag && { b: true }) })') == ({"a", "b"}, False)
    assert app_body(', "POST", { a, ...rest })') == (set(), True)
    # a FormData filled above the call site
    assert app_body(
        ', { method: "POST", body: fd })',
        'const fd = new FormData()\nfd.append("photo", x)\nfd.append("note", n)\n',
    ) == ({"photo", "note"}, False)
    assert upload_fields('router.post("/", up.single("photo"), async (req', 0) == {"photo"}

    # server reads a key no call site sends
    route = {"body": {"a", "b"}, "query": {"limit"}}
    sends_a = {"body": {"a"}, "query": set(), "body_open": False, "dynamic_query": False}
    assert never_sent(route, [sends_a]) == [("body", ["b"]), ("query", ["limit"])]
    sends_b = {"body": {"b"}, "query": {"limit"}, "body_open": False, "dynamic_query": False}
    assert never_sent(route, [sends_a, sends_b]) == []
    opaque = {"body": set(), "query": set(), "body_open": True, "dynamic_query": True}
    assert never_sent(route, [opaque]) == []

    # response keys the app can't be reading
    handler = (
        '(req, res) => {\n'
        '  if (!ok) return res.status(400).json({ success: false, error: "no" })\n'
        '  res.json({ success: true, alreadyEnded, rows: r.map(x => ({ id: x.id })) })\n'
        '  res.json(passthrough)\n'
        "}"
    )
    # a non-literal response contributes nothing, a nested literal contributes
    # `parent.child` (but only one level, and not from inside a callback)
    assert response_keys(handler) == {"success", "error", "alreadyEnded", "rows"}
    user_id, user_name = "user.id", "user.name"
    assert response_keys('res.json({ ok: 1, user: { id, name } })') == {
        "ok",
        "user",
        user_id,
        user_name,
    }
    nested = {"response": {"user", user_id, user_name}}
    # the app opens `user` up but never touches `name`
    assert never_read(nested, [{"reads": {"user", user_id}}], "") == [user_name]
    # the app takes `user` whole: what it does with the insides is unknowable
    assert never_read(nested, [{"reads": {"user"}}], "") == []
    route = {"response": {"success", "alreadyEnded"}}
    # the envelope is always read, the rest falls back to the whole-app test
    # while any call site's use of the response is invisible
    opaque_read = [{"reads": None}]
    assert never_read(route, opaque_read, "nothing relevant here") == ["alreadyEnded"]
    assert never_read(route, opaque_read, "res.alreadyEnded") == []
    # once every call site is visible, only what they actually read counts
    assert never_read(route, [{"reads": {"session"}}], "res.alreadyEnded") == [
        "alreadyEnded"
    ]

    # what a call site reads off its response
    src = (
        "const getUser = async () => {\n"
        '  const data = await apiCall<{ user: AuthUser }>("/api/auth/me")\n'
        "  return data.user\n"
        "}\n"
        "const raw = async () => {\n"
        '  const res = await http(`/api/sessions`, { method: "GET" })\n'
        "  const d = await parseApiResponse<{ sessions?: S[] }>(res)\n"
        "  return (d.sessions ?? []).length\n"
        "}\n"
        "const opaque = async () => {\n"
        '  const data = await apiCall("/api/program")\n'
        "  return data\n"
        "}\n"
    )
    assert response_reads(src, src.index('"/api/auth/me"')) == {"user"}
    # a raw fetch is followed one hop through parseApiResponse to the payload
    assert response_reads(src, src.index("`/api/sessions`")) == {"sessions"}
    # a response handed back whole is unknowable, not empty
    assert response_reads(src, src.index('"/api/program"')) is None
    assert response_reads(src, 0) is None  # not bound to a local at all
    assert local_reads("const { a, ...rest } = d", "d") is None

    # route slices stop at the route's own closing paren
    route_src = (
        'router.get("/a", (req, res) => { res.json(req.query.split) })\n'
        "function helper(req) { return req.query.ghost }\n"
    )
    m = re.search(r'router\.(get)\(\s*("[^"]*")', route_src)
    assert "ghost" not in handler_span(route_src, m)

    print("self-test ok")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--server-root", type=Path, help="server src/ to audit against (default: sibling checkout)")
    a = p.parse_args()
    if a.server_root:
        SERVER_ROOT = a.server_root.resolve()
    if a.self_test:
        self_test()
        sys.exit(0)
    r = audit()
    print(json.dumps(r, indent=2, default=sorted)) if a.json else report(r)
    found = sum(
        len(r[k])
        for k in (
            "missing_on_server",
            "dead_server_endpoints",
            "unused_client_methods",
            "contract_drift",
            "read_but_never_sent",
            "sent_but_never_read_by_app",
            "extracted_but_unused",
            "unused_route_params",
        )
    )
    sys.exit(1 if found else 0)
