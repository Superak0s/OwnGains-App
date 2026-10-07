import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import {
  STORAGE_KEYS,
  saveToStorage,
  loadFromStorage,
} from "@shared/services/storage";
import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import { hydrationApi } from "../services";
import {
  DEFAULT_HYDRATION_ERROR_MARGIN,
  DEFAULT_HYDRATION_PRESETS,
  type HydrationPreset,
} from "../services/types";
import { describeError } from "../helpers";
import { buildLocalISOForDate } from "../utils";
import { useRetryKey } from "../hooks/useRetryKey";
import makeTrackingStyles from "../styles";
import {
  Bar,
  Button,
  Chip,
  ErrorMarginStepper,
  IconButton,
  Metric,
  Row,
  radius,
  space,
} from "../ui";
import { NOTE_MAX_LENGTH } from "@shared/limits";

export type HydrationWidgetType =
  | "hydration_overview"
  | "hydration_calendar"
  | "hydration_goal"
  | "hydration_history"
  | "hydration_chart";

export const HYDRATION_WIDGET_REGISTRY: Record<
  HydrationWidgetType,
  WidgetDefinition<HydrationWidgetType>
> = {
  hydration_overview: {
    type: "hydration_overview",
    title: "Today's Hydration",
    description: "Daily water intake vs. goal",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  hydration_calendar: {
    type: "hydration_calendar",
    title: "Hydration Calendar",
    description: "Calendar view of days you've logged hydration",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  hydration_goal: {
    type: "hydration_goal",
    title: "Weekly Goal",
    description: "This week's hydration progress and average",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  hydration_history: {
    type: "hydration_history",
    title: "Hydration History",
    description: "Recent hydration entries",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  hydration_chart: {
    type: "hydration_chart",
    title: "Hydration Chart",
    description: "Water drunk each day this week",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_HYDRATION_WIDGETS = toDefaultWidgets(
  HYDRATION_WIDGET_REGISTRY,
  [
    "hydration_overview",
    "hydration_chart",
    "hydration_calendar",
    "hydration_history",
    "hydration_goal",
  ],
);

export const HYDRATION_TAB_CONFIG = {
  key: "hydration",
  label: "Hydration",
};

interface LogHydrationModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
  readonly prefillDate?: Date;
}

const STEP_ML = 50;
const PRESET_GOALS_ML = [1500, 2000, 2500, 3000];

export function LogHydrationModal({
  visible,
  onClose,
  onSuccess,
  prefillDate,
}: LogHydrationModalProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [amountMl, setAmountMl] = useState<number>(500);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [settings, setSettings] = useState<{
    goalMl: number;
    measurementErrorPercent: number;
  } | null>(null);
  const [presets, setPresets] = useState<HydrationPreset[]>(
    DEFAULT_HYDRATION_PRESETS,
  );
  const [editingPresets, setEditingPresets] = useState(false);
  const [errorMargin, setErrorMargin] = useState(DEFAULT_HYDRATION_ERROR_MARGIN);
  const retryKey = useRetryKey();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const trackingStyles = useMemo(() => makeTrackingStyles(colors), [colors]);

  const loadPresets = useCallback(async () => {
    const saved = await loadFromStorage<HydrationPreset[]>(
      STORAGE_KEYS.HYDRATION_PRESETS,
      user?.id ?? null,
    );
    if (saved?.length) setPresets(saved);
  }, [user?.id]);

  const updatePresetMl = (index: number, ml: number) => {
    setPresets((prev) => prev.map((p, i) => (i === index ? { ...p, ml } : p)));
  };

  const savePresets = async () => {
    await saveToStorage(
      STORAGE_KEYS.HYDRATION_PRESETS,
      presets,
      user?.id ?? null,
    );
    setEditingPresets(false);
  };

  const loadSettings = useCallback(async () => {
    try {
      const response = await hydrationApi.getSettings();
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (err) {
      console.error("Failed to load hydration settings:", err);
      captureException(err, { stage: "loadHydrationSettings" });
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void loadSettings();
      void loadPresets();
    }
  }, [visible, loadSettings, loadPresets]);

  const handleLog = async () => {
    if (!(amountMl > 0)) {
      setError("Enter an amount above 0 ml.");
      return;
    }
    try {
      setLoading(true);
      setError("");

      const loggedAt = prefillDate ? buildLocalISOForDate(prefillDate) : null;
      await hydrationApi.logHydration(
        amountMl,
        note || undefined,
        loggedAt,
        retryKey.keyFor(`${amountMl}|${note}|${loggedAt ?? ""}|${errorMargin}`),
        errorMargin,
      );
      retryKey.reset();

      setAmountMl(500);
      setNote("");
      setErrorMargin(DEFAULT_HYDRATION_ERROR_MARGIN);
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = settings
    ? Math.min((amountMl / settings.goalMl) * 100, 100)
    : 0;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Log hydration"
      confirmText={loading ? "Logging…" : "Log hydration"}
      onConfirm={handleLog}
      confirmDisabled={loading}
      scrollable
    >
      <ScrollView>
        <View style={styles.amountBlock}>
          <Metric
            label="Amount"
            value={String(amountMl)}
            unit="ml"
            tone={colors.info}
            meta={
              settings
                ? `${Math.round(progressPercentage)}% of your ${settings.goalMl}ml goal`
                : undefined
            }
            side={
              <View style={styles.stepperRow}>
                <IconButton
                  glyph={"−"}
                  label={`Take off ${STEP_ML} millilitres`}
                  onPress={() => setAmountMl((v) => Math.max(0, v - STEP_ML))}
                />
                <IconButton
                  glyph="+"
                  label={`Add ${STEP_ML} millilitres`}
                  onPress={() => setAmountMl((v) => v + STEP_ML)}
                />
              </View>
            }
          />
          {settings && <Bar pct={progressPercentage} tone={colors.info} />}
        </View>

        <Text style={trackingStyles.inputLabel}>Exact amount (ml)</Text>
        <TextInput
          style={trackingStyles.input}
          placeholder="500"
          placeholderTextColor={colors.textMuted}
          value={String(amountMl)}
          onChangeText={(text) =>
            setAmountMl(Math.max(0, Number.parseInt(text, 10) || 0))
          }
          keyboardType="number-pad"
        />

        <View style={styles.presetHeader}>
          <Text style={trackingStyles.inputLabel}>Quick presets</Text>
          <Button
            label={editingPresets ? "Done" : "Edit"}
            size="sm"
            variant="quiet"
            onPress={() =>
              editingPresets ? savePresets() : setEditingPresets(true)
            }
          />
        </View>

        {editingPresets ? (
          <View>
            {presets.map((preset, index) => (
              <Row
                key={preset.label}
                title={preset.label}
                last={index === presets.length - 1}
                right={
                  <TextInput
                    style={styles.presetInput}
                    value={String(preset.ml)}
                    onChangeText={(text) =>
                      updatePresetMl(
                        index,
                        Math.max(0, Number.parseInt(text, 10) || 0),
                      )
                    }
                    keyboardType="number-pad"
                    accessibilityLabel={`${preset.label} in millilitres`}
                  />
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.presetGrid}>
            {presets.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                sub={`${preset.ml}ml`}
                selected={amountMl === preset.ml}
                onPress={() => setAmountMl(preset.ml)}
              />
            ))}
          </View>
        )}

        <Text style={trackingStyles.inputLabel}>
          Note <Text style={trackingStyles.inputLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={[trackingStyles.input, { minHeight: 64 }]}
          placeholder="After a workout, before bed"
          placeholderTextColor={colors.textMuted}
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />

        <ErrorMarginStepper value={errorMargin} onChange={setErrorMargin} />
        <Text style={trackingStyles.modalHint}>
          Glasses and bottles are rarely filled exactly. This margin widens each
          total into a min-max range, so ±3% on 500 ml shows as 485-515.
        </Text>

        {!!error && <Text style={trackingStyles.inputError}>{error}</Text>}
      </ScrollView>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    amountBlock: { gap: space.md, paddingVertical: space.sm },
    stepperRow: { flexDirection: "row", gap: space.sm },
    presetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.sm,
    },
    presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    presetInput: {
      minWidth: 72,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      paddingHorizontal: space.sm,
      paddingVertical: 6,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      textAlign: "center",
    },
  });

interface HydrationSettingsWidgetProps {
  readonly onSettingsUpdate?: (settings: {
    goalMl: number;
    measurementErrorPercent: number;
  }) => void;
}

export function HydrationSettingsWidget({
  onSettingsUpdate,
}: HydrationSettingsWidgetProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [goalMl, setGoalMl] = useState<number>(2000);
  const [measurementErrorPercent, setMeasurementErrorPercent] =
    useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  const styles = useMemo(() => makeHydrationSettingsStyles(colors), [colors]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(timer);
  }, [success]);
  const trackingStyles = useMemo(() => makeTrackingStyles(colors), [colors]);

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadSettings = async () => {
    try {
      const response = await hydrationApi.getSettings();
      if (response.success && response.data) {
        setGoalMl(response.data.goalMl);
        setMeasurementErrorPercent(response.data.measurementErrorPercent);
        onSettingsUpdate?.({
          goalMl: response.data.goalMl,
          measurementErrorPercent: response.data.measurementErrorPercent,
        });
      }
    } catch (err) {
      console.error("Failed to load hydration settings:", err);
      captureException(err, { stage: "loadHydrationSettings" });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess(false);

      await hydrationApi.setSettings(goalMl, measurementErrorPercent);

      setSuccess(true);
      onSettingsUpdate?.({ goalMl, measurementErrorPercent });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Row
        title="Hydration settings"
        meta={`${(goalMl / 1000).toFixed(1)}L a day`}
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
          <View>
            <Text style={trackingStyles.inputLabel}>Daily goal (ml)</Text>
            <TextInput
              style={trackingStyles.input}
              value={String(goalMl)}
              onChangeText={(text) =>
                setGoalMl(Math.max(500, Number.parseInt(text, 10) || 2000))
              }
              keyboardType="number-pad"
              accessibilityLabel="Daily hydration goal in millilitres"
            />
            <View style={styles.presetRow}>
              {PRESET_GOALS_ML.map((preset) => (
                <Chip
                  key={preset}
                  label={`${preset / 1000}L`}
                  selected={goalMl === preset}
                  onPress={() => setGoalMl(preset)}
                />
              ))}
            </View>
          </View>

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

const makeHydrationSettingsStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chevron: { fontSize: 20, color: colors.textMuted },
    chevronOpen: { transform: [{ rotate: "180deg" }] },
    body: { gap: space.lg, paddingTop: space.md },
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    error: { fontSize: 13, color: colors.error },
    success: { fontSize: 13, color: colors.success },
    actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  });
