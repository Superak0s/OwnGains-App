import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FALLBACK_COLORS } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import {
  DEFAULT_SNOOZE_SECONDS,
  dismissAlarm,
  formatSnooze,
  snoozeAlarm,
} from "@shared/services/supplementAlarms";

interface Props {
  readonly notificationId?: string;
  readonly title?: string;
  readonly body?: string;
  readonly snoozeSeconds?: number;
}

const formatNow = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Rendered by the native AlarmActivity over the lock screen, outside App and its providers. */
export default function AlarmScreen({
  notificationId,
  title,
  body,
  snoozeSeconds = DEFAULT_SNOOZE_SECONDS,
}: Props) {
  const [now, setNow] = useState(formatNow);

  useEffect(() => {
    const timer = setInterval(() => setNow(formatNow()), 10_000);
    // Back would close the page and silence the alarm without snoozing or dismissing it.
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, []);

  // BackHandler.exitApp finishes this activity only, since it has its own task.
  const finish = (action: (id: string) => void) => () => {
    try {
      if (notificationId) action(notificationId);
    } catch (error) {
      captureException(error, { stage: "AlarmScreen" });
    }
    BackHandler.exitApp();
  };

  const snooze = finish(snoozeAlarm);
  const dismiss = finish(dismissAlarm);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.time}>{now}</Text>
        <Text style={styles.title}>{title ?? "Supplement alarm"}</Text>
        {!!body && <Text style={styles.body}>{body}</Text>}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.snooze]}
          onPress={snooze}
          accessibilityRole='button'
        >
          <Text style={styles.buttonText}>Snooze {formatSnooze(snoozeSeconds)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.dismiss]}
          onPress={dismiss}
          accessibilityRole='button'
        >
          <Text style={styles.buttonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 64,
  },
  top: { alignItems: "center", gap: 16 },
  time: { fontSize: 72, fontWeight: "200", color: "#ffffff" },
  title: { fontSize: 26, fontWeight: "700", color: "#ffffff", textAlign: "center" },
  body: { fontSize: 18, color: "#cbd5e1", textAlign: "center" },
  actions: { gap: 16 },
  button: { borderRadius: 32, paddingVertical: 20, alignItems: "center" },
  snooze: { backgroundColor: "#334155" },
  dismiss: { backgroundColor: FALLBACK_COLORS.accent },
  buttonText: { fontSize: 20, fontWeight: "700", color: "#ffffff" },
});
