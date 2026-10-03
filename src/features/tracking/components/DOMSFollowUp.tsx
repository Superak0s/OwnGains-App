import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { sorenessApi } from "../services";
import {
  ActiveSoreness,
  SorenessFollowUp,
  MUSCLE_GROUP_LABELS,
} from "../types/muscleRecovery";
import { IntensityPicker } from "@shared/components/IntensityPicker";
import { getSeverityColor, SEVERITY_STOPS } from "@utils/severityColor";
import { captureException } from "@shared/services/crashReporting";
import { useAlert } from "@shared/components/CustomAlert";
import { describeError } from "../helpers";
import {
  Bar,
  Button,
  Chip,
  Note,
  Placeholder,
  SectionLabel,
  radius,
  space,
} from "../ui";

const FOLLOW_UP_OPTIONS = [
  {
    label: "Still sore",
    value: "still_sore" as const,
    color: SEVERITY_STOPS.bad,
  },
  { label: "Better", value: "better" as const, color: SEVERITY_STOPS.warn },
  {
    label: "Recovered",
    value: "recovered" as const,
    color: SEVERITY_STOPS.good,
  },
];

type PendingUpdate = {
  status: SorenessFollowUp["status"];
  intensity: number;
  notes: string;
};

interface DOMSFollowUpProps {
  readonly onNavigateToMuscleDashboard?: (muscle: string) => void;
}

export const DOMSFollowUp: React.FC<DOMSFollowUpProps> = ({
  onNavigateToMuscleDashboard,
}) => {
  const { colors } = useTheme();
  const { alert, AlertComponent } = useAlert();
  const [activeSoreness, setActiveSoreness] = useState<ActiveSoreness[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<
    Record<string, PendingUpdate>
  >({});

  const patchUpdate = (
    id: number,
    update: PendingUpdate,
    patch: Partial<PendingUpdate>,
  ) =>
    setPendingUpdates((prev) => ({ ...prev, [id]: { ...update, ...patch } }));

  useEffect(() => {
    loadActiveSoreness();
  }, []);

  const loadActiveSoreness = async () => {
    try {
      setLoading(true);
      const response = await sorenessApi.getActiveSoreness();
      const data = response?.data ?? response;
      setActiveSoreness(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load active soreness:", error);
      captureException(error, { stage: "loadActiveSoreness" });
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = async (sorenessId: number, update: PendingUpdate) => {
    const idKey = String(sorenessId);
    try {
      setSubmitting(idKey);
      await sorenessApi.updateSoreness({
        sorenessId,
        intensity: update.intensity,
        status: update.status,
        note: update.notes || undefined,
      });

      setPendingUpdates((prev) => {
        const next = { ...prev };
        delete next[idKey];
        return next;
      });
      await loadActiveSoreness();
    } catch (error) {
      console.error("Failed to update soreness:", error);
      captureException(error, { stage: "updateSoreness" });
      alert("Couldn't save", describeError(error), [{ text: "OK" }], "error");
    } finally {
      setSubmitting(null);
    }
  };

  const handleBatchFollowUp = async () => {
    const updates = Object.entries(pendingUpdates).map(([id, update]) => ({
      sorenessId: Number(id),
      intensity: update.intensity,
      status: update.status,
      note: update.notes || undefined,
    }));

    try {
      setSubmitting("batch");
      await sorenessApi.batchFollowUp(updates);
      setPendingUpdates({});
      await loadActiveSoreness();
    } catch (error) {
      console.error("Failed to batch update:", error);
      captureException(error, { stage: "batchUpdateSoreness" });
      alert("Couldn't save", describeError(error), [{ text: "OK" }], "error");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading} accessibilityRole='progressbar'>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (activeSoreness.length === 0) {
    return (
      <Placeholder text="Nothing sore right now. Log soreness after a session and it'll show up here to check on." />
    );
  }

  const pendingCount = Object.keys(pendingUpdates).length;

  return (
    <View style={{ gap: space.lg }}>
      {AlertComponent}
      <Note>How are these feeling today?</Note>

      {activeSoreness.map((soreness, index) => {
        const muscleLabel =
          MUSCLE_GROUP_LABELS[soreness.muscleGroup] || soreness.muscleGroup;
        const update = pendingUpdates[soreness.id] || {
          status: "still_sore" as const,
          intensity: soreness.intensity,
          notes: "",
        };
        const tone = getSeverityColor(update.intensity);

        return (
          <View
            key={soreness.id}
            style={[
              { gap: space.md },
              index < activeSoreness.length - 1 && {
                paddingBottom: space.lg,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.separator,
              },
            ]}
          >
            <View style={styles.head}>
              <Text
                style={[styles.muscle, { color: colors.textPrimary }]}
                onPress={() =>
                  onNavigateToMuscleDashboard?.(soreness.muscleGroup)
                }
                accessibilityRole='button'
                accessibilityLabel={`${muscleLabel}, view recovery details`}
              >
                {muscleLabel}
              </Text>
              <Text style={[styles.value, { color: tone }]}>
                {update.intensity}
                <Text style={[styles.valueUnit, { color: colors.textMuted }]}>
                  {" "}
                  / 10
                </Text>
              </Text>
            </View>
            <Bar pct={update.intensity * 10} tone={tone} />

            {soreness.note ? (
              <Text style={[styles.original, { color: colors.textMuted }]}>
                Logged as: {soreness.note}
              </Text>
            ) : null}

            <View>
              <SectionLabel>Intensity today</SectionLabel>
              <IntensityPicker
                value={update.intensity}
                onChange={(val) =>
                  patchUpdate(soreness.id, update, { intensity: val })
                }
                getColor={getSeverityColor}
                unselectedBackground={colors.inputBackground}
                unselectedBorder={colors.inputBorder}
                unselectedTextColor={colors.textSecondary}
                styles={{
                  container: styles.pickerRow,
                  button: {
                    minWidth: 34,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    alignItems: "center",
                  },
                  buttonText: { fontSize: 13, fontWeight: "600" },
                }}
              />
            </View>

            <View>
              <SectionLabel>Status</SectionLabel>
              <View style={styles.pickerRow}>
                {FOLLOW_UP_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    tone={option.color}
                    selected={update.status === option.value}
                    onPress={() =>
                      patchUpdate(soreness.id, update, { status: option.value })
                    }
                  />
                ))}
              </View>
            </View>

            <View
              style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}
            >
              <Button
                label={
                  submitting === String(soreness.id) ? "Saving…" : "Save update"
                }
                onPress={() => handleFollowUp(soreness.id, update)}
                disabled={!!submitting}
                tone={tone}
              />
              <Button
                label='Recovery details'
                variant='quiet'
                onPress={() =>
                  onNavigateToMuscleDashboard?.(soreness.muscleGroup)
                }
              />
            </View>
          </View>
        );
      })}

      {pendingCount > 0 && (
        <Button
          label={
            submitting === "batch"
              ? "Saving…"
              : `Save all ${pendingCount} updates`
          }
          onPress={handleBatchFollowUp}
          disabled={!!submitting}
          full
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xl, alignItems: "center" },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  muscle: { fontSize: 17, fontWeight: "600" },
  value: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  valueUnit: { fontSize: 13, fontWeight: "600", letterSpacing: 0 },
  original: { fontSize: 13, lineHeight: 18 },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});

export default DOMSFollowUp;
