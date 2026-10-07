import { useState } from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import { useTheme } from "@shared/context/ThemeContext";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
} from "../types/muscleRecovery";

import { MuscleSorenessModal } from "../components/MuscleSorenessModal";
import { DOMSFollowUp } from "../components/DOMSFollowUp";
import { DOMSHeatmap } from "../components/DOMSHeatmap";
import { InjuryTracker } from "../components/InjuryTracker";
import { LogInjuryModal } from "../components/LogInjuryModal";
import { MuscleDashboard } from "../components/MuscleDashboard";
import { Button, Chip, Note, radius, space } from "../ui";

export type SorenessWidgetType =
  | "soreness_log"
  | "doms_followup"
  | "doms_heatmap"
  | "injury_tracker"
  | "soreness_calendar"
  | "soreness_history";

export const SORENESS_WIDGET_REGISTRY: Record<
  SorenessWidgetType,
  WidgetDefinition<SorenessWidgetType>
> = {
  soreness_log: {
    type: "soreness_log",
    title: "Log Soreness",
    description: "Pick a muscle to log how sore it is",
    availableSizes: ["medium", "large"],
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
  soreness_calendar: {
    type: "soreness_calendar",
    title: "Soreness Calendar",
    description: "Calendar view of days you've logged soreness",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  soreness_history: {
    type: "soreness_history",
    title: "Soreness History",
    description: "Your recent soreness entries",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_SORENESS_WIDGETS = toDefaultWidgets(
  SORENESS_WIDGET_REGISTRY,
  [
    "soreness_log",
    "doms_followup",
    "doms_heatmap",
    "soreness_calendar",
    "soreness_history",
  ],
);

export const SORENESS_TAB_CONFIG = {
  key: "soreness",
  label: "Recovery",
};

function MuscleDashboardOverlay({
  muscle,
  onClose,
}: {
  readonly muscle: MuscleGroup | null;
  readonly onClose: () => void;
}) {
  return (
    <Modal visible={!!muscle} animationType="slide" onRequestClose={onClose}>
      {muscle && <MuscleDashboard muscleGroup={muscle} onClose={onClose} />}
    </Modal>
  );
}

function MusclePicker({
  onPick,
}: {
  readonly onPick: (muscle: MuscleGroup) => void;
}) {
  return (
    <View style={styles.musclePicker}>
      {MUSCLE_GROUPS.map((m) => (
        <Chip key={m} label={MUSCLE_GROUP_LABELS[m]} selected={false} onPress={() => onPick(m)} />
      ))}
    </View>
  );
}

export function SorenessLogWidget({
  onLogged,
}: {
  readonly onLogged: () => void;
}) {
  const [tappedMuscle, setTappedMuscle] = useState<MuscleGroup | null>(null);

  return (
    <View>
      <MusclePicker onPick={setTappedMuscle} />
      <View style={styles.pickerHint}>
        <Note>Tap a muscle to log soreness</Note>
      </View>
      {tappedMuscle && (
        <MuscleSorenessModal
          visible
          muscleGroup={tappedMuscle}
          onClose={() => setTappedMuscle(null)}
          onSuccess={onLogged}
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
  const [tappedMuscle, setTappedMuscle] = useState<MuscleGroup | null>(null);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
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
              Which muscle is sore?
            </Text>
            <Button label="Done" size="sm" variant="quiet" onPress={onClose} />
          </View>
          <MusclePicker onPick={setTappedMuscle} />
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
  musclePicker: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pickerHint: { alignItems: "center", marginTop: space.sm },
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
});
