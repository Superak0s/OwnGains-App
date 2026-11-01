import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from "react"
import {
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Modal,
  Animated,
} from "react-native"
import { Text } from "@shared/components/Text"
import { useTheme, type ThemeColors } from "../context/ThemeContext"

export type AlertType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "lock"
  | "session"
  | "default"

export interface AlertButton {
  text: string
  style?: "default" | "cancel" | "destructive"
  onPress?: () => void
}

interface AlertConfig {
  visible: boolean
  title: string
  message: string
  buttons: AlertButton[]
  type: AlertType
}

interface CustomAlertProps {
  readonly visible: boolean
  readonly title: string
  readonly message: string
  readonly buttons: AlertButton[]
  readonly type: AlertType
  readonly onDismiss: () => void
}

export interface UseAlertReturn {
  alert: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    type?: AlertType,
  ) => void
  AlertComponent: ReactElement
}

const TYPE_LABELS: Partial<Record<AlertType, string>> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
  lock: "Locked",
  session: "Session",
}

const accentFor = (type: AlertType, colors: ThemeColors): string =>
  ({
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
    lock: colors.textSecondary,
    session: colors.accent,
    default: colors.accent,
  })[type]

function CustomAlert({
  visible,
  title,
  message,
  buttons,
  type,
  onDismiss,
}: CustomAlertProps) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const accent = accentFor(type, colors)
  const eyebrow = TYPE_LABELS[type]
  const stackButtons = buttons.length > 2
  const isHandlingPressRef = useRef(false)

  // A one-button alert often has the only way out of a bad state (an
  // expired session's "OK" resets to Login). Dismissing by backdrop or back
  // must run that action, not silently skip it. Multi-button alerts
  // are a choice, so dismissing them means "none of the above".
  const handleDismiss = useCallback(() => {
    if (isHandlingPressRef.current) return
    isHandlingPressRef.current = true
    onDismiss()
    if (buttons.length === 1) buttons[0].onPress?.()
    else buttons.find((b) => b.style === "cancel")?.onPress?.()
  }, [buttons, onDismiss])
  const scale = useRef(new Animated.Value(0.94)).current

  // Keyed on the buttons array, which every alert() call replaces: an onPress
  // that raises a replacement alert synchronously batches false/true into one
  // render, so a visible-only dependency would never re-run and every button
  // would be dead, even when the new alert has the same text.

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.94)
      return
    }
    isHandlingPressRef.current = false
    Animated.spring(scale, {
      toValue: 1,
      damping: 18,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    }).start()
  }, [visible, scale, buttons])

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={handleDismiss}
      statusBarTranslucent
      hardwareAccelerated
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.centerer} pointerEvents='box-none'>
        <Animated.View
          style={[styles.card, { transform: [{ scale }] }]}
          accessibilityViewIsModal
          accessibilityRole='alert'
          accessibilityLiveRegion='assertive'
        >
          <View style={[styles.rail, { backgroundColor: accent }]} />

          <View style={styles.body}>
            {!!eyebrow && (
              <Text style={[styles.eyebrow, { color: accent }]}>
                {eyebrow.toUpperCase()}
              </Text>
            )}
            {!!title && <Text style={styles.title}>{title}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}

            <View
              style={[styles.buttonRow, stackButtons && styles.buttonColumn]}
            >
              {buttons.map((btn, idx) => {
                const isCancel = btn.style === "cancel"
                const isDestructive = btn.style === "destructive"
                const isPrimary =
                  !isCancel && !isDestructive && idx === buttons.length - 1

                return (
                  <TouchableOpacity
                    key={btn.text}
                    style={[
                      styles.button,
                      stackButtons && styles.buttonFullWidth,
                      isPrimary && { backgroundColor: accent },
                      isDestructive && styles.buttonDestructive,
                    ]}
                    onPress={() => {
                      if (isHandlingPressRef.current) return
                      isHandlingPressRef.current = true
                      onDismiss()
                      btn.onPress?.()
                    }}
                    activeOpacity={0.75}
                    accessibilityRole='button'
                    accessibilityLabel={btn.text}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isPrimary && styles.buttonTextPrimary,
                        isDestructive && styles.buttonTextDestructive,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

export function useAlert(): UseAlertReturn {
  const [config, setConfig] = useState<AlertConfig>({
    visible: false,
    title: "",
    message: "",
    buttons: [{ text: "OK" }],
    type: "default",
  })

  const alert = useCallback(
    (
      title: string,
      message: string,
      buttons?: AlertButton[],
      type?: AlertType,
    ) => {
      setConfig({
        visible: true,
        title: title ?? "",
        message: message ?? "",
        buttons: buttons?.length ? buttons : [{ text: "OK" }],
        type: type ?? "default",
      })
    },
    [],
  )

  const dismiss = useCallback(() => {
    setConfig((prev) => ({ ...prev, visible: false }))
  }, [])

  const AlertComponent = (
    <CustomAlert
      visible={config.visible}
      title={config.title}
      message={config.message}
      buttons={config.buttons}
      type={config.type}
      onDismiss={dismiss}
    />
  )

  return { alert, AlertComponent }
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    centerer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.surfaceBorder,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.22,
      shadowRadius: 28,
      elevation: 16,
    },
    rail: { height: 3 },
    body: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 20 },
    eyebrow: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.6,
      marginBottom: 8,
    },
    title: {
      fontSize: 21,
      fontWeight: "700",
      color: colors.textPrimary,
      letterSpacing: -0.4,
      lineHeight: 27,
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
      marginTop: 8,
    },
    buttonRow: { flexDirection: "row", marginTop: 24, gap: 10 },
    buttonColumn: { flexDirection: "column" },
    button: {
      flex: 1,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.separator,
    },
    buttonFullWidth: { flex: undefined, width: "100%" },
    buttonDestructive: { backgroundColor: colors.errorLight },
    buttonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
      letterSpacing: -0.1,
    },
    buttonTextPrimary: { color: colors.textOnAccent, fontWeight: "700" },
    buttonTextDestructive: { color: colors.error, fontWeight: "700" },
  })
