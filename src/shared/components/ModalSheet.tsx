import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  Animated,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../context/ThemeContext";

interface ModalSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
  readonly showCancelButton?: boolean;
  readonly showConfirmButton?: boolean;
  readonly cancelText?: string;
  readonly confirmText?: string;
  readonly onConfirm?: () => void;
  readonly confirmDisabled?: boolean;
  readonly scrollable?: boolean;
  readonly fullHeight?: boolean;
  /**
   * Set when the sheet holds unsaved input. A backdrop tap or hardware back
   * then asks before discarding it. The buttons still close without asking,
   * because those are a decision the user just made.
   */
  readonly dirty?: boolean;
}

const KEYBOARD_DISMISS_DURATION_MS = 50;

// The sheet is bottom-anchored, so the keyboard covers its lower
// min(keyboard, sheet). Lift that much, clamped so a tall sheet's header
// can't be pushed above the top of the screen.
export function keyboardLift(
  keyboardHeight: number,
  windowHeight: number,
  sheetHeight: number,
): number {
  return Math.max(0, Math.min(keyboardHeight, windowHeight - sheetHeight));
}

export default function ModalSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  showCancelButton = true,
  showConfirmButton = true,
  cancelText = "Cancel",
  confirmText = "Save",
  onConfirm,
  confirmDisabled = false,
  scrollable = false,
  fullHeight = false,
  dirty = false,
}: ModalSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const isKeyboardOpenRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const isConfirmingRef = useRef(false);
  const sheetHeightRef = useRef(0);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!visible) {
      sheetTranslateY.setValue(0);
      isConfirmingRef.current = false;
      setIsConfirming(false);
    }
  }, [visible, sheetTranslateY]);

  const runConfirm = useCallback((fn?: () => void) => {
    if (!fn || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    const result = fn() as unknown;
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setIsConfirming(true);
      (result as Promise<unknown>).finally(() => {
        isConfirmingRef.current = false;
        setIsConfirming(false);
      });
    } else {
      isConfirmingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      isKeyboardOpenRef.current = true;
      Animated.timing(sheetTranslateY, {
        toValue: -keyboardLift(
          e.endCoordinates.height,
          Dimensions.get("window").height,
          sheetHeightRef.current,
        ),
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardOpenRef.current = false;
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [sheetTranslateY]);

  useEffect(() => {
    if (!visible && closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [visible]);

  const safeClose = useCallback(() => {
    if (closeTimerRef.current) return;
    if (Platform.OS === "android" && isKeyboardOpenRef.current) {
      Keyboard.dismiss();
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, KEYBOARD_DISMISS_DURATION_MS);
    } else {
      onClose();
    }
  }, [onClose]);

  const closeWithConfirm = useCallback(() => {
    if (!dirty) {
      safeClose();
      return;
    }
    Alert.alert(
      "Discard changes?",
      "What you have typed here has not been saved.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: safeClose },
      ],
    );
  }, [dirty, safeClose]);

  const bottomPad = Math.max(
    insets.bottom,
    Platform.OS === "android" ? 16 : 34,
  );

  const buttons =
    showCancelButton || showConfirmButton ? (
      <View style={[styles.modalButtons, { paddingBottom: bottomPad }]}>
        {showCancelButton && (
          <TouchableOpacity
            style={styles.modalButtonCancel}
            accessibilityRole='button'
            accessibilityLabel={cancelText}
            onPress={safeClose}
          >
            <Text style={styles.modalButtonTextCancel}>{cancelText}</Text>
          </TouchableOpacity>
        )}
        {showConfirmButton && (
          <TouchableOpacity
            style={[
              styles.modalButtonConfirm,
              (confirmDisabled || isConfirming) && styles.modalButtonDisabled,
            ]}
            onPress={() => runConfirm(onConfirm)}
            disabled={confirmDisabled || isConfirming}
            accessibilityRole='button'
            accessibilityState={{
              disabled: confirmDisabled || isConfirming,
              busy: isConfirming,
            }}
          >
            {isConfirming ? (
              <ActivityIndicator size='small' color={colors.textOnAccent} />
            ) : (
              <Text style={styles.modalButtonTextConfirm}>{confirmText}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      onRequestClose={closeWithConfirm}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.fullScreen}>
        <TouchableWithoutFeedback onPress={closeWithConfirm}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            fullHeight && { height: "90%" },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          onLayout={(e) => {
            sheetHeightRef.current = e.nativeEvent.layout.height;
          }}
          accessibilityViewIsModal
        >
          <TouchableOpacity
            accessibilityRole='button'
            accessibilityLabel='Close'
            style={styles.closeButton}
            onPress={closeWithConfirm}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          {title ? <Text style={styles.modalTitle}>{title}</Text> : null}
          {subtitle ? (
            <Text style={styles.modalSubtitle}>{subtitle}</Text>
          ) : null}

          {scrollable ? (
            <>
              <ScrollView
                style={[styles.scrollBody, fullHeight && { flex: 1 }]}
                contentContainerStyle={[
                  styles.scrollBodyContent,
                  !buttons && { paddingBottom: bottomPad },
                ]}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps='handled'
                bounces={false}
              >
                {children}
              </ScrollView>
              {buttons}
            </>
          ) : (
            <>
              {/* A fullHeight sheet has a fixed height, so its body can fill it, and
                  children laid out with flex: 1 get zero height otherwise. */}
              <View style={[styles.staticBody, fullHeight && { flex: 1 }]}>
                {children}
              </View>
              {buttons}
              {!showCancelButton && !showConfirmButton && (
                <View style={{ height: bottomPad }} />
              )}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    fullScreen: { flex: 1 },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: "90%",
      backgroundColor: colors.surface,
      flexDirection: "column",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 7,
      paddingTop: 20,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 12,
    },
    closeButton: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.separator,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },
    closeButtonText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: "700",
      lineHeight: 18,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 4,
      textAlign: "center",
      paddingRight: 32,
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 16,
      textAlign: "center",
    },
    // flex: 1 clipped a non-scrollable body that outgrew the sheet's
    // maxHeight, so the last rows could not be scrolled to. Shrinking is enough.
    staticBody: { marginTop: 8, flexShrink: 1 },
    scrollBody: { marginTop: 8, flexShrink: 1 },
    scrollBodyContent: { paddingBottom: 8 },
    modalButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
    modalButtonCancel: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.separator,
      alignItems: "center",
    },
    modalButtonTextCancel: {
      color: colors.textSecondary,
      fontWeight: "600",
      fontSize: 15,
    },
    modalButtonConfirm: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: "center",
    },
    modalButtonDisabled: { opacity: 0.5 },
    modalButtonTextConfirm: {
      color: colors.textOnAccent,
      fontWeight: "700",
      fontSize: 15,
    },
  });
