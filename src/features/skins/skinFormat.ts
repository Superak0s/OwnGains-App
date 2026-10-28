import { DARK_COLORS, LIGHT_COLORS, isDarkColor, type AppTheme, type ThemeColors } from "@shared/context/ThemeContext"
import type { WidgetInstance, WidgetSize } from "@shared/types"
import { generateId } from "@utils/format"
import { isSkinBoardId, type SkinBoardId } from "./boards"

export const MAX_SKIN_BYTES = 65536

export interface SkinWidget {
  type: string
  size: WidgetSize
  order: number
  title?: string
  icon?: string
  subtitle?: string
}

export interface SkinDocument {
  format: 1
  theme?: { name: string; colors: Partial<Record<keyof ThemeColors, string>> }
  boards?: Partial<Record<SkinBoardId, SkinWidget[]>>
}

export type SkinBoards = Partial<Record<SkinBoardId, WidgetInstance[]>>

export interface ParsedSkin {
  theme: ThemeColors | null
  themeName: string | null
  boards: SkinBoards
  droppedBoards: number
}

export class SkinFormatError extends Error {}

const SIZES = new Set(["small", "medium", "large"])
const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i
const COLOR_KEYS = new Set(Object.keys(LIGHT_COLORS))

const fail = (message: string): never => {
  throw new SkinFormatError(message)
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

const optionalText = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined)

function parseTheme(v: unknown): { name: string; colors: ThemeColors } {
  if (!isObject(v) || !isObject(v.colors)) return fail("The skin's theme is damaged.")
  const name = optionalText(v.name, 60) ?? "Imported theme"
  const picked: Partial<ThemeColors> = {}
  for (const [key, value] of Object.entries(v.colors)) {
    if (!COLOR_KEYS.has(key)) continue
    if (typeof value !== "string" || !COLOR.test(value)) fail(`The theme color "${key}" is not a valid color.`)
    picked[key as keyof ThemeColors] = value as string
  }
  const base = picked.background && isDarkColor(picked.background) ? DARK_COLORS : LIGHT_COLORS
  return { name, colors: { ...base, ...picked } }
}

function parseWidget(v: unknown, board: string): WidgetInstance {
  if (!isObject(v) || typeof v.type !== "string" || !/^\w{1,64}$/.test(v.type))
    return fail(`A widget on the ${board} board is damaged.`)
  if (typeof v.size !== "string" || !SIZES.has(v.size)) fail(`A widget on the ${board} board has an unknown size.`)
  const order = Number.isInteger(v.order) ? (v.order as number) : 0
  const w: WidgetInstance = { id: generateId("widget"), type: v.type, size: v.size as WidgetSize, order }
  const title = optionalText(v.title, 60)
  const icon = optionalText(v.icon, 40)
  const subtitle = optionalText(v.subtitle, 60)
  if (title) w.title = title
  if (icon) w.icon = icon
  if (subtitle) w.subtitle = subtitle
  return w
}

/** Validates a skin document from the marketplace or a file. Throws `SkinFormatError` with a message for the user. */
export function parseSkin(input: unknown): ParsedSkin {
  if (JSON.stringify(input ?? null).length > MAX_SKIN_BYTES) fail("This skin is too large.")
  if (!isObject(input) || input.format !== 1) return fail("This is not an OwnGains skin, or it needs a newer app version.")
  const theme = input.theme === undefined ? null : parseTheme(input.theme)
  const boards: SkinBoards = {}
  let droppedBoards = 0
  if (input.boards !== undefined) {
    if (!isObject(input.boards)) fail("The skin's widget layouts are damaged.")
    for (const [id, list] of Object.entries(input.boards as Record<string, unknown>)) {
      if (!isSkinBoardId(id)) {
        droppedBoards += 1
        continue
      }
      if (!Array.isArray(list)) fail(`The ${id} layout is damaged.`)
      const seen = new Set<string>()
      boards[id] = (list as unknown[])
        .slice(0, 40)
        .map((w) => parseWidget(w, id))
        .filter((w) => !seen.has(w.type) && seen.add(w.type))
        .sort((a, b) => a.order - b.order)
    }
  }
  if (!theme && !Object.keys(boards).length && !droppedBoards) fail("This skin has no theme or widget layouts.")
  return { theme: theme?.colors ?? null, themeName: theme?.name ?? null, boards, droppedBoards }
}

/** Turns a theme and widget layouts into a shareable skin document. Widget ids stay on the device. */
export function buildSkin(theme: AppTheme | null, boards: SkinBoards): SkinDocument {
  const doc: SkinDocument = { format: 1 }
  if (theme) doc.theme = { name: theme.name, colors: { ...theme.colors } }
  const entries = Object.entries(boards) as [SkinBoardId, WidgetInstance[]][]
  if (entries.length)
    doc.boards = Object.fromEntries(entries.map(([id, list]) => [id, list.map(({ id: _id, ...w }) => w)]))
  return doc
}
