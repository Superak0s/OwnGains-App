import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import { injuryApi } from "../services";
import { describeError } from "../helpers";
import {
  InjuryRecord,
  InjuryType,
  InjuryStatus,
  MUSCLE_GROUP_LABELS,
} from "../types/muscleRecovery";
import { getSeverityColor, SEVERITY_STOPS } from "@utils/severityColor";
import { Bar, Button, Chip, Placeholder, TINT, radius, space } from "../ui";
import { captureException, metric } from "@shared/services/crashReporting";

interface InjuryTrackerProps {
  readonly onLogInjury?: () => void;
}

const INJURY_TYPES: { value: InjuryType; label: string }[] = [
  { value: "strain", label: "Strain" },
  { value: "sprain", label: "Sprain" },
  { value: "tendonitis", label: "Tendonitis" },
  { value: "fracture", label: "Fracture" },
  { value: "dislocation", label: "Dislocation" },
  { value: "tear", label: "Tear" },
  { value: "overuse", label: "Overuse" },
  { value: "surgery", label: "Surgery" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<InjuryStatus, { label: string; color: string }> = {
  active: { label: "Active", color: SEVERITY_STOPS.bad },
  recovering: { label: "Recovering", color: SEVERITY_STOPS.warn },
  recovered: { label: "Recovered", color: SEVERITY_STOPS.good },
};

const FILTERS: { value: "all" | InjuryStatus; label: string }[] = [
  { value: "all", label: "All" },
  ...(Object.keys(STATUS_CONFIG) as InjuryStatus[]).map((status) => ({
    value: status,
    label: STATUS_CONFIG[status].label,
  })),
];

export const InjuryTracker: React.FC<InjuryTrackerProps> = ({
  onLogInjury,
}) => {
  const { colors } = useTheme();
  const { alert, AlertComponent } = useAlert();
  const [injuries, setInjuries] = useState<InjuryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const activeInjuries = useMemo(
    () => injuries.filter((injury) => injury.status !== "recovered"),
    [injuries],
  );
  const [filter, setFilter] = useState<"all" | InjuryStatus>("all");

  useEffect(() => {
    loadInjuries();
  }, []);

  const loadInjuries = async () => {
    try {
      setLoading(true);
      const allResponse = await injuryApi.getAllInjuries();
      const allData = allResponse?.data ?? allResponse;
      setInjuries(Array.isArray(allData) ? allData : []);
    } catch (error) {
      console.error("Failed to load injuries:", error);
      metric.count("tracking.injuries_load_failed");
      captureException(error, { stage: "loadInjuries" });
    } finally {
      setLoading(false);
    }
  };

  const filteredInjuries =
    filter === "all" ? injuries : injuries.filter((i) => i.status === filter);

  const markRecovered = async (injury: InjuryRecord) => {
    try {
      await injuryApi.updateInjury(injury.id, {
        status: "recovered",
        recoveryDate: new Date().toISOString(),
      });
      loadInjuries();
    } catch (error) {
      alert("Couldn't update injury", describeError(error), undefined, "error");
    }
  };

  const confirmDelete = (injury: InjuryRecord) => {
    alert("Delete injury", "Remove this injury record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await injuryApi.deleteInjury(injury.id);
            loadInjuries();
          } catch (error) {
            alert("Couldn't delete injury", describeError(error), undefined, "error");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading} accessibilityRole='progressbar'>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {activeInjuries.length > 0 && (
        <View
          style={[
            styles.alert,
            {
              backgroundColor: `${colors.warning}${TINT}`,
              borderLeftColor: colors.warning,
            },
          ]}
        >
          <Text style={[styles.alertText, { color: colors.textPrimary }]}>
            {activeInjuries.length === 1
              ? "One injury is still active. Train around it."
              : `${activeInjuries.length} injuries are still active. Train around them.`}
          </Text>
        </View>
      )}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      {filteredInjuries.length === 0 ? (
        <Placeholder
          text={
            filter === "all"
              ? "Nothing logged. Injuries tracked here are kept separate from everyday soreness."
              : "Nothing matches this filter."
          }
          action={
            onLogInjury
              ? { label: "Log an injury", onPress: onLogInjury }
              : undefined
          }
        />
      ) : (
        <View>
          {filteredInjuries.map((injury, index) => {
            const muscleLabel =
              MUSCLE_GROUP_LABELS[injury.muscleGroup] || injury.muscleGroup;
            const injuryType = INJURY_TYPES.find(
              (t) => t.value === injury.injuryType,
            );
            const status = STATUS_CONFIG[injury.status];
            const painTone = getSeverityColor(injury.painLevel, 3);

            return (
              <View
                key={injury.id}
                style={[
                  styles.injury,
                  index < filteredInjuries.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.separator,
                  },
                ]}
              >
                <View style={styles.injuryHead}>
                  <Text style={[styles.muscle, { color: colors.textPrimary }]}>
                    {muscleLabel}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: `${status.color}${TINT}` },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {injuryType?.label || injury.injuryType} ·{" "}
                  {new Date(injury.startDate).toLocaleDateString()}
                  {injury.recoveryDate
                    ? ` · cleared ${new Date(injury.recoveryDate).toLocaleDateString()}`
                    : ""}
                </Text>

                <View style={styles.painRow}>
                  <View style={{ flex: 1 }}>
                    <Bar pct={(injury.painLevel / 10) * 100} tone={painTone} />
                  </View>
                  <Text style={[styles.pain, { color: painTone }]}>
                    {injury.painLevel}/10 pain
                  </Text>
                </View>

                {injury.note ? (
                  <Text style={[styles.note, { color: colors.textSecondary }]}>
                    {injury.note}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {injury.status !== "recovered" && (
                    <Button
                      label='Mark recovered'
                      size='sm'
                      variant='quiet'
                      tone={SEVERITY_STOPS.good}
                      onPress={() => markRecovered(injury)}
                    />
                  )}
                  <Button
                    label='Delete'
                    size='sm'
                    variant='danger'
                    onPress={() => confirmDelete(injury)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {onLogInjury && filteredInjuries.length > 0 && (
        <Button label='Log an injury' onPress={onLogInjury} full />
      )}
      {AlertComponent}
    </View>
  );
};

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xl, alignItems: "center" },
  alert: {
    padding: space.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  alertText: { fontSize: 13, lineHeight: 18 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  injury: { paddingVertical: space.md, gap: space.sm },
  injuryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  muscle: { fontSize: 17, fontWeight: "600", flexShrink: 1 },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  meta: { fontSize: 13 },
  painRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  pain: { fontSize: 13, fontWeight: "600" },
  note: { fontSize: 13, lineHeight: 19 },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    flexWrap: "wrap",
    marginTop: space.xs,
  },
});

export default InjuryTracker;
