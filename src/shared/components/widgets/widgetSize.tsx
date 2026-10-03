// Lets shared content (charts, lists) grow with its widget card without
// every screen threading the size through its renderContent switch.

import { createContext, useContext } from "react"
import type { WidgetSize } from "@shared/types"

export const WidgetSizeContext = createContext<WidgetSize | null>(null)

export function useWidgetSize(): WidgetSize | null {
  return useContext(WidgetSizeContext)
}
