import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { injuryApi } from "../services";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  InjuryType,
  MuscleGroup,
} from "../types/muscleRecovery";
import ModalSheet from "@shared/components/ModalSheet";
import { IntensityPicker } from "@shared/components/IntensityPicker";
import { getSeverityColor } from "@utils/severityColor";
import makeStyles from "../styles";
import { Bar, Chip, Metric, radius, space } from "../ui";
import { captureException, metric } from "@shared/services/crashReporting";
import { NOTE_MAX_LENGTH } from "@shared/limits";

interface LogInjuryModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
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

function painLabel(value: number): string {
  if (value <= 2) return "Barely noticeable";
  if (value <= 5) return "Nagging";
  if (value <= 8) return "Limits what you can do";
  return "Stops you training";
}

export const LogInjuryModal: React.FC<LogInjuryModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [muscleSearch, setMuscleSearch] = useState("");
  const [injuryType, setInjuryType] = useState<InjuryType | "">("");
  const [painLevel, setPainLevel] = useState(5);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filteredMuscles = MUSCLE_GROUPS.filter((muscle) =>
    MUSCLE_GROUP_LABELS[muscle]
      .toLowerCase()
      .includes(muscleSearch.trim().toLowerCase()),
  );

  const handleSelectMuscle = (muscle: MuscleGroup) => {
    setSelectedMuscles((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle],
    );
  };

  const handleSubmit = async () => {
    if (selectedMuscles.length === 0 || !injuryType) {
      setError("Pick at least one muscle group and an injury type.");
      return;
    }

    try {
      setError("");
      setSubmitting(true);
      await Promise.all(
        selectedMuscles.map((muscleGroup) =>
          injuryApi.logInjury({
            muscleGroup,
            injuryType,
            painLevel,
            startDate: new Date().toISOString(),
            note: notes.trim() || undefined,
          }),
        ),
      );
      onSuccess();
      setSelectedMuscles([]);
      setMuscleSearch("");
      setInjuryType("");
      setPainLevel(5);
      setNotes("");
      onClose();
    } catch (err) {
      console.error("Failed to log injury:", err);
      metric.count("tracking.injury_log_failed");
      captureException(err, { stage: "logInjury" });
      setError("Couldn't save the injury. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const painTone = getSeverityColor(painLevel, 3);

  return (
    <ModalSheet
      visible={visible}
      title="Log an injury"
      onClose={onClose}
      confirmText="Save"
      confirmDisabled={submitting || selectedMuscles.length === 0 || !injuryType}
      onConfirm={handleSubmit}
      cancelText="Cancel"
    >
      <ScrollView style={{ maxHeight: 600 }}>
        {error ? <Text style={styles.inputError}>{error}</Text> : null}

        <Text style={styles.inputLabel}>
          Where does it hurt?{" "}
          {selectedMuscles.length > 0 ? (
            <Text style={styles.inputLabelOptional}>
              ({selectedMuscles.length} selected)
            </Text>
          ) : null}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Search muscle groups"
          placeholderTextColor={colors.textMuted}
          value={muscleSearch}
          onChangeText={setMuscleSearch}
        />
        <View style={local.grid}>
          {filteredMuscles.map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_GROUP_LABELS[muscle]}
              selected={selectedMuscles.includes(muscle)}
              onPress={() => handleSelectMuscle(muscle)}
            />
          ))}
        </View>

        <Text style={styles.inputLabel}>What kind of injury?</Text>
        <View style={local.grid}>
          {INJURY_TYPES.map((type) => (
            <Chip
              key={type.value}
              label={type.label}
              selected={injuryType === type.value}
              onPress={() => setInjuryType(type.value)}
            />
          ))}
        </View>

        <View style={local.painBlock}>
          <Metric
            label="Pain"
            value={String(painLevel)}
            unit="/ 10"
            meta={painLabel(painLevel)}
            tone={painTone}
          />
          <Bar pct={(painLevel / 10) * 100} tone={painTone} />
          <IntensityPicker
            value={painLevel}
            onChange={setPainLevel}
            getColor={(level) => getSeverityColor(level, 3)}
            unselectedBackground={colors.inputBackground}
            unselectedBorder={colors.inputBorder}
            unselectedTextColor={colors.textSecondary}
            styles={{
              container: local.grid,
              button: {
                width: 36,
                height: 36,
                borderRadius: radius.sm,
                borderWidth: 1,
                justifyContent: "center",
                alignItems: "center",
              },
              buttonText: { fontSize: 13, fontWeight: "600" },
            }}
          />
        </View>

        <Text style={styles.inputLabel}>
          Notes <Text style={styles.inputLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="How it happened, what makes it worse"
          placeholderTextColor={colors.textMuted}
          value={notes}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </ScrollView>
    </ModalSheet>
  );
};

const local = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  painBlock: { gap: space.md, marginTop: space.lg },
});

export default LogInjuryModal;
