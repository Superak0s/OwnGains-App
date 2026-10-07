import { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import { menstrualApi } from "../services";
import { buildLocalISOForDate } from "../utils";
import makeTrackingStyles from "../styles";
import { Button, IconButton, Note, Row, radius, space } from "../ui";
import { NOTE_MAX_LENGTH } from "@shared/limits";
import { userFacingError } from "@shared/services/apiError";

export type MenstrualWidgetType =
  | "menstrual_overview"
  | "menstrual_calendar"
  | "menstrual_cycle"
  | "menstrual_history"
  | "menstrual_chart";

export const MENSTRUAL_WIDGET_REGISTRY: Record<
  MenstrualWidgetType,
  WidgetDefinition<MenstrualWidgetType>
> = {
  menstrual_overview: {
    type: "menstrual_overview",
    title: "Cycle Status",
    description: "Current cycle phase and estimated next period",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  menstrual_calendar: {
    type: "menstrual_calendar",
    title: "Cycle Calendar",
    description: "Calendar view of your menstrual cycle",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  menstrual_cycle: {
    type: "menstrual_cycle",
    title: "Cycle Details",
    description: "Current cycle length and phase information",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  menstrual_history: {
    type: "menstrual_history",
    title: "Cycle History",
    description: "Your recent menstrual cycle entries",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  menstrual_chart: {
    type: "menstrual_chart",
    title: "Cycle Length Chart",
    description: "How many days each of your cycles lasted",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_MENSTRUAL_WIDGETS = toDefaultWidgets(
  MENSTRUAL_WIDGET_REGISTRY,
  [
    "menstrual_overview",
    "menstrual_chart",
    "menstrual_calendar",
    "menstrual_history",
    "menstrual_cycle",
  ],
);

export const MENSTRUAL_TAB_CONFIG = {
  key: "menstrual",
  label: "Cycle",
};

interface LogCycleModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly prefillDate?: Date;
  readonly onSuccess?: () => void;
}

export function LogCycleModal({
  visible,
  onClose,
  prefillDate,
  onSuccess,
}: LogCycleModalProps) {
  const { colors } = useTheme();
  const [settings, setSettings] = useState<{
    periodDays: number;
    cycleLengthDays: number;
  } | null>(null);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const styles = useMemo(() => makeTrackingStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const response = await menstrualApi.getSettings();
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (err) {
      console.error("Failed to load menstrual settings:", err);
      captureException(err, { stage: "loadMenstrualSettings" });
    }
  };

  const handleLog = async () => {
    try {
      setLoading(true);
      setError("");

      const cycleStart = prefillDate || new Date();
      const cycleStartIso = buildLocalISOForDate(cycleStart);

      await menstrualApi.logMenstrualCycle(
        cycleStartIso,
        note ? [note] : undefined,
      );

      setNote("");
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(userFacingError(err, "Couldn't log the cycle."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Log period start"
      confirmText={loading ? "Logging…" : "Log period"}
      onConfirm={handleLog}
      confirmDisabled={loading}
      scrollable
    >
      <ScrollView>
        {settings && (
          <Note>
            Your settings: {settings.periodDays}-day period on a{" "}
            {settings.cycleLengthDays}-day cycle.
          </Note>
        )}

        <Text style={styles.inputLabel}>
          Note <Text style={styles.inputLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 90 }]}
          placeholder="Symptoms, how you feel"
          placeholderTextColor={colors.textMuted}
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {!!error && <Text style={styles.inputError}>{error}</Text>}
      </ScrollView>
    </ModalSheet>
  );
}

interface CycleSettingsWidgetProps {
  readonly onSettingsUpdate?: (settings: {
    periodDays: number;
    cycleLengthDays: number;
  }) => void;
}

export function CycleSettingsWidget({
  onSettingsUpdate,
}: CycleSettingsWidgetProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(5);
  const [cycleLengthDays, setCycleLengthDays] = useState<number>(28);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  const styles = useMemo(() => makeCycleSettingsStyles(colors), [colors]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await menstrualApi.getSettings();
      if (response.success && response.data) {
        setPeriodDays(response.data.periodDays);
        setCycleLengthDays(response.data.cycleLengthDays);
      }
    } catch (err) {
      console.error("Failed to load cycle settings:", err);
      captureException(err, { stage: "loadCycleSettings" });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess(false);

      await menstrualApi.setSettings(periodDays, cycleLengthDays);

      setSuccess(true);
      onSettingsUpdate?.({ periodDays, cycleLengthDays });
    } catch (err) {
      setError(userFacingError(err, "Couldn't save your settings."));
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    {
      label: "Period length",
      hint: "Most people log 3 to 7 days.",
      value: periodDays,
      min: 1,
      max: 14,
      fallback: 5,
      onChange: setPeriodDays,
    },
    {
      label: "Cycle length",
      hint: "Most people log 21 to 35 days.",
      value: cycleLengthDays,
      min: 20,
      max: 50,
      fallback: 28,
      onChange: setCycleLengthDays,
    },
  ];

  return (
    <View>
      <Row
        title="Cycle settings"
        meta={`${periodDays}-day period on a ${cycleLengthDays}-day cycle`}
        onPress={() => setExpanded(!expanded)}
        right={
          <Text style={[styles.chevron, expanded && styles.chevronOpen]}>
            {"⌄"}
          </Text>
        }
        last
      />

      {expanded && (
        <View style={styles.body}>
          {fields.map((field) => (
            <View key={field.label} style={styles.field}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <View style={styles.stepperRow}>
                <IconButton
                  glyph={"−"}
                  label={`Decrease ${field.label.toLowerCase()}`}
                  onPress={() =>
                    field.onChange(Math.max(field.min, field.value - 1))
                  }
                />
                <TextInput
                  style={styles.stepperInput}
                  value={String(field.value)}
                  onChangeText={(text) =>
                    field.onChange(
                      Math.max(
                        field.min,
                        Number.parseInt(text, 10) || field.fallback,
                      ),
                    )
                  }
                  keyboardType="number-pad"
                  accessibilityLabel={field.label}
                />
                <IconButton
                  glyph="+"
                  label={`Increase ${field.label.toLowerCase()}`}
                  onPress={() =>
                    field.onChange(Math.min(field.max, field.value + 1))
                  }
                />
                <Text style={styles.unit}>days</Text>
              </View>
              <Note>{field.hint}</Note>
            </View>
          ))}

          {!!error && <Text style={styles.error}>{error}</Text>}
          {success && <Text style={styles.success}>Settings saved.</Text>}

          <View style={styles.actions}>
            <Button
              label={loading ? "Saving…" : "Save settings"}
              onPress={handleSave}
              disabled={loading}
            />
            <Button
              label="Close"
              variant="quiet"
              onPress={() => setExpanded(false)}
              disabled={loading}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const makeCycleSettingsStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chevron: { fontSize: 20, color: colors.textMuted },
    chevronOpen: { transform: [{ rotate: "180deg" }] },
    body: { gap: space.lg, paddingTop: space.md },
    field: { gap: space.sm },
    fieldLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
    stepperRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
    stepperInput: {
      minWidth: 64,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      textAlign: "center",
    },
    unit: { fontSize: 14, color: colors.textMuted },
    error: { fontSize: 13, color: colors.error },
    success: { fontSize: 13, color: colors.success },
    actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  });
