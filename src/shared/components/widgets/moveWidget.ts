import type { WidgetInstance } from "@shared/types"

export type MoveDirection = "up" | "down" | "left" | "right"

/** Widgets flow in a wrap container where `small` is half-width and every
 *  other size takes a full row, so the flat order has to be grouped back
 *  into visual rows before "up"/"down" mean anything. */
function buildRows<T extends string>(items: WidgetInstance<T>[]): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  for (const w of items) {
    if (w.size === "small") {
      row.push(w.id)
      if (row.length === 2) {
        rows.push(row)
        row = []
      }
    } else {
      if (row.length) {
        rows.push(row)
        row = []
      }
      rows.push([w.id])
    }
  }
  if (row.length) rows.push(row)
  return rows
}

/** New id order after nudging `id` one step in `dir`, or null if that move
 *  isn't possible (edge of the grid), which is also what greys the button out. */
export function moveWidget<T extends string>(
  items: WidgetInstance<T>[],
  id: string,
  dir: MoveDirection,
): string[] | null {
  const rows = buildRows(items)
  const r = rows.findIndex((row) => row.includes(id))
  if (r === -1) return null
  const col = rows[r].indexOf(id)

  let neighbour: string | undefined
  if (dir === "left") neighbour = rows[r][col - 1]
  else if (dir === "right") neighbour = rows[r][col + 1]
  else {
    const other = rows[dir === "up" ? r - 1 : r + 1]
    if (other) neighbour = other[Math.min(col, other.length - 1)]
  }
  if (!neighbour) return null

  const ids = items.map((w) => w.id)
  const target = ids.indexOf(neighbour)
  const next = ids.filter((x) => x !== id)
  next.splice(target, 0, id)
  return next
}
