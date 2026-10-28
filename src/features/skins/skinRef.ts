export interface SkinRef {
  id: number
  marketplace: string | null
}

const toId = (s: string) => (/^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : null)

/** Reads a skin id, a share link or an `owngains://skin/` deep link. Null for anything else. */
export function parseSkinRef(input: string): SkinRef | null {
  const s = input.trim()
  const plain = toId(s.replace(/^#/, ""))
  if (plain) return { id: plain, marketplace: null }
  const deep = /^owngains:\/\/skin\/(\d+)(?:\?(.*))?$/.exec(s)
  if (deep) {
    const id = toId(deep[1])
    if (!id) return null
    const m = new URLSearchParams(deep[2] ?? "").get("m")
    return { id, marketplace: m || null }
  }
  const link = /^(https?:\/\/.+?)\/skins\/(\d+)\/?$/.exec(s)
  const id = link && toId(link[2])
  return id ? { id, marketplace: link[1] } : null
}
