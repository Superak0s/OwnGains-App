import { useCallback, useEffect, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View, Text, StyleSheet, Modal } from "react-native";
import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import { useTheme } from "@shared/context/ThemeContext";
import { sorenessApi } from "../services";
import type { ActiveSoreness, MuscleGroup } from "../types/muscleRecovery";

import MuscleMap from "../components/MuscleMap";
import { MuscleSorenessModal } from "../components/MuscleSorenessModal";
import { DOMSFollowUp } from "../components/DOMSFollowUp";
import { DOMSHeatmap } from "../components/DOMSHeatmap";
import { InjuryTracker } from "../components/InjuryTracker";
import { LogInjuryModal } from "../components/LogInjuryModal";
import { MuscleDashboard } from "../components/MuscleDashboard";
import { Button, Chip, Note, radius, space } from "../ui";
import { captureException, metric } from "@shared/services/crashReporting";

export type SorenessWidgetType =
  | "muscle_map"
  | "doms_followup"
  | "doms_heatmap"
  | "injury_tracker";

export const SORENESS_WIDGET_REGISTRY: Record<
  SorenessWidgetType,
  WidgetDefinition<SorenessWidgetType>
> = {
  muscle_map: {
    type: "muscle_map",
    title: "Muscle Map",
    description: "Tap any muscle to log soreness, front and back views",
    availableSizes: ["large"],
    defaultSize: "large",
  },
  doms_followup: {
    type: "doms_followup",
    title: "Morning Recovery Check",
    description: "Follow up on muscles that are currently sore",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  doms_heatmap: {
    type: "doms_heatmap",
    title: "Recovery Analytics",
    description: "Frequency, recovery time, and severity trends by muscle",
    availableSizes: ["large"],
    defaultSize: "large",
  },
  injury_tracker: {
    type: "injury_tracker",
    title: "Injury History",
    description: "Track injuries separately from everyday soreness",
    availableSizes: ["large"],
    defaultSize: "large",
  },
};

export const DEFAULT_SORENESS_WIDGETS = toDefaultWidgets(
  SORENESS_WIDGET_REGISTRY,
  ["muscle_map", "doms_followup"],
);

export const SORENESS_TAB_CONFIG = {
  key: "soreness",
  label: "Recovery",
};

function buildSorenessMap(
  activeSoreness: ActiveSoreness[],
): Partial<Record<MuscleGroup, number>> {
  const map: Partial<Record<MuscleGroup, number>> = {};
  for (const s of activeSoreness) {
    // A muscle with more than one active record shows the worse of the two.
    if (!map[s.muscleGroup] || map[s.muscleGroup]! < s.intensity) {
      map[s.muscleGroup] = s.intensity;
    }
  }
  return map;
}

function MuscleDashboardOverlay({
  muscle,
  onClose,
}: {
  readonly muscle: MuscleGroup | null;
  readonly onClose: () => void;
}) {
  return (
    <Modal visible={!!muscle} animationType='slide' onRequestClose={onClose}>
      {muscle && <MuscleDashboard muscleGroup={muscle} onClose={onClose} />}
    </Modal>
  );
}

function ViewToggle({
  view,
  onChange,
  style,
}: {
  readonly view: "front" | "back";
  readonly onChange: (view: "front" | "back") => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.viewToggle, style]}>
      {(["front", "back"] as const).map((v) => (
        <Chip
          key={v}
          label={v === "front" ? "Front" : "Back"}
          selected={view === v}
          onPress={() => onChange(v)}
        />
      ))}
    </View>
  );
}

