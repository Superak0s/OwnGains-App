import { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme } from "@shared/context/ThemeContext";
import { parseDecimal } from "@utils/format";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { NOTE_MAX_LENGTH } from "@shared/limits";

interface QuickLogSupplementProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onLog: (amount: number, note: string, takenAt: string | null) => void;
  readonly supplementName?: string;
  readonly subtitle?: string;
  readonly unit?: string;
  readonly icon?: string;
  readonly defaultAmount?: number;
  readonly quickAmounts?: readonly number[];
}

const DEFAULT_QUICK_AMOUNTS = [3, 5, 10] as const;

export default function QuickLogSupplement({
  visible,
  onClose,
  onLog,
  supplementName = "Supplement",
  subtitle = "Quick entry",
  unit = "grams",
  icon = "💊",
  defaultAmount = 5,
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
}: QuickLogSupplementProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [note, setNote] = useState("");
  const [daysAgo, setDaysAgo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isLoggingRef = useRef(false);

  const handleLog = () => {
    if (isLoggingRef.current) return;
    isLoggingRef.current = true;
    try {
      const parsed = parseDecimal(amount);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setError("Enter an amount greater than zero.");
        return;
      }
      setError(null);
      // Backdated entries keep the time of day from now, which is all a daily
      // streak needs and is less to ask for than a full date picker.
      let takenAt: string | null = null;
      if (daysAgo > 0) {
        const when = new Date();
        when.setDate(when.getDate() - daysAgo);
        takenAt = when.toISOString();
      }
      onLog(parsed, note, takenAt);
      setNote("");
      onClose();
    } finally {
      // Reset on every path: the parent currently unmounts this component on
      // close, but a sheet kept mounted would otherwise have a dead button.
      isLoggingRef.current = false;
    }
  };

  const DAY_CHOICES = [
    { days: 0, label: "Today" },
    { days: 1, label: "Yesterday" },
    { days: 2, label: "2 days ago" },
  ];

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      showCancelButton={false}
      showConfirmButton={false}
    >
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title}>Log {supplementName}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.quickAmounts}>
        {quickAmounts.map((q) => (
          <TouchableOpacity
            key={q}
            style={[
              styles.quickButton,
              amount === String(q) && styles.quickButtonActive,
            ]}
            onPress={() => setAmount(String(q))}
            accessibilityRole='button'
            accessibilityLabel={`Set amount to ${q} ${unit}`}
            accessibilityState={{ selected: amount === String(q) }}
          >
            <Text
              style={[
                styles.quickButtonText,
                amount === String(q) && styles.quickButtonTextActive,
              ]}
            >
              {q}
              {unit === "grams" ? "g" : unit}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Amount</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              if (error) setError(null);
            }}
            keyboardType='decimal-pad'
            placeholder={String(defaultAmount)}
            autoFocus
            accessibilityLabel={`Amount in ${unit}`}
          />
          <Text style={styles.inputUnit}>{unit}</Text>
        </View>
        {error && (
          <Text style={styles.errorText} accessibilityLiveRegion='polite'>
            {error}
          </Text>
        )}
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>When</Text>
        <View style={styles.quickAmounts}>
          {DAY_CHOICES.map((choice) => (
            <TouchableOpacity
              key={choice.days}
              style={[
                styles.quickButton,
                daysAgo === choice.days && styles.quickButtonActive,
              ]}
              onPress={() => setDaysAgo(choice.days)}
              accessibilityRole='button'
              accessibilityLabel={`Log for ${choice.label}`}
              accessibilityState={{ selected: daysAgo === choice.days }}
            >
              <Text
                style={[
                  styles.quickButtonText,
                  daysAgo === choice.days && styles.quickButtonTextActive,
                ]}
              >
                {choice.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Note (optional)</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNote}
          placeholder='e.g., with breakfast'
          accessibilityLabel='Note for this dose'
          multiline
        />
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onClose}
          accessibilityRole='button'
          accessibilityLabel='Cancel'
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logButton}
          onPress={handleLog}
          accessibilityRole='button'
          accessibilityLabel={`Log ${amount} ${unit} of ${supplementName}`}
        >
          <Text style={styles.logButtonText}>✓ Log Entry</Text>
        </TouchableOpacity>
      </View>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { alignItems: "center", marginBottom: 24 },
    icon: { fontSize: 48, marginBottom: 8 },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    subtitle: { fontSize: 14, color: colors.textMuted },
    quickAmounts: { flexDirection: "row", gap: 12, marginBottom: 20 },
    quickButton: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    quickButtonActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    quickButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    quickButtonTextActive: { color: colors.accent },
    inputSection: { marginBottom: 16 },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    input: {
      flex: 1,
      fontSize: 24,
      fontWeight: "700",
      paddingVertical: 14,
      color: colors.textPrimary,
    },
    inputUnit: { fontSize: 16, color: colors.textMuted, fontWeight: "600" },
    errorText: { fontSize: 13, color: colors.error, marginTop: 6 },
    noteInput: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      minHeight: 60,
      textAlignVertical: "top",
    },
    buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.separator,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    logButton: {
      flex: 1,
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    logButtonText: { fontSize: 16, fontWeight: "700", color: colors.surface },
  });
