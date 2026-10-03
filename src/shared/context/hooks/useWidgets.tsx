import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useTwoFingerPull } from "@shared/context/hooks/useTwoFingerPull"
import { saveToStorage, loadFromStorage } from "@shared/services/storage"
import { generateId } from "@utils/format"
import type {
  WidgetInstance,
  WidgetDefinition,
} from "@shared/types"
import { captureException, metric, trackFeature } from "@shared/services/crashReporting"
import { showToast } from "@shared/components/toast"

function sortByOrder<T extends string>(
  list: WidgetInstance<T>[],
): WidgetInstance<T>[] {
  return [...list].sort((a, b) => a.order - b.order)
}

/**
 * Each screen supplies its own widget-type union (via `T`), registry, defaults
 * and storage key, so boards never share storage or type space.
 */
interface UseWidgetsConfig<T extends string> {
  registry: Record<T, WidgetDefinition<T>>
  defaults: WidgetInstance<T>[]
  /** Storage key this screen's widget layout is persisted under. */
  storageKey: string
  /** Skip the storage load until true, for boards on tabs not yet visited. Defaults to true. */
  enabled?: boolean
}

export function useWidgets<T extends string>(
  userId: string | null,
  { registry, defaults, storageKey, enabled = true }: UseWidgetsConfig<T>,
) {
  const [widgets, setWidgets] = useState<WidgetInstance<T>[]>(defaults)
  const [isLoaded, setIsLoaded] = useState<boolean>(false)
  const isMountedRef = useRef<boolean>(true)
  // Keep a ref mirror of widgets so callbacks that must be stable
  // (e.g. things fired from a gesture handler) always see the latest
  // list instead of a stale closure captured at mount time.
  const widgetsRef = useRef<WidgetInstance<T>[]>([])

  useEffect(() => {
    widgetsRef.current = widgets
  }, [widgets])

  // Read through refs so a screen passing an inline literal doesn't reload the
  // board on every render: the load is keyed on the user and the storage key.
  const registryRef = useRef(registry)
  registryRef.current = registry
  const defaultsRef = useRef(defaults)
  defaultsRef.current = defaults

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // (Re)load whenever the active user (or the screen's storage key) changes.
  // `enabled` lets a screen with several tabbed boards defer a board's load
  // until its tab is actually visited, instead of hitting SQLite for all of
  // them on mount.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setIsLoaded(false)
    ;(async () => {
      try {
        const stored = await loadFromStorage<WidgetInstance<T>[]>(
          storageKey,
          userId,
        )
        if (cancelled) return
        // Drop instances whose type is no longer in the registry, so a widget
        // removed from the app doesn't linger in an already-saved layout.
        const known = stored?.filter((w) => w.type in registryRef.current) ?? []
        if (stored && known.length < stored.length) {
          metric.count("widgets.dropped", stored.length - known.length, {
            attributes: { board: storageKey },
          })
        }
        setWidgets(known.length > 0 ? sortByOrder(known) : defaultsRef.current)
      } catch (error) {
        console.error("Error loading widgets:", error)
        metric.count("widgets.load_failed", 1, {
          attributes: { board: storageKey },
        })
        captureException(error, { board: storageKey, stage: "loadWidgets" })
        if (!cancelled) setWidgets(defaultsRef.current)
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, storageKey, enabled])

  // Applied optimistically so the board feels instant, but a failed write is
  // rolled back. Otherwise the new layout looks saved and silently reverts on
  // the next launch.
  const persist = useCallback(
    async (next: WidgetInstance<T>[]) => {
      if (!isMountedRef.current) return
      const previous = widgetsRef.current
      setWidgets(next)
      widgetsRef.current = next
      let error: unknown = null
      try {
        // saveToStorage swallows its own errors and reports failure by
        // returning false, so only a bug in it throws.
        if (!(await saveToStorage(storageKey, next, userId))) {
          error = new Error("Widget layout write returned false")
        }
      } catch (err) {
        error = err
      }
      if (error) {
        console.error("Error saving widgets:", error)
        metric.count("widgets.save_failed", 1, {
          attributes: { board: storageKey },
        })
        captureException(error, { board: storageKey, stage: "saveWidgets" })
        widgetsRef.current = previous
        if (isMountedRef.current) setWidgets(previous)
        showToast("Couldn't save your layout, change undone")
      }
    },
    [userId, storageKey],
  )

  const addWidget = useCallback(
    async (type: T): Promise<{ success: boolean; error?: string }> => {
      const def = registry[type]
      if (!def) return { success: false, error: "Unknown widget type" }

      const current = widgetsRef.current
      if (current.some((w) => w.type === type)) {
        return {
          success: false,
          error: `${def.title} is already on this board`,
        }
      }

      const instance: WidgetInstance<T> = {
        id: generateId("widget"),
        type,
        size: def.defaultSize,
        order: current.length,
      }

      await persist([...current, instance])
      trackFeature("widgets", "add", { board: storageKey, widget: type })
      return { success: true }
    },
    [persist, registry, storageKey],
  )

  const removeWidget = useCallback(
    async (id: string) => {
      const next = widgetsRef.current
        .filter((w) => w.id !== id)
        .map((w, index) => ({ ...w, order: index }))
      await persist(next)
      trackFeature("widgets", "remove", { board: storageKey })
    },
    [persist, storageKey],
  )

  const cycleWidgetSize = useCallback(
    async (id: string) => {
      const current = widgetsRef.current
      const target = current.find((w) => w.id === id)
      if (!target) return
      const def = registry[target.type]
      const options = def.availableSizes
      if (options.length <= 1) return

      const currentIndex = options.indexOf(target.size)
      const nextSize = options[(currentIndex + 1) % options.length]

      await persist(
        current.map((w) => (w.id === id ? { ...w, size: nextSize } : w)),
      )
      trackFeature("widgets", "resize", { board: storageKey, widget: target.type, size: nextSize })
    },
    [persist, registry, storageKey],
  )

  const reorderWidgets = useCallback(
    async (orderedIds: string[]) => {
      const byId = new Map(widgetsRef.current.map((w) => [w.id, w]))
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((w): w is WidgetInstance<T> => !!w)
        .map((w, index) => ({ ...w, order: index }))
      await persist(next)
      trackFeature("widgets", "reorder", { board: storageKey })
    },
    [persist, storageKey],
  )

  const availableToAdd: WidgetDefinition<T>[] = useMemo(
    () =>
      (Object.values(registry) as WidgetDefinition<T>[]).filter(
        (def) => !widgets.some((w) => w.type === def.type),
      ),
    [registry, widgets],
  )
  const sortedWidgets = useMemo(() => sortByOrder(widgets), [widgets])

  return {
    widgets: sortedWidgets,
    isLoaded,
    availableToAdd,
    addWidget,
    removeWidget,
    cycleWidgetSize,
    reorderWidgets,
  }
}

interface UseWidgetBoardOptions {
  /** Reports why a widget couldn't be added. Screens with alert plumbing pass their `alert`. Without one the failure is only logged. */
  onError?: (message: string) => void
  /** Ignore the two-finger pull while false, for tabs that host no widgets. Defaults to true. */
  pullEnabled?: boolean
}

/**
 * The chrome around a board: gallery visibility, edit mode, and the two-finger
 * pull that opens the gallery. Split from `useWidgets` because the tabbed
 * screens run several boards behind one shared gallery, so they pass whichever
 * board is currently active.
 */
export function useWidgetBoard<T extends string>(
  addWidget: (type: T) => Promise<{ success: boolean; error?: string }>,
  { onError, pullEnabled = true }: UseWidgetBoardOptions = {},
) {
  const [galleryVisible, setGalleryVisible] = useState<boolean>(false)
  const [editMode, setEditMode] = useState<boolean>(false)

  const { panHandlers, isPulling, pullArmed } = useTwoFingerPull(() => {
    if (pullEnabled) setGalleryVisible(true)
  })

  const openGallery = useCallback(() => setGalleryVisible(true), [])
  const closeGallery = useCallback(() => setGalleryVisible(false), [])

  const editWidgets = useCallback(() => {
    setGalleryVisible(false)
    setEditMode(true)
  }, [])

  const add = useCallback(
    async (type: T) => {
      const { success, error } = await addWidget(type)
      if (!success && error) {
        metric.count("widgets.add_rejected")
        if (onError) onError(error)
        else console.error("Can't add widget:", error)
        return
      }
      setGalleryVisible(false)
    },
    [addWidget, onError],
  )

  return {
    galleryVisible,
    openGallery,
    closeGallery,
    editMode,
    setEditMode,
    editWidgets,
    add,
    panHandlers,
    isPulling,
    pullArmed,
  }
}
