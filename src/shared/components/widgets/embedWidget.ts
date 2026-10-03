import type { WidgetInstance } from "@shared/types"

/** A throwaway instance for a widget rendered outside its own board. The
 *  surrounding card sets id/size/order, the renderer only reads the type. */
export function embedInstance<T extends string>(type: T): WidgetInstance<T> {
  return { id: `embed-${type}`, type, size: "medium", order: 0 }
}