export function MuscleMapWidget() {
  const [view, setView] = useState<"front" | "back">("front");
  const [activeSoreness, setActiveSoreness] = useState<ActiveSoreness[]>([]);
  const [tappedMuscle, setTappedMuscle] = useState<MuscleGroup | null>(null);

  const loadActiveSoreness = useCallback(async () => {
    try {
      const response = await sorenessApi.getActiveSoreness();
      setActiveSoreness(response.data ?? []);
    } catch (err) {
      console.error("Failed to load active soreness:", err);
      metric.count("tracking.active_soreness_load_failed");
      captureException(err, { stage: "loadActiveSoreness" });
    }
  }, []);

  useEffect(() => {
    loadActiveSoreness();
  }, [loadActiveSoreness]);

  const sorenessMap = buildSorenessMap(activeSoreness);

  return (
    <View>
      <ViewToggle view={view} onChange={setView} style={styles.mapToggle} />
      <MuscleMap
        view={view}
        selectedMuscles={new Set()}
        sorenessMap={sorenessMap as Record<MuscleGroup, number>}
        onPressMuscle={(muscle) => setTappedMuscle(muscle)}
        showLabels
      />
      <View style={styles.mapHint}>
        <Note>Tap a muscle to log soreness</Note>
      </View>
      {tappedMuscle && (
        <MuscleSorenessModal
          visible={!!tappedMuscle}
          muscleGroup={tappedMuscle}
          onClose={() => setTappedMuscle(null)}
          onSuccess={loadActiveSoreness}
        />
      )}
    </View>
  );
}

export function DOMSFollowUpWidget() {
  const [dashboardMuscle, setDashboardMuscle] = useState<MuscleGroup | null>(
    null,
  );

  return (
    <View>
      <DOMSFollowUp
        onNavigateToMuscleDashboard={(muscle) =>
          setDashboardMuscle(muscle as MuscleGroup)
        }
      />
      <MuscleDashboardOverlay
        muscle={dashboardMuscle}
        onClose={() => setDashboardMuscle(null)}
      />
    </View>
  );
}

export function DOMSHeatmapWidget() {
  const [dashboardMuscle, setDashboardMuscle] = useState<MuscleGroup | null>(
    null,
  );

  return (
    <View>
      <DOMSHeatmap
        onSelectMuscle={(muscle) => setDashboardMuscle(muscle as MuscleGroup)}
      />
      <MuscleDashboardOverlay
        muscle={dashboardMuscle}
        onClose={() => setDashboardMuscle(null)}
      />
    </View>
  );
}

export function InjuryTrackerWidget() {
  const [showLogModal, setShowLogModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <View>
      <InjuryTracker
        key={refreshKey}
        onLogInjury={() => setShowLogModal(true)}
      />
      <LogInjuryModal
        visible={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </View>
  );
}

interface LogSorenessModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
  readonly prefillDate?: Date;
}

export function LogSorenessModal({
  visible,
  onClose,
  onSuccess,
  prefillDate,
}: LogSorenessModalProps) {
  const { colors } = useTheme();
  const [view, setView] = useState<"front" | "back">("front");
  const [tappedMuscle, setTappedMuscle] = useState<MuscleGroup | null>(null);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType='slide'
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[styles.quickLogBackdrop, { backgroundColor: colors.overlay }]}
      >
        <View
          style={[styles.quickLogSheet, { backgroundColor: colors.background }]}
        >
          <View style={styles.quickLogHeader}>
            <Text style={[styles.quickLogTitle, { color: colors.textPrimary }]}>
              Tap a muscle to log soreness
            </Text>
            <Button label='Done' size='sm' variant='quiet' onPress={onClose} />
          </View>
          <ViewToggle view={view} onChange={setView} />
          <MuscleMap
            view={view}
            selectedMuscles={new Set()}
            sorenessMap={{} as Record<MuscleGroup, number>}
            onPressMuscle={(muscle) => setTappedMuscle(muscle)}
            showLabels
          />
        </View>
      </View>

      {tappedMuscle && (
        <MuscleSorenessModal
          visible={!!tappedMuscle}
          muscleGroup={tappedMuscle}
          onClose={() => setTappedMuscle(null)}
          onSuccess={onSuccess ?? (() => {})}
          prefillDate={prefillDate}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  mapToggle: { alignSelf: "center", marginBottom: space.sm },
  mapHint: { alignItems: "center", marginTop: space.xs },
  quickLogBackdrop: { flex: 1, justifyContent: "flex-end" },
  quickLogSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 16,
    maxHeight: "85%",
  },
  quickLogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.md,
  },
  quickLogTitle: { fontSize: 17, fontWeight: "600", flexShrink: 1 },
  viewToggle: { flexDirection: "row", gap: space.sm },
});
