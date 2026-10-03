// Detects a two-finger downward drag anywhere on the wrapped view, the
// same gesture Android uses to open the widget picker. Built on the
// built-in PanResponder so it needs no extra native dependencies.

import { useRef, useState } from "react"
import { PanResponder, type GestureResponderEvent } from "react-native"

// px of downward travel needed to fire onTrigger
export const TRIGGER_DISTANCE = 90

type PullPhase = "idle" | "pulling" | "armed"

const phaseFor = (dy: number): PullPhase => {
  if (dy <= 0) return "idle"
  return dy > TRIGGER_DISTANCE ? "armed" : "pulling"
}

export function useTwoFingerPull(onTrigger: () => void) {
  // Only the phase is state: a per-move distance re-rendered the whole host
  // screen on every few pixels of the gesture.
  const [phase, setPhase] = useState<PullPhase>("idle")
  const triggeredRef = useRef(false)
  // The PanResponder below is built once, so calling onTrigger directly would
  // pin it to the callback from the first render.
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  const isTwoFingerTouch = (evt: GestureResponderEvent) =>
    evt.nativeEvent.touches.length === 2

  const panResponder = useRef(
    PanResponder.create({
      // Claimed on movement only: capturing when the second finger touched down took
      // over every two-finger scroll and pinch before the ScrollView saw it.
      // The move capture still runs ahead of children, so the gesture is not
      // lost. It just has to look like a deliberate downward pull first.
      onMoveShouldSetPanResponderCapture: (evt, gestureState) =>
        isTwoFingerTouch(evt) &&
        gestureState.dy > 12 &&
        gestureState.dy > Math.abs(gestureState.dx) * 2,

      onPanResponderGrant: () => {
        triggeredRef.current = false
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!isTwoFingerTouch(evt)) {
          setPhase("idle")
          return
        }
        setPhase(phaseFor(gestureState.dy))
        if (gestureState.dy > TRIGGER_DISTANCE && !triggeredRef.current) {
          triggeredRef.current = true
          onTriggerRef.current()
        }
      },
      onPanResponderRelease: () => {
        setPhase("idle")
      },
      onPanResponderTerminate: () => {
        setPhase("idle")
      },
    }),
  ).current

  return {
    panHandlers: panResponder.panHandlers,
    isPulling: phase !== "idle",
    pullArmed: phase === "armed",
  }
}
